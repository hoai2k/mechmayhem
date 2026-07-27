// Alternate paint jobs ("color schemes") so two players on the same mech
// stay readable. Pure color math + def-cloning — split out of roster.js so
// the roster stays data-only. A scheme recolors the PRIMARY armor
// (procedural synth AND texture-tint paths both read skin.primary.base/
// base2) plus the menu tint / glow.

function hexToHsl(hex) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

// Repaint to a target hue. `satMul`/`lumMul` are what make the earthier
// schemes possible: a brown is an orange with the saturation pulled down and
// the value dropped, which no hue alone can express.
const forceHue = (hex, h, minS, satMul = 1, lumMul = 1) => {
  const [, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(1, Math.max(s, minS) * satMul), Math.min(0.96, l * lumMul));
};
const darken = (hex) => {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s * 0.5, Math.max(0.06, l * 0.32));
};

// Nine paint jobs. Names are the mech's, not the crayon's — a robot wears
// EMBER, not "red". Order is the cycle order in mech select; STOCK first so
// the default pick is always the mech as its designer painted it.
export const SCHEME_NAMES = ['STOCK', 'EMBER', 'TIDE', 'MIDNIGHT',
  'AMETHYST', 'VERDANT', 'SOLAR', 'BLOSSOM', 'UMBER'];
export const SCHEME_COUNT = SCHEME_NAMES.length;
const SCHEMES = [
  null,
  { h: 0.02, minS: 0.6, glow: 0xff7a28 },   // EMBER — molten red-orange
  { h: 0.58, minS: 0.55, glow: 0x3fc8ff },  // TIDE — deep-sea blue
  { dark: true },                           // MIDNIGHT — blacked-out stealth
  { h: 0.77, minS: 0.55, glow: 0xc07aff },  // AMETHYST — purple
  { h: 0.33, minS: 0.55, glow: 0x5fe08a },  // VERDANT — green
  { h: 0.09, minS: 0.7, glow: 0xffa62b, lumMul: 1.1 },   // SOLAR — bright orange
  { h: 0.92, minS: 0.5, glow: 0xff8fd0, lumMul: 1.18, satMul: 0.9 }, // BLOSSOM — pink
  { h: 0.075, minS: 0.45, glow: 0xc98b4a, satMul: 0.55, lumMul: 0.62 }, // UMBER — brown
];

// swatch color for menus (cheap: primary after the scheme)
export function schemeSwatch(def, v = 0) {
  const S = SCHEMES[v];
  if (!S) return def.colors.primary;
  return S.dark ? darken(def.colors.primary) : forceHue(def.colors.primary, S.h, S.minS, S.satMul, S.lumMul);
}

// Returns a def clone wearing the scheme; variant 0 is the stock paint.
export function applyColorScheme(def, v = 0) {
  const S = SCHEMES[v];
  if (!S) return def;
  const re = (hex) => (S.dark ? darken(hex) : forceHue(hex, S.h, S.minS, S.satMul, S.lumMul));
  const [stockHue, stockSat] = hexToHsl(def.colors.primary); // BEFORE the repaint
  return {
    ...def,
    variant: v,
    // GLB mechs can't re-synthesize maps from the recolored skin, so they carry
    // this spec to recolorglb.js, which repaints the baked textures to match.
    recolor: {
      variant: v,
      dark: !!S.dark,
      hue: S.h,                                    // undefined for MIDNIGHT
      minS: S.minS,                                // undefined for MIDNIGHT
      satMul: S.satMul,                            // earthier schemes (UMBER)
      lumMul: S.lumMul,
      glowHue: S.glow != null ? hexToHsl(S.glow)[0] : null,
      stockHue,
      // A near-grey/tan primary (the "metal" mechs) gives an unreliable hue —
      // and no vivid primary to distinguish from accents — so recolor ANY
      // saturated paint, not just the stock-hue family. Vivid primaries keep
      // the hue-band so two-tone accents / glows survive.
      anyHue: stockSat < 0.22,
    },
    colors: { ...def.colors, primary: re(def.colors.primary), glow: S.glow ?? def.colors.glow },
    skin: def.skin ? {
      ...def.skin,
      primary: { ...def.skin.primary, base: re(def.skin.primary.base), base2: re(def.skin.primary.base2) },
    } : def.skin,
  };
}
