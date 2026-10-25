import { HEALTH, HP_CURVE, NO_GIANT_BEFORE, SPECIES, STAGES, TIERS, type Species, type StageId } from './data';

/** 以 (seed, index, salt) 產生 [0,1) 的可重現亂數，不預先生成整條街的樹。 */
export function hashRandom(seed: number, index: number, salt: number): number {
  let h = (seed ^ Math.imul(index, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface TreeInfo {
  index: number;
  species: Species;
  stage: StageId;
  stageName: string;
  healthy: boolean;
  healthName: string | null;
  hp: number;
  gold: number; // 未套用任何倍率的金幣
}

export function tierFor(felled: number) {
  let t = TIERS[0];
  for (const tier of TIERS) if (felled >= tier.from) t = tier;
  return t;
}

const AVG_SPECIES_HP = SPECIES.reduce((a, s) => a + s.hp, 0) / SPECIES.length;

/** 平均樹種成樹在第 index 棵時的 HP（錨點間對數內插）。 */
export function hpCurve(index: number): number {
  for (let i = 1; i < HP_CURVE.length; i++) {
    const [x1, y1] = HP_CURVE[i];
    if (index <= x1) {
      const [x0, y0] = HP_CURVE[i - 1];
      const t = (index - x0) / (x1 - x0);
      return y0 * (y1 / y0) ** t;
    }
  }
  return HP_CURVE[HP_CURVE.length - 1][1];
}

const cache = new Map<string, TreeInfo>();

export function generateTree(seed: number, index: number): TreeInfo {
  const key = seed + ':' + index;
  const hit = cache.get(key);
  if (hit) return hit;

  const species = SPECIES[Math.floor(hashRandom(seed, index, 1) * SPECIES.length)];
  const r = hashRandom(seed, index, 2);
  let acc = 0;
  let stage = STAGES[STAGES.length - 1];
  for (const s of STAGES) {
    acc += s.weight;
    if (r < acc) { stage = s; break; }
  }
  if (stage.id === 'giant' && index < NO_GIANT_BEFORE) stage = STAGES.find((s) => s.id === 'mature')!;
  // 幼樹不套用健康倍率
  const healthy = stage.id === 'sapling' || hashRandom(seed, index, 3) < HEALTH.healthy.weight;
  const health = healthy ? HEALTH.healthy : HEALTH.unhealthy;

  const info: TreeInfo = {
    index,
    species,
    stage: stage.id,
    stageName: stage.name,
    healthy,
    healthName: stage.id === 'sapling' ? null : health.name,
    hp: Math.ceil((species.hp / AVG_SPECIES_HP) * stage.hp * health.hp * hpCurve(index)),
    gold: Math.ceil(species.gold * stage.gold * health.gold),
  };
  if (cache.size > 512) cache.clear();
  cache.set(key, info);
  return info;
}
