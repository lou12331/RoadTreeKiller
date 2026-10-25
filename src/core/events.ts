import { ACHIEVEMENTS, EQUIPMENT, NEWS, type Achievement } from './data';
import type { GameState } from './state';

export interface GameEvents {
  achievements: Achievement[];
  news: (typeof NEWS)[number][];
}

/** 檢查新解鎖的成就與新聞（只觸發一次）。 */
export function checkEvents(s: GameState): GameEvents {
  const out: GameEvents = { achievements: [], news: [] };
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.includes(a.id)) continue;
    const ok =
      (a.felled !== undefined && s.felled >= a.felled) ||
      (a.clicks !== undefined && s.clicks >= a.clicks) ||
      (a.equipId !== undefined && s.equipment[EQUIPMENT.findIndex((e) => e.id === a.equipId)] > 0);
    if (ok) {
      s.achievements.push(a.id);
      out.achievements.push(a);
    }
  }
  // 多個節點同時跨過時（例如離線），只播最新一則
  const due = NEWS.filter((n) => s.felled >= n.at && !s.news.includes(n.at));
  for (const n of due) s.news.push(n.at);
  if (due.length) out.news.push(due[due.length - 1]);
  return out;
}
