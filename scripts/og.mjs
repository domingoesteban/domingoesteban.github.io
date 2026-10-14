// Link preview image (src/assets/og.png, 1200x630): the nine robots of the hero grid, from the running dev server.
// usage: node scripts/og.mjs <url> <out.png>          e.g. node scripts/og.mjs http://127.0.0.1:4321/ src/assets/og.png
//        FRAMES=12 node scripts/og.mjs <url> <out.png>  several frames (out-00.png, ...) 650 ms apart, to pick one
//                                                       where no robot is falling
// Only the grid, without the text: the preview card already shows the page title under the image. It is cropped
// around the robots at 4x pixel density, then scaled down to 1200x630, so it stays sharp when LinkedIn or X shrink it.
// The image is imported by the page, so each new capture gets a new address and old cached previews do not stick.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node scripts/og.mjs <url> <out.png>'); process.exit(1); }
const FRAMES = +(process.env.FRAMES ?? 1), EVERY = 650, W = 1600, H = 900, DPR = 4, OUT = [1200, 630];

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
// Only the robots stay visible: no dev toolbar, nav or hero text.
await evaluate(`document.querySelector('astro-dev-toolbar')?.remove(); for (const s of ['.nav', '.hero-text']) document.querySelector(s).style.visibility = 'hidden'`);
await sleep(4000);

// In the page: finds the robots in the screenshot (pixels clearly darker than the background), takes a box of the
// output's aspect around them with a margin, and scales it down to OUT with the browser's high quality resampling.
const crop = png => evaluate(`new Promise(done => {
  const img = new Image();
  img.onload = () => {
    const a = document.createElement('canvas'), ga = a.getContext('2d', { willReadFrequently: true });
    a.width = img.width; a.height = img.height; ga.drawImage(img, 0, 0);
    const d = ga.getImageData(0, 0, a.width, a.height).data, bg = getComputedStyle(document.querySelector('.home')).backgroundColor.match(/\\d+/g).map(Number);
    let x0 = a.width, y0 = a.height, x1 = 0, y1 = 0;
    for (let y = 0; y < a.height; y += 2) for (let x = 0; x < a.width; x += 2) {
      const i = (y * a.width + x) * 4;
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 150) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const aspect = ${OUT[0]} / ${OUT[1]}, h = Math.max(y1 - y0, (x1 - x0) / aspect) * 1.18, w = h * aspect;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = ${OUT[0]}; c.height = ${OUT[1]}; g.fillStyle = 'rgb(' + bg.join(',') + ')'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(a, cx - w / 2, cy - h / 2, w, h, 0, 0, c.width, c.height);
    done(c.toDataURL('image/png').split(',')[1]);
  };
  img.src = 'data:image/png;base64,${png}';
})`);

for (let i = 0; i < FRAMES; i++) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const name = FRAMES > 1 ? out.replace(/\.png$/, `-${String(i).padStart(2, '0')}.png`) : out;
  writeFileSync(name, Buffer.from(await crop(shot.data), 'base64'));
  await sleep(EVERY);
}
proc.kill();
process.exit(0);
