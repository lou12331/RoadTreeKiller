import { OFFLINE_EFFICIENCY, OFFLINE_MAX_SECONDS, TARGET_TREES } from './data';
import { clickDamage, goldMultiplier, totalDps } from './economy';
import type { GameState } from './state';
import { generateTree } from './trees';

export const TICK = 0.1; // 固定步進（秒）

export interface DamageResult {
  killed: number;
  gold: number;
  used?: number; // 實際作用到樹上的傷害（全部砍完後的溢出不計）
}

/** 對目前樹木造成傷害，溢出傷害傳遞至後續樹木。邏輯與畫面完全分離。 */
export function applyDamage(s: GameState, amount: number, auto: boolean): DamageResult {
  const res: DamageResult = { killed: 0, gold: 0 };
  let dmg = amount;
  const finish = () => { res.used = amount - (s.felled >= TARGET_TREES ? dmg : 0); return res; };
  while (dmg > 0 && s.felled < TARGET_TREES) {
    const tree = generateTree(s.seed, s.felled);
    const remaining = tree.hp - s.treeDamage;
    if (dmg < remaining) {
      s.treeDamage += dmg;
      dmg = 0;
      break;
    }
    dmg -= remaining;
    const g = Math.ceil(tree.gold * goldMultiplier(s, s.felled, auto));
    s.gold += g;
    s.totalGold += g;
    res.gold += g;
    res.killed++;
    s.felled++;
    s.treeDamage = 0;
  }
  if (s.felled >= TARGET_TREES) s.treeDamage = 0;
  return finish();
}

export function chop(s: GameState): DamageResult & { damage: number } {
  s.clicks++;
  const damage = clickDamage(s);
  return { ...applyDamage(s, damage, false), damage };
}

/** 固定步進推進 dt 秒的設備傷害。 */
export function advance(s: GameState, dt: number): DamageResult {
  s.playTime += dt;
  return autoDamage(s, totalDps(s) * dt);
}

/** 設備傷害（累計至 autoDamage 統計）。 */
export function autoDamage(s: GameState, amount: number): DamageResult {
  const res = applyDamage(s, amount, true);
  s.autoDamage += res.used ?? 0;
  return res;
}

/** 離線結算：依時間差，最長 8 小時、效率 50%。 */
export function settleOffline(s: GameState, seconds: number): DamageResult & { seconds: number } {
  const t = Math.min(Math.max(0, seconds), OFFLINE_MAX_SECONDS);
  s.idleTime += t;
  const res = autoDamage(s, totalDps(s) * t * OFFLINE_EFFICIENCY);
  return { ...res, seconds: t };
}
