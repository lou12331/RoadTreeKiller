// WebAudio 合成音效，不需載入音檔。

let ctx: AudioContext | null = null;
let enabled = true;
let lastChop = 0;

export function setSound(on: boolean) {
  enabled = on;
}

/** 須在使用者手勢中呼叫一次以解鎖音訊。 */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

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
  o.connect(g).connect(ctx.destination);
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
  src.connect(f).connect(g).connect(ctx.destination);
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
