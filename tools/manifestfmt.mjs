// manifest.json's house formatting, as code.
//
// public/models/manifest.json is hand-edited AND machine-edited, so its shape
// has to survive both. `JSON.stringify(obj, null, 2)` would explode every
// skinOps vertex list into one line per NUMBER — an 80k-line diff for a
// one-op change, which is why every previous machine edit was a careful
// textual splice. This module reproduces the file's actual style instead:
//
//   · two-space pretty-printing for the structure
//   · every skinOp on ONE line (they are the elements of an array)
//   · short leaf objects (a muzzle: joint/offset/rot) inline
//   · number lists (verts, offsets) inline, however long
//
// Verified by round-trip: formatManifest(JSON.parse(file)) === file for the
// committed manifest (tools/manifestfmt.mjs --check).
import fs from 'node:fs';

const INLINE_MAX = 120;   // a leaf object longer than this gets broken out

const isPrimitive = (v) => v === null || typeof v !== 'object';
const compact = (v) => JSON.stringify(v);

function fmt(value, indent, inArray) {
  const pad = ' '.repeat(indent);
  const padIn = ' '.repeat(indent + 2);
  if (isPrimitive(value)) return compact(value);

  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    // a list of numbers/strings stays on one line however long it is: that is
    // what makes a 3000-vertex selection one grep-able line instead of 3000
    if (value.every(isPrimitive)) return compact(value);
    return '[\n' + value.map((v) => padIn + fmt(v, indent + 2, true)).join(',\n') + '\n' + pad + ']';
  }

  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  // elements of an array (skinOps) are always one-liners; so is any short leaf
  // object that holds no nested object (a muzzle's joint/offset/rot)
  const flat = compact(value);
  const hasObjectChild = keys.some((k) => {
    const v = value[k];
    return v && typeof v === 'object' && !Array.isArray(v) ;
  });
  if (inArray || (!hasObjectChild && flat.length <= INLINE_MAX)) return flat;
  return '{\n' + keys.map((k) => padIn + JSON.stringify(k) + ': ' + fmt(value[k], indent + 2, false))
    .join(',\n') + '\n' + pad + '}';
}

/** The manifest object as text, in the file's own style (trailing newline). */
export function formatManifest(obj) {
  return fmt(obj, 0, false) + '\n';
}

/**
 * Deep-merge `patch` into the manifest object. Arrays REPLACE (a skinOps
 * export is a full replacement list, never an append), objects merge key by
 * key, so `{inferno: {alt: {skinOps: [...]}}}` touches nothing else.
 */
export function mergeManifest(base, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)
        && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      mergeManifest(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}


// ---- surgical writes -------------------------------------------------------
// The manifest is edited concurrently by hand, by several agents and by tools,
// so a writer that reformats the whole file turns a one-op change into a
// hundreds-of-line diff and a merge conflict with everything else in flight.
// These helpers replace only the VALUE at a given path, leaving every other
// byte of the file exactly as it was.

const isWs = (c) => c === ' ' || c === '\n' || c === '\t' || c === '\r';
const skipWs = (s, i) => { while (i < s.length && isWs(s[i])) i++; return i; };

// span [start, end) of the JSON value that begins at `i`
function valueSpan(s, i) {
  i = skipWs(s, i);
  const start = i;
  const c = s[i];
  if (c === '"') {
    i++;
    while (i < s.length) { if (s[i] === '\\') i += 2; else if (s[i] === '"') { i++; break; } else i++; }
    return { start, end: i };
  }
  if (c === '{' || c === '[') {
    const open = c, close = c === '{' ? '}' : ']';
    let depth = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"') { const sp = valueSpan(s, i); i = sp.end; continue; }
      if (ch === open) depth++;
      else if (ch === close) { depth--; if (!depth) { i++; break; } }
      i++;
    }
    return { start, end: i };
  }
  while (i < s.length && !isWs(s[i]) && s[i] !== ',' && s[i] !== '}' && s[i] !== ']') i++;
  return { start, end: i };
}

