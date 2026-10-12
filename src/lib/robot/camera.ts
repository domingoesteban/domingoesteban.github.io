// Camera and screen layout. One yaw for everything, so the hero grid, the sections and the walks read as one scene.
import { project, type Camera, type Vec3 } from './rig';
import { lerp, TAU } from './math';

const { min, max, sin, cos, atan2, tan, PI } = Math;

export const YAW = -0.82, FOV = 0.42;
export const HR = atan2(cos(YAW), sin(YAW)), HL = HR - PI; // headings that walk screen-right and screen-left

// The follower camera frames one robot standing on a 0.82 m disc (smaller on the mobile dock).
export const FOL_PITCH = 0.24, FOL_TARGET: Vec3 = [0, 0.85, 0];
export const folPts: Vec3[] = [];
for (let i = 0; i < 16; i++) folPts.push([0.82 * cos((i / 16) * TAU), 0, 0.82 * sin((i / 16) * TAU)], [0.3 * cos((i / 16) * TAU), 1.9, 0.3 * sin((i / 16) * TAU)]);
export const dockPts: Vec3[] = folPts.map(p => (p[1] === 0 ? [p[0] * 0.62, 0, p[2] * 0.62] : p));

export type Rect = { x: number; y: number; w: number; h: number };
export type Fit = { cam: Camera; ox: number; oy: number };
export type View = { cam: Camera; r: Rect; ox: number; oy: number; focal: number; eye: number[]; dx: number };

// Screen layout shared by the hero, the follower and the renderer. app.ts fills it on resize.
export const layout = {
  W: 0, H: 0, dpr: 1, vh: 0, navH: 64, heroH: 600,
  mobile: false, reduced: false,
  heroFit: null as Fit | null, folFit: null as unknown as Fit, folRect: { x: 0, y: 0, w: 1, h: 1 } as Rect, ppm: 100,
};

// Distance (and screen offset) at which the points fit the viewport minus margins [top, right, bottom, left].
export const fitCam = (cam: Camera, pts: Vec3[], aspect: number, [mt, mr, mb, ml]: number[]): Fit => {
  const box = (dist: number) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) {
      const [x, y] = project(p, { ...cam, dist }, aspect, 1);
      x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y);
    }
    return [x0, x1, y0, y1];
  };
  let lo = 1, hi = 80;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2, [x0, x1, y0, y1] = box(mid);
    if (x1 - x0 <= aspect - ml - mr && y1 - y0 <= 1 - mt - mb) hi = mid; else lo = mid;
  }
  const [x0, x1, y0, y1] = box(hi);
  return { cam: { ...cam, dist: hi }, ox: (ml + aspect - mr) / 2 - (x0 + x1) / 2, oy: (mt + 1 - mb) / 2 - (y0 + y1) / 2 };
};
export const camAt = (pitch: number, target: Vec3): Camera => ({ yaw: YAW, pitch, fov: FOV, target, dist: 10 });

// A camera drawn into a screen rect, shifted by ox, oy (in rect heights) and dx (pixels).
export const makeView = (cam: Camera, r: Rect, ox: number, oy: number, dx = 0): View => {
  const cp = cos(cam.pitch), t = cam.target;
  return { cam, r, ox, oy, dx, focal: r.h / 2 / tan(FOV / 2), eye: [t[0] + cam.dist * cp * cos(cam.yaw), t[1] + cam.dist * sin(cam.pitch), t[2] + cam.dist * cp * sin(cam.yaw)] };
};
// World point to screen pixels [x, y, depth].
export const P = (v: View, p: number[]) => {
  const [x, y, z] = project(p as Vec3, v.cam, v.r.w, v.r.h);
  return [x + v.r.x + v.ox * v.r.h + v.dx, y + v.r.y + v.oy * v.r.h, z];
};
export const folView = (dx = 0) => makeView(layout.folFit.cam, layout.folRect, layout.folFit.ox, layout.folFit.oy, dx);

export const toRect = (d: DOMRect): Rect => ({ x: d.left, y: d.top, w: d.width, h: d.height });
export const grow = (r: Rect, k: number): Rect => ({ x: r.x - r.w * k, y: r.y - r.h * k, w: r.w * (1 + 2 * k), h: r.h * (1 + 2 * k) });
export const lerpRect = (a: Rect, b: Rect, k: number): Rect => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) });
