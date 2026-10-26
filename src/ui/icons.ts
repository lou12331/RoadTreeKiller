import type { IconPath } from '../core/icons';

/** Decorative images accompany visible labels, avoiding duplicate screen-reader text. */
export function iconHtml(path: IconPath, small = false): string {
  const source = small ? path.replace('icons/', 'icons/small/') : path;
  return `<img class="game-icon" src="${import.meta.env.BASE_URL}${source}" width="${small ? 16 : 32}" height="${small ? 16 : 32}" alt="" aria-hidden="true" draggable="false" />`;
}
