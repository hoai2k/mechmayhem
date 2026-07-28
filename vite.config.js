import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { applyManifestPatch } from './tools/manifestfmt.mjs';
import { applyRigPatch } from './tools/rigfmt.mjs';

const run = promisify(execFile);

// SAVE FROM THE WORKBENCH — dev server only.
//
// The authoring tools (?debug=skin, ?rigedit) produce patches, and the only
// route to canonical state used to be: download, paste into the file by hand
// (or hand it to an agent), commit. The browser cannot write to the repo — but
// the Vite dev server on the other end of the socket is running on the same
// machine, so it can.
//
//   POST /__rw/manifest   { "<mechId>": { "skinOps": [...] } }   -> manifest.json
//   POST /__rw/rig        { id, bones: [...] }                   -> rigs/<id>.rig.js
//   GET  /__rw/changes    -> every uncommitted change as one git patch
//   GET  /__rw/changes?stat=1 -> just the count + file list (button state)
//
// Scope, deliberately narrow: this exists ONLY under `vite dev` (apply:
// 'serve', and the GitHub Pages deploy is a static build), it writes two known
// places, and each writer splices rather than rewrites — see tools/manifestfmt
// and tools/rigfmt for why that matters. Saving is not publishing: the files
// become the local canonical state, and a git commit is still what carries
// them to the deployed game or anyone else's machine.

// Collect a POSTed JSON body (bounded — a skinOps list with vertex sets is
// megabytes, a runaway is not).
function readJson(req, res, then) {
  let body = '';
  let killed = false;
  req.on('data', (c) => {
    body += c;
    if (body.length > 64e6) { killed = true; req.destroy(); }
  });
  req.on('end', () => {
    if (killed) return;
    res.setHeader('Content-Type', 'application/json');
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: 'body is not JSON' }));
      return;
    }
    Promise.resolve(then(parsed)).catch((e) => {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    });
  });
}

function devWriter() {
  const MANIFEST = path.resolve('public/models/manifest.json');
  const RIG_DIR = path.resolve('src/mechs/rigs');
  const git = (args) => run('git', args, { maxBuffer: 64e6 }).then((r2) => r2.stdout).catch(() => '');
  return {
    name: 'rw-dev-writer',
    apply: 'serve',
    configureServer(server) {
      // ---- manifest patches (?debug=skin, and anything else that edits it) ----
      server.middlewares.use('/__rw/manifest', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST a manifest patch'); return; }
        readJson(req, res, (patch) => {
          if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
            throw new Error('patch must be a JSON object keyed by mech id');
          }
          const written = applyManifestPatch(MANIFEST, patch);
          console.log(`[rw] manifest updated: ${written.join(', ')}`);
          res.end(JSON.stringify({ ok: true, written, file: 'public/models/manifest.json' }));
        });
      });

      // ---- rig files (?rigedit) ----
      // Only the bone list is replaced; the header comment and the re-skin
      // flags the file carries are preserved (tools/rigfmt.mjs).
      server.middlewares.use('/__rw/rig', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST { id, bones }'); return; }
        readJson(req, res, async ({ id, bones }) => {
          const info = await applyRigPatch(RIG_DIR, id, bones);
          console.log(`[rw] rig updated: ${info.file} (${info.bones} bones)`);
          res.end(JSON.stringify({ ok: true, ...info }));
        });
      });

      // ---- everything saved but not yet committed ----
      // The point of local saves is batching them up; this is how a batch
      // leaves the machine. `?stat=1` is the cheap version the Export button
      // polls to know whether it has anything to offer.
      server.middlewares.use('/__rw/changes', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        try {
          const url = new URL(req.url, 'http://x');
          const porcelain = await git(['status', '--porcelain']);
          const files = porcelain.split('\n').filter(Boolean).map((l) => ({
            status: l.slice(0, 2).trim(), path: l.slice(3).replace(/^"|"$/g, ''),
          }));
          if (url.searchParams.get('stat')) {
            res.end(JSON.stringify({ ok: true, count: files.length, files }));
            return;
          }
          // tracked edits as one patch, plus each untracked file as its own
          // /dev/null diff, so the whole thing applies with `git apply`
          const tracked = await git(['diff', 'HEAD', '--']);
          const untracked = files.filter((f) => f.status === '??').map((f) => f.path);
          let extra = '';
          for (const f of untracked) {
            extra += await git(['diff', '--no-index', '--', '/dev/null', f]);
          }
          const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
          const head = (await git(['rev-parse', '--short', 'HEAD'])).trim();
          res.end(JSON.stringify({ ok: true, branch, head, files, patch: tracked + extra }));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
      });
    },
  };
}

