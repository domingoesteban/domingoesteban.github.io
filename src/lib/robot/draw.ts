// The robot look: tapered capsule legs, square-section arms, torso and pelvis shells, feet, helmet with visor.
// Plus props (boxes painted face by face) and the offscreen layer used to fade a figure as one shape.
import type { Frame } from './rig';
import type { Prop, PropKind } from './skills';
import { P, layout, type Rect, type View } from './camera';
import { paintParts, type Box, type Part } from './paint';
import { pal, col } from './palette';
import { clamp, smooth, sub, addv, nrm, crs, dot, TAU } from './math';

const { min, max, abs, hypot, atan2, acos, floor, ceil, cos, sin } = Math;
type G = CanvasRenderingContext2D;

// Adds a tapered capsule outline to the current path.
const capsulePath = (g: G, a: number[], b: number[], ra: number, rb: number) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = hypot(dx, dy);
  if (d <= abs(ra - rb) + 0.01) { const c = ra > rb ? a : b; g.moveTo(c[0] + max(ra, rb), c[1]); g.arc(c[0], c[1], max(ra, rb), 0, TAU); }
  else {
    const th = atan2(dy, dx), ph = acos((ra - rb) / d);
    g.moveTo(a[0] + ra * cos(th + ph), a[1] + ra * sin(th + ph));
    g.arc(a[0], a[1], ra, th + ph, th - ph + TAU);
    g.arc(b[0], b[1], rb, th - ph, th + ph);
  }
  g.closePath();
};
export const capsule = (g: G, a: number[], b: number[], ra: number, rb: number) => { g.beginPath(); capsulePath(g, a, b, ra, rb); g.fill(); g.stroke(); };
// 2D convex hull (monotone chain).
export const hull = (pts: number[][]) => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: number[][] = [], up: number[][] = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
};
// Adds a polygon with rounded corners to the current path.
const roundPolyPath = (g: G, q: number[][], r: number) => {
  const n = q.length, d = (a: number[], b: number[]) => hypot(a[0] - b[0], a[1] - b[1]);
  g.moveTo((q[n - 1][0] + q[0][0]) / 2, (q[n - 1][1] + q[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = q[i], b = q[(i + 1) % n], p = q[(i + n - 1) % n];
    g.arcTo(a[0], a[1], b[0], b[1], min(r, d(a, b) / 2, d(a, p) / 2));
  }
  g.closePath();
};
export const roundPoly = (g: G, q: number[][], r: number) => { g.beginPath(); roundPolyPath(g, q, r); };
// Screen bounding box [x0, y0, x1, y1] of points, grown by r.
const bbox = (pts: number[][], r = 0) => [min(...pts.map(p => p[0])) - r, min(...pts.map(p => p[1])) - r, max(...pts.map(p => p[0])) + r, max(...pts.map(p => p[1])) + r];
// Adds a closed polygon to the current path.
const polygonPath = (g: G, q: number[][]) => { q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
export const polyline = (g: G, pts: number[][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };

const BOX_FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
const cornersOf = (c: number[], ax: number[][]) => {
  const out: number[][] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push([0, 1, 2].map(i => c[i] + ax[0][i] * sx + ax[1][i] * sy + ax[2][i] * sz));
  return out;
};
// Colors per prop kind. The objects the robot handles, sits on or jumps over (boxes, the block, the obstacle) take the
// object color; furniture and tools are drawn in ink, with its strength per kind.
const OBJECTS: PropKind[] = ['block', 'obstacle'];
const PROP_INK: Partial<Record<PropKind, number>> = { table: 0.62, plank: 0.62, tool: 0.86 };
// Box with all six faces painted back to front, so its visible edges read as a solid.
const boxFaces = (g: G, q: number[][], kind: PropKind) => {
  const faces = BOX_FACES.map(fc => ({ fc, z: fc.reduce((s, i) => s + q[i][2], 0) / 4 })).sort((a, b) => b.z - a.z);
  const obj = OBJECTS.includes(kind);
  g.strokeStyle = obj ? col(pal.obj) : col(pal.ink, PROP_INK[kind] ?? 0.7); g.fillStyle = col(obj ? pal.objFill : pal.bg);
  for (const { fc } of faces) {
    g.beginPath(); fc.forEach((i, k) => (k ? g.lineTo(q[i][0], q[i][1]) : g.moveTo(q[i][0], q[i][1])));
    g.closePath(); g.fill(); g.stroke();
  }
};

// Tools and loose crates are drawn by drawFigure when they are the robot's (all = false skips them).
const isCrate = (p: Prop) => !!(p as Prop & { crate?: boolean }).crate;
const withFigure = (p: Prop) => p.kind === 'tool' || isCrate(p);
export const drawProps = (g: G, props: Prop[], v: View, alpha = 1, all = false) => {
  const lw = clamp(v.focal / v.cam.dist / 240, 0.7, 1.1);
  const list = props.filter(p => all || !withFigure(p)).map(p => ({ p, q: cornersOf(p.c, p.ax).map(x => P(v, x)) }));
  list.sort((a, b) => (b.p.kind === 'table' ? 1 : 0) - (a.p.kind === 'table' ? 1 : 0) || b.q.reduce((s, x) => s + x[2], 0) - a.q.reduce((s, x) => s + x[2], 0));
  for (const { p, q } of list) {
    const a = alpha * (p.alpha ?? 1);
    if (a < 0.01) continue;
    g.globalAlpha = a; g.lineWidth = lw; g.lineJoin = 'round';
    if (p.kind === 'hole') {
      const m = P(v, p.c);
      g.fillStyle = col(pal.ink, 0.75); g.beginPath(); g.ellipse(m[0], m[1], max(1.2, lw * 1.6), max(0.8, lw), 0, 0, TAU); g.fill();
    } else boxFaces(g, q, p.kind);
  }
  g.globalAlpha = 1;
};

// Square-section link: four corners at each end, tapered, oriented by the arm plane.
const link = (A: number[], Bp: number[], n: number[], [wa, da]: number[], [wb, db]: number[], ea: number, eb: number) => {
  const d = nrm(sub(Bp, A)), u = nrm(addv(n, d, -dot(n, d))), w = crs(d, u), a = addv(A, d, -ea), b = addv(Bp, d, eb), pts: number[][] = [];
  for (const [c0, hw, hd] of [[a, wa, da], [b, wb, db]] as [number[], number, number][]) for (const su of [-1, 1]) for (const sw of [-1, 1]) pts.push(addv(addv(c0, u, su * hw), w, sw * hd));
  return pts;
};

// Where two parts overlap, the first always paints over the second, whatever their depths (see paint.ts).
const COVERS: [string, string][] = [
  ...['l', 'r'].flatMap(s => [
    [`${s}Thigh`, `${s}Shin`], // the knee reads as the thigh in front
    [`${s}UpperArm`, `${s}Shoulder`], // the shoulder ball sits under the upper arm
    [`${s}Elbow`, `${s}UpperArm`], [`${s}Elbow`, `${s}Forearm`], // the elbow pin sits on both arm links
    [`${s}Hand`, `${s}Forearm`],
    ['tool', `${s}Hand`],
  ] as [string, string][]),
  ['head', 'neck'], ['torso', 'neck'],
];

// The figure as parts (see paint.ts for how they are ordered). extras: the props of the robot's own section; its
// tools are held, and a loose crate hides the parts behind it like the held box does.
export const drawFigure = (g: G, f: Frame, v: View, extras: Prop[] = []) => {
  const J = f.joints, parts: Part[] = [];
  const mid = (pts: number[][]) => pts.reduce((s, p) => addv(s, p, 1 / pts.length), [0, 0, 0]);
  const pr = (p: number[]) => P(v, p), rad = (r: number, z: number) => (r * v.focal) / z;
  const lw = clamp(rad(1.6, hypot(...sub(J.pelvis, v.eye))) / 240, 0.7, 1.15);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const style = (gg: G) => { gg.strokeStyle = col(pal.ink, 0.86); gg.fillStyle = col(pal.bg); gg.lineWidth = lw; };
  const solid = (name: string, pts: number[][], corner: number, z: number, extra?: (g: G) => void) => {
    const q = hull(pts.map(pr));
    parts.push({ name, z, at: mid(pts), bounds: bbox(q), outline: gg => roundPolyPath(gg, q, rad(corner, z)), extra });
  };
  const ball = (name: string, c0: number[], r: number) => {
    const Q = pr(c0), R = rad(r, Q[2]);
    parts.push({ name, z: Q[2], at: c0, bounds: bbox([Q], R), outline: gg => { gg.moveTo(Q[0] + R, Q[1]); gg.arc(Q[0], Q[1], R, 0, TAU); } });
  };
  const tube = (name: string, a: number[], b: number[], ra: number, rb: number) => {
    const Aq = pr(a), Bq = pr(b), rA = rad(ra, Aq[2]), rB = rad(rb, Bq[2]);
    parts.push({ name, z: (Aq[2] + Bq[2]) / 2, at: mid([a, b]), axis: [a, b, max(rA, rB)], bounds: bbox([Aq, Bq], max(rA, rB)), outline: gg => capsulePath(gg, Aq, Bq, rA, rB) });
  };
  const corners = (lo: number[], hi: number[]) => {
    const out: number[][] = [];
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) out.push([x, y, z]);
    return out;
  };
  const frameBox = (c0: number[], ax: number[][], ext: number[][]) => ext.map(e => ax.reduce((p, a, i) => addv(p, a, e[i]), c0));

  for (const s of ['l', 'r'] as const) {
    tube(`${s}Thigh`, J[`${s}Hip`], J[`${s}Knee`], 0.068, 0.048);
    tube(`${s}Shin`, J[`${s}Knee`], J[`${s}Ankle`], 0.05, 0.035);
  }

  // Arms: upper arm, forearm and hand as square-section links, with an edge highlight on the side facing the camera.
  const side = nrm(sub(J.rShoulder, J.lShoulder)), up = nrm(sub(J.neck, J.pelvis)), fwd = nrm(crs(up, side));
  for (const s of ['l', 'r'] as const) {
    const S = J[`${s}Shoulder`], E = J[`${s}Elbow`], Hd = J[`${s}Hand`], ua = sub(E, S), fa = sub(Hd, E);
    const nc = crs(ua, fa), k = smooth(0.02, 0.12, hypot(...nc) / (hypot(...ua) * hypot(...fa) || 1));
    const n = nrm(addv(addv([0, 0, 0], side, 1 - k), nrm(nc), k * (dot(nc, side) < 0 ? -1 : 1)));
    const tip = addv(Hd, nrm(fa), 0.075);
    const links: [string, number[], number[], number[], number[], number, number][] = [
      [`${s}UpperArm`, S, E, [0.045, 0.04], [0.037, 0.034], 0.01, 0.03],
      [`${s}Forearm`, E, Hd, [0.034, 0.031], [0.028, 0.026], 0.026, 0],
      [`${s}Hand`, Hd, tip, [0.025, 0.02], [0.021, 0.017], 0, 0],
    ];
    for (const [name, A, B, wa, wb, ea, eb] of links) {
      const pts = link(A, B, n, wa, wb, ea, eb), q = pts.map(pr), z = q.reduce((a, p) => a + p[2], 0) / q.length, h = hull(q);
      parts.push({ name, z, at: mid(pts), axis: [A, B, rad(wa[0], z)], bounds: bbox(h), outline: gg => roundPolyPath(gg, h, rad(0.008, z)), extra: gg => {
        let best = 0, bz = 1e9;
        for (let e = 0; e < 4; e++) { const m = (q[e][2] + q[e + 4][2]) / 2; if (m < bz) { bz = m; best = e; } }
        gg.strokeStyle = col(pal.ink, 0.28); gg.beginPath(); gg.moveTo(q[best][0], q[best][1]); gg.lineTo(q[best + 4][0], q[best + 4][1]); gg.stroke();
      } });
    }
    ball(`${s}Elbow`, E, 0.02);
    ball(`${s}Shoulder`, S, 0.05);
  }

  // Torso shell (hull of four cross-sections from neck to waist) with a chest seam, and the pelvis shell.
  const axes = [side, up, fwd];
  const toCam = (p: number[]) => nrm(sub(v.eye, p));
  const shell: number[][] = [];
  for (const [c0, w, d] of [
    [addv(J.neck, up, -0.02), 0.13, 0.07], [addv(J.chest, up, 0.1), 0.17, 0.1], [addv(J.chest, up, -0.06), 0.14, 0.09], [addv(J.pelvis, up, 0.11), 0.095, 0.068],
  ] as [number[], number, number][]) shell.push(...frameBox(c0, axes, corners([-w, 0, -d], [w, 0, d])));
  solid('torso', shell, 0.03, pr(J.chest)[2], gg => {
    if (dot(fwd, toCam(J.chest)) < 0.15) return;
    const s2 = [-1, 1].map(kk => pr(addv(addv(addv(J.chest, up, -0.07), fwd, 0.092), side, kk * 0.1)));
    gg.strokeStyle = col(pal.ink, 0.3); gg.beginPath(); gg.moveTo(s2[0][0], s2[0][1]); gg.lineTo(s2[1][0], s2[1][1]); gg.stroke();
  });
  solid('pelvis', frameBox(J.pelvis, axes, corners([-0.115, -0.06, -0.075], [0.115, 0.05, 0.075])), 0.03, pr(J.pelvis)[2]);

  // Feet: a rounded wedge from heel to toe.
  for (const s of ['l', 'r'] as const) {
    const Aj = J[`${s}Ankle`], Tj = J[`${s}Toe`], fu = nrm(sub(J[`${s}Knee`], Aj)), d = sub(Tj, Aj), lat = nrm(crs(d, fu));
    const heel = addv(addv(Aj, fu, -0.055), d, -0.35), toeSole = addv(Tj, fu, -0.022);
    const pts = [Aj, Tj, toeSole, heel].flatMap(p => [addv(p, lat, 0.038), addv(p, lat, -0.038)]);
    solid(`${s}Foot`, pts, 0.012, pr(addv(Aj, d, 0.4))[2]);
  }

  // Neck and helmet, with the accent visor clipped to the helmet.
  tube('neck', J.neck, addv(J.head, up, -0.07), 0.034, 0.032);
  const hc = addv(J.head, up, 0.01);
  solid('head', frameBox(hc, axes, corners([-0.085, -0.085, -0.092], [0.085, 0.1, 0.1])), 0.055, pr(hc)[2], gg => {
    if (dot(fwd, toCam(J.head)) < -0.25) return;
    gg.save(); gg.clip();
    const vis = frameBox(addv(hc, fwd, 0.1), axes, [[-0.066, 0.004, 0], [0.066, 0.004, 0], [0.066, 0.05, 0], [-0.066, 0.05, 0]]).map(pr);
    roundPoly(gg, vis, rad(0.012, vis[0][2]));
    gg.fillStyle = col(pal.accent, 0.92); gg.strokeStyle = col(pal.accent); gg.fill(); gg.stroke();
    gg.restore();
  });

  for (const t of extras.filter(p => p.kind === 'tool')) {
    const q = cornersOf(t.c, t.ax).map(pr), h = hull(q);
    parts.push({ name: 'tool', z: pr(t.c)[2], at: t.c, bounds: bbox(h), outline: gg => polygonPath(gg, h), custom: gg => { gg.lineWidth = lw; boxFaces(gg, q, 'tool'); } });
  }

  // The box: the one in the frame (held, or about to be) or else a loose crate of the robot's section.
  const fb = f.box && (f.box.alpha ?? 1) > 0.05 ? f.box : null, crate = extras.find(isCrate);
  let box: Box | null = null;
  const boxOf = (c: number[], ax: number[][], a: number): Box => {
    const q = cornersOf(c, ax).map(pr);
    return { c, ax, outline: hull(q), paint: gg => { gg.lineWidth = lw; gg.globalAlpha = a; boxFaces(gg, q, 'block'); gg.globalAlpha = 1; } };
  };
  if (fb) {
    const { center, size, yaw } = fb, cy = cos(yaw), sy = sin(yaw);
    box = boxOf(center, [[(size[0] / 2) * cy, 0, (-size[0] / 2) * sy], [0, size[1] / 2, 0], [(size[2] / 2) * sy, 0, (size[2] / 2) * cy]], fb.alpha ?? 1);
  } else if (crate) box = boxOf(crate.c, crate.ax, crate.alpha ?? 1);

  paintParts(g, parts, COVERS, { style, project: pr, eye: v.eye, lw }, box);
};

// Draws through an offscreen layer so overlapping parts of a faint figure do not show through each other. The layer
// only covers r: drawing on a layer that was just drawn makes the browser copy all of it, so keep layers small and
// use one per figure.
export const faded = (ctx: G, lctx: G, a: number, r: Rect, draw: (g: G) => void) => {
  if (a <= 0.004) return;
  if (a >= 0.996) { draw(ctx); return; }
  const { W, H, dpr } = layout;
  const x = max(0, floor(r.x)), y = max(0, floor(r.y)), w = min(W, ceil(r.x + r.w)) - x, h = min(H, ceil(r.y + r.h)) - y;
  if (w <= 0 || h <= 0) return;
  const L = lctx.canvas, pw = ceil(w * dpr), ph = ceil(h * dpr);
  if (L.width < pw || L.height < ph) { L.width = max(L.width, pw); L.height = max(L.height, ph); }
  lctx.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr);
  lctx.clearRect(x, y, w, h);
  draw(lctx);
  ctx.globalAlpha = a;
  ctx.drawImage(L, 0, 0, pw, ph, x, y, pw / dpr, ph / dpr);
  ctx.globalAlpha = 1;
};
