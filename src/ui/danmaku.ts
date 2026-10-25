import { DANMAKU } from '../core/data';

const POOL = 14;
const LANES = 6;

/** 砍樹彈幕：每倒一棵樹飄過一句；DOM 物件池重複使用，高速砍伐時由呼叫端節流。 */
export class Danmaku {
  private layer: HTMLElement;
  private pool: HTMLElement[] = [];
  private cursor = 0;
  private laneFree: number[] = Array(LANES).fill(0);
  private deck: string[] = [];
  enabled = true;

  constructor(stage: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.id = 'danmaku';
    this.layer.setAttribute('aria-hidden', 'true');
    stage.appendChild(this.layer);
    for (let i = 0; i < POOL; i++) {
      const d = document.createElement('div');
      d.className = 'dm';
      d.addEventListener('animationend', () => { d.style.display = 'none'; });
      d.style.display = 'none';
      this.layer.appendChild(d);
      this.pool.push(d);
    }
  }

  /** 洗牌後依序抽，整副用完才會重複。 */
  private next(): string {
    if (!this.deck.length) {
      this.deck = [...DANMAKU];
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
    }
    return this.deck.pop()!;
  }

  spawn() {
    if (!this.enabled) return;
    const now = performance.now();
    // 選最早空出的軌道；全部占用時放棄這一則，避免重疊
    let lane = 0;
    for (let i = 1; i < LANES; i++) if (this.laneFree[i] < this.laneFree[lane]) lane = i;
    if (this.laneFree[lane] > now) return;

    const d = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % POOL;
    const text = this.next();
    d.innerHTML = '';
    // {關鍵字} 轉成醒目標示，其他文字以 textContent 寫入
    for (const part of text.split(/(\{[^}]+\})/)) {
      if (!part) continue;
      if (part.startsWith('{')) {
        const em = document.createElement('em');
        em.textContent = part.slice(1, -1);
        d.appendChild(em);
      } else {
        d.appendChild(document.createTextNode(part));
      }
    }
    const duration = 6.5 + Math.random() * 2;
    d.style.top = `calc(var(--dm-top) + ${lane} * var(--dm-lane))`;
    d.style.animationDuration = `${duration}s`;
    d.style.display = 'none';
    void d.offsetWidth; // 重新啟動動畫
    d.style.display = '';
    // 前一則的尾巴離開右緣後，同軌道才能再放
    const width = d.offsetWidth;
    const stageW = this.layer.clientWidth || window.innerWidth;
    const speed = (stageW + width) / duration;
    this.laneFree[lane] = now + ((width + 24) / speed) * 1000;
  }

  clear() {
    for (const d of this.pool) d.style.display = 'none';
    this.laneFree.fill(0);
  }
}
