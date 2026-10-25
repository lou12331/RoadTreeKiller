import * as THREE from 'three';
import type { SpeciesId } from '../core/data';
import { hashRandom, type TreeInfo } from '../core/trees';

// 共用幾何與材質：所有樹木只建立 Mesh，不重複建立 Geometry / Material。
export const GEO = {
  trunk: new THREE.CylinderGeometry(0.16, 0.26, 1, 7).translate(0, 0.5, 0),
  blob: new THREE.IcosahedronGeometry(1, 1),
  blobLow: new THREE.IcosahedronGeometry(1, 0),
  disc: new THREE.CylinderGeometry(1, 0.85, 0.28, 9),
  cone: new THREE.ConeGeometry(1, 1, 7),
  root: new THREE.CylinderGeometry(0.025, 0.035, 1, 4).translate(0, -0.5, 0),
  dot: new THREE.IcosahedronGeometry(0.12, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  stump: new THREE.CylinderGeometry(0.24, 0.3, 0.3, 8).translate(0, 0.15, 0),
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
  const c = new THREE.Color(color).lerp(SICK, 0.55);
  return mat('#' + c.getHexString());
}

interface SpeciesStyle {
  trunk: number;
  trunkH: number;
  trunkW: number;
  leaves: number[];
}

const STYLE: Record<SpeciesId, SpeciesStyle> = {
  banyan: { trunk: 0x6b5442, trunkH: 2.2, trunkW: 1.5, leaves: [0x3c7a2c, 0x467f32] },
  camphor: { trunk: 0x5c4636, trunkH: 2.3, trunkW: 1.1, leaves: [0x4c8f30, 0x5a9b38] },
  terminalia: { trunk: 0x8a7a68, trunkH: 3.2, trunkW: 0.8, leaves: [0x6eaa4c, 0x7db559] },
  cassia: { trunk: 0x6e5a48, trunkH: 2.3, trunkW: 0.9, leaves: [0x6b9e3a, 0x77a843] },
  sweetgum: { trunk: 0x5e4a3a, trunkH: 2.6, trunkW: 0.9, leaves: [0xd65a26, 0xe8883a, 0xc94a22] },
  bishopwood: { trunk: 0x5a4030, trunkH: 2.0, trunkW: 1.8, leaves: [0x2f6b2a, 0x3a7a30] },
  goldenrain: { trunk: 0x66503e, trunkH: 2.4, trunkW: 1.0, leaves: [0x5d9a3a, 0x68a443] },
};

const STAGE_SCALE = { sapling: 0.45, mature: 1, giant: 1.65 };

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

/** 依樹種／成長／健康建立低面數樹木。回傳的 group 原點在樹根。 */
export function buildTree(info: TreeInfo, seed: number): THREE.Group {
  const g = new THREE.Group();
  const st = STYLE[info.species.id];
  const r = (salt: number) => hashRandom(seed, info.index, 100 + salt);
  const healthy = info.healthy;
  const sparse = healthy ? 1 : 0.82;
  const L = (i: number) => leaf(st.leaves[i % st.leaves.length], healthy);
  const trunkMat = mat(st.trunk);
  const h = st.trunkH * (0.9 + r(0) * 0.2);
  const giantW = info.stage === 'giant' ? 1.3 : 1;
  add(g, GEO.trunk, trunkMat, 0, 0, 0, st.trunkW * giantW, h, st.trunkW * giantW);

  switch (info.species.id) {
    case 'banyan': {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + r(i);
        add(g, GEO.blob, L(i), Math.cos(a) * 1.1, h + 0.5 + r(i + 5) * 0.4, Math.sin(a) * 0.8, 1.15 * sparse, 0.8 * sparse, 1.1 * sparse);
      }
      add(g, GEO.blob, L(1), 0, h + 1.0, 0, 1.3 * sparse, 0.9 * sparse, 1.2 * sparse);
      const rootMat = mat(0x7a6450);
      for (let i = 0; i < 9; i++) {
        const a = r(20 + i) * Math.PI * 2;
        const d = 0.5 + r(30 + i) * 1.1;
        add(g, GEO.root, rootMat, Math.cos(a) * d, h + 0.2, Math.sin(a) * d * 0.8, 1, 0.8 + r(40 + i) * 1.2, 1);
      }
      break;
    }
    case 'camphor':
      add(g, GEO.blob, L(0), 0, h + 0.9, 0, 1.4 * sparse, 1.2 * sparse, 1.3 * sparse);
      add(g, GEO.blob, L(1), 0.6, h + 0.5, 0.2, 0.9 * sparse);
      add(g, GEO.blob, L(1), -0.6, h + 0.6, -0.1, 0.95 * sparse);
      add(g, GEO.blob, L(0), 0.1, h + 1.7, 0, 0.85 * sparse);
      break;
    case 'terminalia':
      for (let i = 0; i < 4; i++) {
        const s = (1.5 - i * 0.32) * sparse;
        const m = add(g, GEO.disc, L(i), 0, h - 0.9 + i * 0.75, 0, s, 1, s);
        m.rotation.y = r(i) * Math.PI;
      }
      break;
    case 'cassia': {
      add(g, GEO.blob, L(0), 0, h + 0.7, 0, 1.25 * sparse, 0.95 * sparse, 1.2 * sparse);
      add(g, GEO.blob, L(1), 0.7, h + 0.4, 0.3, 0.8 * sparse);
      add(g, GEO.blob, L(1), -0.7, h + 0.45, -0.2, 0.8 * sparse);
      const flower = mat(healthy ? 0xf6d33c : 0xd8c060);
      for (let i = 0; i < 14; i++) {
        const a = r(10 + i) * Math.PI * 2;
        const d = 0.6 + r(20 + i) * 0.6;
        const m = add(g, GEO.cone, flower, Math.cos(a) * d, h + 0.05 + r(30 + i) * 0.4, Math.sin(a) * d, 0.12, 0.5, 0.12);
        m.rotation.x = Math.PI;
      }
      break;
    }
    case 'sweetgum':
      add(g, GEO.cone, L(0), 0, h + 1.0, 0, 1.3 * sparse, 2.6, 1.3 * sparse);
      add(g, GEO.blob, L(1), 0.45, h + 0.5, 0.3, 0.7 * sparse);
      add(g, GEO.blob, L(2), -0.4, h + 0.9, -0.2, 0.65 * sparse);
      break;
    case 'bishopwood':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + r(i);
        add(g, GEO.blob, L(i), Math.cos(a) * 0.9, h + 0.6 + r(i + 5) * 0.6, Math.sin(a) * 0.7, 1.0 * sparse);
      }
      add(g, GEO.blob, L(0), 0, h + 1.3, 0, 1.25 * sparse);
      break;
    case 'goldenrain': {
      add(g, GEO.blob, L(0), 0, h + 0.8, 0, 1.25 * sparse, 1.0 * sparse, 1.2 * sparse);
      add(g, GEO.blob, L(1), 0.6, h + 0.4, 0, 0.8 * sparse);
      add(g, GEO.blob, L(1), -0.55, h + 0.5, 0.2, 0.75 * sparse);
      const yellow = mat(0xf2c93b);
      const brown = mat(0xb5523b);
      for (let i = 0; i < 16; i++) {
        const a = r(10 + i) * Math.PI * 2;
        const y = h + 0.6 + r(20 + i) * 1.0;
        add(g, GEO.dot, i % 2 ? yellow : brown, Math.cos(a) * 1.0, y, Math.sin(a) * 0.95, 1 + r(30 + i));
      }
      break;
    }
  }

  const s = STAGE_SCALE[info.stage] * (0.92 + r(50) * 0.16);
  g.scale.setScalar(s);
  g.rotation.order = 'ZYX'; // 倒下（z 軸）方向不受隨機朝向影響
  g.rotation.y = r(51) * Math.PI * 2;
  g.userData.height = (h + 2) * s;
  return g;
}

