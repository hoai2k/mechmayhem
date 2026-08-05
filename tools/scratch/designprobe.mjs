import { chromium } from 'playwright-core';
const url = process.argv[2];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__world, null, { timeout: 60000 });
await page.waitForTimeout(4000);
const stats = await page.evaluate(() => {
  const w = window.__world, a = w.arena;
  let meshes = 0, tris = 0;
  a.propGroup.updateWorldMatrix(true, true);
  w.engine.scene.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; if (g?.index) tris += g.index.count / 3; else if (g?.attributes?.position) tris += g.attributes.position.count / 3; } });
  return {
    props: a.propGroup.children.length,
    propBodies: a.propBodies.length,
    sceneMeshes: meshes, tris: Math.round(tris),
    chunks: a.destructo.count,
    lanes: a.terrain.lanes.length, patches: a.terrain.patches.length,
    draws: w.engine.renderer.info.render.calls,
  };
});
console.log(JSON.stringify(stats));
await browser.close();
