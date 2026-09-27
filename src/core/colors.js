// Shared player identity colors (P1..P8). Single source of truth for the
// tints used by combat VFX (dash trails, rings), HUD plates, menu player
// cards, pad pointers and the menu-stage preview rings. P1-P4 are the
// original four; P5-P8 are picked to sit between them on the hue wheel
// (violet, white, orange, magenta) so eight on screen stay distinguishable.
export const PLAYER_COLORS = [
  0x38e8ff, 0xff4d5e, 0x62ff9a, 0xffb43c,
  0xa77dff, 0xf2f6ff, 0xff7a1f, 0xff5fd2,
];

// HOW MANY FIGHTERS A MATCH HOLDS (humans + CPUs), and how many gamepad
// indices are polled. The browser may expose fewer pads than this — Chromium
// (Chrome, Edge, the Electron build) reports at most four — so a match can
// always fill its remaining seats with keyboards and CPUs.
export const MAX_FIGHTERS = PLAYER_COLORS.length;
export const MAX_PADS = 8;

// one player's color by index (wraps rather than returning undefined)
export const playerColor = (i) => PLAYER_COLORS[i % PLAYER_COLORS.length];

// 0xRRGGBB → '#rrggbb' (the one CSS-hex derivation — use this instead of
// hand-rolling '#' + x.toString(16).padStart(6, '0') at call sites)
export function hexCss(x) {
  return '#' + x.toString(16).padStart(6, '0');
}

// CSS forms of PLAYER_COLORS, for DOM styling
export const PLAYER_COLORS_CSS = PLAYER_COLORS.map(hexCss);
export const playerColorCss = (i) => PLAYER_COLORS_CSS[i % PLAYER_COLORS_CSS.length];
