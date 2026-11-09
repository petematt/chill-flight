#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {execFileSync} from 'child_process';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const files = fs
  .readdirSync(rootDir)
  .filter((f) => f.endsWith('.js') && !f.startsWith('.'));

for (const f of files) {
  execFileSync(process.execPath, ['--check', path.join(rootDir, f)], {
    stdio: 'inherit',
  });
}
