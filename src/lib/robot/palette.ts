// Canvas colors and caption font, read from the CSS variables of the page root (home.css).
// Read again when the theme changes (app.ts).

// Each color is an "r, g, b" string, so col() can add any alpha.
export const pal = { bg: '', ink: '', muted: '', line: '', accent: '', obj: '', objFill: '', mono: '' };
export const col = (c: string, a = 1) => `rgba(${c}, ${a})`;

const rgb = (hex: string) => {
  const h = hex.replace('#', ''), f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)).join(', ');
};

export function readPalette(root: HTMLElement) {
  const cs = getComputedStyle(root), cv = (n: string) => rgb(cs.getPropertyValue(n).trim());
  Object.assign(pal, { bg: cv('--bg'), ink: cv('--ink'), muted: cv('--muted'), line: cv('--line-2'), accent: cv('--accent'), obj: cv('--object'), objFill: cv('--object-fill'), mono: cs.getPropertyValue('--mono').trim() });
}
