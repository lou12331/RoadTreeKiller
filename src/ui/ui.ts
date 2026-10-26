import { ICONS, type IconPath } from '../core/icons';
import { iconHtml } from './icons';
import { ACHIEVEMENTS, EQUIPMENT, PHASES, TARGET_TREES, UPGRADES } from '../core/data';
import {
  axeCost, bulkEquip, clickDamage, equipmentDps, equipmentMultiplier, totalDps, upgradeUnlocked,
} from '../core/economy';
import type { GameState, Quality } from '../core/state';
import { generateTree } from '../core/trees';
import { fmt, fmtDuration, fmtInt } from './format';
import briefingImg from '../assets/briefing.webp';
import logoImg from '../assets/logo.webp';
import avatarImg from '../assets/avatar.webp';

type Tab = 'axe' | 'equip' | 'special' | 'achieve';
type Qty = 1 | 10 | 100 | 'max';

export interface UIHandlers {
  chop: () => void;
  buyAxe: () => void;
  buyEquip: (i: number, qty: number) => void;
  toggleEquipVisible: (i: number) => void;
  buyUpgrade: (id: string) => void;
  setQuality: (q: Quality) => void;
  setSound: (on: boolean) => void;
  setDanmaku: (on: boolean) => void;
  exportSave: () => string;
  importSave: (text: string) => boolean;
  reset: () => void;
  replayIntro: () => void;
}

const SVG_HEAD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const EYE_SVG = `${SVG_HEAD}<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_SVG = `${SVG_HEAD}<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** 空白鍵與 A–Z 皆可砍伐；保留 Ctrl/Alt/Cmd 組合鍵給瀏覽器快捷鍵。 */
function isChopKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  return e.code === 'Space' || /^Key[A-Z]$/.test(e.code);
}

interface RowRefs { buy?: HTMLButtonElement; price?: HTMLElement; label?: HTMLElement; desc?: HTMLElement; count?: HTMLElement; update: (s: GameState) => void }

export class UIController {
  private tab: Tab = 'axe';
  private qty: Qty = 1;
  private rows: RowRefs[] = [];
  private listKey = '';
  private last: Record<string, string> = {};
  private fx = $('fx');
  private fxPool: HTMLElement[] = [];
  private fxCursor = 0;
  private lastFx = 0;
  private sheet = $('sheet');
  private seenAchievements = 0;
  tps = 0;

