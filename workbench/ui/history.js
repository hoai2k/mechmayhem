// UNDO / REDO for a workbench — one implementation instead of four. The rig,
// skin, level and pose tools each carried their own snapshot stacks, and only
// one of them deduped, so in the others a no-op edit (re-picking the same
// value, a drag that went nowhere) was an undo step you had to click through.
//
// A tool hands over two functions and picks one of two ways to feed it:
//
//   const hist = createHistory({ snapshot, restore, cap, sig });
//
//   BEFORE-EDIT (rig, skin, level): call `hist.record()` just before changing
//   anything — it stores the state being left. A drag that captured its own
//   pre-state at pointer-down hands it over on release: `record(before)`, or
//   `recordIfChanged(before)` to skip a drag that moved nothing.
//
//   AFTER-EDIT (pose): call `hist.commit()` once a change has landed — it
//   stores the state arrived at, and a commit whose content (`sig`) matches
//   the current one only refreshes it in place ("same data, parked somewhere
//   else"), so scrubbing and key-stepping never become steps.
//
// Either way `undo()` / `redo()` restore through `restore(state)` and return
// false when there is nothing to do, so the tool says so in its own words.
// `sig` decides what counts as the same state (default: its JSON), which is
// how a tool keeps view-only fields (a scrub position) out of the comparison.
export function createHistory({ snapshot, restore, cap = 200, sig = JSON.stringify }) {
  let past = [], future = [];
  let current = null;           // the committed state (AFTER-EDIT use only)
  const same = (a, b) => sig(a) === sig(b);
  const trim = () => { if (past.length > cap) past.splice(0, past.length - cap); };
  const here = () => (current !== null ? current : snapshot());
  const land = (s) => { if (current !== null) current = s; restore(s); };

  return {
    /** BEFORE-EDIT: remember the state about to be changed (default: now). */
    record(state = snapshot()) {
      if (past.length && same(past[past.length - 1], state)) return false;
      past.push(state); trim(); future = [];
      return true;
    },
    /** BEFORE-EDIT, for a captured pre-state: only if things actually moved. */
    recordIfChanged(before) {
      if (before === null || before === undefined || same(before, snapshot())) return false;
      return this.record(before);
    },
    /** AFTER-EDIT: remember the state just arrived at. */
    commit(state = snapshot()) {
      if (current !== null && same(current, state)) { current = state; return false; }
      if (current !== null) { past.push(current); trim(); }
      future = []; current = state;
      return true;
    },
    undo() {
      if (!past.length) return false;
      future.push(here()); land(past.pop());
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(here()); land(future.pop());
      return true;
    },
    /** Put the last recorded state back WITHOUT making it redoable — for an
     *  edit the browser cancelled (the user did not perform it). */
    revert() {
      if (!past.length) return false;
      land(past.pop());
      return true;
    },
    clear() { past = []; future = []; current = null; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    /** position in the whole history (0-based) and its length, counting the
     *  current state — "step index+1 of length" */
    get index() { return past.length; },
    get length() { return past.length + future.length + 1; },
  };
}