// Find the span of `path`'s value, plus the containing object's span, so a
// caller can either replace the value or insert the key when it is missing.
function locate(s, path) {
  let i = skipWs(s, 0);
  let objSpan = valueSpan(s, i);
  for (let d = 0; d < path.length; d++) {
    const key = JSON.stringify(path[d]);
    // scan this object's members at depth 1 only
    let j = skipWs(s, objSpan.start + 1);
    let found = null;
    while (j < objSpan.end - 1) {
      const kSpan = valueSpan(s, j);
      const keyText = s.slice(kSpan.start, kSpan.end);
      let k = skipWs(s, kSpan.end);
      if (s[k] !== ':') break;
      const vSpan = valueSpan(s, k + 1);
      if (keyText === key) { found = vSpan; break; }
      j = skipWs(s, vSpan.end);
      if (s[j] === ',') j = skipWs(s, j + 1);
    }
    if (!found) return { missing: true, at: d, parent: objSpan };
    if (d === path.length - 1) return { span: found, parent: objSpan };
    objSpan = found;
  }
  return { missing: true, at: 0, parent: objSpan };
}

// indentation of the line `pos` sits on
function indentAt(s, pos) {
  const ls = s.lastIndexOf('\n', pos) + 1;
  let n = 0;
  while (ls + n < s.length && s[ls + n] === ' ') n++;
  return n;
}

/**
 * Replace (or insert) the value at `path` in the manifest TEXT, formatted in
 * the file's house style, touching nothing else. Returns the new text.
 */
export function spliceManifest(text, path, value) {
  const loc = locate(text, path);
  if (loc.span) {
    const indent = indentAt(text, loc.span.start);
    return text.slice(0, loc.span.start) + fmt(value, indent, false) + text.slice(loc.span.end);
  }
  // missing: insert the remaining path as a nested object at the end of the
  // deepest object that DOES exist
  const rest = path.slice(loc.at);
  let nested = value;
  for (let i = rest.length - 1; i > 0; i--) nested = { [rest[i]]: nested };
  const parent = loc.parent;
  const inner = text.slice(parent.start + 1, parent.end - 1);
  const indent = indentAt(text, parent.start) + 2;
  const body = ' '.repeat(indent) + JSON.stringify(rest[0]) + ': ' + fmt(nested, indent, false);
  const sep = inner.trim() ? ',\n' : '\n';
  return text.slice(0, parent.end - 1).replace(/\s*$/, '') + sep + body + '\n'
    + ' '.repeat(indentAt(text, parent.start)) + text.slice(parent.end - 1);
}

/** Every leaf path in a patch object (arrays and primitives are leaves). */
export function patchPaths(patch, prefix = []) {
  const out = [];
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...patchPaths(v, [...prefix, k]));
    else out.push({ path: [...prefix, k], value: v });
  }
  return out;
}

/** Apply a manifest patch to the file at `file`, one surgical splice per leaf. */
export function applyManifestPatch(file, patch) {
  let text = fs.readFileSync(file, 'utf8');
  const leaves = patchPaths(patch);
  for (const { path, value } of leaves) text = spliceManifest(text, path, value);
  JSON.parse(text);                      // never write a file we just broke
  fs.writeFileSync(file, text);
  return leaves.map((l) => l.path.join('.'));
}

// `node tools/manifestfmt.mjs --check [path]` — prove the formatter is a
// no-op on the committed file before trusting it to write one.
if (process.argv[1] && process.argv[1].endsWith('manifestfmt.mjs')) {
  const path = process.argv.find((a) => a.endsWith('.json')) || 'public/models/manifest.json';
  const src = fs.readFileSync(path, 'utf8');
  const out = formatManifest(JSON.parse(src));
  if (out === src) {
    console.log(`round-trip OK — ${path} is byte-identical after reformat`);
  } else {
    const a = src.split('\n'), b = out.split('\n');
    let first = -1;
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { first = i; break; }
    console.log(`round-trip DIFFERS: ${a.length} lines in, ${b.length} out; first at line ${first + 1}`);
    console.log('  file:', JSON.stringify(a[first]?.slice(0, 160)));
    console.log('  fmt :', JSON.stringify(b[first]?.slice(0, 160)));
    process.exit(1);
  }
}