  constructor(private h: UIHandlers, private state: () => GameState) {
    for (let i = 0; i < 24; i++) {
      const d = el('div', 'dmg');
      d.style.display = 'none';
      d.addEventListener('animationend', () => (d.style.display = 'none'));
      this.fx.appendChild(d);
      this.fxPool.push(d);
    }
    this.bindChop();
    this.bindSheet();
    $('tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      this.tab = b.dataset.tab as Tab;
      if (this.tab === 'achieve') this.seenAchievements = this.state().achievements.length;
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $('qty').hidden = this.tab !== 'equip';
      this.listKey = '';
      $('list').scrollTop = 0;
    });
    $('qty').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      const v = b.dataset.qty!;
      this.qty = v === 'max' ? 'max' : (Number(v) as Qty);
      document.querySelectorAll('#qty button').forEach((x) => x.classList.toggle('active', x === b));
      this.refreshRows();
    });
    $('btn-settings').addEventListener('click', () => this.openSettings());
  }

  // ---------- 砍伐輸入 ----------
  private bindChop() {
    const btn = $<HTMLButtonElement>('chop');
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      btn.classList.add('pressed');
      this.h.chop();
    });
    const up = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
    // 全域禁止右鍵／長按選單；存檔文字框保留，方便複製貼上
    document.addEventListener('contextmenu', (e) => {
      if (!(e.target as HTMLElement).closest('textarea')) e.preventDefault();
    });
    window.addEventListener('keydown', (e) => {
      if (!isChopKey(e) || e.repeat || document.querySelector('.overlay')) return;
      e.preventDefault();
      if (btn.disabled) return;
      btn.classList.add('pressed');
      this.h.chop();
    });
    window.addEventListener('keyup', (e) => { if (isChopKey(e)) up(); });
    // 避免雙擊縮放
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  }

  // ---------- 底部抽屜 ----------
  private bindSheet() {
    const sheet = this.sheet;
    const handle = $('sheet-handle');
    let startY = 0;
    let startT = 0;
    let dragging = false;
    let moved = false;
    let justDragged = false;
    let downTarget: HTMLElement | null = null;
    const range = () => sheet.offsetHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-h')) / 100) * window.innerHeight;
    const onDown = (e: PointerEvent) => {
      if (window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)').matches) return;
      dragging = true;
      moved = false;
      startY = e.clientY;
      startT = sheet.classList.contains('expanded') ? 0 : range();
      downTarget = e.currentTarget as HTMLElement;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) > 6) {
        moved = true;
        // 確定是拖曳才擷取指標；點擊時若先擷取，click 會落在分頁列而非按鈕上
        try { downTarget?.setPointerCapture(e.pointerId); } catch { /* 指標已釋放 */ }
      }
      if (!moved) return;
      sheet.classList.add('dragging');
      const t = Math.min(range(), Math.max(0, startT + dy));
      sheet.style.transform = `translateY(${t}px)`;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('dragging');
      sheet.style.transform = '';
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) <= 6) {
        if (downTarget === handle) sheet.classList.toggle('expanded');
        return;
      }
      // 拖曳結束後吞掉接著觸發的 click，避免誤切分頁
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
      sheet.classList.toggle('expanded', dy < 0 ? true : dy > 0 ? false : sheet.classList.contains('expanded'));
    };
    $('tabs').addEventListener('click', (e) => {
      if (justDragged) e.stopImmediatePropagation();
    }, true);
    for (const t of [handle, $('tabs')]) t.addEventListener('pointerdown', onDown);
    // 移動與放開掛在 window：手指滑出分頁列後仍能追蹤
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // ---------- 每幀更新 ----------
  private set(id: string, text: string, prop: 'text' | 'width' = 'text') {
    if (this.last[id] === text) return;
    this.last[id] = text;
    const e = $(id);
    if (prop === 'width') e.style.width = text;
    else e.textContent = text;
  }

  update(s: GameState) {
    this.set('felled', fmtInt(s.felled));
    this.set('gold', fmt(s.gold));
    this.set('progress-bar', `${(s.felled / TARGET_TREES) * 100}%`, 'width');
    let phase = PHASES[0];
    for (const p of PHASES) if (s.felled >= p.from) phase = p;
    this.set('phase', `· ${phase.name}`);

    if (s.felled < TARGET_TREES) {
      const tree = generateTree(s.seed, s.felled);
      const name = [tree.species.name, tree.stageName, tree.healthName].filter(Boolean).join(' · ');
      this.set('tree-name', name);
      this.set('tree-index', `No. ${fmtInt(s.felled + 1)}`);
      const left = Math.max(0, tree.hp - s.treeDamage);
      this.set('hp-bar', `${(left / tree.hp) * 100}%`, 'width');
      this.set('hp-text', `${fmt(Math.ceil(left))} / ${fmt(tree.hp)} HP`);
    } else {
      this.set('tree-name', '已無樹可砍');
      this.set('tree-index', '');
      this.set('hp-bar', '0%', 'width');
      this.set('hp-text', '—');
    }
    this.set('stat-click', `${fmt(clickDamage(s))} DMG`);
    this.set('stat-dps', `${fmt(totalDps(s), 1)} DPS`);
    this.set('stat-tps', this.tps >= 10 ? fmt(this.tps) : this.tps.toFixed(this.tps < 1 ? 2 : 1));

    const key = this.computeListKey(s);
    if (key !== this.listKey) {
      this.listKey = key;
      this.renderList(s);
    }
    this.updateTabDots(s);
  }

  /** 每 100ms 刷新價格與可購買狀態。 */
  refreshRows() {
    const s = this.state();
    for (const r of this.rows) r.update(s);
  }

  private updateTabDots(s: GameState) {
    const dots: Record<Tab, boolean> = {
      axe: s.gold >= axeCost(s.axeLevel),
      equip: EQUIPMENT.some((_, i) => bulkEquip(s, i, 1).cost <= s.gold),
      special: UPGRADES.some((u) => !s.upgrades.includes(u.id) && upgradeUnlocked(s, u) && s.gold >= u.cost),
      achieve: s.achievements.length > this.seenAchievements && this.tab !== 'achieve',
    };
    const sig = JSON.stringify(dots);
    if (this.last.dots === sig) return;
    this.last.dots = sig;
    document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
      const on = dots[b.dataset.tab as Tab];
      let d = b.querySelector('.dot');
      if (on && !d) { d = el('i', 'dot'); b.appendChild(d); }
      if (!on && d) d.remove();
    });
  }

  private computeListKey(s: GameState): string {
    switch (this.tab) {
      case 'axe': return 'axe';
      case 'equip': {
        // 已解鎖到第幾種設備（持有前一種或金幣達到價格的 1/2 才顯示）
        return 'equip' + this.visibleEquip(s);
      }
      case 'special':
        return 'sp' + UPGRADES.map((u) => (s.upgrades.includes(u.id) ? 2 : upgradeUnlocked(s, u) ? 1 : 0)).join('');
      case 'achieve':
        return 'ach' + s.achievements.length;
    }
  }

  private visibleEquip(s: GameState): number {
    let n = 1;
    for (let i = 0; i < EQUIPMENT.length; i++) {
      if (s.equipment[i] > 0 || s.totalGold >= EQUIPMENT[i].cost * 0.4) n = i + 2;
    }
    return Math.min(EQUIPMENT.length, n);
  }

  private priceButton(label: string, onClick: () => void): RowRefs & { buy: HTMLButtonElement } {
    const buy = el('button', 'buy');
    const priceBox = el('span', 'price', iconHtml(ICONS.coin, true));
    const price = el('span', 'value');
    priceBox.append(price);
    const lab = el('span', 'label', label);
    buy.append(priceBox, lab);
    buy.addEventListener('click', onClick);
    return { buy, price, label: lab, update: () => {} };
  }

  private row(icon: IconPath, name: string, desc: string, cls = ''): { row: HTMLElement; ico: HTMLElement; desc: HTMLElement } {
    const row = el('div', 'row ' + cls);
    const ico = el('div', 'ico', iconHtml(icon));
    const info = el('div', 'info');
    const d = el('div', 'desc', desc);
    info.append(el('div', 'name', name), d);
    row.append(ico, info);
    return { row, ico, desc: d };
  }

  private renderList(s: GameState) {
    const list = $('list');
    list.innerHTML = '';
    this.rows = [];

    if (this.tab === 'axe') {
      const { row, desc } = this.row(ICONS.axe, '強化斧頭', '');
      const b = this.priceButton('升級', () => this.h.buyAxe());
      b.update = (st) => {
        const c = axeCost(st.axeLevel);
        b.price!.textContent = fmt(c);
        b.buy.disabled = st.gold < c;
        desc.innerHTML = `Lv. ${st.axeLevel} · 每次點擊造成 <b>${fmt(clickDamage(st))}</b> 點傷害`;
      };
      row.append(b.buy);
      list.append(row);
      this.rows.push(b);
      list.append(el('div', 'section-title', '提示'));
      list.append(el('div', 'row', `<div class="ico">${iconHtml(ICONS.bulb)}</div><div class="info"><div class="desc">斧頭每升一級 +1 手動傷害。購買「設備」可以在你不點擊時持續砍樹，離線時也會以 50% 效率運作（最長 8 小時）。<span class="desktop-only"><br>桌面版可按 <b>空白鍵</b> 或 <b>A–Z</b> 任一字母鍵砍伐。</span></div></div>`));
    }

    if (this.tab === 'equip') {
      const n = this.visibleEquip(s);
      for (let i = 0; i < n; i++) {
        const e = EQUIPMENT[i];
        const { row, ico, desc } = this.row(e.icon, e.name, '');
        const count = el('span', 'count');
        ico.append(count);
        const eye = el('button', 'eye-btn');
        eye.type = 'button';
        const syncEye = (hidden: boolean) => {
          eye.innerHTML = hidden ? EYE_OFF_SVG : EYE_SVG;
          eye.classList.toggle('off', hidden);
          eye.title = hidden ? '顯示此設備' : '隱藏此設備';
          eye.setAttribute('aria-label', eye.title);
          eye.setAttribute('aria-pressed', String(hidden));
        };
        syncEye(s.hiddenEquip[i]);
        eye.addEventListener('click', () => {
          this.h.toggleEquipVisible(i);
          syncEye(this.state().hiddenEquip[i]);
        });
        ico.append(eye);
        const b = this.priceButton('購買', () => this.h.buyEquip(i, this.qty === 'max' ? Infinity : this.qty));
        b.update = (st) => {
          const want = this.qty === 'max' ? Infinity : this.qty;
          const { count: c, cost } = bulkEquip(st, i, want);
          const n2 = this.qty === 'max' ? Math.max(1, c) : c;
          const price = this.qty === 'max' && c === 0 ? bulkEquip(st, i, 1).cost : cost;
          b.price!.textContent = fmt(price);
          b.label!.textContent = this.qty === 1 ? '購買' : `購買 ×${n2}`;
          b.buy.disabled = price > st.gold || (this.qty === 'max' && c === 0);
          count.textContent = st.equipment[i] ? String(st.equipment[i]) : '';
          count.style.display = st.equipment[i] ? '' : 'none';
          const each = e.dps * equipmentMultiplier(st, i);
          desc.innerHTML = `${e.desc} · 每台 <b>${fmt(each, 1)}</b> DPS` + (st.equipment[i] ? `<br>合計 ${fmt(equipmentDps(st, i), 1)} DPS` : '');
        };
        row.append(b.buy);
        list.append(row);
        this.rows.push(b);
      }
      if (n < EQUIPMENT.length) {
        list.append(el('div', 'row locked', `<div class="ico icon-silhouette">${iconHtml(ICONS.question)}</div><div class="info"><div class="name">？？？</div><div class="desc">累積更多金幣以解鎖下一種設備</div></div>`));
      }
    }

    if (this.tab === 'special') {
      const owned = UPGRADES.filter((u) => s.upgrades.includes(u.id));
      const open = UPGRADES.filter((u) => !s.upgrades.includes(u.id));
      for (const u of open) {
        const unlocked = upgradeUnlocked(s, u);
        const { row } = this.row(unlocked ? u.icon : ICONS.lock, unlocked ? u.name : '尚未解鎖', unlocked ? u.desc : `解鎖條件：${u.unlockText}`, unlocked ? '' : 'locked');
        if (unlocked) {
          const b = this.priceButton('購買', () => this.h.buyUpgrade(u.id));
          b.update = (st) => {
            b.price!.textContent = fmt(u.cost);
            b.buy.disabled = st.gold < u.cost;
          };
          row.append(b.buy);
          this.rows.push(b);
        }
        list.append(row);
      }
      if (owned.length) {
        list.append(el('div', 'section-title', '已取得'));
        for (const u of owned) list.append(this.row(u.icon, u.name, u.desc, 'done').row);
      }
    }

    if (this.tab === 'achieve') {
      list.append(el('div', 'section-title', `已達成 ${s.achievements.length} / ${ACHIEVEMENTS.length}`));
      for (const a of ACHIEVEMENTS) {
        const got = s.achievements.includes(a.id);
        list.append(this.row(got ? a.icon : ICONS.lock, got ? a.name : '？？？', a.desc, got ? '' : 'locked').row);
      }
    }
    this.refreshRows();
  }

  // ---------- 浮動數字 ----------
  floatText(x: number, y: number, text: string, cls = '', force = false, icon?: IconPath) {
    const now = performance.now();
    if (!force && now - this.lastFx < 40) return; // 限制視覺更新頻率
    this.lastFx = now;
    const d = this.fxPool[this.fxCursor];
    this.fxCursor = (this.fxCursor + 1) % this.fxPool.length;
    d.className = 'dmg ' + cls;
    d.replaceChildren(document.createTextNode(text));
    if (icon) d.insertAdjacentHTML('beforeend', ' ' + iconHtml(icon, true));
    d.style.left = `${x + (Math.random() - 0.5) * 60}px`;
    d.style.top = `${y + (Math.random() - 0.5) * 30}px`;
    d.style.display = 'none';
    void d.offsetWidth; // 重新啟動動畫
    d.style.display = '';
  }

  // ---------- 通知 ----------
  toast(opts: { icon: IconPath; kicker: string; kickerIcon?: IconPath; title: string; text?: string; textIcon?: IconPath; cls?: string; timeout?: number }) {
    const t = el('div', 'toast ' + (opts.cls ?? ''));
    t.innerHTML = `<div class="t-ico">${iconHtml(opts.icon)}</div><div class="t-body"><div class="t-kicker"></div><div class="t-title"></div>${opts.text ? '<div class="t-text"></div>' : ''}</div><button class="t-close" aria-label="關閉">✕</button>`;
    const kicker = t.querySelector('.t-kicker')!;
    kicker.textContent = opts.kicker;
    if (opts.kickerIcon) kicker.insertAdjacentHTML('afterbegin', iconHtml(opts.kickerIcon, true) + ' ');
    t.querySelector('.t-title')!.textContent = opts.title;
    if (opts.text) {
      const text = t.querySelector('.t-text')!;
      text.textContent = opts.text;
      if (opts.textIcon) text.insertAdjacentHTML('afterbegin', iconHtml(opts.textIcon, true) + ' ');
    }
    const box = $('toasts');
    while (box.children.length >= 2) box.firstElementChild!.remove();
    box.appendChild(t);
    const close = () => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 300);
    };
    t.querySelector('.t-close')!.addEventListener('click', close);
    setTimeout(close, opts.timeout ?? 4000);
  }

  // ---------- 疊層 ----------
  overlay(cls: string, html: string): HTMLElement {
    const o = el('div', 'overlay ' + cls, html);
    $('overlay-root').appendChild(o);
    return o;
  }

  closeOverlays() {
    $('overlay-root').innerHTML = '';
  }

  openAbout() {
    const o = this.overlay('', `
      <div class="modal about" role="dialog" aria-label="關於作者" style="max-width:380px">
        <h2>關於作者<button class="close" data-close aria-label="關閉">✕</button></h2>
        <img class="avatar" src="${avatarImg}" alt="楓葉綠茶的頭像" draggable="false" />
        <p class="author">作者：楓葉綠茶
          <a class="fb-link" href="https://louiegreentea.tw" target="_blank" rel="noopener noreferrer" aria-label="楓葉綠茶的 Facebook">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path fill="#fff" d="M15.12 12.75l.4-2.6h-2.5V8.46c0-.71.35-1.4 1.47-1.4h1.13V4.85s-1.03-.18-2.01-.18c-2.05 0-3.39 1.24-3.39 3.5v1.98H7.94v2.6h2.28V19a9.1 9.1 0 0 0 2.8 0v-6.25h2.1z"/></svg>
          </a>
        </p>
        <p>聽說有人超奢侈的，可以給一個砍樹小遊戲專門開一場發布會。</p>
        <p>不過話說回來，其實我對砍樹議題一點研究都沒有，做這款遊戲純粹只是覺得好玩。</p>
        <p><b>要打就去 Game Jam 打啦！</b></p>
      </div>`);
    o.querySelector('[data-close]')!.addEventListener('click', () => o.remove());
    o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
  }

  /** 遊戲內確認視窗（瀏覽器原生 confirm() 在部分 WebView 會被封鎖）。 */
  confirm(title: string, text: string, okLabel: string): Promise<boolean> {
    return new Promise((resolve) => {
      const o = this.overlay('', `
        <div class="modal" role="alertdialog" aria-label="${title}" style="max-width:360px">
          <h2>${title}</h2>
          <p></p>
          <div class="btn-row"><button class="btn" data-no>取消</button><button class="btn danger" data-yes>${okLabel}</button></div>
        </div>`);
      o.querySelector('p')!.textContent = text;
      const done = (v: boolean) => { o.remove(); resolve(v); };
      o.querySelector('[data-yes]')!.addEventListener('click', () => done(true));
      o.querySelector('[data-no]')!.addEventListener('click', () => done(false));
      o.addEventListener('click', (e) => { if (e.target === o) done(false); });
    });
  }

  /** 開場：逐字顯示任務文字。 */
  intro(text: string, ngPlus: number, onStart: () => void) {
    const o = this.overlay('clear', `
      <div class="intro-wrap">
        <div class="title-logo">
          <img src="${logoImg}" alt="92,776" draggable="false" />
          ${ngPlus ? `<small>第 ${ngPlus + 1} 輪</small>` : ''}
        </div>
        <img class="briefing-img" src="${briefingImg}" alt="" draggable="false" />
        <div class="dialog">
          <div class="kicker">任務簡報</div>
          <div class="say"></div>
          <div class="actions">
            <button class="btn-primary" data-start>開始砍樹！▶</button>
          </div>
        </div>
      </div>`);
    const say = o.querySelector('.say')!;
    const html = text.replace(/92,776/g, '<em>92,776</em>');
    let i = 0;
    let timer = 0;
    const plain = text;
    const tick = () => {
      i++;
      if (i >= plain.length) {
        say.innerHTML = html + '<span class="caret"></span>';
        return;
      }
      say.textContent = plain.slice(0, i);
      timer = window.setTimeout(tick, plain[i - 1] === '，' || plain[i - 1] === '。' ? 260 : 55);
    };
    tick();
    const finish = () => { clearTimeout(timer); i = plain.length; say.innerHTML = html + '<span class="caret"></span>'; };
    o.querySelector('.dialog')!.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('button')) finish();
    });
    o.querySelector('[data-start]')!.addEventListener('click', () => {
      clearTimeout(timer);
      o.remove();
      onStart();
    });
  }

  offlineReport(seconds: number, killed: number, gold: number) {
    const o = this.overlay('', `
      <div class="modal">
        <h2>歡迎回來 ${iconHtml(ICONS.worker)}</h2>
        <p>你離開了 <b>${fmtDuration(seconds)}</b>。</p>
        <p>設備在你不在時以 50% 效率持續運作，砍倒了 <b>${fmtInt(killed)}</b> 棵樹，賺進 <b style="color:var(--gold)">${iconHtml(ICONS.coin, true)} ${fmt(gold)}</b>。</p>
        <p class="muted" style="font-size:13px">離線收益最長計算 8 小時。</p>
        <div class="btn-row" style="grid-template-columns:1fr"><button class="btn primary" data-ok>繼續砍</button></div>
      </div>`);
    o.querySelector('[data-ok]')!.addEventListener('click', () => o.remove());
  }

  openSettings() {
    const s = this.state();
    const o = this.overlay('', `
      <div class="modal" role="dialog" aria-label="設定">
        <h2>設定<button class="close" data-close aria-label="關閉">✕</button></h2>
        <h3>畫質</h3>
        <div class="seg" data-quality>
          <button data-q="low">低</button><button data-q="medium">中</button><button data-q="high">高</button>
        </div>
        <h3>音效</h3>
        <div class="seg" data-sound><button data-v="1">開</button><button data-v="0">關</button></div>
        <h3>砍樹彈幕</h3>
        <div class="seg" data-danmaku><button data-v="1">開</button><button data-v="0">關</button></div>
        <h3>統計</h3>
        <div class="stats-grid">
          <span>遊戲中時間</span><b>${fmtDuration(s.playTime)}</b>
          <span>已砍伐</span><b>${fmtInt(s.felled)} 棵</b>
          <span>手動砍伐</span><b>${fmtInt(s.clicks)} 次</b>
          <span>自動傷害</span><b>${fmt(s.autoDamage)}</b>
          <span>最高每秒砍伐</span><b>${s.peakTps >= 10 ? fmt(s.peakTps) : s.peakTps.toFixed(1)} 棵</b>
          <span>放置時間</span><b>${fmtDuration(s.idleTime)}</b>
          <span>累積金幣</span><b>${fmt(s.totalGold)}</b>
          <span>設備 DPS</span><b>${fmt(totalDps(s), 1)}</b>
          ${s.ngPlus ? `<span>輪次</span><b>第 ${s.ngPlus + 1} 輪</b>` : ''}
        </div>
        <h3>存檔</h3>
        <textarea data-text placeholder="按「匯出」產生存檔文字，或貼上存檔後按「匯入」"></textarea>
        <div class="btn-row">
          <button class="btn" data-export>匯出（複製）</button>
          <button class="btn" data-import>匯入</button>
          <button class="btn" data-download>下載存檔檔案</button>
          <button class="btn" data-file>從檔案匯入</button>
        </div>
        <input type="file" accept="application/json,.json" data-input hidden />
        <h3>其他</h3>
        <div class="btn-row">
          <button class="btn" data-intro>重看開場</button>
          <button class="btn danger" data-reset>重置進度</button>
          <button class="btn span-2" data-about>關於作者</button>
        </div>
      </div>`);
    const q = o.querySelector('[data-quality]')!;
    const syncSeg = () => {
      q.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('active', b.dataset.q === this.state().settings.quality));
      o.querySelectorAll<HTMLButtonElement>('[data-sound] button').forEach((b) => b.classList.toggle('active', (b.dataset.v === '1') === this.state().settings.sound));
      o.querySelectorAll<HTMLButtonElement>('[data-danmaku] button').forEach((b) => b.classList.toggle('active', (b.dataset.v === '1') === this.state().settings.danmaku));
    };
    syncSeg();
    q.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) { this.h.setQuality(b.dataset.q as Quality); syncSeg(); }
    });
    o.querySelector('[data-sound]')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) { this.h.setSound(b.dataset.v === '1'); syncSeg(); }
    });
    o.querySelector('[data-danmaku]')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b) { this.h.setDanmaku(b.dataset.v === '1'); syncSeg(); }
    });
    const ta = o.querySelector<HTMLTextAreaElement>('[data-text]')!;
    o.querySelector('[data-export]')!.addEventListener('click', async () => {
      ta.value = this.h.exportSave();
      ta.select();
      try { await navigator.clipboard.writeText(ta.value); this.toast({ icon: ICONS.clipboard, kicker: '存檔', title: '已複製到剪貼簿' }); } catch { /* 手動複製 */ }
    });
    o.querySelector('[data-import]')!.addEventListener('click', () => {
      if (ta.value.trim() && this.h.importSave(ta.value)) o.remove();
    });
    o.querySelector('[data-download]')!.addEventListener('click', () => {
      const blob = new Blob([this.h.exportSave()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `92776-save-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    const input = o.querySelector<HTMLInputElement>('[data-input]')!;
    o.querySelector('[data-file]')!.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (f && this.h.importSave(await f.text())) o.remove();
    });
    o.querySelector('[data-intro]')!.addEventListener('click', () => { o.remove(); this.h.replayIntro(); });
    o.querySelector('[data-about]')!.addEventListener('click', () => this.openAbout());
    o.querySelector('[data-reset]')!.addEventListener('click', async () => {
      const ok = await this.confirm('重置進度', '確定要重置所有進度嗎？成就也會一併清除，無法復原。', '確定重置');
      if (ok) { o.remove(); this.h.reset(); }
    });
    o.querySelector('[data-close]')!.addEventListener('click', () => o.remove());
    o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
  }

  ending(s: GameState, onQuit: () => void, onNewGame: () => void) {
    const tps = s.peakTps >= 10 ? fmt(s.peakTps) : s.peakTps.toFixed(1);
    const o = this.overlay('clear', `
      <div class="ending">
        <div class="line" style="animation-delay:0.2s">恭喜你，終於把所有樹都砍光了。</div>
        <div class="line" style="animation-delay:1.6s">雖然沒有人知道為什麼。</div>
        <div class="notice" style="animation-delay:3.4s">
          <div class="kicker">${iconHtml(ICONS.megaphone, true)} 市府公告</div>
          為落實永續發展政策，市府宣布啟動 <b>92,776</b> 棵路樹復育計畫。
        </div>
        <div class="end-stats" style="animation-delay:5s">
          <div class="kicker">${iconHtml(ICONS.chart, true)} 伐木紀錄</div>
          <div class="stats-grid">
            <span>手動砍伐</span><b>${fmtInt(s.clicks)} 次</b>
            <span>自動傷害</span><b>${fmt(s.autoDamage)}</b>
            <span>最高每秒砍伐</span><b>${tps} 棵</b>
            <span>遊戲中時間</span><b>${fmtDuration(s.playTime)}</b>
            <span>放置時間</span><b>${fmtDuration(s.idleTime)}</b>
          </div>
        </div>
        <div class="line by-the-way" style="animation-delay:7s">順便說一下，<br>92,776，是臺北市行道樹的總數。</div>
        <div class="actions" style="animation-delay:8.6s">
          <button class="btn-secondary" data-quit>結束遊戲</button>
          <button class="btn-primary" data-ng>${iconHtml(ICONS.seedling, true)} 開始種樹</button>
        </div>
      </div>`);
    o.querySelector('[data-quit]')!.addEventListener('click', () => {
      o.remove();
      onQuit();
      const m = this.overlay('', `
        <div class="modal" style="max-width:360px">
          <h2>${iconHtml(ICONS.finish, true)} 遊戲結束</h2>
          <p class="muted">街道很安靜。陽光很刺眼。</p>
          <div class="btn-row"><button class="btn" data-back>回到街景</button><button class="btn primary" data-ng>${iconHtml(ICONS.seedling, true)} 開始種樹</button></div>
        </div>`);
      m.querySelector('[data-back]')!.addEventListener('click', () => m.remove());
      m.querySelector('[data-ng]')!.addEventListener('click', () => { m.remove(); onNewGame(); });
    });
    o.querySelector('[data-ng]')!.addEventListener('click', () => { o.remove(); onNewGame(); });
  }

  setChopEnabled(on: boolean) {
    $<HTMLButtonElement>('chop').disabled = !on;
  }
}
