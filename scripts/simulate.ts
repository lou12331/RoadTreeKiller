// 經濟模擬：npm run sim
// 三種策略：積極點擊並最佳化購買、偶爾點擊且定期購買、主要依賴放置。
import { EQUIPMENT, PHASES, TARGET_TREES, UPGRADES } from '../src/core/data';
import {
  axeCost, buyAxe, buyEquip, buyUpgrade, clickDamage, equipCost, goldMultiplier, totalDps, upgradeUnlocked,
} from '../src/core/economy';
import { applyDamage, advance } from '../src/core/sim';
import { newState, type GameState } from '../src/core/state';
import { generateTree } from '../src/core/trees';

interface Strategy { name: string; cps: (t: number) => number; buyEvery: number }

const strategies: Strategy[] = [
  { name: '積極點擊＋最佳化購買', cps: () => 6, buyEvery: 1 },
  { name: '偶爾點擊＋定期購買', cps: (t) => (t % 600 < 60 ? 4 : 0), buyEvery: 120 },
  { name: '主要依賴放置', cps: (t) => (t < 300 ? 3 : 0), buyEvery: 600 },
];

function goldRate(s: GameState, cps: number): number {
  const tree = generateTree(s.seed, s.felled);
  const goldPerDmg = (tree.gold * goldMultiplier(s, s.felled, true)) / tree.hp;
  return (clickDamage(s) * cps + totalDps(s)) * goldPerDmg;
}

type Option = { cost: number; apply: () => boolean; label: string };

function options(s: GameState): Option[] {
  const out: Option[] = [{ cost: axeCost(s.axeLevel), apply: () => buyAxe(s), label: 'axe' }];
  EQUIPMENT.forEach((e, i) => out.push({ cost: equipCost(i, s.equipment[i]), apply: () => buyEquip(s, i, 1) > 0, label: e.id }));
  for (const u of UPGRADES) {
    if (!s.upgrades.includes(u.id) && upgradeUnlocked(s, u)) out.push({ cost: u.cost, apply: () => buyUpgrade(s, u), label: u.id });
  }
  return out;
}

/** 以「金幣速率增量 / 價格」選出最佳購買。 */
function best(s: GameState, cps: number): Option | null {
  const base = goldRate(s, cps);
  let pick: Option | null = null;
  let bestScore = 0;
  for (const o of options(s)) {
    const copy: GameState = JSON.parse(JSON.stringify(s));
    copy.gold = Infinity;
    const opt = options(copy).find((x) => x.label === o.label)!;
    opt.apply();
    const gain = goldRate(copy, cps) - base;
    // 加入等待時間的懲罰，避免永遠等待遙不可及的選項
    const wait = Math.max(0, o.cost - s.gold) / Math.max(base, 1e-9);
    const score = gain / (o.cost + wait * base * 0.5);
    if (score > bestScore) { bestScore = score; pick = o; }
  }
  return pick;
}

function run(st: Strategy) {
  const s = newState();
  s.seed = 12345;
  let t = 0;
  const phaseTimes: number[] = [];
  const firstBuy: Record<string, number> = {};
  while (s.felled < TARGET_TREES && t < 30 * 3600) {
    const cps = st.cps(t);
    const clicks = Math.floor(cps);
    for (let c = 0; c < clicks; c++) { s.clicks++; applyDamage(s, clickDamage(s), false); }
    advance(s, 1);
    t++;
    PHASES.forEach((p, i) => { if (phaseTimes[i] === undefined && s.felled >= p.from) phaseTimes[i] = t; });
    if (t % st.buyEvery === 0) {
      for (let k = 0; k < 500; k++) {
        const o = best(s, Math.max(cps, st.cps(t + 1)));
        if (!o || o.cost > s.gold) break;
        o.apply();
        if (firstBuy[o.label] === undefined) firstBuy[o.label] = t;
      }
    }
  }
  const fmt = (x: number) => `${(x / 3600).toFixed(2)}h`;
  console.log(`\n== ${st.name} ==  通關 ${fmt(t)}  ${s.felled}/${TARGET_TREES}`);
  console.log('階段開始：', PHASES.map((p, i) => `${p.name} ${phaseTimes[i] !== undefined ? fmt(phaseTimes[i]) : '-'}`).join(' | '));
  console.log('首次購買：', Object.entries(firstBuy).map(([k, v]) => `${k} ${fmt(v)}`).join(' | '));
  console.log('設備：', s.equipment.join(','), ' 斧頭', s.axeLevel, ' DPS', totalDps(s).toExponential(2));
}

for (const st of strategies) run(st);
