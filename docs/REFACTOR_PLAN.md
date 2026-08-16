# Refactor plan — 2026-07-20 sweep

Tracking doc for the "keep it well factored" refactor pass requested after
the codebase review. **If you are an agent resuming this work: read this
file top to bottom, then continue at the first unchecked batch.** Work on
branch `claude/codebase-refactoring-review-441t8t`, one batch at a time;
when a batch is verified (build green + soak for combat, screenshots for
art), merge it into `main` and push (push to main auto-deploys via
`.github/workflows/deploy.yml`). Update the checkboxes + notes here in the
same commit as the work. All refactors are **behavior-preserving** unless a
note says otherwise.

Baseline: main @ 849b648, build green, review findings summarized per batch
below (file:line refs are from that commit and drift as batches land).

## Batch A — contract validator  [x DONE 2026-07-20]

The MECH_ART_GUIDE §5 joints/anchors contract is prose-only; animator/combat
`if (J.x)`-guard every extra joint (animator.js:479-782), so a missing
`gatlingL`/`muzzleR`/`halo`/`tail0-2`/`shield`/`mortars` ships silently.
GLB path never calls `design()` (gltf.js:149) so extra joints are absent
there by design — the validator must encode *expected* per-route loss
(glbanim.js:115-127 lists accepted GLB losses).

- [x] `src/mechs/contract.js`: §5 table as data (joints/anchors/materials
      per mech, `glbAnchors` = manifest-reinstated subset).
- [x] `validateMech(mech)` → { violations, glbLosses }.
- [x] Wired into BOTH build factories instead of rigtest (better: fires in
      every mode — battle, showcase, soak — for free): `warnContract` in
      factory.buildMech + gltf.buildGlbMech, deduped per mech+route.
      Violations = console.warn; known GLB losses = console.debug.
- [x] Verified: procedural + GLB showcase clean (0 violations, 13 GLB
      known-loss lines as expected; vulcan podL + nullbot glow2 correctly
      satisfied by manifest/GLB_DRESS); sabotage test fired then reverted;
      build green; titanus/viper ace soak crash:null.
      New tool: tools/console.mjs (headless console capture).

## Batch B — skinOps compaction  [x DONE 2026-07-20]

manifest.json is ~9.5k lines, mostly verbose append-only skinOps dumps from
?debug=skin; superseded ops accumulate (titanus comp 50 mapped 3×; last
wins per applySkinOps order, skinops.js:357). Selectors are positional
(n-th largest island, sort at skinops.js:102) — do NOT change selector
semantics in this batch (stable keys are future work; re-exports are rare).

- [x] compactSkinOps + skinOpsToJson in skinops.js. Census first: ALL 1504
      ops are pure {comp:N} selectors (global ordinals, stable under
      rebinds) → keep-last-per-comp dedupe is exact. {bone,comp} ordinal
      selectors would NOT be safe to dedupe; compactor leaves them (and
      purgeFar/purgePair) untouched — rationale documented in skinops.js.
- [x] tools/compact-skinops.mjs: dedupe + one-op-per-line rewrite with a
      symbolic old-vs-new equivalence check that aborts on mismatch.
      Result: 1504→1425 ops, manifest.json 10.5k→2k lines. Idempotent.
- [x] ?debug=skin export now emits compacted one-line form.
- [x] Verified: symbolic equivalence + before/after screenshots
      (titanus/jerry/glacier — pixel diff shown to be pure scene
      nondeterminism via same-state control shot; visual compare
      identical); GLB showcase contract-clean; aegis/jerry ace GLB soak
      crash:null; build green.

## Batch C — world.js fx lifecycle unification  [x DONE 2026-07-20]

world.js keeps 5 bespoke arrays (geysers/waves/tornados/firePatches/
flameJets) each with its own reverse-iterate update/dispose loop
(world.js:290-376) + clearTransient copies (861-887); specials.js pushes
into them directly (specials.js:649, 2117, 2333). A generic
addUpdater(tick, end) already exists (world.js:134).

- [x] spawnGeyser/spawnWave/spawnTornado/spawnFlameJet/addFirePatch/
      freezeOverlay all register sticky updaters; damage ticks moved
      verbatim. KEY DISCOVERY: startFinisher's endUpdaters() must NOT
      kill environmental fx (they survive into cinematics; scripts spawn
      their own) → updaters got a {sticky} flag; endUpdaters(false) at
      startFinisher, endUpdaters() [all] at clearTransient. flameJets Map
      kept as retrigger index only; jets self-unindex (guarded so a
      replacement jet isn't unindexed by its predecessor's end()).
- [x] specials.js + finisher.js converted to the spawn APIs. The tornado
      loop's owner-damage branch was DEAD code (no push site ever set
      owner — inferno ult runs its own damage updater) and was dropped.
      freezeOverlay's end() now also disposes geo/mat on round sweeps
      (fixes a small leak; previously only scene.remove).
- [x] Verified: build green; ace soaks cranky/inferno, glacier/tempest,
      titanus/viper all crash:null; finisherdemo loops for inferno
      (flame-jet 'fin' path) 90s and cranky (fx-only geyser) 300s with
      zero page errors.

