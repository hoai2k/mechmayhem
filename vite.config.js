import { defineConfig } from 'vite';
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

export default defineConfig({
  base: './',
  plugins: [devWriter()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    // two pages: the game, and the workbenches at /workbench/. They share the
    // engine chunks — the workbench is the same code with different UI on top.
    rollupOptions: {
      input: {
        main: path.resolve('index.html'),
        workbench: path.resolve('workbench/index.html'),
      },
    },
  },
  server: {
    host: true,
  },
});
