import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// (The workbenches used to SAVE through this server: POST /__rw/manifest and
// /__rw/rig wrote public/models/manifest.json and src/mechs/rigs/<id>.rig.js on
// the machine running `vite dev`, and /__rw/changes handed back the batch as a
// git patch. Removed on purpose — a write you cannot see is a write you cannot
// trust, and every tool exports its edit as readable text instead. The splicing
// formatters those endpoints used, tools/manifestfmt.mjs and tools/rigfmt.mjs,
// are still there: they are what an agent applies a pasted patch with.)

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
  plugins: [musicPlugin()],
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
