// Painter for a figure made of 2D parts: back to front by depth, with two rules on top.
//
// 1. Covers: where two parts overlap, a fixed one paints over the other whatever their depths (a thigh over its
//    shin at the knee). Given as [over, under] name pairs, so a joint's look is one line of data.
// 2. Box: a box (held, or on the floor) hides exactly the parts behind it. Each part goes on the side of the box it is
//    on in 3D, and a limb that crosses a box face is cut where it passes behind the box.
//
// The body is painted by depth, then the box over it, then the parts in front of the box again, clipped to the box
// outline. So away from the box plain depth order holds, and over it every part keeps a consistent side.
import { addv, sub, dot } from './math';

type G = CanvasRenderingContext2D;

export type Part = {
  name: string; // for covers ('lThigh', 'torso', ...); names need not be unique
  z: number; // depth, larger is farther
  at: number[]; // world point that decides its side of the box
  axis?: [number[], number[], number]; // a limb: world axis ends and its half width in pixels, so it can be cut
  outline: (g: G) => void; // adds the part's screen silhouette to the current path
  extra?: (g: G) => void; // details painted after the fill and stroke (seams, visor), with the outline as path
  custom?: (g: G) => void; // replaces the default fill and stroke of the outline
};
export type Box = { c: number[]; ax: number[][]; paint: (g: G) => void; outline: number[][] }; // ax: half extents
export type Look = { style: (g: G) => void; project: (p: number[]) => number[]; eye: number[]; lw: number };

// True when the box cannot hide point p. A point outside a box face that looks at the camera is in front (the eye and
// the point are both on the outer side of that face's plane). A point inside the box goes with its closest face.
export const beforeBox = (p: number[], { c, ax }: Pick<Box, 'c' | 'ax'>, eye: number[]) => {
  const d = sub(p, c);
  let deepest = -1e9, front = false;
  for (const a of ax) {
    const u = dot(d, a) / dot(a, a);
    for (const s of [-1, 1]) {
      const looks = dot(sub(eye, addv(c, a, s)), a) * s > 0;
      if (s * u > 1 && looks) return true;
      if (s * u > deepest) { deepest = s * u; front = looks; }
    }
  }
  return deepest <= 1 && front;
};

const BIG = 1e5;
const polygon = (g: G, q: number[][]) => { q.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };

export function paintParts(g: G, parts: Part[], covers: [string, string][], look: Look, box: Box | null) {
  const { style, project, eye, lw } = look;
  const over = (p: Part) => parts.filter(q => q !== p && covers.some(([a, b]) => a === q.name && b === p.name));

  const fill = (p: Part) => {
    if (p.custom) return p.custom(g);
    style(g); g.beginPath(); p.outline(g); g.fill(); g.stroke(); p.extra?.(g);
  };
  // A part painted without its coverers' areas, then their outlines redrawn over it (the clip halves them).
  const paint = (p: Part) => {
    const top = over(p);
    if (!top.length) return fill(p);
    g.save();
    for (const q of top) { g.beginPath(); g.rect(-BIG, -BIG, 2 * BIG, 2 * BIG); q.outline(g); g.clip('evenodd'); }
    fill(p);
    g.restore();
    g.save(); g.beginPath(); p.outline(g); g.clip();
    style(g);
    for (const q of top) { g.beginPath(); q.outline(g); g.stroke(); }
    g.restore();
  };
  const byDepth = (list: Part[]) => [...list].sort((a, b) => b.z - a.z).forEach(paint);

  byDepth(parts);
  if (!box) return;
  box.paint(g);

  // Whether a part is in front of the box: true, false, or for a limb crossing a box face the clip polygon of the
  // stretch of its axis in front.
  const K = 9, lerp3 = (A: number[], B: number[], t: number) => addv(A, sub(B, A), t);
  const inFront = (p: Part): number[][] | boolean => {
    if (!p.axis) return beforeBox(p.at, box, eye);
    const [A, B, R] = p.axis, on = Array.from({ length: K }, (_, i) => beforeBox(lerp3(A, B, i / (K - 1)), box, eye));
    if (on.every(x => x === on[0])) return on[0];
    const i0 = on.indexOf(true), i1 = on.lastIndexOf(true);
    const ta = i0 === 0 ? 0 : (i0 - 0.5) / (K - 1), tb = i1 === K - 1 ? 1 : (i1 + 0.5) / (K - 1);
    const pa = project(lerp3(A, B, ta)), pb = project(lerp3(A, B, tb)), len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    if (len < 1) return beforeBox(p.at, box, eye);
    // A band along the axis, three half widths wide, running past the limb's own ends.
    const d = [(pb[0] - pa[0]) / len, (pb[1] - pa[1]) / len], n = [-d[1] * 3 * R, d[0] * 3 * R];
    const ea = ta === 0 ? 3 * R : 0, eb = tb === 1 ? 3 * R : 0;
    const a0 = [pa[0] - d[0] * ea, pa[1] - d[1] * ea], b0 = [pb[0] + d[0] * eb, pb[1] + d[1] * eb];
    return [[a0[0] + n[0], a0[1] + n[1]], [b0[0] + n[0], b0[1] + n[1]], [b0[0] - n[0], b0[1] - n[1]], [a0[0] - n[0], a0[1] - n[1]]];
  };
  // Grown by the line width, so the box's own outline under a front part is covered too.
  const q = box.outline, m = q.reduce((s, p) => [s[0] + p[0] / q.length, s[1] + p[1] / q.length], [0, 0]);
  const grown = q.map(([x, y]) => { const l = Math.hypot(x - m[0], y - m[1]) || 1; return [x + ((x - m[0]) / l) * 2 * lw, y + ((y - m[1]) / l) * 2 * lw]; });
  g.save(); g.beginPath(); polygon(g, grown); g.clip();
  for (const p of [...parts].sort((a, b) => b.z - a.z)) {
    const k = inFront(p);
    if (k === false) continue;
    if (k === true) { paint(p); continue; }
    g.save(); g.beginPath(); polygon(g, k); g.clip(); paint(p); g.restore();
  }
  g.restore();
}
