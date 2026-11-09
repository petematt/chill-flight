import {defineConfig} from 'vite';
import fs from 'fs';
import process from 'node:process';
import {execSync} from 'child_process';

function getGitInfo(isBuild = false, isPreview = false) {
  let commitHash = 'unknown';
  try {
    commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    // fallback if git is unavailable
  }

  let isDirty = false;
  try {
    const status = execSync('git status --porcelain', {
      encoding: 'utf-8',
    });
    if (status.trim()) {
      const lines = status.split('\n').filter((l) => l.length > 0);
      const dirtyFiles = lines
        .map((line) => {
          const match = line.match(/^.. (.+)$/);
          if (!match) return line.trim();
          const filePath = match[1].trim();
          if (filePath.includes(' -> ')) {
            return filePath.split(' -> ')[1].trim();
          }
          return filePath;
        })
        .filter((file) => {
          // Always ignore build output directory
          if (file.startsWith('docs/')) return false;
          // During production builds, ignore files modified as part of the release workflow
          if (isBuild) {
            const releaseFiles = [
              'package.json',
              'package-lock.json',
              'RELEASE_NOTES.md',
            ];
            if (
              releaseFiles.includes(file) ||
              file.startsWith('ios/') ||
              file.startsWith('android/')
            ) {
              return false;
            }
          }
          return true;
        });
      isDirty = dirtyFiles.length > 0;
    }
  } catch {
    // fallback if git is unavailable
  }

  let version = '0.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    version = pkg.version;
    if (isPreview) {
      const parts = version.split('.').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        version = `${parts[0]}.${parts[1]}.${parts[2] + 1}-preview`;
      } else {
        version = `${version}-preview`;
      }
    }
  } catch {
    // fallback
  }

  return {commitHash, isDirty, version};
}

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      // @capacitor-firebase/analytics lists firebase as an optional peer dep.
      // The web build uses Google Tag Manager directly, so we stub this out
      // to avoid requiring the full Firebase SDK as a web dependency.
      'firebase/analytics': new URL(
        './src/stubs/firebase-analytics.js',
        import.meta.url
      ).pathname,
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    // three.js is ~610 kB and the game ~710 kB
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: 'index.html',
        // Debug pages (debug/) are dev-only and not part of the build.
      },
      output: {
        // three.js in a file of its own: it only changes when three is
        // updated, so players keep it cached from one release to the next
        codeSplitting: {
          groups: [{name: 'three', test: /node_modules[\\/]three[\\/]/}],
        },
      },
    },
  },
  plugins: [
    {
      name: 'dynamic-git-info',
      transformIndexHtml: {
        order: 'pre',
        handler(html, ctx) {
          const isBuild = !ctx.server;
          const isPreview = process.env.VITE_PREVIEW === 'true';
          const {commitHash, isDirty, version} = getGitInfo(isBuild, isPreview);
          return [
            {
              tag: 'script',
              children: `window.__APP_VERSION__ = ${JSON.stringify(version)};\nwindow.__COMMIT_HASH__ = ${JSON.stringify(commitHash)};\nwindow.__IS_DIRTY__ = ${JSON.stringify(isDirty)};`,
              injectTo: 'head-prepend',
            },
          ];
        },
      },
    },
  ],
});
