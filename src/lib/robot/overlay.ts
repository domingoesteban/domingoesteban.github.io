// Everything drawn around the robot: the policy net beside its head (and its closed-loop state), the ring it
// stands on, the ground line of a walk, the caption under it and the push arrow.
import type { Frame, JointName } from './rig';
import { P, type View } from './camera';
import { pal, col } from './palette';
import { polyline } from './draw';
import { follow, TAU } from './math';

const { min, max, abs, sin, cos, atan2, tanh, hypot } = Math;
type G = CanvasRenderingContext2D;

// The policy beside the head runs in closed loop: every frame it reads the robot's own motion (gait clock, speed,
// feet, hands, torso, push) and its activations follow. Walking, drilling or standing still each light it in their
// own way, and it never goes dark: biases and a little sensor noise keep it ticking at rest.
const NET = [3, 3];
let seed = 7;
const w = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
// Observations: speed, gait sin, gait cos, left foot, right foot, left hand, right hand, torso, push.
// Input node 0 mostly reads the legs, node 1 the arms, node 2 the torso and balance, plus a little of everything.
const W0 = [
  [0.3, 1.1, 0.2, 0.9, 0.9, 0, 0, 0, 0.3],
  [0, 0, 0, 0, 0, 1.3, 1.3, 0.3, 0],
  [0.7, 0, 0.8, 0, 0, 0, 0, 1.2, 1.4],
].map(row => row.map(x => 0.8 * x + 0.2 * w()));
const B0 = [0.32, 0.26, 0.3];
// Hidden layer: each node follows one input node and is held back by another, so a gait or a task shows a pattern
// rather than lighting everything.
const W1 = [
  [1.2, -0.6, 0.2],
  [-0.3, 0.9, 0.4],
  [0.2, -0.3, 1.1],
];
const B1 = [0.3, -0.1, 0];
const GAIN = [0.35, 0.7, 0.7, 0.45, 0.45, 0.8, 0.8, 1, 1];
const dense = (W: number[][], x: number[], b: number[]) => W.map((row, i) => tanh(row.reduce((s, wij, j) => s + wij * x[j], b[i])));

const a0 = dense(W0, Array(9).fill(0), B0);
export const net = { obs: Array(9).fill(0), noise: Array(9).fill(0), a: [a0, dense(W1, a0, B1)], prev: null as Frame | null };

// s carries the follower state the frame alone does not show: track speed (m/s), gait phase, gait amplitude, push.
export function stepNet(f: Frame, s: { v: number; phase: number; amp: number; push: number }, dt: number) {
  const p = net.prev;
  net.prev = f;
  if (!p || dt <= 0) return;
  const vel = (j: JointName, rel = true) => {
    const a = f.joints[j], b = p.joints[j], pa = rel ? f.joints.pelvis : [0, 0, 0], pb = rel ? p.joints.pelvis : [0, 0, 0];
    return hypot(a[0] - pa[0] - b[0] + pb[0], a[1] - pa[1] - b[1] + pb[1], a[2] - pa[2] - b[2] + pb[2]) / dt;
  };
  const ph = s.phase * TAU;
  const raw = [abs(s.v), s.amp * sin(ph), s.amp * cos(ph), vel('lAnkle'), vel('rAnkle'), vel('lHand'), vel('rHand'), vel('chest', false), abs(s.push)];
  net.noise = net.noise.map(n => follow(n, 0.3 * (Math.random() * 2 - 1), 8, dt));
  net.obs = raw.map((x, i) => follow(net.obs[i], tanh(GAIN[i] * x) + net.noise[i], 16, dt));
  // Each layer lags the one before a little, so changes flow from the inputs toward the head.
  const x0 = dense(W0, net.obs, B0), x1 = dense(W1, net.a[0], B1);
  net.a[0] = net.a[0].map((v, i) => follow(v, x0[i], 14, dt));
  net.a[1] = net.a[1].map((v, i) => follow(v, x1[i], 9, dt));
}

// A few faint nodes beside the head, wired into it. out = 1 puts the net to the right of the head, -1 to the left,
// values in between fold it through the head when it changes side.
export const drawNet = (g: G, f: Frame, v: View, a: number, out: number) => {
  if (a < 0.01) return;
  a *= 0.55 + 0.45 * abs(out);
  const h = P(v, f.joints.head), s = v.focal / v.cam.dist / 170;
  const nodes = NET.map((n, L) => Array.from({ length: n }, (_, i) => [h[0] + out * (70 - L * 26) * s, h[1] - 30 * s + (i - (n - 1) / 2) * 12 * s]));
  const into = [h[0] + out * 13 * s, h[1] - 4 * s];
  const [A0, A1] = net.a;
  g.lineWidth = 0.7;
  const edge = (p: number[], q: number[], lit: number) => {
    g.strokeStyle = col(pal.ink, 0.08 * a); polyline(g, [p, q]);
    g.strokeStyle = col(pal.accent, min(0.65, 0.6 * lit) * a); polyline(g, [p, q]);
  };
  nodes[0].forEach((p, i) => nodes[1].forEach((q, j) => edge(p, q, abs(A0[i] * W1[j][i]))));
  nodes[1].forEach((p, j) => edge(p, into, abs(A1[j])));
  nodes.forEach((layer, L) => layer.forEach((p, i) => {
    const r = 1.8 * max(0.8, s);
    g.fillStyle = col(pal.bg);
    g.beginPath(); g.arc(p[0], p[1], r, 0, TAU); g.fill();
    g.fillStyle = col(pal.accent, (0.08 + 0.85 * abs(net.a[L][i]) ** 1.5) * a); g.strokeStyle = col(pal.ink, 0.3 * a);
    g.fill(); g.stroke();
  }));
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
  if (!text || a < 0.01) return;
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
