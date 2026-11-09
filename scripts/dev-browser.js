// Helpers for scripted looks at the running dev server (npm run dev, port
// 5173) in headless Chrome: screenshots (scripts/shot.js) and render
// benchmarks (scripts/bench-render.js).
//
// Pages open with ?start=1&ui=0&music=0 unless the query says otherwise: no
// Begin button, no HUD or panels over the view, and no music downloads.
import puppeteer from 'puppeteer-core';
import {execFileSync} from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

export const BASE = process.env.GAME_URL || 'http://localhost:5173/';
const DEFAULT_CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ...(process.env.LOCALAPPDATA
    ? [
        path.join(
          process.env.LOCALAPPDATA,
          'Google/Chrome/Application/chrome.exe'
        ),
      ]
    : []),
  '/usr/lib/chromium/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
export const CHROME =
  process.env.CHROME_PATH ||
  DEFAULT_CHROME_PATHS.find((p) => fs.existsSync(p)) ||
  DEFAULT_CHROME_PATHS[0];

export function autoCloseOnExit(browser, onCleanup) {
  let closing = false;

  const killSync = () => {
    try {
      onCleanup?.();
    } catch {
      // Ignore errors during emergency cleanup.
    }
    try {
      const proc = browser.process();
      if (proc && proc.exitCode === null) {
        proc.kill('SIGKILL');
      }
    } catch {
      // Process may already be terminated.
    }
  };

  const handleSignal = async (signal) => {
    if (closing) {
      killSync();
      process.exit(1);
    }
    closing = true;
    try {
      try {
        onCleanup?.();
      } catch {
        // Ignore errors during emergency cleanup.
      }
      await Promise.race([
        browser.close(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      // Ignore errors during emergency cleanup.
    } finally {
      killSync();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    }
  };

  const onSigInt = () => handleSignal('SIGINT');
  const onSigTerm = () => handleSignal('SIGTERM');
  const onSigHup = () => handleSignal('SIGHUP');
  const onExit = () => killSync();

  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);
  process.on('SIGHUP', onSigHup);
  process.once('exit', onExit);

  browser.once('disconnected', () => {
    process.removeListener('SIGINT', onSigInt);
    process.removeListener('SIGTERM', onSigTerm);
    process.removeListener('SIGHUP', onSigHup);
    process.removeListener('exit', onExit);
  });
}

// WebGL backend: the Mac's GPU through Metal, software SwiftShader elsewhere
// (cloud and CI have no GPU, and containers lack user namespaces for Chrome's
// sandbox). SwiftShader on a Mac keeps 3-4 cores busy.
export const GL_ARGS =
  process.platform === 'darwin'
    ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    : [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ];

export function requireGpu(what) {
  if (process.platform !== 'darwin' && !process.env.ALLOW_SOFTWARE_GL) {
    console.error(
      `${what} needs a hardware GPU (macOS Metal). Run on a Mac, or set ALLOW_SOFTWARE_GL=1 to force software WebGL.`
    );
    process.exit(1);
  }
}

// Kill headless Chrome left running by an earlier run that was killed before
// it could close its browser (its Node parent is gone, so it now belongs to
// pid 1). Puppeteer gives every browser it launches a temporary profile
// named puppeteer_dev_chrome_profile-*, so a browser someone opened by hand,
// or one another run is still using, is never touched.
export function killOrphanedChrome() {
  if (process.platform === 'win32') return;
  let rows;
  try {
    rows = execFileSync('ps', ['-Ao', 'pid=,ppid=,command='], {
      encoding: 'utf8',
    });
  } catch {
    return;
  }
  let killed = 0;
  for (const row of rows.split('\n')) {
    const m = row.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m || m[2] !== '1' || !m[3].includes('puppeteer_dev_chrome_profile-'))
      continue;
    try {
      process.kill(Number(m[1]), 'SIGKILL');
      killed++;
    } catch {
      // Already gone.
    }
  }
  if (killed)
    console.log(`Closed ${killed} leftover headless Chrome process(es)`);
}

export async function launch(opts = {}) {
  killOrphanedChrome();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    pipe: true,
    protocolTimeout: 900000,
    args: GL_ARGS,
    ...opts,
  });
  autoCloseOnExit(browser);
  return browser;
}

// The game URL for a query string ("x=0&z=-5000&tod=0.5"), with the scripted
// defaults added unless the query sets them.
export function gameUrl(query = '') {
  const params = new URLSearchParams(query.replace(/^\?/, ''));
  for (const [k, v] of [
    ['start', '1'],
    ['ui', '0'],
    ['music', '0'],
  ]) {
    if (!params.has(k)) params.set(k, v);
  }
  return BASE + '?' + params.toString();
}

// Opens the game and waits until the terrain around the camera has loaded
// (the chunk queue is empty) plus `settleMs` for the distant terrain ring and
// shadows. Inside page.evaluate, reach the game's modules with
// `await window.gameModule('sky.js')` (see below). Page errors are collected
// in page.errors.
export async function openGame(
  browser,
  query,
  {width = 1600, height = 900, scale = 1, settleMs = 4000} = {}
) {
  const page = await browser.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') page.errors.push(m.text());
  });
  await page.setViewport({width, height, deviceScaleFactor: scale});
  // gameModule('state.js') imports the game's own instance of a module: after
  // a hot update Vite serves modules under versioned URLs (?t=...), and a
  // plain import('/state.js') would load a second, separate copy.
  await page.evaluateOnNewDocument(() => {
    window.gameModule = (name) =>
      import(
        performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .find((url) => new URL(url).pathname === '/' + name) || '/' + name
      );
  });
  await page.goto(gameUrl(query), {waitUntil: 'load', timeout: 90000});
  const started = Date.now();
  // Loading dismisses itself with start=1; give chunks up to 60 s to load.
  while (Date.now() - started < 60000) {
    const ready = await page
      .evaluate(async () => {
        const {state} = await window.gameModule('state.js');
        return !state.isPaused && state.chunkQueue.length === 0;
      })
      .catch(() => false);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, settleMs));
  return page;
}

// Minimal static file server for a production build in a temp dir (never
// docs/); resolves to the listening server (port: server.address().port).
export function serveDir(dir) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wasm': 'application/wasm',
  };
  const server = http.createServer((req, res) => {
    let file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (file.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(dir) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const type = types[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type': type});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}
