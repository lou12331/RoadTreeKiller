import { EQUIPMENT } from './data';

export type Quality = 'low' | 'medium' | 'high';

export interface GameState {
  version: number;
  seed: number;
  felled: number; // 已砍倒數，也是目前樹木的索引
  treeDamage: number; // 目前樹木已承受的傷害
  gold: number;
  totalGold: number;
  axeLevel: number;
  equipment: number[];
  upgrades: string[];
  achievements: string[];
  news: number[]; // 已顯示過的新聞節點
  clicks: number;
  autoDamage: number; // 設備累計傷害
  peakTps: number; // 最高每秒砍伐數
  idleTime: number; // 放置時間（背景與離線，秒）
  playTime: number; // 秒
  lastSaved: number; // ms timestamp
  introSeen: boolean;
  finished: boolean;
  ngPlus: number;
  settings: { quality: Quality; sound: boolean; danmaku: boolean };
}

export const SAVE_VERSION = 1;

export function newState(prev?: Pick<GameState, 'achievements' | 'ngPlus' | 'settings'>): GameState {
  return {
    version: SAVE_VERSION,
    seed: (Math.random() * 2 ** 32) >>> 0,
    felled: 0,
    treeDamage: 0,
    gold: 0,
    totalGold: 0,
    axeLevel: 0,
    equipment: EQUIPMENT.map(() => 0),
    upgrades: [],
    achievements: prev ? [...prev.achievements] : [],
    news: [],
    clicks: 0,
    autoDamage: 0,
    peakTps: 0,
    idleTime: 0,
    playTime: 0,
    lastSaved: Date.now(),
    introSeen: false,
    finished: false,
    ngPlus: prev?.ngPlus ?? 0,
    settings: prev ? { ...prev.settings } : { quality: 'medium', sound: true, danmaku: true },
  };
}

/** 存檔資料遷移：未知欄位丟棄、缺漏欄位補預設值。 */
export function migrate(raw: unknown): GameState {
  const base = newState();
  if (!raw || typeof raw !== 'object') throw new Error('存檔格式錯誤');
  const s = { ...base, ...(raw as Partial<GameState>) };
  s.settings = { ...base.settings, ...(s.settings ?? {}) };
  const eq = Array.isArray(s.equipment) ? s.equipment : [];
  s.equipment = EQUIPMENT.map((_, i) => Math.max(0, Math.floor(Number(eq[i]) || 0)));
  for (const k of ['felled', 'treeDamage', 'gold', 'totalGold', 'axeLevel', 'clicks', 'playTime', 'ngPlus', 'autoDamage', 'peakTps', 'idleTime'] as const) {
    const v = Number(s[k]);
    s[k] = Number.isFinite(v) && v >= 0 ? v : 0;
  }
  s.upgrades = Array.isArray(s.upgrades) ? s.upgrades.filter((x) => typeof x === 'string') : [];
  s.achievements = Array.isArray(s.achievements) ? s.achievements.filter((x) => typeof x === 'string') : [];
  s.news = Array.isArray(s.news) ? s.news.filter((x) => typeof x === 'number') : [];
  s.version = SAVE_VERSION;
  return s;
}
