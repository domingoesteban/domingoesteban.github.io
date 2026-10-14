// Link preview image (public/og.png, 1200x630) from the hero of the running dev server.
// usage: node scripts/og.mjs <url> <out.png>          e.g. node scripts/og.mjs http://127.0.0.1:4321/ public/og.png
//        FRAMES=12 node scripts/og.mjs <url> <out.png>  several frames (out-00.png, ...) 650 ms apart, to pick one
//                                                       where no robot is falling
// The hero is captured at 960 px wide, so text and lines are larger than at 1200, at 2.5x pixel density, then scaled
// down to 1200x630 so they stay sharp when LinkedIn or X shrink the preview. The nav is left out.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node scripts/og.mjs <url> <out.png>'); process.exit(1); }
const FRAMES = +(process.env.FRAMES ?? 1), EVERY = 650, W = 960, H = 504, DPR = 2.5, OUT = [1200, 630];

const CH = process.env.CHROME ?? '/home/desteban/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const port = 9000 + (process.pid % 900);
const proc = spawn(CH, ['--headless', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 80 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(100); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
await send('Page.navigate', { url });
await sleep(3500);
await evaluate(`document.querySelector('astro-dev-toolbar')?.remove(); document.querySelector('.nav').style.display = 'none'; dispatchEvent(new Event('resize'))`);
await sleep(4000);

// Scales a screenshot down to OUT in the page, with the browser's high quality resampling.
const shrink = png => evaluate(`new Promise(done => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = ${OUT[0]}; c.height = ${OUT[1]}; g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    done(c.toDataURL('image/png').split(',')[1]);
  };
  img.src = 'data:image/png;base64,${png}';
})`);

for (let i = 0; i < FRAMES; i++) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const name = FRAMES > 1 ? out.replace(/\.png$/, `-${String(i).padStart(2, '0')}.png`) : out;
  writeFileSync(name, Buffer.from(await shrink(shot.data), 'base64'));
  await sleep(EVERY);
}
proc.kill();
process.exit(0);
