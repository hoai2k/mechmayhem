import { defineConfig } from 'vite';
import path from 'node:path';
import { applyManifestPatch } from './tools/manifestfmt.mjs';

// SAVE FROM THE WORKBENCH — dev server only.
//
// The authoring tools (?debug=skin, ?rigedit, …) produce manifest patches, and
// until now the only way to make one canonical was: download the JSON, paste it
// into public/models/manifest.json by hand (or hand it to an agent), commit.
// The browser cannot write to the repo — but the dev server it is talking to
// runs on the same machine, so it can. This middleware accepts exactly the
// patch a workbench exports and splices it into the manifest on disk, leaving
// every other byte of the file alone (tools/manifestfmt.mjs).
//
//   POST /__rw/manifest   body: { "<mechId>": { "skinOps": [...] } }
//
// Scope, deliberately narrow: it exists ONLY under `vite dev` (apply:'serve',
// and the GitHub Pages deploy is a static build), it writes ONE known file, and
// it refuses anything that isn't a JSON object. Saving is not publishing: the
// file becomes the local canonical state, and it still takes a git commit to
// reach the deployed game or anyone else's machine.
function manifestWriter() {
  const FILE = path.resolve('public/models/manifest.json');
  return {
    name: 'rw-manifest-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__rw/manifest', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST a manifest patch');
          return;
        }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 64e6) req.destroy(); });
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const patch = JSON.parse(body);
            if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
              throw new Error('patch must be a JSON object keyed by mech id');
            }
            const written = applyManifestPatch(FILE, patch);
            console.log(`[rw] manifest updated: ${written.join(', ')}`);
            res.end(JSON.stringify({ ok: true, written, file: 'public/models/manifest.json' }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [manifestWriter()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
  },
});
