#!/usr/bin/env node
/**
 * scripts/check-i18n.js
 *
 * Every piece of on-screen English has a translation in each language's
 * table (locales/), and each table has nothing left over that the game no
 * longer says. The English comes from:
 * - t('...') calls in the game's modules (i18n.js)
 * - index.html's text and title/aria-label/placeholder attributes (outside
 *   the debug menu), which i18n.js translates at load
 * - people.js (names, airports, cargo and every line), achievements.js
 *   (titles and hints) and landmarks.js (place names), whose English is
 *   translated where it's shown
 * A translation must keep the English's {placeholders}.
 *
 * `node scripts/check-i18n.js --missing` prints the missing keys as a
 * table to paste into a locale and fill in.
 */

import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import * as espree from 'espree';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const read = (f) => fs.readFileSync(path.join(rootDir, f), 'utf8');

console.log('Checking translations...');

const keys = new Map(); // English → where it's from
const add = (text, from) => {
  if (typeof text !== 'string' || !/[A-Za-z]/.test(text)) {
    if (text !== ', ') return; // (joinList's)
  }
  if (!keys.has(text)) keys.set(text, from);
};

// --- t('...') in the modules ---
function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => walk(c, visit));
    else if (child && typeof child.type === 'string') walk(child, visit);
  }
}
const hidden = []; // English inside a t() argument that isn't just text
const modules = fs
  .readdirSync(rootDir)
  .filter((f) => f.endsWith('.js') && !f.startsWith('eslint'));
for (const f of modules) {
  const src = read(f);
  if (!src.includes('i18n.js') && f !== 'i18n.js') continue;
  const ast = espree.parse(src, {ecmaVersion: 'latest', sourceType: 'module'});
  walk(ast, (n) => {
    if (n.type !== 'CallExpression' || n.callee.name !== 't') return;
    const arg = n.arguments[0];
    if (arg?.type === 'Literal') add(arg.value, f);
    else if (arg?.type === 'TemplateLiteral' && !arg.expressions.length) {
      add(arg.quasis[0].value.cooked, f);
    } else {
      // t(x || 'Empty') hides 'Empty' from this check: x ? t(x) : t('Empty')
      walk(arg, (inner) => {
        if (inner.type === 'Literal' && /[A-Za-z]/.test(inner.value)) {
          hidden.push(`  ${f}: ${JSON.stringify(inner.value)}`);
        }
      });
    }
  });
}

// --- index.html ---
function htmlKeys(html) {
  html = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<head>[\s\S]*?<\/head>/, '');
  // Whole elements marked data-no-translate (the debug panels, the
  // splash's title, language names): from the opening tag to its match
  for (;;) {
    const open = html.match(/<(\w+)\b[^>]*\sdata-no-translate[^>]*>/);
    if (!open) break;
    const tag = new RegExp(`<(/?)${open[1]}\\b[^>]*>`, 'g');
    tag.lastIndex = open.index;
    let depth = 0;
    let m;
    while ((m = tag.exec(html))) {
      depth += m[1] ? -1 : 1;
      if (!depth) break;
    }
    html = html.slice(0, open.index) + html.slice(tag.lastIndex);
  }
  const decode = (s) =>
    s
      .replace(/&bull;/g, '•')
      .replace(/&nbsp;/g, ' ')
      .replace(/&deg;/g, '°')
      .replace(/&amp;/g, '&');
  const out = [];
  for (const part of html.split(/(<[^>]+>)/)) {
    if (part.startsWith('<')) {
      for (const [, , value] of part.matchAll(
        /\s(title|aria-label|placeholder)="([^"]*)"/g
      )) {
        out.push(decode(value));
      }
    } else {
      const text = decode(part).replace(/\s+/g, ' ').trim();
      if (text) out.push(text);
    }
  }
  return out;
}
for (const text of htmlKeys(read('index.html'))) add(text, 'index.html');