## Batch D — specials framework + fireRanged table  [x DONE 2026-07-20]

DONE: movekit.js (stillCasting/cast/eachEnemy/volley/timedUpdater, doc'd);
specials.js migrated conservatively — 35 cast sites, 14 volleys, 3
eachEnemy, 2 timedUpdater; everything whose guards/skip-conditions
differed from the helpers stayed inline BY DESIGN (allies/minion skips,
victims-sets, delay arrays, recursive ticks — bending them would change
behavior). specials.js 2765→2675 lines. world.fireRanged switch → WEAPONS
table (21 handlers, verified token-identical to old switch bodies via
normalized AST-ish diff). Verified: full-roster soak matrix (9 ace
matchups covering all 17 mechs) + GLB soak all crash:null; build green.

## Batch E — fighter.js dedup + balance constants + cycle cut  [x MOSTLY DONE 2026-07-20 — cycle cut deferred to remaining-work list]

- [x] _chargeHoldPhase(dt, o) extracted (hold/accumulate/tell/full-beat
      scaffold); updateHeavyHold/updatePunchHold keep their distinct
      release choreography inline. Per-attack field names kept (startAttack
      seeds them, update loop dispatches on them).
- [x] _blockAbsorb helper unifies the raised-guard + AEGIS passive-cover
      tails; their deliberate asymmetries (chip rounding, ult drip counts
      full vs post-block dmg, push factor) are commented AT THE CALL SITES
      and preserved. BLOCK_ULT_DIV=3000 named; both clean-hit maxHp-scaled
      formulas untouched.
- [x] Named: BLOCK_LEAK_DEFAULT, WEIGHT_KNOCK_RESIST, HITSTUN_HEAVY/LIGHT,
      SOFT_FLINCH_CHANCE, DASH_SPEED_MULT/CHARGE_BOOST/COOLDOWN,
      ESCAPE_JUMP_MULT/VY, MOMENTUM_FLOOR/DMG_RATE/DMG_CAP. (Rumble
      magnitudes left inline — single-site, self-explanatory.)
- [ ] Cut fighter↔specials import cycle — DEFERRED (works today; do as a
      small follow-up: inject Fighter ctor into the raptor summon).
- [x] colorscheme.js split out (SCHEME_NAMES/COUNT/schemeSwatch/
      applyColorScheme + hsl math); roster.js is data-only again; 5
      importers rewired. DIGITIGRADE_REST preset (viper+fenrir; wraith's
      scaled variant intentionally explicit).
- [x] Verified via the batch-D soak matrix (includes saurion raptors,
      aegis shield, titanus charge holds); build green.

## Batch F — animator SIGNATURES registry + animations REST_KEY  [x DONE 2026-07-20]

DONE: src/mechs/signatures.js — SIGNATURES[id] registry (12 entries) +
levelHands + shield quats moved there; animator.signature() is now a
3-line dispatcher; vulcan/inferno/cranky get roster `levelHands: true`
instead of hardcoded id checks (inferno's whole case WAS just that flag).
frogger's early `break` became `return` (same semantics — dispatcher
still runs profile.post after). animations.js: REST_FULL/REST_ARMSTANCE/
REST_UPPER consts replace 19 EXACT-duplicate end keys (the review's "~50
verbatim" was wrong — only exact set+value matches were replaced; pose
keys drive only listed joints, so near-misses MUST stay inline). Consts
sit before CLIPS_RAW (TDZ). compile() copies pose arrays so sharing is
safe (verified). Verified: showcase console clean both routes, lineup
screenshot personality intact, soak matrix above.

- [ ] animator.signature() 13-case switch (animator.js:479-782) →
      SIGNATURES[id] registry module (src/mechs/signatures.js); keep
      levelHands via a def flag instead of hardcoded ids.
- [ ] animations.js: extract the ~50 verbatim return-to-rest end keys into
      REST_KEY / returnTo(dur) helper.
- [ ] Verify: ?showcase screenshot sweep (all 12 + anim=walk spot checks),
      soak, build green.

## Batch G — finisher sharding  [x DONE 2026-07-20]

DONE: finisher.js = 375-line DSL engine; 18 scripts in finisher/<id>.js
(+ index.js registry, shared.js, carry.js with carryGrip(F,t0,t1) —
titanus/colossus blocks were byte-identical except hold end 2.55 vs 2.5).
nullbot BSOD → BSOD_HTML template fn. Verified: build green, titanus +
nullbot finisherdemo loops 240s each, zero page errors.

- [ ] Split SCRIPTS (finisher.js:384-1493, 18 scripts) into
      src/game/finisher/<id>.js + index that assembles the registry; DSL
      engine stays in finisher.js. Extract shared carry() grip (titanus
      415-429 ≡ colossus 505-517). Move nullbot BSOD HTML to a template
      constant in its own file.
- [ ] Verify: ?finishers debug page (see config.js) screenshots for
      titanus/colossus/nullbot + one soak to KO; build green.

## Batch H — boot extraction + shared createBattle + UI dedupe  [x DONE 2026-07-20]

DONE: menustage.js / padpointers.js / warmup.js (Warmup class; per-battle
state stays on B.loading — boot loop + teardown read it) extracted; zoom
guards folded into touch.js; boot.js ~810 lines of screen flow.
battle.js createBattle() shared by boot + battletest (differences
reconciled deliberately: seed param, audio=null, world.input order proven
neutral, CameraSystem ctor timing proven DOM-only). core/colors.js owns
PLAYER_COLORS + hexCss (fighter.js keeps a compat re-export — remove
whenever). menus.js MenuList (list build/nav/hot-corner ring) under
Title/Pause/Settings/Results; MechSelect untouched. camera.js: shared
azimuthBehind/followAzimuth/giantFactor/giantZoomDamp; per-mode rates
preserved at call sites. Verified: build, title screenshot, menu console
clean, colossus giant-camera ace soaks crash:null.

- [ ] Extract from boot.js: MenuStage (46-242) → src/game/menustage.js,
      PadPointers (275-359) → src/game/padpointers.js, warm-up loader
      (615-834) → src/game/warmup.js, touch zoom guards.
- [ ] Extract createBattle() from boot.startBattle (837-918); reuse in
      dev/battletest.js (currently a drifted copy, battletest.js:24-71).
- [ ] menus.js: shared MenuList helper for Title/Pause/Settings/Results
      vertical lists + the duplicated corner hot-button ring (88-108 vs
      928-950).
- [ ] Move PLAYER_COLORS from fighter.js:56 → src/core/colors.js with
      CSS-hex derivation; update hud.js/menus.js/boot.js/finisher.js
      imports; delete COLOR_CSS duplicates.
- [ ] camera.js: share follow/lock/giant-zoom between updateCombined
      (246-291) and updateSplit (403-436).
- [ ] Verify: menu flow by hand via screenshots (title→mech select→battle,
      pause, results), pad-pointer smoke if feasible, soak, build green.

## Batch I — gltf.js buildGlbMech cleanup + manifest validation  [ ]

- [ ] Extract rescale(k) helper (3 copy-pasted blocks gltf.js:257/353/373);
      hoist <10-bones fallback check to right after mapBones (before
      skinOps/clone/dress work).
- [ ] Consolidate 3 manifest fetch paths (loadManifest/buildGlbForTool/
      fetchRawManifest).
- [ ] Manifest key validation: warn loudly (dev) on unknown keys/bad bone
      names; keep prod fallback-to-procedural behavior.
- [ ] Verify: ?showcase screenshot sweep (all GLB mechs), soak, build.

## Batch J — perf smalls + shader dedupe  [x DONE 2026-07-20 (scoped)]

- [x] src/combat/fxglsl.js: GLSL_VNOISE chunk replaces the 3 verbatim
      hash/vnoise copies (geyserfx/nadofx/wavefx; flamefx never had one).
      ShaderFX base class SKIPPED deliberately: the four fx classes share
      only ~10 lines of ctor/dispose shape and unifying their lifecycles
      would risk subtle regressions for little gain.
- [x] fwd/muzzle gained optional `out` scratch params (documented aliasing
      rules); blanket call-site conversion SKIPPED — retaining callers
      exist and the GC win didn't justify the aliasing risk.
- [x] ParticlePool.emit reuses two module scratch Colors.
- [x] FlameFX pooling SKIPPED (not simple; extinguish/rekindle already
      reuse live instances via the flameJets retrigger index).
- [x] Verified: ?geyser + ?ultfx=wave/nado/tsunami pages error-free,
      cranky/inferno ace soak crash:null, build green.

## Log

- 2026-07-20: plan created; branch reset onto main @ 849b648; baseline
  build green.
- 2026-07-20 (later): ALL BATCHES COMPLETE. A-C merged to main
  individually; D-F merged together (75309b6); G-J merged together at the
  end of the session. Deploys ride the main pushes (Pages workflow).

## Remaining follow-ups (small, safe to do anytime)
- Cut the fighter.js <-> specials.js import cycle (inject the Fighter
  ctor into the raptor summon, or move it to a neutral module); then drop
  fighter.js's PLAYER_COLORS compat re-export (import core/colors.js
  directly wherever it's still consumed via fighter.js).
- ~~CLAUDE.md/MECH_ART_GUIDE say "12 mechs" — roster is 17; refresh docs~~ —
  done in the docs accuracy pass (README, CLAUDE.md, ASSETS.md,
  MECH_ART_GUIDE, WEB_LAUNCH_CHECKLIST). Still outstanding from this item:
  the CLAUDE.md architecture map should also mention movekit.js,
  signatures.js, colorscheme.js, contract.js, core/colors.js, game/battle.js,
  and `game/finisher/<id>.js` being parallel-agent-safe.
- Consider stable skinOps island keys (bone+centroid hash) if GLBs ever
  get re-exported; today's ordinals silently rebind on re-export.
