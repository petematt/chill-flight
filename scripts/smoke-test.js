// Browser smoke test: loads the game and debug pages in headless Chrome,
// starts a flight, and fails if any JS errors or failed requests occur.
// Usage:
//   npm run test:browser  - against the dev server (`npm run dev` on port 5173)
//   npm run test:build    - builds to a temp dir (not docs/) and tests that
import puppeteer from 'puppeteer-core';
import {
  CHROME,
  GL_ARGS,
  autoCloseOnExit,
  killOrphanedChrome,
  serveDir,
} from './dev-browser.js';
import {execSync} from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {ChillFlightLogic} from '../chill-flight-logic.js';

const BUILD_MODE = process.argv.includes('--build');
let BASE = process.env.SMOKE_URL || 'http://localhost:5173/';
let staticServer = null;
let outDir = null;

if (BUILD_MODE) {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chill-flight-build-'));
  console.log(`Building to ${outDir} ...`);
  execSync(`npx vite build --outDir "${outDir}" --emptyOutDir`, {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  staticServer = await serveDir(outDir);
  BASE = `http://localhost:${staticServer.address().port}/`;
}
const FLIGHT_MS = 8000;
const DEBUG_PAGE_MS = 3000;

// The game gets a full flight; debug pages only need to load cleanly.
const PAGES = [
  {path: '', fly: true},
  // Debug pages are dev-only (not in the production build).
  {path: 'debug/debug-models.html', devOnly: true},
  {path: 'debug/debug-faces.html', devOnly: true},
  {path: 'debug/debug-person.html', devOnly: true},
  {path: 'debug/debug-export-map.html', devOnly: true},
  {path: 'debug/debug-sound.html', devOnly: true},
  // Every third-party host drops every packet (e.g. a subway): the game must
  // still paint and start, and music must fall back to the bundled track
  // (issue #73).
  {path: '?seed=1', blackhole: true},
];

// The bundled fallback music track.
const BUNDLED_TRACK = 'assets/purrple-cat-birds-of-a-feather.mp3';

const origin = new URL(BASE).origin;
const errors = [];

// Retry briefly: Vite restarts the dev server whenever vite.config.js changes.
for (let attempt = 1; ; attempt++) {
  try {
    await fetch(BASE);
    break;
  } catch {
    if (attempt === 10) {
      console.error(
        `Dev server not reachable at ${BASE}. Run \`npm run dev\`.`
      );
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const failPage = (tag, msg) => errors.push(`[${tag}] ${msg}`);

// The world seed defaults to today's date; pin it so every run sees the same
// world (pages that set their own seed keep it).
const TEST_SEED = '20260101';

async function checkPage(browser, {path, fly, blackhole}) {
  const pageUrl = new URL(path, BASE);
  if (!pageUrl.searchParams.has('seed')) {
    pageUrl.searchParams.set('seed', TEST_SEED);
  }
  const url = pageUrl.href;
  const tag = blackhole ? 'black-hole network' : path || 'index.html';
  const page = await browser.newPage();
  let closing = false;
  const closePage = async () => {
    closing = true;
    await page.close();
  };
  // Smallish viewport (software WebGL is slow on a busy machine), but wider
  // than 1024px so the game uses its desktop layout.
  await page.setViewport({width: 1100, height: 700});

  // Keep test runs out of analytics and the music host; only first-party
  // requests matter here. The music host is blocked so the test doesn't
  // depend on reaching it: audio.js starts loading a remote track on any page
  // that imports it, and a failed load would count as a console error.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (
      !u.startsWith(origin) &&
      (/google-analytics|analytics\.google|googletagmanager|firebaseinstallations|firebaselogging/.test(
        u
      ) ||
        (!blackhole && /r2\.dev/.test(u)))
    ) {
      req.abort('blockedbyclient').catch(() => {});
    } else if (blackhole && !u.startsWith(origin)) {
      // Never answer: the request hangs like on a packet-dropping network.
    } else {
      req.continue().catch(() => {});
    }
  });

  page.on('pageerror', (err) =>
    errors.push(`[${tag}] pageerror: ${err.message}`)
  );
  page.on('console', (msg) => {
    // Ignore the noise from our own analytics blocking above.
    if (
      msg.type() === 'error' &&
      !msg.text().includes('ERR_BLOCKED_BY_CLIENT')
    ) {
      errors.push(`[${tag}] console.error: ${msg.text()}`);
    }
  });
  page.on('requestfailed', (req) => {
    if (!closing && req.url().startsWith(origin)) {
      errors.push(
        `[${tag}] requestfailed: ${req.url()} (${req.failure()?.errorText})`
      );
    }
  });
  page.on('workercreated', (worker) => {
    worker.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`[${tag}] worker error: ${msg.text()}`);
      }
    });
  });

  // Count worker replies, so a silent fallback to main-thread terrain
  // generation (workers crashing on load) fails the test.
  await page.evaluateOnNewDocument(() => {
    window.__smokeWorkerMessages = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', () => window.__smokeWorkerMessages++);
      }
    };
  });

  if (blackhole) {
    // A returning player (first-time players always get the bundled track),
    // with music on, on a network that claims to be online. ?seed=1 starts on
    // a streamed track.
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'onLine', {get: () => true});
      localStorage.setItem('chill_flight_played_before', 'true');
      localStorage.setItem('chill_flight_music_enabled', 'true');
    });
  }
  const bundledRequested = new Promise((resolve) => {
    page.on('request', (req) => {
      if (req.url().includes(BUNDLED_TRACK)) resolve(true);
    });
  });

  console.log(`Loading ${url} ...`);
  if (blackhole) {
    // 'load' may never fire while third-party requests hang; don't wait for it.
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
  } else {
    await page.goto(url, {waitUntil: 'load', timeout: 30000});
  }

  if (blackhole) {
    // Generous deadlines: a busy machine can be slow, but a real black
    // screen never paints at all.
    await page.waitForSelector('#begin-btn', {visible: true, timeout: 60000});
    // A screenshot needs a painted frame; if a render-blocking third-party
    // resource hangs, the page never paints (a black screen).
    const painted = await Promise.race([
      page
        .screenshot()
        .then(() => true)
        .catch(() => false),
      new Promise((r) => setTimeout(() => r(false), 30000)),
    ]);
    if (!painted) failPage(tag, 'page never painted (black screen)');
    await page.click('#begin-btn');
    const fellBack = await Promise.race([
      bundledRequested,
      new Promise((r) => setTimeout(() => r(false), 25000)),
    ]);
    if (!fellBack) failPage(tag, 'music never fell back to the bundled track');
    const musicSetting = await page.evaluate(() =>
      localStorage.getItem('chill_flight_music_enabled')
    );
    if (musicSetting === 'false') {
      failPage(tag, 'falling back turned the music setting off');
    }
    await closePage();
    console.log(
      `  black-hole network: painted ${painted ? 'ok' : 'NO'}, music ${fellBack ? 'fell back ok' : 'did NOT fall back'}`
    );
    return;
  }

  if (!fly) {
    await new Promise((r) => setTimeout(r, DEBUG_PAGE_MS));
    if (path === 'debug/debug-models.html') {
      const check = await page.evaluate(() => ({
        canvases: document.querySelectorAll('canvas').length,
        sidebarW: document.getElementById('sidebar')?.offsetWidth || 0,
        viewerW: document.getElementById('viewer')?.offsetWidth || 0,
        hasModel: !!window.currentModel,
      }));
      if (
        check.canvases !== 1 ||
        check.sidebarW < 250 ||
        check.viewerW < 600 ||
        !check.hasModel
      ) {
        failPage(
          tag,
          `unexpected model viewer layout: ${JSON.stringify(check)}`
        );
      }
    }
    await closePage();
    return;
  }

  // Press START so the game loop, physics, and terrain generation all run.
  try {
    await page.waitForSelector('#begin-btn', {visible: true, timeout: 30000});
    await page.click('#begin-btn');
  } catch (err) {
    errors.push(`[${tag}] could not press START: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, FLIGHT_MS));

  const state = await page.evaluate(() => ({
    workerMessages: window.__smokeWorkerMessages,
    canvas: !!document.querySelector('canvas'),
    paused:
      getComputedStyle(document.getElementById('pause-overlay')).display !==
      'none',
  }));
  if (!state.canvas) {
    errors.push(`[${tag}] no <canvas> found: renderer never started`);
  }
  if (state.paused) errors.push(`[${tag}] still paused after pressing START`);
  if (!state.workerMessages) {
    errors.push(`[${tag}] terrain workers never replied`);
  }
  console.log(`  terrain worker replies: ${state.workerMessages}`);
  await exerciseControls(page, tag);
  await closePage();
}

// Drive the game through the keyboard and check its effects through the DOM
// (HUD and debug panel), so this keeps working however the code is organized.
async function exerciseControls(page, tag) {
  const errorsBefore = errors.length;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fail = (msg) => errors.push(`[${tag}] ${msg}`);
  const readDebug = () =>
    page.evaluate(() => {
      const posText =
        document.getElementById('debug-position')?.textContent || '';
      const m = posText.match(/(-?\d+),\s*(-?\d+),\s*(-?\d+)/);
      const x = m ? parseFloat(m[1]) : 0;
      const y = m ? parseFloat(m[2]) : 0;
      const z = m ? parseFloat(m[3]) : 0;

      const vehText =
        document.getElementById('debug-vehicle')?.textContent || '';
      const vm = vehText.match(/·\s*(\d+)/);
      const target = vm ? parseFloat(vm[1]) : 0;

      const camText =
        document.getElementById('debug-camera')?.textContent || '';
      const cm = camText.match(/@\s*(-?\d+)°/);
      const heading = cm ? parseFloat(cm[1]) : 0;
      const camMode = camText.split('·')[0]?.trim() || '';

      return {x, y, z, target, heading, camMode};
    });
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await wait(ms);
    await page.keyboard.up(key);
  };
  const shifted = async (key) => {
    await page.keyboard.down('Shift');
    await page.keyboard.press(key);
    await page.keyboard.up('Shift');
  };
  const isPaused = () => isVisible('#pause-overlay');
  const isVisible = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      const cs = getComputedStyle(el);
      return (
        cs.display !== 'none' &&
        cs.visibility !== 'hidden' &&
        !el.classList.contains('hidden') &&
        el.getClientRects().length > 0
      );
    }, sel);
  const clickAndCheck = async (sel, target, expectVisible, what) => {
    await page.click(sel).catch((err) => fail(`${what}: ${err.message}`));
    await wait(800);
    if ((await isVisible(target)) !== expectVisible) fail(`${what} failed`);
  };

  // Headless frame rates vary, so poll the debug readouts for a few seconds
  // instead of reading them once after a fixed delay.
  const readUntil = async (check, timeoutMs = 4000) => {
    const end = Date.now() + timeoutMs;
    let s = await readDebug();
    while (!check(s) && Date.now() < end) {
      await wait(250);
      s = await readDebug();
    }
    return s;
  };

  // Debug panel (Shift+D) exposes live flight values in the DOM.
  await shifted('D');
  await wait(500);
  const a = await readDebug();
  const b = await readUntil((s) => Math.hypot(s.x - a.x, s.z - a.z) > 1);
  if (!(Math.hypot(b.x - a.x, b.z - a.z) > 1)) {
    fail(`plane is not moving (${JSON.stringify(a)} -> ${JSON.stringify(b)})`);
  }

  // Controls are ignored during the intro camera transition, which can run
  // long on a busy machine, so give input a few attempts before failing.
  let c = b;
  for (let i = 0; i < 3 && !(c.target > b.target); i++) {
    await page.keyboard.down('Shift'); // Shift+Up: throttle up
    await hold('ArrowUp', 1000);
    await page.keyboard.up('Shift');
    c = await readUntil((s) => s.target > b.target, 2000);
  }
  if (!(c.target > b.target)) {
    fail(`throttle up did not raise target speed (${b.target} -> ${c.target})`);
  }

  let d = c;
  for (let i = 0; i < 3 && d.heading === c.heading; i++) {
    await page.keyboard.down('ArrowLeft'); // bank left
    d = await readUntil((s) => s.heading !== c.heading, 3000);
    await page.keyboard.up('ArrowLeft');
  }
  if (d.heading === c.heading) fail(`steering did not change heading`);

  const cameraMoved = (s) => s.camMode !== d.camMode;
  await page.keyboard.press('c'); // camera mode
  const e = await readUntil(cameraMoved, 5000);
  if (!cameraMoved(e)) {
    fail(`camera toggle did not move the camera relative to the plane`);
  }

  // Toggles without a simple DOM readout: these just need to not throw.
  for (const key of ['g', 'v', 'l']) {
    await page.keyboard.press(key);
    await wait(700);
  }
  await shifted('S'); // shooting star
  await shifted('U'); // rainbow
  await wait(1500);

  const minimapBefore = await isVisible('#minimap-container');
  await shifted('M');
  await wait(800);
  if ((await isVisible('#minimap-container')) === minimapBefore) {
    fail('Shift+M did not toggle the minimap');
  }

  // M opens the full map mid-flight (pausing), and closes it back to flight
  await page.keyboard.press('m');
  await wait(800);
  if (!(await isVisible('#fullscreen-map-overlay'))) {
    fail('m did not open the fullscreen map');
  }
  if (!(await isPaused())) fail('the map opened mid-flight did not pause');
  await page.keyboard.press('m');
  await wait(800);
  if (await isVisible('#fullscreen-map-overlay')) {
    fail('m did not close the fullscreen map');
  }
  if (await isPaused()) fail('closing the map did not return to flight');

  // A tap a few pixels from an airport's pin picks the airport: the panel
  // names it and who's there
  const vp = page.viewport() || {width: 1280, height: 720};
  await page.keyboard.press('m');
  await wait(800);
  const meadow = ChillFlightLogic.AIRPORTS.find(
    (a) => a.name === 'Meadow Field'
  );
  const view = await page.evaluate(() => {
    const q = new URLSearchParams(location.search);
    const coord = (v) => (parseFloat(v) || 0) * (/[SW]$/.test(v) ? -1 : 1);
    return {
      x: coord(q.get('mapLon') || '0') * 5000,
      z: -coord(q.get('mapLat') || '0') * 5000,
      radius: 7500 / parseFloat(q.get('mapZoom') || '1'),
    };
  });
  const unitsPerPixel = (view.radius * 2) / Math.min(vp.width, vp.height);
  await page.mouse.click(
    vp.width / 2 + (meadow.x - view.x) / unitsPerPixel + 6,
    vp.height / 2 + (meadow.z - view.z) / unitsPerPixel + 4
  );
  await wait(300);
  const picked = await page.evaluate(() => ({
    name: document.getElementById('fullscreen-map-warp-name')?.textContent,
    people: document.getElementById('fullscreen-map-warp-people')?.textContent,
  }));
  if (picked.name !== 'Meadow Field') {
    fail(`a tap by Meadow Field picked "${picked.name}"`);
  }
  if (!/ here$/.test(picked.people || '')) {
    fail(`Meadow Field's panel didn't say who's there ("${picked.people}")`);
  }
  // Warping there arrives on final approach: lined up with Meadow's runway
  // (which runs east), slowed to 61 knots (90 units/s)
  await page
    .click('#fullscreen-map-warp-btn')
    .catch((err) => fail(`warp to Meadow Field: ${err.message}`));
  // The readout only updates on a frame, and arriving in a new part of the
  // world builds its terrain, which can stall frames for a few seconds on a
  // busy machine, so allow a generous deadline
  let readout = {};
  for (let i = 0; i < 48; i++) {
    await wait(250);
    readout = await page.evaluate(() => ({
      heading: document.getElementById('cockpit-dir')?.textContent,
      speed: document.getElementById('cockpit-spd')?.textContent,
    }));
    if (readout.heading === 'E' && readout.speed === '61 KTS') break;
  }
  if (readout.heading !== 'E' || readout.speed !== '61 KTS') {
    fail(
      `warping to Meadow Field didn't line up for landing (${readout.heading}, ${readout.speed})`
    );
  }

  // Pick a spot on the map and set it as the waypoint: back to flight, with
  // the marker showing the way; then clear it from the map
  await page.keyboard.press('m');
  await wait(800);
  await page.mouse.click(vp.width / 2 + 200, vp.height / 2 - 120);
  await wait(300);
  await page
    .click('#fullscreen-map-waypoint-btn')
    .catch((err) => fail(`set waypoint: ${err.message}`));
  await wait(800);
  if (await isVisible('#fullscreen-map-overlay')) {
    fail('Set waypoint did not close the map');
  }
  if (await isPaused()) fail('Set waypoint did not return to flight');
  // The marker updates on the next frame, which can be slow under software
  // WebGL, so give it a few seconds
  const markerIs = async (shown) => {
    for (let i = 0; i < 12; i++) {
      if ((await isVisible('#waypoint-indicator')) === shown) return true;
      await wait(250);
    }
    return false;
  };
  if (!(await markerIs(true))) fail('the waypoint marker did not appear');
  await page.keyboard.press('m');
  await wait(800);
  await page
    .click('#fullscreen-map-waypoint-btn')
    .catch((err) => fail(`clear waypoint: ${err.message}`));
  await wait(300);
  if (await isVisible('#fullscreen-map-warp')) {
    fail('Clear waypoint left its panel on the map');
  }
  await page.keyboard.press('m');
  await wait(800);
  if (!(await markerIs(false))) {
    fail('Clear waypoint did not remove the marker');
  }

  await page.keyboard.press('Escape');
  await wait(500);
  if (!(await isPaused())) fail('Escape did not pause the game');
  if (!(await isVisible('#plane-stats'))) {
    fail('plane stats should be visible for airplane');
  }
  await page.click('.scheme-btn[data-plane="buggy"]');
  await wait(200);
  if (!(await isVisible('#plane-stats'))) {
    fail('vehicle stats should be visible for buggy');
  }
  const buggyStats = await page.evaluate(() => {
    const el = document.getElementById('plane-stats');
    return {
      speed: el
        ?.querySelector('[data-stat="speed"]')
        ?.style.getPropertyValue('--v'),
      agility: el
        ?.querySelector('[data-stat="agility"]')
        ?.style.getPropertyValue('--v'),
      float: el
        ?.querySelector('[data-stat="float"]')
        ?.style.getPropertyValue('--v'),
      unit: document.getElementById('throttle-unit')?.textContent,
    };
  });
  if (
    buggyStats.speed !== '0.273' ||
    buggyStats.float !== '0.500' ||
    buggyStats.unit !== 'KM/H'
  ) {
    fail(`buggy stats mismatch: ${JSON.stringify(buggyStats)}`);
  }
  await page.click('.scheme-btn[data-plane="biplane"]');
  await wait(200);
  const biplaneStats = await page.evaluate(() => {
    const el = document.getElementById('plane-stats');
    return {
      speed: el
        ?.querySelector('[data-stat="speed"]')
        ?.style.getPropertyValue('--v'),
      agility: el
        ?.querySelector('[data-stat="agility"]')
        ?.style.getPropertyValue('--v'),
      float: el
        ?.querySelector('[data-stat="float"]')
        ?.style.getPropertyValue('--v'),
      unit: document.getElementById('throttle-unit')?.textContent,
    };
  });
  if (
    biplaneStats.speed !== '0.255' ||
    biplaneStats.float !== '1.000' ||
    biplaneStats.unit !== 'KTS'
  ) {
    fail(`biplane stats mismatch: ${JSON.stringify(biplaneStats)}`);
  }
  await clickAndCheck(
    '#achievements-btn',
    '#achievements-overlay',
    true,
    'open achievements'
  );
  await clickAndCheck(
    '#achievements-close-btn',
    '#achievements-overlay',
    false,
    'close achievements'
  );
  await clickAndCheck('#people-btn', '#people-overlay', true, 'open people');
  await clickAndCheck(
    '#people-close-btn',
    '#people-overlay',
    false,
    'close people'
  );
  await page
    .click('#resume-btn')
    .catch((err) => fail(`resume: ${err.message}`));
  await wait(800);
  if (await isPaused()) fail('resume button did not unpause the game');

  // The quick menu opens the map (pausing), and its Resume goes back to flying
  await page
    .click('#mobile-menu-trigger')
    .catch((err) => fail(`quick menu: ${err.message}`));
  await wait(500);
  await clickAndCheck(
    '#mobile-map-btn',
    '#fullscreen-map-overlay',
    true,
    'open map from the quick menu'
  );
  if (!(await isPaused())) fail('the map did not pause the game');
  await clickAndCheck(
    '#fullscreen-map-resume-btn',
    '#fullscreen-map-overlay',
    false,
    'resume from the map'
  );
  if (await isPaused()) fail("the map's Resume did not unpause the game");
  if (errors.length === errorsBefore) {
    console.log(
      '  controls: move, throttle, steer, camera, toggles, minimap, pause menu ok'
    );
  }
}

