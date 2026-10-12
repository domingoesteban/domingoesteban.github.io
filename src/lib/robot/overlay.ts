// Everything drawn around the robot: the policy net beside its head, the ring it stands on, the ground line of a
// walk, the caption under it and the push arrow.
import type { Frame } from './rig';
import { P, type View } from './camera';
import { pal, col } from './palette';
import { polyline } from './draw';
import { rnd, smooth, TAU } from './math';

const { min, max, sin, cos, atan2 } = Math;
type G = CanvasRenderingContext2D;

// Pulses run through the net in step with the action: k is the strength, w a random weight per edge.
export const pulses: { t: number; k: number; w: number[] }[] = [];
export const pulse = (time: number, k = 1) => { pulses.push({ t: time, k, w: Array.from({ length: 30 }, () => rnd()) }); if (pulses.length > 6) pulses.shift(); };

// A few faint nodes beside the head, wired into it. out = 1 puts the net to the right of the head, -1 to the left.
const NET = [3, 3];
export const drawNet = (g: G, f: Frame, v: View, a: number, out: number, time: number) => {
  if (a < 0.01) return;
  const h = P(v, f.joints.head), s = v.focal / v.cam.dist / 170;
  const nodes = NET.map((n, L) => Array.from({ length: n }, (_, i) => [h[0] + out * (70 - L * 26) * s, h[1] - 30 * s + (i - (n - 1) / 2) * 12 * s]));
  const into = [h[0] + out * 13 * s, h[1] - 4 * s];
  const edges: [number[], number[], number][] = [];
  for (const p of nodes[0]) for (const q of nodes[1]) edges.push([p, q, 0]);
  for (const p of nodes[1]) edges.push([p, into, 1]);
  g.lineWidth = 0.7;
  edges.forEach(([p, q, L], i) => {
    let lit = 0;
    for (const pu of pulses) {
      const u = (time - pu.t) / 0.5;
      lit = max(lit, pu.k * (0.35 + 0.65 * pu.w[i % pu.w.length]) * smooth(L * 0.4 - 0.05, L * 0.4 + 0.15, u) * (1 - smooth(L * 0.4 + 0.3, L * 0.4 + 0.7, u)));
    }
    g.strokeStyle = col(pal.ink, 0.1 * a); polyline(g, [p, q]);
    if (lit > 0.02) { g.strokeStyle = col(pal.accent, min(0.7, lit * 0.7) * a); polyline(g, [p, q]); }
  });
  nodes.flat().forEach((p, i) => {
    let lit = 0;
    for (const pu of pulses) { const u = (time - pu.t) / 0.5, L = i < NET[0] ? 0 : 1; lit = max(lit, pu.k * smooth(L * 0.4, L * 0.4 + 0.12, u) * (1 - smooth(L * 0.4 + 0.25, L * 0.4 + 0.65, u))); }
    g.fillStyle = lit > 0.05 ? col(pal.accent, min(0.8, lit) * a) : col(pal.bg); g.strokeStyle = col(pal.ink, 0.32 * a);
    g.beginPath(); g.arc(p[0], p[1], 1.8 * max(0.8, s), 0, TAU); g.fill(); g.stroke();
  });
};

// Ground circle of radius r (m) around (cx, cz).
export const ring = (g: G, v: View, r: number, a: number, cx = 0, cz = 0) => {
  if (a < 0.01) return;
  const pts: number[][] = [];
  for (let i = 0; i <= 72; i++) pts.push(P(v, [cx + r * cos((i / 72) * TAU), 0, cz + r * sin((i / 72) * TAU)]));
  g.strokeStyle = col(pal.line, a); g.lineWidth = 1; polyline(g, pts);
};

// Horizontal ground line that fades out at both ends.
export const groundLine = (g: G, x0: number, x1: number, y: number, a: number) => {
  if (a < 0.01 || x1 - x0 < 2) return;
  const gr = g.createLinearGradient(x0, 0, x1, 0), f = min(0.3, 60 / (x1 - x0));
  gr.addColorStop(0, col(pal.line, 0)); gr.addColorStop(f, col(pal.line, a)); gr.addColorStop(1 - f, col(pal.line, a)); gr.addColorStop(1, col(pal.line, 0));
  g.strokeStyle = gr; g.lineWidth = 1;
  polyline(g, [[x0, y + 0.5], [x1, y + 0.5]]);
};

export const caption = (g: G, text: string, x: number, y: number, a: number, align: CanvasTextAlign = 'center') => {
  if (a < 0.01) return;
  g.font = `500 10px ${pal.mono}`;
  g.letterSpacing = '0.09em';
  g.textAlign = align; g.textBaseline = 'alphabetic';
  g.fillStyle = col(pal.muted, a);
  g.fillText(text.toUpperCase(), x, y);
};

export const arrow = (g: G, v: View, from: number[], to: number[], a: number) => {
  const Aq = P(v, from), Bq = P(v, to), th = atan2(Bq[1] - Aq[1], Bq[0] - Aq[0]), hl = 6;
  g.strokeStyle = col(pal.accent, a); g.lineWidth = 1.3;
  polyline(g, [Aq, Bq]);
  polyline(g, [[Bq[0] - hl * cos(th - 0.45), Bq[1] - hl * sin(th - 0.45)], Bq, [Bq[0] - hl * cos(th + 0.45), Bq[1] - hl * sin(th + 0.45)]]);
};
