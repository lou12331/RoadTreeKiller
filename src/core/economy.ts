import { AXE_BASE_COST, AXE_GROWTH, EQUIPMENT, EQUIP_GROWTH, TARGET_TREES, UPGRADES, type Upgrade } from './data';
import type { GameState } from './state';
import { tierFor } from './trees';

const has = (s: GameState, id: string) => s.upgrades.includes(id);

/** New Game+ 經驗加成 */
export const ngBonus = (s: GameState) => 1 + 0.5 * s.ngPlus;

export function clickDamage(s: GameState): number {
  let d = 1 + s.axeLevel;
  for (const u of UPGRADES) if (u.effect.kind === 'clickMul' && has(s, u.id)) d *= u.effect.value;
  return d * ngBonus(s);
}

export function equipmentMultiplier(s: GameState, i: number): number {
  let m = ngBonus(s);
  for (const u of UPGRADES) {
    if (u.effect.kind !== 'dpsMul' || !has(s, u.id)) continue;
    if (u.effect.only && !u.effect.only.includes(i)) continue;
    m *= u.effect.value;
  }
  return m;
}

export function equipmentDps(s: GameState, i: number): number {
  return s.equipment[i] * EQUIPMENT[i].dps * equipmentMultiplier(s, i);
}

export function totalDps(s: GameState): number {
  if (s.felled >= TARGET_TREES) return 0;
  let sum = 0;
  for (let i = 0; i < EQUIPMENT.length; i++) sum += equipmentDps(s, i);
  return sum;
}

export function goldMultiplier(s: GameState, felled: number, auto: boolean): number {
  let m = tierFor(felled).gold * ngBonus(s);
  for (const u of UPGRADES) {
    if (!has(s, u.id)) continue;
    if (u.effect.kind === 'goldMul') m *= u.effect.value;
    if (auto && u.effect.kind === 'autoGoldMul') m *= u.effect.value;
  }
  return m;
}

export const axeCost = (level: number) => Math.ceil(AXE_BASE_COST * AXE_GROWTH ** level);

export const equipCost = (i: number, owned: number) => Math.ceil(EQUIPMENT[i].cost * EQUIP_GROWTH ** owned);

/** 計算購買 want 台（want = Infinity 代表最大可購買）的數量與總價。 */
export function bulkEquip(s: GameState, i: number, want: number): { count: number; cost: number } {
  let count = 0;
  let cost = 0;
  const owned = s.equipment[i];
  const max = Number.isFinite(want) ? want : 10_000;
  while (count < max) {
    const next = equipCost(i, owned + count);
    if (!Number.isFinite(want) && cost + next > s.gold) break;
    cost += next;
    count++;
  }
  return { count, cost };
}

export function buyEquip(s: GameState, i: number, want: number): number {
  const { count, cost } = bulkEquip(s, i, want);
  if (count === 0 || cost > s.gold) return 0;
  s.gold -= cost;
  s.equipment[i] += count;
  return count;
}

export function buyAxe(s: GameState): boolean {
  const c = axeCost(s.axeLevel);
  if (s.gold < c) return false;
  s.gold -= c;
  s.axeLevel++;
  return true;
}

export const totalEquipment = (s: GameState) => s.equipment.reduce((a, b) => a + b, 0);

export function upgradeUnlocked(s: GameState, u: Upgrade): boolean {
  if (u.unlock.felled !== undefined && s.felled < u.unlock.felled) return false;
  if (u.unlock.equipment !== undefined && totalEquipment(s) < u.unlock.equipment) return false;
  return true;
}

export function buyUpgrade(s: GameState, u: Upgrade): boolean {
  if (has(s, u.id) || !upgradeUnlocked(s, u) || s.gold < u.cost) return false;
  s.gold -= u.cost;
  s.upgrades.push(u.id);
  return true;
}
