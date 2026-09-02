// STRIP SESSION CACHES OUT OF A SHIPPED GLB — surgically.
//
//   node tools/stripcache.mjs                     # DRY RUN over public/models/mech_*.glb
//   node tools/stripcache.mjs --apply [file …]    # rewrite the ones that carry one
//
// A baked model is written by GLTFExporter, which serializes geometry.userData
// as primitive `extras`. feather.js keeps its geodesic graph there
// (`__featherGraph`, per-vertex adjacency for the whole mesh), so two bakes
// shipped with the cache inside them: konga 29.6 MB with 21.7 MB of JSON,
// saurion 45.7 with 33.9. The loader parses it back on every load and nothing
// reads it — the skinOp it served was folded into the weights by the same bake.
// src/dev/bake.js drops every `__`-prefixed key before exporting now; this is
// the same rule applied to files already on disk.
//
// SURGICAL means the BIN chunk is copied byte for byte and only the JSON chunk
// is rewritten (re-padded to 4 bytes as the container requires), so vertex
// order, accessors, textures and skin all stay bit-identical — nothing that
// hurtbox.js samples or dist.mjs verifies can move. Keys kept: everything that
// does not start with `__` (`rwSeam` is the seam record the skin audit needs).
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = files.length ? files
  : fs.readdirSync('public/models').filter((f) => /^mech_.*\.glb$/.test(f)).map((f) => path.join('public/models', f));

const MAGIC = 0x46546C67, JSON_T = 0x4E4F534A;
let total = 0;
for (const file of targets) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== MAGIC) { console.log(`${file}: not a GLB`); continue; }
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== JSON_T) { console.log(`${file}: first chunk is not JSON`); continue; }
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const rest = buf.subarray(20 + jsonLen);           // BIN chunk, untouched
  let stripped = 0;
  const scrub = (obj) => {
    if (!obj?.extras) return;
    for (const k of Object.keys(obj.extras)) {
      if (!k.startsWith('__')) continue;
      stripped += JSON.stringify(obj.extras[k]).length;
      delete obj.extras[k];
    }
    if (!Object.keys(obj.extras).length) delete obj.extras;
  };
  for (const m of json.meshes || []) { scrub(m); for (const p of m.primitives || []) scrub(p); }
  for (const n of json.nodes || []) scrub(n);
  if (!stripped) continue;
  total += stripped;
  const text = Buffer.from(JSON.stringify(json), 'utf8');
  const padded = Buffer.alloc((text.length + 3) & ~3, 0x20);
  text.copy(padded);
  const out = Buffer.alloc(20 + padded.length + rest.length);
  buf.copy(out, 0, 0, 12);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12);
  out.writeUInt32LE(JSON_T, 16);
  padded.copy(out, 20);
  rest.copy(out, 20 + padded.length);
  console.log(`${file}: ${(buf.length / 1e6).toFixed(1)} MB -> ${(out.length / 1e6).toFixed(1)} MB  (${(stripped / 1e6).toFixed(1)} MB of session cache${APPLY ? ', rewritten' : ''})`);
  if (APPLY) fs.writeFileSync(file, out);
}
console.log(total ? `${APPLY ? 'stripped' : 'would strip'} ${(total / 1e6).toFixed(1)} MB` : 'nothing to strip');
