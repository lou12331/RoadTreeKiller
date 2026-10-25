import * as THREE from 'three';
import type { SpeciesId } from '../core/data';
import { hashRandom, type TreeInfo } from '../core/trees';

// 共用幾何與材質；樹木組裝後依幾何／材質批次繪製。
export const GEO = {
  trunk: new THREE.CylinderGeometry(0.16, 0.26, 1, 9).translate(0, 0.5, 0),
  branch: new THREE.CylinderGeometry(0.55, 1, 1, 7).translate(0, 0.5, 0),
  blob: new THREE.IcosahedronGeometry(1, 1),
  blobLow: new THREE.IcosahedronGeometry(1, 0),
  disc: new THREE.CylinderGeometry(1, 0.85, 0.28, 9),
  cone: new THREE.ConeGeometry(1, 1, 9),
  root: new THREE.CylinderGeometry(0.025, 0.035, 1, 5).translate(0, -0.5, 0),
  dot: new THREE.IcosahedronGeometry(0.12, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
  ring: new THREE.TorusGeometry(1, 0.12, 5, 16),
  tire: new THREE.TorusGeometry(0.75, 0.25, 6, 12),
  stump: new THREE.CylinderGeometry(0.24, 0.3, 0.3, 9).translate(0, 0.15, 0),
};

const matCache = new Map<string, THREE.MeshLambertMaterial>();
export function mat(color: number | string, opts: { emissive?: number; flat?: boolean } = {}): THREE.MeshLambertMaterial {
  const key = `${color}|${opts.emissive ?? ''}|${opts.flat ?? true}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: opts.flat ?? true });
    if (opts.emissive !== undefined) m.emissive = new THREE.Color(opts.emissive);
    matCache.set(key, m);
  }
  return m;
}

const SICK = new THREE.Color(0x9b8a4c);
function leaf(color: number, healthy: boolean): THREE.MeshLambertMaterial {
  if (healthy) return mat(color);
  return mat('#' + new THREE.Color(color).lerp(SICK, 0.55).getHexString());
}

interface SpeciesStyle {
  trunk: number;
  trunkH: number;
  trunkW: number;
  leaves: number[];
}

const STYLE: Record<SpeciesId, SpeciesStyle> = {
  banyan: { trunk: 0x6b5442, trunkH: 2.2, trunkW: 1.5, leaves: [0x306439, 0x467f3e, 0x62944b] },
  camphor: { trunk: 0x5c4636, trunkH: 2.3, trunkW: 1.1, leaves: [0x397443, 0x508b48, 0x72a257] },
  terminalia: { trunk: 0x8a7a68, trunkH: 3.2, trunkW: 0.8, leaves: [0x568746, 0x78a85b, 0x9abd70] },
  cassia: { trunk: 0x6e5a48, trunkH: 2.3, trunkW: 0.9, leaves: [0x557a38, 0x709643, 0x8cac50] },
  sweetgum: { trunk: 0x5e4a3a, trunkH: 2.6, trunkW: 0.9, leaves: [0xb7472c, 0xda6831, 0xeea14d] },
  bishopwood: { trunk: 0x5a4030, trunkH: 2.0, trunkW: 1.8, leaves: [0x285b37, 0x3d7742, 0x608c4b] },
  goldenrain: { trunk: 0x66503e, trunkH: 2.4, trunkW: 1.0, leaves: [0x477540, 0x669047, 0x88a953] },
};

const STAGE_SCALE = { sapling: 0.45, mature: 1, giant: 1.65 };
const UP = new THREE.Vector3(0, 1, 0);

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

type Point = [number, number, number];

/** 從起點長至終點的錐形枝條，也用於液壓桿與支架。 */
function strut(g: THREE.Group, m: THREE.Material, from: Point, to: Point, radius: number) {
  const delta = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const mesh = add(g, GEO.branch, m, ...from, radius, delta.length(), radius);
  mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
  return mesh;
}

/** 每棵樹依共用幾何／材質合併 instance，避免每根枝條各佔一次 draw call。 */
function batchTree(g: THREE.Group) {
  const batches = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]>();
  for (const child of g.children) {
    const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    const key = `${mesh.geometry.uuid}|${mesh.material.uuid}`;
    const batch = batches.get(key);
    if (batch) batch.push(mesh);
    else batches.set(key, [mesh]);
  }
  g.clear();
  for (const meshes of batches.values()) {
    const first = meshes[0];
    const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    meshes.forEach((mesh, i) => { mesh.updateMatrix(); batch.setMatrixAt(i, mesh.matrix); });
    batch.castShadow = batch.receiveShadow = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    g.add(batch);
  }
}

/** 只釋放每棵樹自己的 instance buffer，保留共用幾何和材質。 */
export function disposeTree(g: THREE.Group) {
  g.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
}

/** 依樹種／成長／健康建立低面數樹木。原點位於樹根，保留倒樹動畫的軸向。 */
export function buildTree(info: TreeInfo, seed: number): THREE.Group {
  const g = new THREE.Group();
  const distant = new THREE.Group();
  const st = STYLE[info.species.id];
  const r = (salt: number) => hashRandom(seed, info.index, 100 + salt);
  const healthy = info.healthy;
  const sparse = healthy ? 1 : 0.78;
  const young = info.stage === 'sapling';
  const L = (i: number) => leaf(st.leaves[i % st.leaves.length], healthy);
  const trunkMat = mat(st.trunk);
  const barkMat = mat('#' + new THREE.Color(st.trunk).multiplyScalar(0.72).getHexString());
  const h = st.trunkH * (0.9 + r(0) * 0.2);
  const w = st.trunkW * (info.stage === 'giant' ? 1.3 : young ? 0.72 : 1);
  add(g, GEO.trunk, trunkMat, 0, 0, 0, w, h, w);
  add(distant, GEO.trunk, trunkMat, 0, 0, 0, w, h, w);

  // 放射狀板根、縱向樹皮與樹瘤；幼樹的根與樹皮較簡單。
  const roots = young ? 3 : 5;
  for (let i = 0; i < roots; i++) {
    const a = i / roots * Math.PI * 2 + r(60 + i) * 0.35;
    const d = w * (0.32 + r(70 + i) * 0.18);
    strut(g, trunkMat, [Math.cos(a) * d, 0.035, Math.sin(a) * d], [0, 0.5 + r(80 + i) * 0.25, 0], w * 0.105);
    if (!young) {
      const radius = w * 0.2, y = h * (0.18 + r(90 + i) * 0.28);
      strut(g, barkMat, [Math.cos(a) * radius, y, Math.sin(a) * radius],
        [Math.cos(a) * radius * 0.8, y + h * 0.28, Math.sin(a) * radius * 0.8], w * 0.018);
    }
  }
  if (!young) add(g, GEO.blobLow, barkMat, w * 0.18, h * 0.42, w * 0.04, w * 0.085, w * 0.15, w * 0.1);

  const crown = (x: number, y: number, z: number, sx: number, sy: number, sz: number, i: number) => {
    const blob = add(g, GEO.blob, L(i), x, y, z, sx * sparse, sy * sparse, sz * sparse);
    blob.rotation.set(r(200 + i) * 0.2, r(220 + i) * Math.PI, r(240 + i) * 0.16);
    const farBlob = add(distant, GEO.blob, L(1), x, y, z, sx * sparse, sy * sparse, sz * sparse);
    farBlob.quaternion.copy(blob.quaternion);
    add(g, GEO.blobLow, L(i + 1), x + sx * 0.35, y + sy * 0.55, z + sz * 0.12,
      sx * 0.52 * sparse, sy * 0.48 * sparse, sz * 0.55 * sparse);
  };
  const limb = (x: number, y: number, z: number, thickness = 0.1) => {
    strut(g, trunkMat, [0, h * 0.65, 0], [x, y, z], thickness * w);
  };

  switch (info.species.id) {
    case 'banyan': {
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + r(i) * 0.35;
        const x = Math.cos(a) * 1.12, z = Math.sin(a) * 0.9, y = h + 0.35 + r(i + 5) * 0.4;
        limb(x, y, z, 0.13);
        crown(x, y, z, 1.05, 0.72, 1, i);
      }
      crown(0, h + 1, 0, 1.25, 0.8, 1.1, 7);
      for (let i = 0; i < (young ? 4 : 10); i++) {
        const a = r(20 + i) * Math.PI * 2, d = 0.65 + r(30 + i) * 0.8;
        const y = h + 0.2, length = 0.7 + r(40 + i) * (h - 0.6);
        const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8;
        strut(g, barkMat, [x, y, z], [x + 0.06, Math.max(0.06, y - length), z], 0.025);
      }
      break;
    }
    case 'camphor': {
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + r(i) * 0.3;
        const x = Math.cos(a) * 0.82, z = Math.sin(a) * 0.75, y = h + 0.45 + r(10 + i) * 0.45;
        limb(x, y, z);
        crown(x, y, z, 0.92, 0.95, 0.9, i);
      }
      crown(0, h + 1.45, 0, 1.02, 1.05, 0.95, 6);
      break;
    }
    case 'terminalia': {
      for (let tier = 0; tier < 4; tier++) {
        const radius = 1.5 - tier * 0.31, y = h - 0.9 + tier * 0.75;
        for (let j = 0; j < 4; j++) {
          const a = j / 4 * Math.PI * 2 + tier * 0.7 + r(10 + tier) * 0.3;
          const x = Math.cos(a) * radius * 0.6, z = Math.sin(a) * radius * 0.6;
          strut(g, trunkMat, [0, y - 0.25, 0], [x, y, z], 0.055 * w);
          crown(x, y + 0.06, z, radius * 0.65, 0.24, radius * 0.6, tier + j);
        }
      }
      break;
    }
    case 'cassia': {
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2, x = Math.cos(a) * 0.85, z = Math.sin(a) * 0.75;
        limb(x, h + 0.4, z, 0.075);
        crown(x, h + 0.65 + r(5 + i) * 0.25, z, 0.88, 0.75, 0.85, i);
      }
      crown(0, h + 1.05, 0, 0.9, 0.72, 0.9, 5);
      const flower = mat(healthy ? 0xf4c635 : 0xc9ad55), tips = mat(healthy ? 0xffe583 : 0xd9c78c);
      for (let i = 0; i < (healthy ? 16 : 8); i++) {
        const a = r(10 + i) * Math.PI * 2, d = 0.8 + r(30 + i) * 0.6;
        const x = Math.cos(a) * d, z = Math.sin(a) * d, y = h + 0.5 + r(50 + i) * 0.35;
        const length = 0.45 + r(100 + i) * 0.3;
        strut(g, trunkMat, [x, y, z], [x + 0.035, y - length, z], 0.012);
        for (let j = 0; j < 4; j++) {
          add(g, GEO.blobLow, j === 3 ? tips : flower, x + Math.sin(j * 2.4) * 0.035,
            y - j * length / 3, z, 0.13 - j * 0.022, 0.11, 0.12 - j * 0.02);
        }
      }
      break;
    }
    case 'sweetgum': {
      for (let tier = 0; tier < 3; tier++) {
        const d = 0.85 - tier * 0.23;
        for (let j = 0; j < 3; j++) {
          const a = j / 3 * Math.PI * 2 + tier * 0.9;
          const x = Math.cos(a) * d, z = Math.sin(a) * d, y = h + tier * 0.65;
          limb(x, y, z, 0.075);
          crown(x, y + 0.2, z, 0.78 - tier * 0.13, 0.7, 0.75 - tier * 0.12, tier + j);
        }
      }
      crown(0, h + 1.95, 0, 0.5, 0.65, 0.5, 2);
      break;
    }
    case 'bishopwood': {
      // 主幹伸入樹冠，粗大的分叉從下方仍有連續結構。
      add(g, GEO.trunk, trunkMat, 0, h - 0.1, 0, w * 0.65, 1.25, w * 0.65);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + r(i) * 0.3;
        const x = Math.cos(a) * 0.95, z = Math.sin(a) * 0.8, y = h + 0.5 + r(5 + i) * 0.5;
        limb(x, y, z, 0.16);
        crown(x, y, z, 1.02, 0.95, 0.95, i);
      }
      crown(0, h + 1.4, 0, 1.15, 0.95, 1.05, 7);
      break;
    }
    case 'goldenrain': {
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2, x = Math.cos(a) * 0.75, z = Math.sin(a) * 0.7;
        limb(x, h + 0.6, z, 0.08);
        crown(x, h + 0.7 + r(5 + i) * 0.3, z, 0.9, 0.8, 0.85, i);
      }
      crown(0, h + 1.35, 0, 0.9, 0.75, 0.85, 5);
      const yellow = mat(healthy ? 0xf2cb47 : 0xc4ad61), fruit = mat(healthy ? 0xc66a55 : 0x986957);
      for (let i = 0; i < (healthy ? 15 : 8); i++) {
        const a = r(10 + i) * Math.PI * 2;
        const isFruit = i % 3 === 0;
        const d = isFruit ? 1.2 + r(30 + i) * 0.4 : 0.65 + r(30 + i) * 0.6;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const y = h + (isFruit ? 0.45 + r(50 + i) * 0.3 : 1.85 + r(50 + i) * 0.4);
        if (isFruit) {
          strut(g, trunkMat, [x, y, z], [x, y - 0.32, z], 0.014);
          add(g, GEO.blobLow, fruit, x, y - 0.3, z, 0.15, 0.22, 0.13);
          add(g, GEO.blobLow, fruit, x + 0.13, y - 0.2, z + 0.06, 0.12, 0.18, 0.1);
        } else {
          add(g, GEO.blobLow, yellow, x, y, z, 0.18, 0.23, 0.16);
          add(g, GEO.blobLow, yellow, x + 0.07, y + 0.2, z, 0.11, 0.16, 0.1);
        }
      }
      break;
    }
  }

  if (!healthy) {
    for (let i = 0; i < 3; i++) {
      const a = r(300 + i) * Math.PI * 2;
      const tip: Point = [Math.cos(a) * 1.6, h + 0.5 + r(310 + i) * 0.6, Math.sin(a) * 1.4];
      strut(g, barkMat, [0, h * 0.8, 0], tip, 0.06 * w);
      strut(g, barkMat, tip, [tip[0] * 1.12, tip[1] + 0.35, tip[2] * 1.12], 0.027 * w);
    }
  }
  // 遠景保留花果辨識，但略去嫩葉、細枝和樹皮。
  const foliage = st.leaves.map((_, i) => L(i));
  for (const child of g.children) {
    const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    if (mesh.geometry === GEO.blobLow && mesh.material !== barkMat && !foliage.includes(mesh.material as THREE.MeshLambertMaterial)) {
      distant.add(mesh.clone());
    }
  }
  batchTree(g);
  batchTree(distant);
  const root = new THREE.Group();
  const lod = new THREE.LOD();
  lod.addLevel(g, 0);
  lod.addLevel(distant, 38, 0.12);
  root.add(lod);
  const s = STAGE_SCALE[info.stage] * (0.92 + r(50) * 0.16);
  root.userData.height = new THREE.Box3().setFromObject(g).max.y * s;
  root.scale.setScalar(s);
  root.rotation.order = 'ZYX';
  root.rotation.y = r(51) * Math.PI * 2;
  return root;
}

/** 共用有弧度與倒角的斧刃。 */
function axeBlade() {
  const outline = new THREE.Shape();
  outline.moveTo(0.04, 0.075);
  outline.lineTo(-0.1, 0.085);
  outline.quadraticCurveTo(-0.2, 0.1, -0.255, 0.17);
  outline.quadraticCurveTo(-0.31, 0, -0.255, -0.17);
  outline.quadraticCurveTo(-0.18, -0.1, -0.09, -0.075);
  outline.lineTo(0.04, -0.075);
  outline.closePath();
  return new THREE.ExtrudeGeometry(outline, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, steps: 1, curveSegments: 5 }).translate(0, 0, -0.0275);
}
const AXE_BLADE = axeBlade();

/** 斧頭（附著於相機，第一人稱視角）。 */
export function buildAxe(): THREE.Group {
  const pivot = new THREE.Group();
  const wood = mat(0xa87746), leather = mat(0x4a3830), steel = mat(0x77848c);
  strut(pivot, wood, [0.035, -0.025, 0], [-0.015, 0.9, 0], 0.047);
  for (let i = 0; i < 7; i++) {
    add(pivot, GEO.cylinder, i % 2 ? mat(0x655044) : leather, 0.031 - i * 0.002, 0.045 + i * 0.038, 0, 0.052, 0.033, 0.05);
  }
  add(pivot, GEO.cylinder, steel, -0.01, 0.73, 0, 0.043, 0.09, 0.041);
  const head = new THREE.Group();
  add(head, AXE_BLADE, steel, 0, 0, 0, 1);
  add(head, GEO.box, mat(0xdde7e9), -0.27, 0, 0, 0.025, 0.27, 0.065).rotation.z = -0.035;
  add(head, GEO.box, mat(0x515d65), 0.055, 0, 0, 0.095, 0.135, 0.095);
  add(head, GEO.cylinder, wood, 0, 0.09, 0, 0.027, 0.025, 0.026);
  for (const z of [-0.04, 0.04]) add(head, GEO.cylinder, mat(0xb4c0c5), 0, 0, z, 0.019, 0.01, 0.019).rotation.x = Math.PI / 2;
  head.position.set(-0.015, 0.86, 0);
  head.scale.setScalar(0.85);
  pivot.add(head);
  return pivot;
}

/** 各設備的代表模型。userData 動畫節點維持與 SceneController 相容。 */
export function buildEquipment(): THREE.Object3D[] {
  const orange = mat(0xe97929), grey = mat(0x7c8990), dark = mat(0x303b42);
  const yellow = mat(0xe9b93f), silver = mat(0xc1cdd0), rubber = mat(0x20292e);
  const glass = mat(0x72b1c8), green = mat(0x438968);
  const redLight = mat(0xff5a49, { emissive: 0x992211 });
  const blueLight = mat(0x9be7f2, { emissive: 0x268eaa });
  const wheel = (g: THREE.Group, x: number, y: number, z: number, radius: number, width: number) => {
    add(g, GEO.tire, rubber, x, y, z, radius, radius, width).rotation.y = Math.PI / 2;
    add(g, GEO.cylinder, grey, x, y, z, radius * 0.5, width * 0.6, radius * 0.5).rotation.z = Math.PI / 2;
    add(g, GEO.cylinder, silver, x + Math.sign(x) * width * 0.32, y, z, radius * 0.18, 0.02, radius * 0.18).rotation.z = Math.PI / 2;
  };

  // 0 電鋸：散熱柵、把手與獨立振動的導板／鏈齒。
  const saw = new THREE.Group();
  add(saw, GEO.box, orange, -0.025, 0, 0, 0.34, 0.22, 0.2);
  add(saw, GEO.box, dark, -0.06, -0.1, 0, 0.31, 0.045, 0.22);
  add(saw, GEO.cylinder, grey, 0.04, 0, 0.108, 0.073, 0.025, 0.073).rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) add(saw, GEO.box, dark, -0.14 + i * 0.035, 0.025, -0.104, 0.014, 0.085, 0.008);
  add(saw, GEO.ring, rubber, -0.04, 0.13, 0, 0.13, 0.12, 0.13).rotation.y = Math.PI / 2;
  add(saw, GEO.box, dark, -0.25, 0.015, 0, 0.15, 0.055, 0.07);
  strut(saw, dark, [-0.31, 0.015, 0], [-0.18, -0.09, 0], 0.025);
  add(saw, GEO.box, dark, 0.13, 0.105, 0, 0.035, 0.15, 0.2).rotation.z = -0.2;
  const sawBlade = new THREE.Group();
  sawBlade.position.x = 0.12;
  add(sawBlade, GEO.box, dark, 0.23, 0, 0, 0.48, 0.09, 0.035);
  add(sawBlade, GEO.box, silver, 0.23, 0, 0, 0.44, 0.055, 0.04);
  add(sawBlade, GEO.box, grey, 0.23, 0, 0.022, 0.32, 0.012, 0.005);
  for (let i = 0; i < 10; i++) for (const y of [-0.05, 0.05]) {
    add(sawBlade, GEO.box, silver, 0.025 + i * 0.047, y, 0, 0.019, 0.021, 0.044).rotation.z = 0.35;
  }
  saw.add(sawBlade);
  saw.userData.spin = sawBlade;
  saw.position.set(-0.55, 0.45, 0.25);

  // 1 自動揮斧機：底座、樞軸、液壓桿。
  const arm = new THREE.Group();
  add(arm, GEO.box, dark, 0, 0.07, 0, 0.62, 0.14, 0.58);
  add(arm, GEO.box, yellow, 0, 0.27, 0, 0.43, 0.3, 0.4);
  for (const x of [-0.24, 0.24]) for (const z of [-0.22, 0.22]) add(arm, GEO.cylinder, silver, x, 0.15, z, 0.026, 0.025, 0.026);
  add(arm, GEO.cylinder, grey, 0, 0.44, 0, 0.14, 0.3, 0.14).rotation.x = Math.PI / 2;
  const joint = new THREE.Group();
  joint.position.set(0, 0.45, 0);
  add(joint, GEO.box, yellow, 0, 0.37, 0, 0.15, 0.74, 0.18).rotation.z = -0.1;
  strut(joint, grey, [-0.11, 0.08, 0.12], [-0.15, 0.5, 0.12], 0.045);
  strut(joint, silver, [-0.15, 0.5, 0.12], [-0.06, 0.72, 0.12], 0.025);
  add(joint, GEO.cylinder, dark, 0.07, 0.77, 0, 0.1, 0.25, 0.1).rotation.x = Math.PI / 2;
  add(joint, GEO.box, grey, -0.2, 0.79, 0, 0.55, 0.09, 0.1);
  add(joint, AXE_BLADE, silver, -0.47, 0.79, 0, 1.1);
  arm.add(joint);
  arm.userData.swing = joint;
  arm.position.set(0.95, 0, 0.35);

  // 2 粉碎機：開口料斗、飛輪、出料管與輪式底盤。
  const shred = new THREE.Group();
  add(shred, GEO.box, dark, 0, 0.18, 0, 0.88, 0.14, 0.68);
  add(shred, GEO.box, green, 0, 0.5, 0, 0.7, 0.5, 0.56);
  for (const x of [-0.42, 0.42]) wheel(shred, x, 0.18, 0.13, 0.18, 0.19);
  add(shred, GEO.box, dark, 0, 0.765, 0, 0.44, 0.035, 0.39);
  for (const x of [-1, 1]) add(shred, GEO.box, green, x * 0.28, 0.91, 0, 0.055, 0.3, 0.55).rotation.z = -x * 0.35;
  for (const z of [-1, 1]) add(shred, GEO.box, green, 0, 0.91, z * 0.25, 0.56, 0.3, 0.055).rotation.x = z * 0.35;
  const disc = new THREE.Group();
  disc.position.set(0.39, 0.5, 0);
  add(disc, GEO.cylinder, grey, 0, 0, 0, 0.23, 0.06, 0.23).rotation.z = Math.PI / 2;
  add(disc, GEO.cylinder, yellow, 0.04, 0, 0, 0.065, 0.04, 0.065).rotation.z = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    add(disc, GEO.box, dark, 0.033, Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.012, 0.09, 0.035).rotation.x = -a;
  }
  shred.add(disc);
  strut(shred, green, [-0.2, 0.6, -0.15], [-0.24, 1.15, -0.4], 0.1);
  strut(shred, green, [-0.24, 1.15, -0.4], [-0.24, 1.22, -0.72], 0.09);
  add(shred, GEO.box, dark, -0.24, 1.22, -0.73, 0.16, 0.12, 0.025);
  shred.userData.spin = disc;
  shred.position.set(-1.6, 0, 0.9);

  // 3 伐木車：駕駛室、護欄、木材與附有夾爪的吊臂。
  const truck = new THREE.Group();
  add(truck, GEO.box, dark, 0, 0.35, 0, 1, 0.22, 2.75);
  add(truck, GEO.box, mat(0xc95338), 0, 0.72, -0.9, 0.96, 0.76, 0.82);
  add(truck, GEO.box, dark, 0, 1.12, -0.9, 1.04, 0.07, 0.9);
  add(truck, GEO.box, glass, 0, 0.88, -1.318, 0.81, 0.33, 0.018);
  for (const x of [-0.489, 0.489]) {
    add(truck, GEO.box, glass, x, 0.88, -0.94, 0.018, 0.33, 0.57);
    add(truck, GEO.box, silver, x * 1.15, 0.86, -1.22, 0.09, 0.14, 0.06);
    add(truck, GEO.box, dark, x, 0.65, -0.64, 0.025, 0.025, 0.1);
  }
  add(truck, GEO.box, grey, 0, 0.4, -1.37, 1.05, 0.13, 0.13);
  for (const x of [-0.33, 0.33]) add(truck, GEO.box, mat(0xffedb5, { emissive: 0x665020 }), x, 0.57, -1.33, 0.16, 0.1, 0.025);
  add(truck, GEO.box, dark, 0, 0.67, -1.334, 0.36, 0.12, 0.025);
  for (const z of [-0.92, 0.45, 1.05]) for (const x of [-0.54, 0.54]) wheel(truck, x, 0.25, z, 0.25, 0.26);
  add(truck, GEO.box, grey, 0, 0.49, 0.65, 1, 0.12, 1.72);
  for (const x of [-0.46, 0.46]) for (const z of [0.02, 1.32]) add(truck, GEO.box, dark, x, 0.83, z, 0.045, 0.65, 0.045);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.27;
    add(truck, GEO.cylinder, mat(0x755139), x, 0.7, 0.72, 0.14, 1.25, 0.14).rotation.x = Math.PI / 2;
    add(truck, GEO.cylinder, mat(0xd5b180), x, 0.7, 1.35, 0.118, 0.012, 0.118).rotation.x = Math.PI / 2;
  }
  const crane = new THREE.Group();
  crane.position.set(0, 0.61, -0.06);
  add(crane, GEO.cylinder, dark, 0, 0.05, 0, 0.19, 0.15, 0.19);
  strut(crane, yellow, [0, 0.1, 0], [-0.45, 1.12, 0], 0.1);
  strut(crane, yellow, [-0.45, 1.12, 0], [-1.05, 0.82, 0], 0.085);
  strut(crane, silver, [-0.07, 0.25, 0.09], [-0.54, 0.96, 0.09], 0.035);
  strut(crane, dark, [-1.05, 0.82, 0], [-1.05, 0.49, 0], 0.03);
  for (const side of [-1, 1]) {
    strut(crane, grey, [-1.05, 0.5, 0], [-1.05 + side * 0.15, 0.35, 0], 0.035);
    strut(crane, grey, [-1.05 + side * 0.15, 0.35, 0], [-1.05 + side * 0.07, 0.24, 0], 0.03);
  }
  truck.add(crane);
  truck.userData.swing = crane;
  truck.position.set(2.6, 0, 0.4);

  // 4 無人機：馬達、雙葉旋翼、起落架與下掛切割器。
  const drone = new THREE.Group();
  add(drone, GEO.blobLow, dark, 0, 0, 0, 0.23, 0.1, 0.23);
  add(drone, GEO.box, orange, 0, 0.07, 0, 0.22, 0.06, 0.27);
  const rotors: THREE.Group[] = [];
  for (const [x, z] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) {
    strut(drone, grey, [x * 0.2, 0, z * 0.2], [x, 0, z], 0.035);
    add(drone, GEO.cylinder, dark, x, 0.025, z, 0.055, 0.095, 0.055);
    const rotor = new THREE.Group();
    rotor.position.set(x, 0.08, z);
    add(rotor, GEO.box, silver, 0, 0, 0, 0.42, 0.012, 0.038);
    add(rotor, GEO.cylinder, grey, 0, 0.015, 0, 0.025, 0.035, 0.025);
    drone.add(rotor);
    rotors.push(rotor);
  }
  for (const x of [-0.16, 0.16]) {
    strut(drone, dark, [x, -0.03, -0.12], [x, -0.22, -0.18], 0.018);
    strut(drone, dark, [x, -0.03, 0.12], [x, -0.22, 0.18], 0.018);
    strut(drone, grey, [x, -0.22, -0.23], [x, -0.22, 0.23], 0.018);
  }
  add(drone, GEO.cylinder, grey, 0, -0.17, 0, 0.1, 0.025, 0.1);
  add(drone, GEO.box, redLight, -0.1, 0, 0.21, 0.045, 0.035, 0.025);
  add(drone, GEO.box, blueLight, 0.1, 0, 0.21, 0.045, 0.035, 0.025);
  drone.userData.rotors = rotors;
  drone.position.set(0.9, 2.8, 0.9);

  // 5 雷射砲：支腳、散熱環與發光鏡頭，光束沿 barrel 的 +X 軸延伸。
  const laser = new THREE.Group();
  add(laser, GEO.cylinder, dark, 0, 0.12, 0, 0.33, 0.24, 0.33);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    strut(laser, grey, [0, 0.26, 0], [Math.cos(a) * 0.46, 0.06, Math.sin(a) * 0.46], 0.065);
  }
  add(laser, GEO.cylinder, grey, 0, 0.4, 0, 0.13, 0.4, 0.13);
  const barrel = new THREE.Group();
  barrel.position.set(0, 0.6, 0);
  add(barrel, GEO.box, dark, -0.03, 0, 0, 0.38, 0.28, 0.3);
  add(barrel, GEO.cylinder, grey, 0.35, 0, 0, 0.085, 0.65, 0.085).rotation.z = Math.PI / 2;
  for (let i = 0; i < 5; i++) add(barrel, GEO.cylinder, dark, 0.14 + i * 0.1, 0, 0, 0.115, 0.025, 0.115).rotation.z = Math.PI / 2;
  add(barrel, GEO.cylinder, silver, 0.69, 0, 0, 0.105, 0.07, 0.105).rotation.z = Math.PI / 2;
  add(barrel, GEO.cylinder, blueLight, 0.732, 0, 0, 0.073, 0.012, 0.073).rotation.z = Math.PI / 2;
  for (const z of [-0.155, 0.155]) add(barrel, GEO.box, blueLight, -0.04, 0.02, z, 0.18, 0.045, 0.012);
  laser.add(barrel);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1, 6).translate(0, 0.5, 0).rotateZ(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.position.x = 0.74;
  barrel.add(beam);
  laser.userData.beam = beam;
  laser.userData.barrel = barrel;
  laser.position.set(-2.6, 0, -0.6);

  // 6 軌道衛星：受動畫控制的雙層光柱，衛星本體位於光柱上端。
  const sat = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 60, 16, 1, true).translate(0, 30, 0),
    new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.25, 60, 10, 1, true).translate(0, 30, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  sat.add(pillar, core);
  add(sat, GEO.cylinder, silver, 0, 60, 0, 0.8, 1.6, 0.8);
  add(sat, GEO.cone, grey, 0, 58.85, 0, 1.1, 0.7, 1.1).rotation.x = Math.PI;
  add(sat, GEO.cylinder, blueLight, 0, 58.45, 0, 0.38, 0.08, 0.38);
  for (const side of [-1, 1]) {
    strut(sat, grey, [0, 60, 0], [side * 3, 60, 0], 0.09);
    add(sat, GEO.box, mat(0x294b70), side * 2.7, 60, 0, 3.3, 0.08, 2.2);
    for (let i = 0; i < 5; i++) add(sat, GEO.box, silver, side * 2.7 - 1.5 + i * 0.75, 60.05, 0, 0.025, 0.015, 2.2);
  }
  sat.userData.pillar = pillar;
  sat.userData.core = core;
  return [saw, arm, shred, truck, drone, laser, sat];
}