/** 斧頭（附著於相機，第一人稱視角）。 */
export function buildAxe(): THREE.Group {
  const pivot = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.95, 8), mat(0x9a6634, { flat: false }));
  handle.position.y = 0.45;
  pivot.add(handle);
  const head = new THREE.Group();
  const metal = mat(0x8c9399);
  const edge = mat(0xd9dee2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.08), metal);
  head.add(body);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.04), metal);
  blade.position.x = -0.13;
  head.add(blade);
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.045), edge);
  bit.position.x = -0.24;
  head.add(bit);
  head.position.y = 0.86;
  pivot.add(head);
  return pivot;
}

/** 各設備的代表模型。 */
export function buildEquipment(): THREE.Object3D[] {
  const orange = mat(0xf07a1a);
  const grey = mat(0x707880);
  const dark = mat(0x33383d);
  const yellow = mat(0xf2c230);

  // 0 電鋸
  const saw = new THREE.Group();
  add(saw, GEO.box, orange, 0, 0, 0, 0.3, 0.2, 0.18);
  const sawBlade = add(saw, GEO.box, grey, 0.3, 0, 0, 0.45, 0.07, 0.03);
  saw.userData.spin = sawBlade;
  saw.position.set(-0.55, 0.45, 0.25);

  // 1 自動揮斧機
  const arm = new THREE.Group();
  add(arm, GEO.box, yellow, 0, 0.2, 0, 0.5, 0.4, 0.5);
  const joint = new THREE.Group();
  joint.position.set(0, 0.45, 0);
  add(joint, GEO.box, yellow, 0, 0.4, 0, 0.14, 0.8, 0.14);
  const fore = new THREE.Group();
  fore.position.set(0, 0.8, 0);
  add(fore, GEO.box, dark, -0.25, 0, 0, 0.5, 0.1, 0.1);
  add(fore, GEO.box, grey, -0.5, 0, 0, 0.06, 0.25, 0.2);
  joint.add(fore);
  arm.add(joint);
  arm.userData.swing = joint;
  arm.position.set(0.95, 0, 0.35);

  // 2 樹木粉碎機
  const shred = new THREE.Group();
  add(shred, GEO.box, mat(0x2f7d4a), 0, 0.35, 0, 0.8, 0.7, 0.6);
  add(shred, GEO.cone, dark, 0, 0.85, 0, 0.35, 0.4, 0.35).rotation.x = Math.PI;
  const disc = add(shred, new THREE.CylinderGeometry(0.25, 0.25, 0.05, 10), grey, 0.42, 0.4, 0, 1);
  disc.rotation.z = Math.PI / 2;
  shred.userData.spin = disc;
  shred.position.set(-1.6, 0, 0.9);

  // 3 自動伐木車
  const truck = new THREE.Group();
  add(truck, GEO.box, mat(0xd94a2a), 0, 0.55, -0.9, 1.0, 0.8, 0.9);
  add(truck, GEO.box, mat(0x8fb7d0), 0, 0.75, -1.36, 0.85, 0.35, 0.02);
  add(truck, GEO.box, grey, 0, 0.45, 0.4, 1.0, 0.4, 1.8);
  for (const [x, z] of [[-0.5, -0.9], [0.5, -0.9], [-0.5, 0.8], [0.5, 0.8]]) {
    add(truck, new THREE.CylinderGeometry(0.22, 0.22, 0.15, 10), dark, x, 0.22, z, 1).rotation.z = Math.PI / 2;
  }
  const crane = new THREE.Group();
  crane.position.set(0, 0.7, 0.4);
  add(crane, GEO.box, yellow, -0.7, 0.4, 0, 1.6, 0.12, 0.12).rotation.z = 0.5;
  truck.add(crane);
  truck.userData.swing = crane;
  truck.position.set(2.6, 0, 0.4);

  // 4 伐木無人機
  const drone = new THREE.Group();
  add(drone, GEO.box, dark, 0, 0, 0, 0.35, 0.1, 0.35);
  const rotors: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
    add(drone, GEO.box, grey, x * 0.6, 0, z * 0.6, 0.3, 0.04, 0.04).rotation.y = Math.atan2(z, x);
    rotors.push(add(drone, GEO.box, mat(0xcfd6dc), x, 0.06, z, 0.3, 0.01, 0.04));
  }
  add(drone, GEO.box, mat(0xff4040, { emissive: 0xaa0000 }), 0, -0.07, 0.18, 0.06, 0.04, 0.02);
  drone.userData.rotors = rotors;
  drone.position.set(0.9, 2.8, 0.9);

  // 5 雷射伐木砲
  const laser = new THREE.Group();
  add(laser, GEO.box, dark, 0, 0.25, 0, 0.6, 0.5, 0.6);
  const barrel = new THREE.Group();
  barrel.position.set(0, 0.6, 0);
  add(barrel, GEO.box, grey, 0, 0, 0, 0.35, 0.3, 0.35);
  add(barrel, new THREE.CylinderGeometry(0.06, 0.08, 0.7, 8), grey, 0.35, 0, 0, 1).rotation.z = Math.PI / 2;
  laser.add(barrel);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1, 6).translate(0, 0.5, 0).rotateZ(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  barrel.add(beam);
  laser.userData.beam = beam;
  laser.userData.barrel = barrel;
  laser.position.set(-2.6, 0, -0.6);

  // 6 軌道伐木衛星：天空光柱
  const sat = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 60, 16, 1, true).translate(0, 30, 0),
    new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  sat.add(pillar);
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.25, 60, 10, 1, true).translate(0, 30, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  sat.add(core);
  sat.userData.pillar = pillar;
  sat.userData.core = core;

  return [saw, arm, shred, truck, drone, laser, sat];
}
