// workbench/ui/history.js — the one undo/redo every workbench uses. Pure, so
// it is tested here against a plain value standing in for a tool's state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../workbench/ui/history.js';

function tool(start = 0) {
  const t = { v: start };
  t.hist = createHistory({ snapshot: () => t.v, restore: (s) => { t.v = s; } });
  t.edit = (v) => { t.hist.record(); t.v = v; };
  return t;
}

test('before-edit: undo walks back, redo forward, a new edit drops the redo tail', () => {
  const t = tool(0);
  t.edit(1); t.edit(2); t.edit(3);
  assert.ok(t.hist.undo()); assert.equal(t.v, 2);
  assert.ok(t.hist.undo()); assert.equal(t.v, 1);
  assert.ok(t.hist.redo()); assert.equal(t.v, 2);
  t.edit(9);
  assert.equal(t.hist.canRedo, false);
  assert.ok(t.hist.undo()); assert.equal(t.v, 2);
  assert.ok(t.hist.undo()); assert.ok(t.hist.undo()); assert.equal(t.v, 0);
  assert.equal(t.hist.undo(), false, 'nothing left');
});

test('a no-op edit is not a step, and a drag that went nowhere is not either', () => {
  const t = tool(5);
  t.edit(5); t.edit(5);
  assert.equal(t.hist.index, 1, 'repeated identical records collapse');
  const d = tool(5), before = d.v;             // a drag: pre-state captured at pointer-down
  assert.equal(d.hist.recordIfChanged(before), false, 'released where it started');
  d.v = 7;
  assert.equal(d.hist.recordIfChanged(before), true);
  assert.ok(d.hist.undo()); assert.equal(d.v, 5);
});

test('revert puts the recorded state back without making it redoable', () => {
  const t = tool(0);
  t.hist.record(); t.v = 4;
  assert.ok(t.hist.revert()); assert.equal(t.v, 0);
  assert.equal(t.hist.canRedo, false);
});

test('the cap drops the oldest steps', () => {
  const t = { v: 0 };
  const h = createHistory({ snapshot: () => t.v, restore: (s) => { t.v = s; }, cap: 3 });
  for (let i = 1; i <= 10; i++) { h.record(); t.v = i; }
  let n = 0; while (h.undo()) n++;
  assert.equal(n, 3); assert.equal(t.v, 7);
});

test('after-edit: commits dedupe on sig, index/length count the current state', () => {
  const t = { v: { data: 0, view: 0 } };
  const h = createHistory({
    snapshot: () => ({ ...t.v }), restore: (s) => { t.v = { ...s }; },
    sig: (s) => JSON.stringify(s.data),
  });
  h.commit();                                   // baseline
  t.v.view = 3; h.commit();                     // view only — parked, not a step
  assert.equal(h.length, 1);
  t.v.data = 1; h.commit();
  t.v.data = 2; h.commit();
  assert.equal(h.index, 2); assert.equal(h.length, 3);
  assert.ok(h.undo()); assert.equal(t.v.data, 1);
  assert.ok(h.undo()); assert.deepEqual(t.v, { data: 0, view: 3 }, 'the parked view came back too');
  assert.equal(h.undo(), false);
  assert.ok(h.redo()); assert.equal(t.v.data, 1);
});
