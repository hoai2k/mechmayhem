// Writing src/mechs/rigs/<id>.rig.js from the ?rigedit editor.
//
// A rig file is NOT just its bone list. It carries the header comment that
// explains why the rig exists and how it was measured, the flags the re-skin
// depends on (`skinSpan`, `softSkin`, `cutWelds`, `cutPairs`) and the group
// comments inside the array ("---- LEFT arm (+z) ----"). The editor emits only
// name/parent/pos/bias/post, so a whole-file write would silently delete all of
// it — that is exactly the loss this session already hit twice by hand.
//
// So the writer SPLICES: it replaces the contents of `bones: [ … ]` and leaves
// every other byte alone, re-attaching each bone's own preceding comment lines
// by name. Bones that vanish take their comment with them; new bones arrive
// bare. Verified by import: the file is written to a temp path, imported, and
// only then renamed over the real one — a rig that doesn't parse never lands.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// the editor's own line format, kept identical so Export and Save produce the
// same text (rigedit.js exportRig)
export function formatBone(b) {
  let extra = '';
  if (b.post !== undefined) extra += `, post: ${typeof b.post === 'object' ? JSON.stringify(b.post) : b.post}`;
  if (b.bias !== undefined) extra += `, bias: ${b.bias}`;
  const pos = b.pos.map((v) => {
    const s = Number(v).toFixed(3);
    return s.endsWith('0') ? s.slice(0, -1) : s;   // 0.010 -> 0.01, 0.285 stays
  }).join(', ');
  return `    { name: '${b.name}', parent: ${b.parent ? `'${b.parent}'` : 'null'}, pos: [${pos}]${extra} },`;
}

// span of the `bones: [` … `]` array body in a rig file
function bonesSpan(text) {
  const key = text.indexOf('bones:');
  if (key < 0) throw new Error('no `bones:` in rig file');
  const open = text.indexOf('[', key);
  if (open < 0) throw new Error('no `[` after `bones:`');
  let depth = 0, i = open;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"') {                 // skip strings
      const q = c; i++;
      while (i < text.length && text[i] !== q) { if (text[i] === '\\') i++; i++; }
    } else if (c === '[') depth++;
    else if (c === ']') { depth--; if (!depth) return { open, close: i }; }
    i++;
  }
  throw new Error('unterminated bones array');
}

// name -> the comment lines that sat directly above that bone
function harvestComments(body) {
  const out = new Map();
  let pending = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) { continue; }
    if (t.startsWith('//')) { pending.push('    ' + t); continue; }
    const m = t.match(/name:\s*'([^']+)'/);
    if (m && pending.length) out.set(m[1], pending);
    pending = [];
  }
  return out;
}

/** Replace the bone list in a rig file's TEXT, keeping everything else. */
export function spliceRigBones(text, bones) {
  const { open, close } = bonesSpan(text);
  const comments = harvestComments(text.slice(open + 1, close));
  const lines = [];
  for (const b of bones) {
    for (const c of comments.get(b.name) || []) lines.push(c);
    lines.push(formatBone(b));
  }
  return text.slice(0, open + 1) + '\n' + lines.join('\n') + '\n  ' + text.slice(close);
}

/**
 * Write `bones` into src/mechs/rigs/<id>.rig.js. Returns { file, bones, kept }.
 * Throws if the file is missing (a brand-new rig needs a human-written header
 * first — Export gives you the block to start from) or if the result doesn't
 * import cleanly.
 */
export async function applyRigPatch(dir, id, bones) {
  if (!/^[a-z0-9_-]+$/i.test(id)) throw new Error(`bad rig id "${id}"`);
  if (!Array.isArray(bones) || !bones.length) throw new Error('no bones in payload');
  for (const b of bones) {
    if (!b || typeof b.name !== 'string' || !Array.isArray(b.pos) || b.pos.length !== 3) {
      throw new Error('each bone needs { name, parent, pos:[x,y,z] }');
    }
  }
  const file = path.join(dir, `${id}.rig.js`);
  if (!fs.existsSync(file)) throw new Error(`no ${id}.rig.js yet — Export it and commit a first version`);
  const text = fs.readFileSync(file, 'utf8');
  const next = spliceRigBones(text, bones);

  // prove it parses AND still exports a rig before it replaces anything
  const tmp = file + '.tmp.mjs';
  fs.writeFileSync(tmp, next);
  try {
    const mod = await import(pathToFileURL(tmp).href + '?t=' + Date.now());
    const rig = Object.values(mod).find((v) => v && typeof v === 'object' && Array.isArray(v.bones));
    if (!rig) throw new Error('file no longer exports a rig object');
    if (rig.bones.length !== bones.length) throw new Error('bone count mismatch after write');
  } finally {
    // keep the temp file only long enough to import it
    try { fs.unlinkSync(tmp); } catch (e) { /* already gone */ }
  }
  fs.writeFileSync(file, next);
  return { file: path.relative(process.cwd(), file), bones: bones.length,
    kept: /skinSpan|softSkin|cutWelds|cutPairs/.test(next) };
}
