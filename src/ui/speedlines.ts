const MAX_LINES = 70;

/** 高速砍伐時的漫畫式放射速度線（2D canvas 疊在 3D 畫面上）。 */
export class SpeedLines {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private intensity = 0;
  private flicker = 0;
  private drawn = false;
  private w = 0;
  private h = 0;

  constructor(stage: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'speedlines';
    this.canvas.setAttribute('aria-hidden', 'true');
    // 放在彈幕之下，避免蓋住文字
    stage.insertBefore(this.canvas, stage.querySelector('#danmaku'));
    this.ctx = this.canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(stage);
    this.resize();
  }

  private resize() {
    // 速度線不需要高解析度，固定 1x 降低負擔
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, this.w);
    this.canvas.height = Math.max(1, this.h);
  }

  update(dt: number, target: number, center: { x: number; y: number }) {
    // 加速時快速浮現、減速時慢慢淡出
    const k = target > this.intensity ? 6 : 2.5;
    this.intensity += (target - this.intensity) * Math.min(1, dt * k);
    const ctx = this.ctx;
    if (this.intensity < 0.02) {
      if (this.drawn) {
        ctx.clearRect(0, 0, this.w, this.h);
        this.drawn = false;
      }
      return;
    }
    // 每兩幀重抽一次線條位置，產生閃爍的漫畫感
    this.flicker += dt;
    if (this.flicker < 1 / 30 && this.drawn) return;
    this.flicker = 0;

    ctx.clearRect(0, 0, this.w, this.h);
    this.drawn = true;
    const reach = Math.hypot(Math.max(center.x, this.w - center.x), Math.max(center.y, this.h - center.y));
    const inner = Math.min(this.w, this.h) * (0.42 - 0.18 * this.intensity); // 越快，中央留白越小
    const n = Math.round(18 + (MAX_LINES - 18) * this.intensity);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = inner + Math.random() * reach * 0.3;
      const r1 = reach * 1.05;
      const half = (0.006 + Math.random() * 0.014) * (0.7 + this.intensity); // 線寬（弧度）
      const alpha = (0.3 + Math.random() * 0.45) * this.intensity;
      // 先畫較寬的深色底線再疊白線，亮背景（天空、建築）上也看得清楚
      this.wedge(center, a, r0, r1, half * 1.6, '#000', alpha * 0.35);
      this.wedge(center, a, r0, r1, half, '#fff', alpha);
    }
    ctx.globalAlpha = 1;
  }

  private wedge(c: { x: number; y: number }, a: number, r0: number, r1: number, half: number, color: string, alpha: number) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0);
    ctx.lineTo(c.x + Math.cos(a - half) * r1, c.y + Math.sin(a - half) * r1);
    ctx.lineTo(c.x + Math.cos(a + half) * r1, c.y + Math.sin(a + half) * r1);
    ctx.closePath();
    ctx.fill();
  }
}
