// ONE PLAYWRIGHT HARNESS FOR EVERY TOOL.
//
// Every browser tool under tools/ used to carry the same launch block:
//
//   chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
//                     args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] })
//
// 160-odd copies of one path, which is why a second contributor on a machine
// where Chromium lives anywhere else could not run a single check. The path
// lives HERE, once, and `PW_CHROMIUM` overrides it:
//
//   PW_CHROMIUM=/Applications/Chromium.app/Contents/MacOS/Chromium node tools/iconcheck.mjs
//
// The args are the SwiftShader software-GL setup every tool assumes (the
// game needs WebGL and a headless box has no GPU; note it runs the game ~20x
// slow, so the waits in each tool are calibrated to that). `launch(opts)`
// passes everything else straight through to chromium.launch; an `args` you
// hand it is APPENDED to the standard set rather than replacing it, so a tool
// wanting `--autoplay-policy=no-user-gesture-required` on top asks for just
// that one. `gl: false` drops the SwiftShader pair for a tool that never draws
// (icon checks, audio decoding) and wants only `--no-sandbox`.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

export const DEFAULT_CHROMIUM = '/opt/pw-browsers/chromium';
export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'];
export const PLAIN_ARGS = ['--no-sandbox'];

/** Where the browser binary is: `PW_CHROMIUM` if set, else the CI/container path. */
export function chromiumPath() {
  return process.env.PW_CHROMIUM ?? DEFAULT_CHROMIUM;
}

/**
 * chromium.launch with the shared executable + SwiftShader args.
 *   const browser = await launch();
 *   const browser = await launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
 *   const browser = await launch({ gl: false });   // no WebGL needed: '--no-sandbox' only
 * Any other playwright launch option (headless, timeout, …) passes through.
 */
export async function launch(opts = {}) {
  const { args = [], gl = true, executablePath = chromiumPath(), ...rest } = opts;
  if (!existsSync(executablePath)) {
    throw new Error(`[tools/lib/browser] no Chromium at ${executablePath} — `
      + 'set PW_CHROMIUM to your Chromium/Chrome binary');
  }
  return chromium.launch({ executablePath, args: [...(gl ? GL_ARGS : PLAIN_ARGS), ...args], ...rest });
}

export { chromium };

/**
 * DETERMINISM FOR A MEASUREMENT. The Animator seeds phase/time off
 * Math.random() on purpose and several signatures twitch off it, so the same
 * build probed twice disagrees (groundprobe's tritone flipped a clip across
 * its limit between two identical runs). This replaces Math.random with a
 * seeded xorshift BEFORE the page boots — seeding inside page.evaluate is too
 * late, the harness has already built and animated the body by then.
 *   await seedRandom(page);            // before page.goto
 */
export function seedRandom(page, seed = 0x2f6e2b1) {
  return page.addInitScript((s0) => {
    let s = s0 | 0;
    Math.random = () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 1e6) / 1e6;
    };
  }, seed);
}
