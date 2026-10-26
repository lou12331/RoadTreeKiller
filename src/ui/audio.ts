// WebAudio 合成音效，不需載入音檔。

let ctx: AudioContext | null = null;
let enabled = true;
let lastChop = 0;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let driveBus: GainNode | null = null; // 加速時淡入的第二層
let intensity = 0; // 0..1，目標強度
let drive = 0; // 平滑後的強度

export function setSound(on: boolean) {
  enabled = on;
  if (on) startMusic();
  else stopMusic();
}

/** 須在使用者手勢中呼叫一次以解鎖音訊。 */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.5;
    musicBus.connect(master);
    driveBus = ctx.createGain();
    driveBus.gain.value = 0;
    driveBus.connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  if (enabled) startMusic();
}

document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend();
  else if (enabled) void ctx.resume();
});

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  return buf;
}

let noise: AudioBuffer | null = null;

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function burst(dur: number, freq: number, gain: number, delay = 0) {
  if (!ctx) return;
  noise ??= noiseBuffer(ctx, 1);
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

export const sfx = {
  chop() {
    if (!enabled || !ctx) return;
    const now = performance.now();
    if (now - lastChop < 45) return; // 限制連點音效頻率
    lastChop = now;
    tone(140 + Math.random() * 30, 0.12, 'triangle', 0.35, -60);
    burst(0.08, 1800 + Math.random() * 600, 0.25);
  },
  fall() {
    if (!enabled || !ctx) return;
    burst(0.5, 500, 0.3);
    tone(70, 0.45, 'sine', 0.4, -30, 0.35);
    burst(0.3, 200, 0.35, 0.35);
  },
  coin() {
    if (!enabled || !ctx) return;
    tone(988, 0.08, 'square', 0.06);
    tone(1319, 0.18, 'square', 0.06, 0, 0.07);
  },
  buy() {
    if (!enabled || !ctx) return;
    tone(523, 0.08, 'triangle', 0.15);
    tone(784, 0.14, 'triangle', 0.15, 0, 0.07);
  },
  fanfare() {
    if (!enabled || !ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, 0, i * 0.12));
  },
};

// ---------- MIDI 風格 8-bit 背景音樂：A 小調、輕快帶點壞心眼 ----------
// 每小節 8 步（八分音符）；數字為 MIDI 音高，'.' 休止，'-' 延音。
const BPM = 116;
const STEP = 60 / BPM / 2;
const BARS = 8;
const CHORDS = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 48, tones: [55, 60, 64] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 48, tones: [55, 60, 64] }, // C
  { root: 40, tones: [56, 59, 64] }, // E
];
const LEAD = [
  '69 - 72 76 - 74 72 .',
  '65 - 69 72 - 69 72 77',
  '76 - 72 67 - 72 76 -',
  '74 - 71 67 71 74 79 -',
  '72 - 76 81 - 76 72 -',
  '77 - 72 69 - 72 77 -',
  '76 - 79 76 72 - 67 72',
  '71 - 68 71 76 - 71 .',
].map((b) => b.split(' '));

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

function note(type: OscillatorType, midi: number, t: number, dur: number, gain: number, bus = musicBus) {
  if (!ctx || !bus) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = mtof(midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function drum(t: number, kind: 'kick' | 'snare' | 'hat', bus = musicBus) {
  if (!ctx || !bus) return;
  if (kind === 'kick') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.16);
    return;
  }
  noise ??= noiseBuffer(ctx, 1);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = kind === 'hat' ? 'highpass' : 'bandpass';
  f.frequency.value = kind === 'hat' ? 7000 : 1800;
  const g = ctx.createGain();
  const dur = kind === 'hat' ? 0.04 : 0.12;
  g.gain.setValueAtTime(kind === 'hat' ? 0.1 : 0.22, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

function playStep(step: number, t: number) {
  const bar = Math.floor(step / 8) % BARS;
  const i = step % 8;
  const ch = CHORDS[bar];
  // 低音：三角波
  const bassPat = [0, -1, 0, 12, 0, -1, 7, 12];
  if (bassPat[i] >= 0) note('triangle', ch.root + bassPat[i], t, STEP * 1.6, 0.4);
  // 琶音：窄脈衝感（方波）
  note('square', ch.tones[[0, 1, 2, 1, 0, 1, 2, 1][i]] + 12, t, STEP * 0.8, 0.035);
  // 主旋律：方波，遇 '-' 延續前音
  const tok = LEAD[bar][i];
  if (tok !== '.' && tok !== '-') {
    let len = 1;
    while (i + len < 8 && LEAD[bar][i + len] === '-') len++;
    note('square', +tok, t, STEP * len * 0.95, 0.07);
  }
  // 鼓組
  if (i === 0 || i === 4) drum(t, 'kick');
  if (i === 2 || i === 6) drum(t, 'snare');
  drum(t, 'hat');

  // 第二層（加速時淡入）：四四拍底鼓、十六分 hi-hat、八度鋸齒主旋律、高速琶音、跳動低音
  if (drive > 0.02 && driveBus) {
    if (i % 2 === 0) drum(t, 'kick', driveBus);
    drum(t + STEP / 2, 'hat', driveBus);
    if (i === 7) drum(t + STEP / 2, 'snare', driveBus);
    note('triangle', ch.root + 12, t + STEP / 2, STEP * 0.5, 0.25, driveBus);
    ch.tones.forEach((m, k) => note('square', m + 24, t + (k * STEP) / 3, STEP / 3, 0.03, driveBus));
    if (tok !== '.' && tok !== '-') {
      let len = 1;
      while (i + len < 8 && LEAD[bar][i + len] === '-') len++;
      note('sawtooth', +tok + 12, t, STEP * len * 0.9, 0.035, driveBus);
    }
  }
}

/** 0..1：高速砍伐程度，越高第二層越明顯。 */
export function setIntensity(v: number) {
  intensity = Math.min(1, Math.max(0, v));
}

let musicTimer = 0;
let nextTime = 0;
let stepIdx = 0;

function startMusic() {
  if (!ctx || musicTimer) return;
  nextTime = ctx.currentTime + 0.1;
  musicTimer = window.setInterval(() => {
    if (!ctx) return;
    // 平滑追隨目標強度（輪詢間隔 80ms）
    drive += (intensity - drive) * 0.15;
    if (driveBus) driveBus.gain.setTargetAtTime(drive * 0.9, ctx.currentTime, 0.1);
    while (nextTime < ctx.currentTime + 0.3) {
      playStep(stepIdx, nextTime);
      stepIdx = (stepIdx + 1) % (BARS * 8);
      nextTime += STEP;
    }
  }, 80);
}

function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = 0;
}
