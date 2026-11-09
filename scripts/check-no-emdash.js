#!/usr/bin/env node
/**
 * scripts/check-no-emdash.js
 *
 * Scans the repository for em dashes (\u2014) and &mdash;.
 * Enforces the rule that em dashes should never be used in any writing.
 */

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const IGNORED_DIRS = new Set([
  'docs',
  'node_modules',
  '.git',
  'dist',
  '.superpowers',
  'android',
  'ios',
  'target',
  'build',
]);

const ALLOWED_EXTS = new Set(['.js', '.html', '.css', '.md', '.json', '.glsl']);

const problems = [];

function checkFile(relPath) {
  const normPath = relPath.replace(/\\/g, '/');
  // Ignore this check script itself
  if (normPath === 'scripts/check-no-emdash.js') return;

  const fullPath = path.join(rootDir, relPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // In AGENTS.md, allow the rule definition line itself
    if (normPath === 'AGENTS.md' && line.includes('**No em dashes**:')) {
      continue;
    }

    if (line.includes('\u2014') || line.includes('&mdash;')) {
      problems.push({
        file: normPath,
        line: i + 1,
        text: line.trim(),
      });
    }
  }
}

function walk(dir) {
  const entries = fs.readdirSync(path.join(rootDir, dir), {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && dir === '') {
      if (entry.name !== '.prettierignore') continue;
    }
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (ALLOWED_EXTS.has(ext)) {
        checkFile(path.join(dir, entry.name));
      }
    }
  }
}

walk('');

if (problems.length > 0) {
  console.error(`\n❌ Found ${problems.length} em dash(es) in the repository:`);
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line} -> ${p.text}`);
  }
  console.error(
    '\nPlease replace em dashes (—) with hyphens (-), colons (:), or parentheses.\n'
  );
  process.exit(1);
}

console.log('✅ No em dashes found.');
process.exit(0);
