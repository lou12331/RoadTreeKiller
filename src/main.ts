import './style.css';
import { EQUIPMENT, INTRO_TEXT, INTRO_TEXT_NGPLUS, TARGET_TREES, UPGRADES } from './core/data';
import { buyAxe, buyEquip, buyUpgrade, totalDps } from './core/economy';
import { checkEvents } from './core/events';
import { clearSave, exportSave, importSave, loadGame, saveGame } from './core/save';
import { TICK, advance, autoDamage, chop, settleOffline, type DamageResult } from './core/sim';
import { newState, type GameState } from './core/state';
import { GameScene } from './scene/scene';
import { setSound, sfx, unlockAudio } from './ui/audio';
import { fmt, fmtInt } from './ui/format';
import { UIController } from './ui/ui';
import { Danmaku } from './ui/danmaku';
import { SpeedLines } from './ui/speedlines';

let state: GameState = newState();
const scene = new GameScene(document.getElementById('stage')!);
const stageEl = document.getElementById('stage')!;
const danmaku = new Danmaku(stageEl);
const speedLines = new SpeedLines(stageEl);

// 每秒砍伐數（滑動平均）
const killLog: { t: number; n: number }[] = [];
function logKills(n: number) {
  const now = performance.now();
  if (n > 0) killLog.push({ t: now, n });
  while (killLog.length && now - killLog[0].t > 3000) killLog.shift();
  ui.tps = killLog.reduce((a, b) => a + b.n, 0) / 3;
  if (ui.tps > state.peakTps) state.peakTps = ui.tps;
}

const ui = new UIController(
  {
    chop: onChop,
    buyAxe: () => { if (buyAxe(state)) afterBuy(); },
    buyEquip: (i, q) => { if (buyEquip(state, i, q) > 0) afterBuy(); },
    buyUpgrade: (id) => {
      const u = UPGRADES.find((x) => x.id === id);
      if (u && buyUpgrade(state, u)) {
        afterBuy();
        ui.toast({ icon: u.icon, kicker: '特殊升級', title: u.name, text: u.desc });
      }
    },
    setQuality: (q) => { state.settings.quality = q; scene.setQuality(q); void saveGame(state); },
    setSound: (on) => { state.settings.sound = on; setSound(on); void saveGame(state); },
    setDanmaku: (on) => {
      state.settings.danmaku = on;
      danmaku.enabled = on;
      if (!on) danmaku.clear();
      void saveGame(state);
    },
    exportSave: () => exportSave(state),
    importSave: (text) => {
      try {
        loadState(importSave(text));
        ui.toast({ icon: '📂', kicker: '存檔', title: '匯入成功' });
        void saveGame(state);
        return true;
      } catch (e) {
        ui.toast({ icon: '⚠️', kicker: '存檔', title: '匯入失敗', text: (e as Error).message });
        return false;
      }
    },
    reset: async () => {
      await clearSave();
      loadState(newState({ achievements: [], ngPlus: 0, settings: state.settings }));
      showIntro();
    },
    replayIntro: () => showIntro(),
  },
  () => state,
);

function afterBuy() {
  sfx.buy();
  ui.refreshRows();
  handleEvents();
}

function onChop() {
  if (state.felled >= TARGET_TREES || ending) return;
  unlockAudio();
  const res = chop(state);
  scene.hit(1);
  sfx.chop();
  const p = scene.hitScreenPos();
  ui.floatText(p.x, p.y, `-${fmt(res.damage)}`);
  onKills(res, false);
}

// 自動砍伐的金幣合併顯示，避免高速時數字洗版
let pendingGold = 0;
let pendingKills = 0;
let lastGoldFx = 0;

function onKills(res: DamageResult, auto: boolean) {
  logKills(res.killed);
  if (res.killed === 0) return;
  scene.setProgress(state.felled);
  pendingGold += res.gold;
  pendingKills += res.killed;
  const now = performance.now();
  if (!auto || now - lastGoldFx > 600) {
    const p = scene.hitScreenPos();
    const text = pendingKills > 1 ? `+${fmt(pendingGold)} 🪙 ×${fmtInt(pendingKills)}棵` : `+${fmt(pendingGold)} 🪙`;
    ui.floatText(p.x + 40, p.y - 50, text, pendingKills > 1 ? 'gold big' : 'gold', true);
    pendingGold = 0;
    pendingKills = 0;
    lastGoldFx = now;
  }
  handleEvents();
}

// 畫面上每倒一棵樹（高速時由場景節流）飄過一句彈幕
scene.onFell = () => {
  danmaku.spawn();
  sfx.fall();
  setTimeout(() => sfx.coin(), 380);
};

function handleEvents() {
  const ev = checkEvents(state);
  for (const a of ev.achievements) {
    ui.toast({ icon: a.icon, kicker: '🏆 成就達成', title: a.name, text: a.desc });
  }
  for (const n of ev.news) {
    ui.toast({ icon: '📰', kicker: '新聞快訊', title: n.title, text: n.body, cls: 'news', timeout: 9000 });
  }
}

