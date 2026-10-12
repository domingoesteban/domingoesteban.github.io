// Standard screenshot set of the home page (or prototype 23) for parity checks.
// usage: node shots.mjs <url> <outdir> [--quick] [--reduced]
//   desktop 1440x900: hero after 16 s, hero->section 1 mid, each section, each transition at 25/50/75%
//   then a sweep: scroll through each band in 1.6 s and capture at 60% (push, run and carry only show in motion)
//   mobile 390x844: hero, plus three scroll positions
// Also reports console errors / exceptions and horizontal overflow in <outdir>/report.txt.
// --quick shortens the hero wait (4 s) for fast iterations; --reduced emulates prefers-reduced-motion.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [url, out, ...flags] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node shots.mjs <url> <outdir> [--quick]'); process.exit(1); }
const HERO_WAIT = flags.includes('--quick') ? 4000 : 16000, SETTLE = 2500;
mkdirSync(out, { recursive: true });

const CH = process.env.CHROME ?? '/home/desteban/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const port = 9000 + (process.pid % 900);
const proc = spawn(CH, ['--headless', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${port}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 80 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(100); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));

let id = 0;
const pending = new Map(), problems = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) problems.push(`console.${m.params.type}: ${m.params.args.map(a => a.value ?? a.description).join(' ')}`);
  if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) problems.push(`log.${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
});
const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/${name}.png`, Buffer.from(r.data, 'base64')); };
const scrollTo = async y => { await evaluate(`window.scrollTo(0, ${Math.round(y)})`); await sleep(SETTLE); };
const report = [`url: ${url}`];

// Page geometry: band scroll ranges [A, B] written by the robot app, hero span and max scroll.
const geometry = () => evaluate(`(() => {
  const root = document.querySelector('.home, .s23'), [A, B] = JSON.parse(root.dataset.ab);
  const heroH = document.querySelector('.hero').offsetHeight, mobile = matchMedia('(max-width: 900px)').matches;
  const span = mobile ? Math.max(140, heroH * 0.45) : heroH * 0.7;
  const max = document.documentElement.scrollHeight - innerHeight;
  const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  return { A, B, span, max, overflow };
})()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
if (flags.includes('--reduced')) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

async function run(prefix, w, h, mobile, plan) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send('Page.navigate', { url });
  await sleep(HERO_WAIT);
  await evaluate(`document.querySelector('.proto-switcher')?.remove(); document.querySelector('astro-dev-toolbar')?.remove()`); // prototype pill, dev toolbar
  await shot(`${prefix}-00-hero`);
  const g = await geometry();
  report.push(`${prefix} ${w}x${h}: bands A=${g.A} B=${g.B} heroSpan=${Math.round(g.span)} maxScroll=${g.max} horizontalOverflow=${g.overflow}px`);
  let i = 1;
  for (const [name, y] of plan(g)) { await scrollTo(y); await shot(`${prefix}-${String(i++).padStart(2, '0')}-${name}`); }
  if (!mobile) for (let k = 0; k < g.A.length; k++) {
    await scrollTo(g.A[k] - 40);
    for (let n = 0; n <= 24; n++) { await evaluate(`window.scrollTo(0, ${Math.round(g.A[k] - 40 + (g.B[k] - g.A[k] + 80) * n / 40)})`); await sleep(40); }
    await shot(`${prefix}-${String(i++).padStart(2, '0')}-sweep${k}`);
  }
  const dbg = await evaluate(`document.querySelector('.home, .s23').dataset.dbg`);
  report.push(`${prefix} last state: ${dbg}`);
}

// Section k is parked between the end of band k-1 (or the hero collapse) and the start of band k.
const sectionY = (g, k) => { const lo = k === 0 ? g.span : g.B[k - 1], hi = k < g.A.length ? g.A[k] : g.max; return (lo + Math.min(hi, g.max)) / 2; };

await run('d', 1440, 900, false, g => {
  const steps = [['hero-mid', g.span * 0.5]];
  for (let k = 0; k <= g.A.length; k++) {
    steps.push([`s${k}`, sectionY(g, k)]);
    if (k < g.A.length) for (const p of [25, 50, 75]) steps.push([`t${k}-${p}`, g.A[k] + (g.B[k] - g.A[k]) * p / 100]);
  }
  return steps;
});
await run('m', 390, 844, true, g => [['s0', sectionY(g, 0)], ['t1-50', (g.A[1] + g.B[1]) / 2], ['s3', sectionY(g, 3)]]);

report.push(problems.length ? `problems (${problems.length}):\n  ${[...new Set(problems)].join('\n  ')}` : 'problems: none');
writeFileSync(`${out}/report.txt`, report.join('\n') + '\n');
console.log(report.join('\n'));
proc.kill();
process.exit(0);
