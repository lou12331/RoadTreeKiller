import * as THREE from 'three';
import type { Quality } from '../core/state';
import { generateTree } from '../core/trees';
import { TARGET_TREES } from '../core/data';
import { GEO, buildAxe, buildEquipment, buildTree, disposeTree, mat } from './models';

const SPACING = 7; // 行道樹間距
const LOOKAHEAD = 50; // 預覽後續幾棵樹
const STUMPS = 24;
const CATCHUP = 1.2; // 落後很多棵時，鏡頭追上最新砍倒的樹所需秒數
const STREET_LEN = 300; // 環境物件循環長度

type Mode = 'intro' | 'play' | 'ending';

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface TreeSlot { g: THREE.Group; fallT: number; dur: number } // fallT < 0：尚未倒下

interface Recyclable { mesh: THREE.InstancedMesh; items: { x: number; z: number; sx: number; sy: number; sz: number }[] }

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  private world = new THREE.Group(); // 會隨前進捲動的物件
  private slots: TreeSlot[] = [];
  private behind: (TreeSlot & { base: number })[] = []; // 已經過鏡頭、仍在倒下的樹
  private fellCooldown = 0;
  speedFactor = 0; // 0..1，高速砍伐時的前進速度
  private stumps: THREE.InstancedMesh;
  private axe = buildAxe();
  private axeT = 1;
  private shake = 0;
  private gear = buildEquipment();
  private chips: THREE.InstancedMesh;
  private chipData: { p: THREE.Vector3; v: THREE.Vector3; life: number; rot: number }[] = [];
  private chipCursor = 0;
  private recyclables: Recyclable[] = [];
  private groundTex: THREE.CanvasTexture[] = [];
  private seed = 0;
  private visualIndex = 0; // 畫面上目前樹木的索引
  private targetIndex = 0; // 邏輯層的已砍伐數
  private scroll = 0; // 0..SPACING，前進動畫進度
  private totalScroll = 0;
  private mode: Mode = 'intro';
  private time = 0;
  private endingT = 0;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private dpr = 1.5;
  private axeBase = new THREE.Vector3(0.3, -0.5, -0.95);
  private width = 1;
  private height = 1;
  onFell?: () => void;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    const sc = this.scene;
    sc.background = new THREE.Color(0x9fd3f2);
    sc.fog = new THREE.Fog(0xbfe0f2, 40, 150);
    sc.add(new THREE.HemisphereLight(0xdff2ff, 0x6a7a4a, 1.4));
    this.sun.position.set(-6, 12, 6);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sh = this.sun.shadow.camera;
    sh.left = -6; sh.right = 6; sh.top = 8; sh.bottom = -4; sh.far = 40;
    sc.add(this.sun, this.sun.target);
    sc.add(this.world);
    sc.add(this.camera);

    this.axe.scale.setScalar(0.5);
    this.camera.add(this.axe);

    this.buildStreet();

    this.stumps = new THREE.InstancedMesh(GEO.stump, mat(0x8a6a4a), STUMPS);
    this.stumps.count = 0;
    this.stumps.receiveShadow = true;
    this.world.add(this.stumps);

    for (const g of this.gear) { g.visible = false; sc.add(g); }

    this.chips = new THREE.InstancedMesh(GEO.box, mat(0xd9b27a), 80);
    this.chips.frustumCulled = false;
    for (let i = 0; i < 80; i++) {
      this.chipData.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, rot: 0 });
      this.chips.setMatrixAt(i, this.tmpM.makeScale(0, 0, 0));
    }
    sc.add(this.chips);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  // ---------- 街景 ----------
  private buildStreet() {
    const sidewalk = canvasTexture(256, 256, (c) => {
      const colors = ['#b5654f', '#a85a46', '#c27a62', '#9e9a92'];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
        c.fillStyle = colors[(x * 7 + y * 3) % colors.length];
        c.fillRect(x * 64 + 1, y * 32 + 1, 62, 30);
      }
    });
    sidewalk.repeat.set(2, 30);
    const road = canvasTexture(256, 256, (c) => {
      c.fillStyle = '#4a4d52';
      c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 400; i++) {
        c.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},255,0.04)`;
        c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
      c.fillStyle = '#f2f2f2';
      c.fillRect(124, 0, 8, 120);
      c.fillStyle = '#f2c230';
      c.fillRect(6, 0, 6, 256);
    });
    road.repeat.set(1, 30);
    const tactile = canvasTexture(64, 64, (c) => {
      c.fillStyle = '#e8c23a';
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#c9a42a';
      for (let i = 0; i < 4; i++) c.fillRect(i * 16 + 4, 0, 6, 64);
    });
    tactile.repeat.set(1, 60);
    this.groundTex = [sidewalk, road, tactile];

    const plane = (tex: THREE.Texture, w: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 240), new THREE.MeshLambertMaterial({ map: tex }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, -100);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    plane(sidewalk, 5, -0.6, 0);
    plane(tactile, 0.45, -1.4, 0.005);
    plane(road, 9, 6.4, -0.08);
    plane(sidewalk, 5, 13.4, 0); // 對向人行道
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, 240), mat(0xc9c6bd));
    curb.position.set(1.9, 0, -100);
    this.scene.add(curb);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0x7a9a5a));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.12, -100);
    this.scene.add(grass);

    // 建築物：InstancedMesh + 窗戶貼圖 + 每棟顏色
    const windows = canvasTexture(64, 128, (c) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 64, 128);
      c.fillStyle = '#5d7488';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) c.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
    });
    windows.repeat.set(1, 1);
    const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const palette = [0xe8dccb, 0xd9cbb5, 0xc8c2b8, 0xe2d2c0, 0xb9b2a8, 0xf0e6d6, 0xcfb9a0];
    const makeRow = (count: number, xMin: number, xMax: number) => {
      const mesh = new THREE.InstancedMesh(bGeo, new THREE.MeshLambertMaterial({ map: windows }), count);
      const items = [];
      for (let i = 0; i < count; i++) {
        const sx = 4 + Math.random() * 3;
        const sy = 7 + Math.random() * 18;
        items.push({ x: xMin + Math.random() * (xMax - xMin), z: -(i / count) * STREET_LEN, sx, sy, sz: STREET_LEN / count - 0.4 });
        mesh.setColorAt(i, new THREE.Color(palette[i % palette.length]));
      }
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.recyclables.push({ mesh, items });
    };
    makeRow(22, -7.5, -6.5);
    makeRow(22, 19.5, 20.5);

    // 路燈
    const lampGeo = new THREE.CylinderGeometry(0.06, 0.08, 1, 6).translate(0, 0.5, 0);
    const lamps = new THREE.InstancedMesh(lampGeo, mat(0x4d5a60), 10);
    lamps.frustumCulled = false;
    this.scene.add(lamps);
    this.recyclables.push({ mesh: lamps, items: Array.from({ length: 10 }, (_, i) => ({ x: 1.75, z: -i * (STREET_LEN / 10) - 3.5, sx: 0.8, sy: 5, sz: 0.8 })) });

    // 遠方高塔
    const tower = new THREE.Group();
    const tMat = mat(0x5d9a94);
    for (let i = 0; i < 8; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.6, 6, 4), tMat);
      seg.position.y = 8 + i * 6;
      seg.rotation.y = Math.PI / 4;
      tower.add(seg);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 5).translate(0, 4, 0), tMat);
    tower.add(base);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 14, 6), mat(0x8fa8a6));
    spire.position.y = 62;
    tower.add(spire);
    tower.position.set(50, 0, -190);
    this.scene.add(tower);
  }

  private wrapZ(z: number): number {
    // 讓物件落在 [-STREET_LEN+12, 12)
    const shifted = z + this.totalScroll + this.scroll;
    return (((shifted - 12) % STREET_LEN) - STREET_LEN) % STREET_LEN + 12;
  }

  private updateStreet() {
    for (const r of this.recyclables) {
      r.items.forEach((it, i) => {
        this.tmpM.compose(this.tmpV.set(it.x, 0, this.wrapZ(it.z)), this.tmpQ.identity(), this.tmpS.set(it.sx, it.sy, it.sz));
        r.mesh.setMatrixAt(i, this.tmpM);
      });
      r.mesh.instanceMatrix.needsUpdate = true;
    }
    const off = (this.totalScroll + this.scroll) / 240;
    for (const t of this.groundTex) t.offset.y = (off * t.repeat.y) % 1;
  }

  // ---------- 樹木 ----------
  // 行道樹排成一列：slots[k] 位於 z = -k*SPACING + scroll，索引為 visualIndex + k。
  // 索引小於 targetIndex 的樹已被邏輯層砍倒，會在原地倒下並隨街景捲動經過鏡頭；
  // 第一棵仍站著的樹就是 HUD 顯示 HP 的那棵，畫面與邏輯因此永遠對得上。

  /** 依邏輯進度重建整排行道樹（初始化、讀檔時）。 */
  syncTrees(seed: number, felled: number) {
    this.seed = seed;
    this.targetIndex = felled;
    for (const sl of [...this.slots, ...this.behind]) {
      this.world.remove(sl.g);
      disposeTree(sl.g);
    }
    this.behind = [];
    this.slots = [];
    this.visualIndex = felled;
    for (let k = 0; k <= LOOKAHEAD; k++) this.slots.push(this.makeSlot(felled + k));
    this.scroll = 0;
    this.layoutTrees();
  }

  /** 畫面是否已追上邏輯進度（結局等待最後一棵倒下）。 */
  get caughtUp(): boolean {
    return this.visualIndex >= this.targetIndex && this.behind.every((b) => b.fallT > 1.2);
  }

  private makeSlot(index: number): TreeSlot {
    const g = index < TARGET_TREES ? buildTree(generateTree(this.seed, index), this.seed) : new THREE.Group();
    this.world.add(g);
    return { g, fallT: -1, dur: 0.9 };
  }

  /** 邏輯層告知目前已砍伐數；畫面以有限速率追趕，避免大量建立 3D 物件。 */
  setProgress(felled: number) {
    this.targetIndex = felled;
  }

  private layoutTrees() {
    this.slots.forEach((sl, k) => { sl.g.position.z = -k * SPACING + this.scroll; });
    for (const b of this.behind) b.g.position.z = b.base + this.scroll;

    // 樹樁：前方已開始倒下的位置 + 身後經過的位置
    let n = 0;
    const put = (z: number) => {
      if (n >= STUMPS) return;
      this.stumps.setMatrixAt(n++, this.tmpM.makeTranslation(0, 0, z));
    };
    if (this.mode === 'ending') {
      for (let j = 0; j < STUMPS; j++) put(-12 * SPACING + j * SPACING + this.scroll);
    } else {
      this.slots.forEach((sl, k) => { if (sl.fallT >= 0) put(-k * SPACING + this.scroll); });
      const behindCount = Math.min(STUMPS, this.visualIndex);
      for (let j = 0; j < behindCount; j++) put((j + 1) * SPACING + this.scroll);
    }
    this.stumps.count = n;
    this.stumps.instanceMatrix.needsUpdate = true;
  }

  private animateFall(sl: { g: THREE.Group; fallT: number; dur: number }, dt: number) {
    if (sl.fallT < 0) return;
    sl.fallT += dt;
    const p = Math.min(1, sl.fallT / sl.dur);
    sl.g.rotation.z = 1.5 * p * p;
    sl.g.rotation.x = 0;
    sl.g.position.y = p >= 1 ? -Math.min(1, (sl.fallT - sl.dur) / 0.5) * 1.5 : 0;
  }

  private stepTrees(dt: number) {
    for (const sl of this.slots) this.animateFall(sl, dt);
    for (let i = this.behind.length - 1; i >= 0; i--) {
      const b = this.behind[i];
      this.animateFall(b, dt);
      if (b.fallT > b.dur + 0.5 && b.base + this.scroll > 4) {
        this.world.remove(b.g);
        disposeTree(b.g);
        this.behind.splice(i, 1);
      }
    }
    this.fellCooldown -= dt;

    this.speedFactor = 0;
    if (this.mode !== 'ending') {
      const backlog = this.targetIndex - this.visualIndex;
      // 捲動速度隨落後量提升，一般上限每秒 15 棵；落後太遠時再加速，約 CATCHUP 秒內追上
      const cruise = Math.min(SPACING * 15, (SPACING / 0.55) * Math.max(1, backlog / 1.5));
      const speed = Math.max(cruise, (backlog * SPACING) / CATCHUP);
      const dur = Math.min(0.9, (2.2 * SPACING) / speed);

      // 已被砍倒但還站著的樹：開始倒下
      for (let k = 0; k < Math.min(backlog, this.slots.length); k++) {
        const sl = this.slots[k];
        if (sl.fallT >= 0 || this.visualIndex + k >= TARGET_TREES) continue;
        sl.fallT = 0;
        sl.dur = dur;
        if (this.fellCooldown <= 0) {
          this.fellCooldown = 0.25;
          this.onFell?.();
        }
      }

      // 目前這棵倒下過半才前進；落後多棵時不等待
      const head = this.slots[0];
      const go = backlog > 1 || (backlog === 1 && head.fallT >= head.dur * 0.6);
      // 速度線強度：一般前進為 0，達到上限速度為 1
      const base = SPACING / 0.55;
      this.speedFactor = go ? Math.min(1, Math.sqrt(Math.max(0, speed / base - 1) / (SPACING * 15 / base - 1))) : 0;
      if (go) {
        this.scroll += speed * dt;
        while (this.scroll >= SPACING && this.visualIndex < this.targetIndex) {
          this.scroll -= SPACING;
          this.totalScroll += SPACING;
          const passed = this.slots.shift()!;
          this.behind.push({ ...passed, base: SPACING });
          for (const b of this.behind) if (b !== this.behind[this.behind.length - 1]) b.base += SPACING;
          this.visualIndex++;
          this.slots.push(this.makeSlot(this.visualIndex + LOOKAHEAD));
          this.skipAhead();
        }
        if (this.visualIndex >= this.targetIndex) this.scroll = 0;
      }
    }
    this.layoutTrees();
  }

  /** 落後超過畫面可見的樹數時，跳過中間的樹（保留前方兩棵倒下中的樹，街景不中斷）。 */
  private skipAhead() {
    const backlog = this.targetIndex - this.visualIndex;
    if (backlog <= LOOKAHEAD + 1) return;
    this.visualIndex = this.targetIndex - 2;
    // 已倒下的樹沿用原模型；仍站著的樹換成正確樹種，HUD 與畫面一致
    this.slots.forEach((sl, k) => {
      if (this.visualIndex + k < this.targetIndex) return;
      this.world.remove(sl.g);
      disposeTree(sl.g);
      this.slots[k] = this.makeSlot(this.visualIndex + k);
    });
  }

  // ---------- 打擊回饋 ----------
  hit(strength = 1) {
    if (this.axeT > 0.45) this.axeT = 0;
    this.shake = Math.min(1, this.shake + 0.5 * strength);
    this.emitChips(4 + Math.round(strength * 2), new THREE.Vector3(0.15, 1.1, 0.25));
  }

  private emitChips(n: number, at: THREE.Vector3) {
    for (let i = 0; i < n; i++) {
      const c = this.chipData[this.chipCursor];
      this.chipCursor = (this.chipCursor + 1) % this.chipData.length;
      c.p.copy(at);
      c.v.set((Math.random() - 0.3) * 3, 1.5 + Math.random() * 2.5, Math.random() * 2.5);
      c.life = 0.8 + Math.random() * 0.4;
      c.rot = Math.random() * 6;
    }
  }

  private stepChips(dt: number) {
    for (let i = 0; i < this.chipData.length; i++) {
      const c = this.chipData[i];
      if (c.life <= 0) continue;
      c.life -= dt;
      c.v.y -= 9 * dt;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.03) { c.p.y = 0.03; c.v.set(0, 0, 0); }
      c.rot += dt * 8;
      const s = c.life > 0 ? 0.07 : 0;
      this.tmpQ.setFromAxisAngle(this.tmpV.set(1, 1, 0).normalize(), c.rot);
      this.tmpM.compose(c.p, this.tmpQ, this.tmpS.set(s, s * 0.5, s * 1.4));
      this.chips.setMatrixAt(i, this.tmpM);
    }
    this.chips.instanceMatrix.needsUpdate = true;
  }

  /** 街道盡頭（消失點）的螢幕座標，速度線由此放射。 */
  vanishingPoint(): { x: number; y: number } {
    const v = this.tmpV.set(0.5, 2, -120).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }

  /** 目前樹幹受擊點的螢幕座標（CSS px，相對容器）。 */
  hitScreenPos(): { x: number; y: number } {
    const v = this.tmpV.set(0, 1.4, 0).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }

  // ---------- 設備 ----------
  private stepGear(dt: number, counts: number[], active: boolean) {
    const t = this.time;
    counts.forEach((n, i) => {
      const g = this.gear[i];
      g.visible = n > 0 && this.mode !== 'intro';
      if (!g.visible) return;
      const k = active ? Math.min(3, 1 + Math.log10(n)) : 0; // 動畫強度
      const u = g.userData;
      switch (i) {
        case 0:
          u.spin.position.y = Math.sin(t * 60) * 0.01 * k;
          g.position.y = 0.45 + Math.sin(t * 40) * 0.005 * k;
          break;
        case 1:
          u.swing.rotation.z = Math.sin(t * 4 * k) * 0.6;
          break;
        case 2:
          u.spin.rotation.x += dt * 20 * k;
          if (active && Math.random() < dt * 6 * k) this.emitChips(1, new THREE.Vector3(-1.2, 0.8, 0.9));
          break;
        case 3:
          u.swing.rotation.y = Math.sin(t * 1.5 * k) * 0.3;
          break;
        case 4:
          g.position.y = 2.8 + Math.sin(t * 2) * 0.15;
          g.position.x = 0.9 + Math.sin(t * 0.7) * 0.3;
          for (const r of u.rotors) r.rotation.y += dt * 40;
          break;
        case 5: {
          const beam = u.beam as THREE.Mesh;
          beam.visible = active;
          const target = this.tmpV.set(0, 1.2, 0);
          const origin = (u.barrel as THREE.Object3D).getWorldPosition(this.tmpS);
          const dir = target.sub(origin);
          (u.barrel as THREE.Object3D).rotation.z = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
          g.rotation.y = -Math.atan2(dir.z, dir.x);
          beam.scale.set(Math.max(0, dir.length() - beam.position.x), 0.8 + Math.random() * 0.4 * k, 0.8 + Math.random() * 0.4 * k);
          (beam.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.random() * 0.4;
          break;
        }
        case 6:
          (u.pillar.material as THREE.MeshBasicMaterial).opacity = active ? 0.18 + Math.sin(t * 6) * 0.06 + 0.04 * k : 0;
          (u.core.material as THREE.MeshBasicMaterial).opacity = active ? 0.4 + Math.random() * 0.2 : 0;
          break;
      }
    });
  }

  // ---------- 模式與相機 ----------
  setMode(mode: Mode) {
    this.mode = mode;
    this.endingT = 0;
    document.body.classList.toggle('intro', mode === 'intro');
    document.body.classList.toggle('ending', mode === 'ending');
    if (mode === 'ending') this.layoutTrees();
    this.axe.visible = mode === 'play';
  }

  private updateCamera(dt: number) {
    const aspect = this.width / this.height;
    // 直向畫面視角較窄，往後拉以容納整棵樹
    const back = aspect < 1 ? 9 + (1 - aspect) * 6 : 9.5;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (this.mode === 'intro') {
      const a = this.time * 0.08;
      pos = new THREE.Vector3(3 + Math.sin(a) * 1.5, 2.2, back + 3);
      look = new THREE.Vector3(0.5, 2.6, -8);
    } else if (this.mode === 'ending') {
      this.endingT += dt;
      const p = Math.min(1, this.endingT / 6);
      const e = 1 - (1 - p) ** 3;
      pos = new THREE.Vector3(0.9 + e * 4, 1.55 + e * 16, back + e * 26);
      look = new THREE.Vector3(1 + e * 2, 1.9 - e * 1.5, -e * 30);
    } else {
      pos = new THREE.Vector3(1.0, 1.8, back);
      look = new THREE.Vector3(0.1, aspect < 1 ? 3.2 : 2.7, 0);
    }
    const k = 1 - Math.exp(-dt * (this.mode === 'ending' ? 8 : 3));
    if (this.camPos.lengthSq() === 0) { this.camPos.copy(pos); this.camLook.copy(look); }
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private stepAxe(dt: number) {
    this.axeT = Math.min(1, this.axeT + dt / 0.22);
    // 前段快速揮下，後段收回
    const t = this.axeT;
    const swing = t < 0.35 ? Math.sin((t / 0.35) * Math.PI / 2) : Math.cos(((t - 0.35) / 0.65) * Math.PI / 2);
    const a = this.axeBase;
    this.axe.rotation.set(0.1 - swing * 0.9, -0.2 + swing * 0.2, 0.12 + swing * 0.8);
    this.axe.position.set(a.x - swing * a.x * 0.6, a.y + swing * 0.08, a.z);

    this.shake = Math.max(0, this.shake - dt * 3);
    const cur = this.slots[0];
    if (cur && cur.fallT < 0) {
      cur.g.rotation.z = Math.sin(this.time * 50) * 0.025 * this.shake;
      cur.g.rotation.x = Math.cos(this.time * 43) * 0.015 * this.shake;
    }
  }

  // ---------- 主更新 ----------
  update(dt: number, ctx: { equipment: number[]; dps: number }) {
    this.time += dt;
    this.stepTrees(dt);
    this.stepAxe(dt);
    this.stepChips(dt);
    this.stepGear(dt, ctx.equipment, ctx.dps > 0 && this.mode === 'play');
    if (ctx.dps > 0 && this.mode === 'play' && Math.random() < dt * Math.min(8, 1 + Math.log10(ctx.dps))) {
      this.emitChips(1, new THREE.Vector3(0, 0.6 + Math.random() * 0.8, 0.25));
    }
    this.updateStreet();
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- 畫質 ----------
  setQuality(q: Quality) {
    const cap = q === 'low' ? 1 : q === 'medium' ? 1.5 : 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap);
    const shadows = q === 'high';
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 58 : 50;
    // 視覺中心上移，讓樹木落在「砍！」按鈕上方
    const d = Math.round(h * (aspect < 1 ? 0.2 : 0.08));
    this.camera.setViewOffset(w, h + 2 * d, 0, 2 * d, w, h);
    this.camera.updateProjectionMatrix();
    // 斧頭依畫面寬度放在右下角
    const halfH = 0.95 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfW = halfH * aspect * (h / (h + 2 * d));
    this.axeBase.set(Math.min(0.55, halfW * 0.8), -halfH * 1.05, -0.95);
  }
}