// ---------- 主迴圈：固定步進邏輯 + requestAnimationFrame 渲染 ----------
let acc = 0;
let lastFrame = performance.now();
let lastRows = 0;
let lastSave = performance.now();
let running = false;
let ending = false;
let endingStarted = false;

function frame(now: number) {
  if (!running) return;
  const dt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.introSeen && !ending) {
    acc += dt;
    let killed = 0;
    let gold = 0;
    while (acc >= TICK) {
      const r = advance(state, TICK);
      killed += r.killed;
      gold += r.gold;
      acc -= TICK;
    }
    onKills({ killed, gold }, true);
    if (killed === 0) logKills(0);
  }

  if (state.felled >= TARGET_TREES && !ending) startEnding();
  if (ending && !endingStarted && scene.caughtUp) {
    endingStarted = true;
    scene.setMode('ending');
    sfx.fanfare();
    setTimeout(() => ui.ending(state, () => {}, newGamePlus), 3500);
  }

  scene.update(dt, { equipment: state.equipment, dps: ending ? 0 : totalDps(state) });
  speedLines.update(dt, scene.speedFactor, scene.vanishingPoint());
  ui.update(state);
  if (now - lastRows > 100) { ui.refreshRows(); lastRows = now; }
  if (now - lastSave > 15000) { lastSave = now; void saveGame(state); }
  requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  running = true;
  lastFrame = performance.now();
  requestAnimationFrame(frame);
}

function startEnding() {
  ending = true;
  endingStarted = false;
  state.finished = true;
  ui.setChopEnabled(false);
  scene.setProgress(state.felled);
  void saveGame(state);
}

function newGamePlus() {
  loadState(newState({ achievements: state.achievements, ngPlus: state.ngPlus + 1, settings: state.settings }));
  void saveGame(state);
  showIntro();
}

function loadState(s: GameState) {
  state = s;
  ending = false;
  endingStarted = false;
  acc = 0;
  killLog.length = 0;
  setSound(s.settings.sound);
  danmaku.enabled = s.settings.danmaku;
  danmaku.clear();
  scene.setQuality(s.settings.quality);
  ui.closeOverlays();
  if (s.finished) {
    // 已通關的存檔：直接顯示光禿街景與結局選項
    scene.syncTrees(s.seed, s.felled);
    scene.setMode('ending');
    ending = true;
    endingStarted = true;
    ui.setChopEnabled(false);
    ui.ending(s, () => {}, newGamePlus);
    return;
  }
  scene.syncTrees(s.seed, s.felled);
  scene.setMode(s.introSeen ? 'play' : 'intro');
  ui.setChopEnabled(true);
}

function showIntro() {
  scene.setMode('intro');
  ui.closeOverlays();
  ui.intro(state.ngPlus ? INTRO_TEXT_NGPLUS : INTRO_TEXT, state.ngPlus, () => {
    unlockAudio();
    state.introSeen = true;
    scene.setMode('play');
    lastFrame = performance.now();
    void saveGame(state);
  });
}

// ---------- 背景化：停止渲染、記錄時間，回到前景先結算再恢復 ----------
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    running = false;
    void saveGame(state);
  } else {
    if (hiddenAt && state.introSeen && !ending) {
      const sec = (Date.now() - hiddenAt) / 1000;
      // 前 10 分鐘全速結算，之後依離線規則（50%）
      const full = Math.min(sec, 600);
      const res = autoDamage(state, totalDps(state) * full);
      state.idleTime += full;
      let killed = res.killed;
      let gold = res.gold;
      if (sec > 600) {
        const off = settleOffline(state, sec - 600);
        killed += off.killed;
        gold += off.gold;
      }
      scene.setProgress(state.felled);
      if (killed > 0) {
        ui.toast({ icon: '⏱️', kicker: '背景結算', title: `砍倒 ${fmtInt(killed)} 棵`, text: `獲得 🪙 ${fmt(gold)}` });
        handleEvents();
      }
    }
    hiddenAt = 0;
    start();
  }
});
window.addEventListener('pagehide', () => void saveGame(state));

// WebGL Context Lost：存檔後重新載入
scene.renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  void saveGame(state).then(() => location.reload());
});

// 點擊 3D 畫面也能砍（但不攔截捲動）
stageEl.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).tagName === 'CANVAS' && state.introSeen && !ending) onChop();
});

// ---------- 啟動 ----------
(async () => {
  const saved = await loadGame();
  if (saved) {
    loadState(saved);
    if (!saved.finished && saved.introSeen) {
      const sec = (Date.now() - saved.lastSaved) / 1000;
      if (sec > 60 && totalDps(state) > 0) {
        const off = settleOffline(state, sec);
        scene.syncTrees(state.seed, state.felled);
        if (off.killed > 0 || off.gold > 0) ui.offlineReport(off.seconds, off.killed, off.gold);
        handleEvents();
      }
    } else if (!saved.introSeen) {
      showIntro();
    }
  } else {
    loadState(state);
    showIntro();
  }
  start();
  // 開發用：在主控台操作 window.__game
  (window as unknown as { __game: unknown }).__game = { get state() { return state; }, scene, EQUIPMENT, save: () => saveGame(state) };
})();
