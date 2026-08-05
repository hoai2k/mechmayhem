// ARENA DESIGN SYSTEMS — who decides WHERE a generated arena's pieces stand.
//
// An arena build has always been two layers: WHAT a place is made of
// (themes.js — palettes, prop lists, hazards, mood) and WHERE those
// ingredients land. The WHERE used to be one hard-coded scatter (rings of
// props, cluster-plus-solo buildings); it is now a pluggable DESIGN SYSTEM,
// picked by SETTINGS → ARENA DESIGN (CONFIG.arenaDesign, ?design=<id>):
//
//   wards   — Lynch districts: a jittered ward grid with roles (dense blocks,
//             a tower court, a market, yards, paved pocket plazas)   [default]
//   avenues — the axial city: boulevards through the centre AND along the
//             wrap seam, street walls, gateway towers, terminated vistas
//   circuit — arena-shooter flow: rotationally symmetric bastion rings,
//             alternating cover and open gates, seam-corner clusters
//
// A design system is a PLANNER, never a builder: `plan(env)` returns
//   layout    — a replacement theme.layout for the Terrain (or null to keep
//               the theme's own); MUST be a fresh object — themes are shared
//   buildings(ctx) — building sites [{x, z, tall, cluster, hRange?}]
//   props(ctx)     — Map(spec → [{x, z, ry?}]) for the theme's prop specs;
//                    a spec left out (or empty) falls back to ring scatter
// and the Arena EXECUTES the plan through the exact same code the fallback
// path runs — massing, tinting, prop registration, recipe recording — so a
// designed arena bakes, plays and records identically to a scattered one.
//
// FALLBACK is deliberately not a module here: it is the absence of a plan.
// arenaDesignSystem() returns null for it and arena.js runs its original
// placement code untouched — the current generator survives byte-identical
// as the always-reachable safety net.
import { CONFIG } from '../../core/config.js';
import { WARDS } from './wards.js';
import { AVENUES } from './avenues.js';
import { CIRCUIT } from './circuit.js';

export const DESIGN_SYSTEMS = {
  wards: WARDS,
  avenues: AVENUES,
  circuit: CIRCUIT,
};

// which system a generated (non-authored) arena uses under each settings mode;
// 'authored' plays hand-built levels where they exist (authored.js) and hands
// every OTHER arena to the default system below
export const DEFAULT_DESIGN = 'wards';

export function arenaDesignSystem() {
  const mode = CONFIG.arenaDesign;
  if (mode === 'fallback') return null;
  return DESIGN_SYSTEMS[mode] || DESIGN_SYSTEMS[DEFAULT_DESIGN];
}
