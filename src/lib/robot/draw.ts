// The robot look: tapered capsule legs, square-section arms, torso and pelvis shells, feet, helmet with visor.
// Plus props (boxes painted face by face) and the offscreen layer used to fade a figure as one shape.
import type { Frame, JointName } from './rig';
import type { Prop } from './skills';
import { P, layout, type Rect, type View } from './camera';
import { pal, col } from './palette';
import { clamp, smooth, sub, addv, nrm, crs, dot, TAU } from './math';

const { min, max, abs, hypot, atan2, acos, floor, ceil, cos, sin } = Math;
type G = CanvasRenderingContext2D;

export const capsule = (g: G, a: number[], b: number[], ra: number, rb: number) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = hypot(dx, dy);
  g.beginPath();
  if (d <= abs(ra - rb) + 0.01) g.arc(ra > rb ? a[0] : b[0], ra > rb ? a[1] : b[1], max(ra, rb), 0, TAU);
  else {
    const th = atan2(dy, dx), ph = acos((ra - rb) / d);
    g.arc(a[0], a[1], ra, th + ph, th - ph + TAU);
    g.arc(b[0], b[1], rb, th - ph, th + ph);
    g.closePath();
  }
  g.fill(); g.stroke();
};
// 2D convex hull (monotone chain).
export const hull = (pts: number[][]) => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: number[][] = [], up: number[][] = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
};
export const roundPoly = (g: G, q: number[][], r: number) => {
  const n = q.length, d = (a: number[], b: number[]) => hypot(a[0] - b[0], a[1] - b[1]);
  g.beginPath();
  g.moveTo((q[n - 1][0] + q[0][0]) / 2, (q[n - 1][1] + q[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = q[i], b = q[(i + 1) % n], p = q[(i + n - 1) % n];
    g.arcTo(a[0], a[1], b[0], b[1], min(r, d(a, b) / 2, d(a, p) / 2));
  }
  g.closePath();
};
export const polyline = (g: G, pts: number[][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };

const BOX_FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
const cornersOf = (c: number[], ax: number[][]) => {
  const out: number[][] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push([0, 1, 2].map(i => c[i] + ax[0][i] * sx + ax[1][i] * sy + ax[2][i] * sz));
  return out;
};
// Box with all six faces painted back to front, so its visible edges read as a solid.
const boxFaces = (g: G, q: number[][], ink: number) => {
  const faces = BOX_FACES.map(fc => ({ fc, z: fc.reduce((s, i) => s + q[i][2], 0) / 4 })).sort((a, b) => b.z - a.z);
  g.strokeStyle = col(pal.ink, ink); g.fillStyle = col(pal.bg);
  for (const { fc } of faces) {
    g.beginPath(); fc.forEach((i, k) => (k ? g.lineTo(q[i][0], q[i][1]) : g.moveTo(q[i][0], q[i][1])));
    g.closePath(); g.fill(); g.stroke();
  }
};

// Ink strength per prop kind. Tools are drawn by drawFigure when the robot holds them (tools = false skips them).
const PROP_INK: Record<string, number> = { table: 0.62, plank: 0.62, block: 0.7, obstacle: 0.7, tool: 0.85 };
export const drawProps = (g: G, props: Prop[], v: View, alpha = 1, tools = false) => {
  const lw = clamp(v.focal / v.cam.dist / 240, 0.7, 1.1);
  const list = props.filter(p => tools || p.kind !== 'tool').map(p => ({ p, q: cornersOf(p.c, p.ax).map(x => P(v, x)) }));
  list.sort((a, b) => (b.p.kind === 'table' ? 1 : 0) - (a.p.kind === 'table' ? 1 : 0) || b.q.reduce((s, x) => s + x[2], 0) - a.q.reduce((s, x) => s + x[2], 0));
  for (const { p, q } of list) {
    const a = alpha * (p.alpha ?? 1);
    if (a < 0.01) continue;
    g.globalAlpha = a; g.lineWidth = lw; g.lineJoin = 'round';
    if (p.kind === 'hole') {
      const m = P(v, p.c);
      g.fillStyle = col(pal.ink, 0.75); g.beginPath(); g.ellipse(m[0], m[1], max(1.2, lw * 1.6), max(0.8, lw), 0, 0, TAU); g.fill();
    } else boxFaces(g, q, (p as Prop & { crate?: boolean }).crate ? 0.86 : PROP_INK[p.kind] ?? 0.7);
  }
  g.globalAlpha = 1;
};

// Leg links: [from, to, radius at from, radius at to] in meters.
const LEGS: [JointName, JointName, number, number][] = [
  ['lHip', 'lKnee', 0.068, 0.048], ['lKnee', 'lAnkle', 0.05, 0.035], ['rHip', 'rKnee', 0.068, 0.048], ['rKnee', 'rAnkle', 0.05, 0.035],
];
// Square-section link: four corners at each end, tapered, oriented by the arm plane.
const link = (A: number[], Bp: number[], n: number[], [wa, da]: number[], [wb, db]: number[], ea: number, eb: number) => {
  const d = nrm(sub(Bp, A)), u = nrm(addv(n, d, -dot(n, d))), w = crs(d, u), a = addv(A, d, -ea), b = addv(Bp, d, eb), pts: number[][] = [];
  for (const [c0, hw, hd] of [[a, wa, da], [b, wb, db]] as [number[], number, number][]) for (const su of [-1, 1]) for (const sw of [-1, 1]) pts.push(addv(addv(c0, u, su * hw), w, sw * hd));
  return pts;
};

// Every part is queued with its depth and painted back to front.
export const drawFigure = (g: G, f: Frame, v: View, tools: Prop[] = []) => {
  const J = f.joints, items: { z: number; draw: () => void }[] = [];
  const pr = (p: number[]) => P(v, p), rad = (r: number, z: number) => (r * v.focal) / z;
  const lw = clamp(rad(1.6, hypot(...sub(J.pelvis, v.eye))) / 240, 0.7, 1.15);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const style = () => { g.strokeStyle = col(pal.ink, 0.86); g.fillStyle = col(pal.bg); g.lineWidth = lw; };
  const solid = (pts: number[][], corner: number, z: number, extra?: () => void) => {
    const q = pts.map(pr);
    items.push({ z, draw: () => { style(); roundPoly(g, hull(q), rad(corner, z)); g.fill(); g.stroke(); extra?.(); } });
  };
  const ball = (c0: number[], r: number, dz = 0) => {
    const Q = pr(c0);
    items.push({ z: Q[2] + dz, draw: () => { style(); g.beginPath(); g.arc(Q[0], Q[1], rad(r, Q[2]), 0, TAU); g.fill(); g.stroke(); } });
  };
  const corners = (lo: number[], hi: number[]) => {
    const out: number[][] = [];
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) out.push([x, y, z]);
    return out;
  };
  const frameBox = (c0: number[], ax: number[][], ext: number[][]) => ext.map(e => ax.reduce((p, a, i) => addv(p, a, e[i]), c0));

  for (const [a, b, ra, rb] of LEGS) {
    const Aq = pr(J[a]), Bq = pr(J[b]);
    items.push({ z: (Aq[2] + Bq[2]) / 2, draw: () => { style(); capsule(g, Aq, Bq, rad(ra, Aq[2]), rad(rb, Bq[2])); } });
  }

  // Arms: upper arm, forearm and hand as square-section links, with an edge highlight on the side facing the camera.
  const side = nrm(sub(J.rShoulder, J.lShoulder)), up = nrm(sub(J.neck, J.pelvis)), fwd = nrm(crs(up, side));
  for (const s of ['l', 'r'] as const) {
    const S = J[`${s}Shoulder`], E = J[`${s}Elbow`], Hd = J[`${s}Hand`], ua = sub(E, S), fa = sub(Hd, E);
    const nc = crs(ua, fa), k = smooth(0.02, 0.12, hypot(...nc) / (hypot(...ua) * hypot(...fa) || 1));
    const n = nrm(addv(addv([0, 0, 0], side, 1 - k), nrm(nc), k * (dot(nc, side) < 0 ? -1 : 1)));
    const segs = [
      link(S, E, n, [0.045, 0.04], [0.037, 0.034], 0.01, 0.03),
      link(E, Hd, n, [0.034, 0.031], [0.028, 0.026], 0.026, 0.0),
      link(Hd, addv(Hd, nrm(fa), 0.075), n, [0.025, 0.02], [0.021, 0.017], 0, 0),
    ];
    segs.forEach((pts, i) => {
      const q = pts.map(pr), z = (q.reduce((a, p) => a + p[2], 0) / q.length) + (i === 2 ? -0.004 : 0);
      items.push({ z, draw: () => {
        style(); roundPoly(g, hull(q), rad(0.008, z)); g.fill(); g.stroke();
        let best = 0, bz = 1e9;
        for (let e = 0; e < 4; e++) { const m = (q[e][2] + q[e + 4][2]) / 2; if (m < bz) { bz = m; best = e; } }
        g.strokeStyle = col(pal.ink, 0.28); g.beginPath(); g.moveTo(q[best][0], q[best][1]); g.lineTo(q[best + 4][0], q[best + 4][1]); g.stroke();
      } });
    });
    const Eq = pr(E);
    items.push({ z: Eq[2] - 0.03, draw: () => { style(); g.beginPath(); g.arc(Eq[0], Eq[1], rad(0.02, Eq[2]), 0, TAU); g.fill(); g.stroke(); } });
    ball(S, 0.05, 0.03);
  }

  // Torso shell (hull of four cross-sections from neck to waist) with a chest seam, and the pelvis shell.
  const axes = [side, up, fwd];
  const toCam = (p: number[]) => nrm(sub(v.eye, p));
  const shell: number[][] = [];
  for (const [c0, w, d] of [
    [addv(J.neck, up, -0.02), 0.13, 0.07], [addv(J.chest, up, 0.1), 0.17, 0.1], [addv(J.chest, up, -0.06), 0.14, 0.09], [addv(J.pelvis, up, 0.11), 0.095, 0.068],
  ] as [number[], number, number][]) shell.push(...frameBox(c0, axes, corners([-w, 0, -d], [w, 0, d])));
  solid(shell, 0.03, pr(J.chest)[2], () => {
    if (dot(fwd, toCam(J.chest)) < 0.15) return;
    const s2 = [-1, 1].map(kk => pr(addv(addv(addv(J.chest, up, -0.07), fwd, 0.092), side, kk * 0.1)));
    g.strokeStyle = col(pal.ink, 0.3); g.beginPath(); g.moveTo(s2[0][0], s2[0][1]); g.lineTo(s2[1][0], s2[1][1]); g.stroke();
  });
  solid(frameBox(J.pelvis, axes, corners([-0.115, -0.06, -0.075], [0.115, 0.05, 0.075])), 0.03, pr(J.pelvis)[2]);

  // Feet: a rounded wedge from heel to toe.
  for (const [an, to, kn] of [['lAnkle', 'lToe', 'lKnee'], ['rAnkle', 'rToe', 'rKnee']] as JointName[][]) {
    const Aj = J[an], Tj = J[to], fu = nrm(sub(J[kn], Aj)), d = sub(Tj, Aj), lat = nrm(crs(d, fu));
    const heel = addv(addv(Aj, fu, -0.055), d, -0.35), toeSole = addv(Tj, fu, -0.022);
    const pts = [Aj, Tj, toeSole, heel].flatMap(p => [addv(p, lat, 0.038), addv(p, lat, -0.038)]);
    solid(pts, 0.012, pr(addv(Aj, d, 0.4))[2]);
  }

  // Neck and helmet, with the accent visor clipped to the helmet.
  const neckTop = addv(J.head, up, -0.07), NA = pr(J.neck), NB = pr(neckTop);
  items.push({ z: (NA[2] + NB[2]) / 2 + 0.02, draw: () => { style(); capsule(g, NA, NB, rad(0.034, NA[2]), rad(0.032, NB[2])); } });
  const hc = addv(J.head, up, 0.01);
  solid(frameBox(hc, axes, corners([-0.085, -0.085, -0.092], [0.085, 0.1, 0.1])), 0.055, pr(hc)[2], () => {
    if (dot(fwd, toCam(J.head)) < -0.25) return;
    g.save(); g.clip();
    const vis = frameBox(addv(hc, fwd, 0.1), axes, [[-0.066, 0.004, 0], [0.066, 0.004, 0], [0.066, 0.05, 0], [-0.066, 0.05, 0]]).map(pr);
    roundPoly(g, vis, rad(0.012, vis[0][2]));
    g.fillStyle = col(pal.accent, 0.92); g.strokeStyle = col(pal.accent); g.fill(); g.stroke();
    g.restore();
  });

  // Held box and tools are sorted with the body, so hands can be in front of or behind them.
  const box = f.box;
  if (box && (box.alpha ?? 1) > 0.05) {
    const { center, size, yaw } = box, cy = cos(yaw), sy = sin(yaw);
    const q = cornersOf(center, [[(size[0] / 2) * cy, 0, (-size[0] / 2) * sy], [0, size[1] / 2, 0], [(size[2] / 2) * sy, 0, (size[2] / 2) * cy]]).map(pr);
    items.push({ z: pr(center)[2], draw: () => { g.lineWidth = lw; g.globalAlpha = box.alpha ?? 1; boxFaces(g, q, 0.86); g.globalAlpha = 1; } });
  }
  for (const t of tools) {
    if (t.kind !== 'tool') continue;
    const q = cornersOf(t.c, t.ax).map(pr);
    items.push({ z: pr(t.c)[2] - 0.02, draw: () => { g.lineWidth = lw; boxFaces(g, q, 0.86); } });
  }
  items.sort((a, b) => b.z - a.z).forEach(it => it.draw());
};

// Draws through an offscreen layer so overlapping parts of a faint figure do not show through each other.
export const faded = (ctx: G, lctx: G, a: number, r: Rect, draw: (g: G) => void) => {
  if (a <= 0.004) return;
  if (a >= 0.996) { draw(ctx); return; }
  const { W, H, dpr } = layout;
  const x = max(0, floor(r.x)), y = max(0, floor(r.y)), w = min(W, ceil(r.x + r.w)) - x, h = min(H, ceil(r.y + r.h)) - y;
  if (w <= 0 || h <= 0) return;
  lctx.clearRect(x, y, w, h);
  draw(lctx);
  ctx.globalAlpha = a;
  ctx.drawImage(lctx.canvas, x * dpr, y * dpr, w * dpr, h * dpr, x, y, w, h);
  ctx.globalAlpha = 1;
};
