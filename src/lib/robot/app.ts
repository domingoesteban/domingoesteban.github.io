// DOM wiring of the robot: layout on resize, the animation loop, pointer nudges and reduced motion.
// It reads these elements inside the page root: .view (fixed canvas), .dock / .dock-fig / .dock-cap / .dock-bar i
// (mobile dock), .nav, .hero, .stage (hero grid area), main.wrap (text columns) and .band (one per transition).
import { HERO, SECTIONS, TRANSITIONS } from './story';
import { envs, heroPts, renderHero, stepEnv, stepHero } from './hero';
import { F, clocks, renderFollower, scene, track, update as updateFollower } from './follower';
import { FOL_PITCH, FOL_TARGET, FOV, YAW, P, camAt, dockPts, fitCam, folPts, folView, layout, toRect, type Rect } from './camera';
import { TASK } from './tasks';
import { readPalette } from './palette';
import { net } from './overlay';
import { clamp, ease, kick, toLocal } from './math';

const { min, max, abs, sin, cos, hypot, tan } = Math;
const NARROW = '(max-width: 900px)'; // same breakpoint as the CSS

export function startRobot(root: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia(NARROW);
  layout.reduced = reduced;
  readPalette(root);

  const canvas = root.querySelector<HTMLCanvasElement>('.view')!;
  const ctx = canvas.getContext('2d')!;
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d')!;
  const hero = root.querySelector<HTMLElement>('.hero')!;
  const stage = root.querySelector<HTMLElement>('.stage')!;
  const dock = root.querySelector<HTMLElement>('.dock')!;
  const dockFig = root.querySelector<HTMLElement>('.dock-fig')!;
  const dockCap = root.querySelector<HTMLElement>('.dock-cap')!;
  const dockBar = root.querySelector<HTMLElement>('.dock-bar i')!;
  const bands = [...root.querySelectorAll<HTMLElement>('.band')];
  const mainWrap = root.querySelector<HTMLElement>('main.wrap')!;
  const navEl = root.querySelector<HTMLElement>('.nav')!;
  if (bands.length !== TRANSITIONS.length) console.warn(`robot: ${bands.length} bands on the page, ${TRANSITIONS.length} transitions from PAGE (src/data/page.ts)`);

  // Layout: hero and follower cameras, section x positions, band heights (desktop) and band scroll ranges.
  const resize = () => {
    const L = layout, { A, B } = track;
    L.W = canvas.clientWidth; L.H = canvas.clientHeight; L.vh = innerHeight;
    L.dpr = min(2, devicePixelRatio || 1);
    for (const c of [canvas, layer]) { c.width = Math.round(L.W * L.dpr); c.height = Math.round(L.H * L.dpr); }
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    lctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    L.mobile = narrow.matches;
    L.navH = navEl.offsetHeight;
    const s = stage.getBoundingClientRect();
    L.heroFit = fitCam(camAt(0.62, [0, 0.4, 0]), heroPts, s.width / s.height, [0.03, 0.02, 0.1, 0.02]);
    let gDoc = [0, 0];
    if (L.mobile) {
      // The robot lives in the dock and walks along a straight line, 3.2 m per section.
      L.folRect = toRect(dockFig.getBoundingClientRect());
      L.folFit = fitCam(camAt(FOL_PITCH, FOL_TARGET), dockPts, L.folRect.w / L.folRect.h, [0.07, 0.04, 0.12, 0.04]);
      L.ppm = L.folRect.h / 2 / tan(FOV / 2) / L.folFit.cam.dist;
      track.X = SECTIONS.map((_, i) => i * 3.2);
      bands.forEach(b => (b.style.height = ''));
    } else {
      // The robot stands in the free column (--colgap apart), vertically centered below the nav.
      const m = mainWrap.getBoundingClientRect(), pcs = getComputedStyle(mainWrap);
      const left = m.left + parseFloat(pcs.paddingLeft), cw = m.width - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight);
      const gap = parseFloat(getComputedStyle(root).getPropertyValue('--colgap')) || 64, colW = (cw - gap) / 2;
      const size = min(450, L.vh * 0.54, colW * 0.95), cy = L.navH + (L.vh - L.navH) / 2 + 6;
      const rcx = left + colW + gap + colW / 2, lcx = left + colW / 2;
      L.folRect = { x: rcx - size / 2, y: cy - size / 2, w: size, h: size };
      L.folFit = fitCam(camAt(FOL_PITCH, FOL_TARGET), folPts, 1, [0.04, 0.05, 0.12, 0.05]);
      L.ppm = size / 2 / tan(FOV / 2) / L.folFit.cam.dist;
      track.xLeft = (lcx - rcx) / L.ppm;
      track.X = SECTIONS.map(s => (s.side === 'R' ? 0 : track.xLeft));
      // A band is as tall as the figure plus margins plus a walk, so the robot crosses it in view.
      const v = folView(), gy = P(v, [0, 0, 0])[1], top = P(v, [0, 2.08, 0])[1];
      const fig = gy + 12 - (top - 4), M = 26, walk = clamp(L.vh * 0.42, 320, 470);
      bands.forEach(b => (b.style.height = `${Math.round(fig + 2 * M + walk)}px`));
      gDoc = [top - 4 - M, gy + 12 + M];
    }
    bands.forEach((b, k) => {
      const r = b.getBoundingClientRect(), top = r.top + scrollY, bot = r.bottom + scrollY;
      if (L.mobile) { A[k] = top - L.vh * 0.72; B[k] = bot - L.vh * 0.3; }
      else { A[k] = top - gDoc[0]; B[k] = bot - gDoc[1]; }
    });
    L.heroH = hero.offsetHeight;
    root.dataset.ab = JSON.stringify([A.map(Math.round), B.map(Math.round)]); // read by the screenshot script
  };

  // c: hero collapse, 0 on the hero grid and 1 once the selected tile has become the follower.
  let time = 0, c = 0;
  const update = (dt: number) => {
    time += dt;
    const heroSpan = layout.mobile ? max(140, layout.heroH * 0.45) : layout.heroH * 0.7;
    c = clamp(scrollY / heroSpan);
    if (reduced) c = c > 0.5 ? 1 : 0;
    if (c < 1) stepHero(dt, c, time);
    updateFollower(dt, time, c);
    root.dataset.dbg = `g=${F.g.toFixed(3)} v=${F.v.toFixed(2)} run=${F.run.toFixed(2)} task=${F.task} w=${F.wTask.toFixed(2)} clk=${clocks[F.task].toFixed(2)} th=${F.theta.toFixed(2)} cap=${scene.cap} net=${net.a.flat().map(a => a.toFixed(2)).join(",")} obs=${net.obs.map(a => a.toFixed(2)).join(",")}`;
  };

  let figRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  const render = () => {
    if (!layout.heroFit) return;
    ctx.clearRect(0, 0, layout.W, layout.H);
    const progress = clamp(scrollY / max(1, document.documentElement.scrollHeight - innerHeight));
    dockBar.style.transform = `scaleX(${progress.toFixed(4)})`;
    dock.style.setProperty('--c', String(clamp(c * 1.5)));
    if (c < 1) figRect = renderHero(ctx, lctx, c, reduced ? c : ease(c), toRect(stage.getBoundingClientRect()));
    else {
      figRect = renderFollower(ctx, layout.mobile ? dock.getBoundingClientRect() : null);
      if (layout.mobile && dockCap.textContent !== scene.cap) dockCap.textContent = scene.cap;
    }
  };

  // Pointer: moving across a robot nudges it; the follower or the nearest hero tile reacts.
  let lastPt: [number, number] | null = null;
  const inside = (x: number, y: number, r: Rect) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  addEventListener('pointermove', ev => {
    const pt: [number, number] = [ev.clientX, ev.clientY];
    if (lastPt && inside(pt[0], pt[1], figRect) && !reduced) {
      const dx = ((pt[0] - lastPt[0]) * 1.2) / max(80, figRect.h), rx = sin(YAW), rz = -cos(YAW);
      if (abs(dx) > 0.002) {
        if (c >= 1) kick(F.sp, rx * dx * 6, rz * dx * 6);
        else {
          let best = envs[0], bd = 1e9;
          for (const e of envs) { const d = hypot(e.sx - pt[0], e.sy - pt[1]); if (d < bd) { bd = d; best = e; } }
          if (best.i !== HERO.selected) { const l = toLocal(rx * dx * 6, rz * dx * 6, best.yaw); kick(best.sp, l[0], l[2]); }
        }
      }
    }
    lastPt = pt;
  }, { passive: true });

  let last = 0, running = false, raf = 0;
  const loop = (now: number) => {
    const dt = last ? min(0.05, (now - last) / 1000) : 0;
    last = now;
    update(dt);
    render();
    raf = requestAnimationFrame(loop);
  };
  const start = () => { if (!running && !document.hidden) { running = true; last = 0; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  const still = () => { update(0); render(); };

  resize();
  for (const e of envs) { e.p = reduced ? 1 : 0; stepEnv(e, 0, 0, 0); }
  addEventListener('resize', () => { resize(); if (reduced) still(); });
  narrow.addEventListener('change', () => { resize(); if (reduced) still(); });
  document.fonts?.ready.then(() => { resize(); if (reduced) still(); });
  if (reduced) {
    // Every tile frozen at a converged mid-task pose; the page redraws on scroll only.
    for (const e of envs) { e.clock = TASK[e.task].D * 0.4; stepEnv(e, 0, 0, 0); }
    still();
    addEventListener('scroll', still, { passive: true });
  } else {
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    start();
  }
}