killOrphanedChrome();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  pipe: true,
  args: [
    ...GL_ARGS,
    // Let music start without a real user gesture.
    '--autoplay-policy=no-user-gesture-required',
  ],
  // Fail instead of hanging if a page stops responding (e.g. a stuck loop).
  protocolTimeout: 60000,
});
autoCloseOnExit(browser, () => {
  staticServer?.close();
  if (outDir) fs.rmSync(outDir, {recursive: true, force: true});
});

const PAGE_TIMEOUT_MS = 120000;
try {
  for (const p of PAGES) {
    if (BUILD_MODE && p.devOnly) continue;
    let timer;
    await Promise.race([
      checkPage(browser, p),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${PAGE_TIMEOUT_MS}ms`)),
          PAGE_TIMEOUT_MS
        );
      }),
    ])
      .catch((err) => errors.push(`[${p.path || 'index.html'}] ${err.message}`))
      .finally(() => clearTimeout(timer));
  }
} finally {
  await browser.close();
  staticServer?.close();
  if (outDir) fs.rmSync(outDir, {recursive: true, force: true});
}

if (errors.length) {
  console.error(`\nSmoke test FAILED with ${errors.length} error(s):`);
  for (const e of [...new Set(errors)]) console.error(`  ${e}`);
  process.exit(1);
}
console.log('Smoke test passed: no JS errors.');