// --- Data translated where it's shown ---
const {PEOPLE} = await import(
  pathToFileURL(path.join(rootDir, 'people.js')).href
);
const lines = (field) => (field || []).flat(2);
for (const p of PEOPLE) {
  add(p.name, 'people.js');
  add(p.airport, 'people.js');
  for (const what of ['intro', 'hello', 'accept', 'decline']) {
    lines(p[what]).forEach((l) => add(l, 'people.js'));
  }
  for (const j of p.jobs) {
    add(j.cargo, 'people.js');
    j.to.forEach((a) => add(a, 'people.js'));
    lines(j.offer).forEach((l) => add(l, 'people.js'));
    lines(j.thanks).forEach((l) => add(l, 'people.js'));
  }
}
// achievements.js and landmarks.js need a browser; their tables are read
// from the source instead
const achievements = read('achievements.js');
for (const m of achievements.matchAll(
  /\b(?:title|hint):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g
)) {
  add((m[1] ?? m[2]).replace(/\\(.)/g, '$1'), 'achievements.js');
}
for (const [, name] of read('landmarks.js').matchAll(/name: '([^']+)'/g)) {
  add(name, 'landmarks.js');
}
for (const [, name] of read('chill-flight-logic.js').matchAll(
  /name: '([A-Z][a-z]+ Field)'/g
)) {
  add(name, 'chill-flight-logic.js');
}
// Said through a constant
add(
  'If something comes up, just clear the waypoint on the map.',
  'jobs-logic.js'
);

// Not words: brand names and symbols, the same in every language
const SAME = new Set([
  'Chill Flight',
  'Chill-Flight',
  'Purrple Cat',
  'VR',
  'MAX',
  'KTS',
  '150',
  'AUTO',
  'Chill Flight •',
  // index.html's stand-ins until the HUD fills them
  '0.0° N, 0.0° E',
  '0°N 0°E',
  'N',
  '200 M',
  '150 KTS',
]);

if (hidden.length) {
  console.error(
    '❌ Text inside a t() argument (pass each text to its own t()):'
  );
  console.error(hidden.join('\n'));
}

// --- Each table ---
const placeholders = (s) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
let problems = hidden.length;
const missingOut = [];
for (const file of fs.readdirSync(path.join(rootDir, 'locales'))) {
  const {default: table} = await import(
    pathToFileURL(path.join(rootDir, 'locales', file)).href
  );
  const missing = [];
  for (const [text, from] of keys) {
    if (SAME.has(text)) continue;
    if (!(text in table)) missing.push(`  ${from}: ${JSON.stringify(text)}`);
    else if (placeholders(text).join() !== placeholders(table[text]).join()) {
      console.error(
        `❌ ${file}: ${JSON.stringify(text)} has different {placeholders}`
      );
      problems++;
    }
  }
  const unused = Object.keys(table).filter((k) => !keys.has(k));
  if (missing.length) {
    console.error(`❌ ${file}: ${missing.length} without a translation:`);
    console.error(missing.join('\n'));
    problems += missing.length;
    missingOut.push(...missing);
  }
  if (unused.length) {
    console.error(`❌ ${file}: ${unused.length} the game no longer says:`);
    console.error(unused.map((k) => `  ${JSON.stringify(k)}`).join('\n'));
    problems += unused.length;
  }
}

// English (US)'s table in i18n.js (only the strings naming metric units):
// each key must still be on screen and keep its {placeholders}
const i18nAst = espree.parse(read('i18n.js'), {
  ecmaVersion: 'latest',
  sourceType: 'module',
});
let enUs = null;
walk(i18nAst, (n) => {
  if (n.type === 'VariableDeclarator' && n.id.name === 'EN_US_TABLE') {
    enUs = n.init;
  }
});
if (!enUs?.properties?.length) {
  console.error("❌ i18n.js: couldn't find EN_US_TABLE");
  problems++;
}
for (const prop of enUs?.properties || []) {
  const text = prop.key.value ?? prop.key.name;
  const value = prop.value.value;
  if (!keys.has(text)) {
    console.error(
      `❌ i18n.js EN_US_TABLE: the game no longer says ${JSON.stringify(text)}`
    );
    problems++;
  } else if (placeholders(text).join() !== placeholders(value).join()) {
    console.error(
      `❌ i18n.js EN_US_TABLE: ${JSON.stringify(text)} has different {placeholders}`
    );
    problems++;
  }
}

if (process.argv.includes('--missing')) {
  for (const [text] of keys) {
    if (missingOut.some((l) => l.endsWith(JSON.stringify(text)))) {
      console.log(`  ${JSON.stringify(text)}: '',`);
    }
  }
}

if (problems) process.exit(1);
console.log(`✅ ${keys.size} strings translated in every language`);