// THE BATTLE SOUNDTRACK — `src/music/*` stays OUT of the JS module graph.
//
// The songs are streamed at runtime, so nothing about them belongs in a
// bundler chunk: this plugin lists the folder and hands the game a virtual
// module of plain urls, then copies the files into `dist/music/` VERBATIM
// (no hashing — a stable url is a cacheable url). The list is read off disk
// every time the module is loaded, so dropping a song in and reloading the
// page is still all it takes to add it to the rotation.
//
// RW_NO_MUSIC=1 builds the game WITHOUT the soundtrack: no files copied, an
// empty track list, and the game falls back to its procedural battle themes.
// That's the switch for a packaged build that shouldn't carry ~40MB of audio.
const MUSIC_DIR = path.resolve('src/music');
const MUSIC_EXT = /\.(mp3|ogg|m4a|wav|webm)$/i;
const MUSIC_ID = 'virtual:rw-music';

function musicFiles() {
  if (process.env.RW_NO_MUSIC === '1') return [];
  try {
    return fs.readdirSync(MUSIC_DIR).filter((f) => MUSIC_EXT.test(f)).sort();
  } catch (e) { return []; } // no folder — procedural themes only
}

function musicPlugin() {
  let isBuild = false;
  return {
    name: 'rw-music',
    configResolved(cfg) { isBuild = cfg.command === 'build'; },
    resolveId(id) { return id === MUSIC_ID ? '\0' + MUSIC_ID : null; },
    load(id) {
      if (id !== '\0' + MUSIC_ID) return null;
      // dev serves src/ off the project root already; a build gets its own
      // copy beside index.html (relative, so `base: './'` keeps working)
      const base = isBuild ? './music/' : '/src/music/';
      return `export const MUSIC_BASE = ${JSON.stringify(base)};\n`
        + `export const MUSIC_FILES = ${JSON.stringify(musicFiles())};\n`;
    },
    // Copied, not emitted: routing ~40MB of audio through rollup's asset
    // pipeline (buffer it, hash it, account it) costs a minute and a half of
    // build time to produce files it must not rename anyway.
    writeBundle(opts) {
      const files = musicFiles();
      if (!files.length) return;
      const dir = path.join(opts.dir || 'dist', 'music');
      fs.mkdirSync(dir, { recursive: true });
      for (const f of files) fs.copyFileSync(path.join(MUSIC_DIR, f), path.join(dir, f));
    },
    // a song added/removed while the dev server runs: reload the page so the
    // virtual module is re-read
    configureServer(server) {
      const touch = (file) => {
        if (!file.startsWith(MUSIC_DIR) || !MUSIC_EXT.test(file)) return;
        const mod = server.moduleGraph.getModuleById('\0' + MUSIC_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', touch);
      server.watcher.on('unlink', touch);
    },
  };
}

// RW_DIST=1 marks a DISTRIBUTION build (tools/dist.mjs): the public artifact,
// with no authoring surface in it. Two effects — the /workbench/ page leaves
// the build inputs, and __RW_DIST__ compiles the dev routes out of the game
// entry so ?debug=..., ?showcase and the level editor are not merely unlisted
// but absent. A normal `npm run build` is unchanged and still ships both pages.
const IS_DIST = process.env.RW_DIST === '1';

export default defineConfig({
  base: './',
  plugins: [devWriter(), musicPlugin()],
  define: {
    __RW_DIST__: JSON.stringify(IS_DIST),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    // two pages: the game, and the workbenches at /workbench/. They share the
    // engine chunks — the workbench is the same code with different UI on top.
    rollupOptions: {
      input: IS_DIST ? { main: path.resolve('index.html') } : {
        main: path.resolve('index.html'),
        workbench: path.resolve('workbench/index.html'),
      },
    },
  },
  server: {
    host: true,
  },
});
