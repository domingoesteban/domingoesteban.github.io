// Small math helpers shared by the robot modules.
import type { Vec3 } from './rig';

const { min, max, exp, hypot, sin, cos, PI } = Math;
export const TAU = PI * 2;

export const clamp = (x: number, a = 0, b = 1) => min(b, max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const smooth = (a: number, b: number, x: number) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
export const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
export const mod = (a: number, n: number) => ((a % n) + n) % n;
export const wrapA = (a: number) => mod(a + PI, TAU) - PI;
// Exponential approach of x toward `to`, frame-rate independent.
export const follow = (x: number, to: number, rate: number, dt: number) => x + (to - x) * (1 - exp(-rate * dt));

// Seeded random numbers, so every page load plays the same learning story.
let seed = 23;
export const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const addv = (a: number[], b: number[], s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const nrm = (a: number[]) => { const l = hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const crs = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Damped spring on the ground plane: pointer nudges kick it, the figure leans by its offset.
export type Spring = { x: number; z: number; vx: number; vz: number };
export const stepSpring = (s: Spring, dt: number, k = 40, c = 9) => { s.vx += (-k * s.x - c * s.vx) * dt; s.vz += (-k * s.z - c * s.vz) * dt; s.x += s.vx * dt; s.z += s.vz * dt; };
export const kick = (s: Spring, dx: number, dz: number) => { s.vx += dx; s.vz += dz; const m = hypot(s.vx, s.vz); if (m > 2.4) { s.vx *= 2.4 / m; s.vz *= 2.4 / m; } };
export const toLocal = (x: number, z: number, yaw: number): Vec3 => [x * cos(yaw) - z * sin(yaw), 0, x * sin(yaw) + z * cos(yaw)];
