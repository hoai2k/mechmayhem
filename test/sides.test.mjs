// WHO FIGHTS WHOM — movekit.isFoe is the one test every target pick and hit
// sweep goes through (it came in three hand-written forms, and the ones
// missing the ally check let a homing round lock onto the caster's own
// summon). Plain objects stand in for fighters: the rule reads only
// alive / allyOf / isAllyOf, which is what keeps it testable without a world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFoe } from '../src/combat/movekit.js';

// Fighter.isAllyOf, restated for the stand-ins
function body(allyOf = null) {
  const b = { alive: true, allyOf };
  b.isAllyOf = (o) => !!o && (o.allyOf === b || b.allyOf === o || (!!b.allyOf && b.allyOf === o.allyOf));
  return b;
}

test('an enemy is a foe; yourself, the dead and your own side are not', () => {
  const me = body(), enemy = body(), minion = body(me), minion2 = body(me), theirs = body(enemy);
  assert.equal(isFoe(me, enemy), true);
  assert.equal(isFoe(me, theirs), true);
  assert.equal(isFoe(me, me), false);
  assert.equal(isFoe(me, minion), false, 'owner -> own summon');
  assert.equal(isFoe(minion, me), false, 'summon -> its owner');
  assert.equal(isFoe(minion, minion2), false, 'two summons of one owner');
  assert.equal(isFoe(minion, enemy), true);
  enemy.alive = false;
  assert.equal(isFoe(me, enemy), false);
  assert.equal(isFoe(me, null), false);
});

test('a null owner is the environment and fights everyone alive', () => {
  const a = body(), m = body(a);
  assert.equal(isFoe(null, a), true);
  assert.equal(isFoe(null, m), true);
});
