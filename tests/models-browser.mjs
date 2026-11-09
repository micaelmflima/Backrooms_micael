import { chromium } from "playwright";
import { startServer } from "../server/index.js";
import { CHARACTERS } from "../shared/characters.js";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = await startServer({ port: 0, host: "127.0.0.1" }); let browser; const errors = [], result = [];
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const context = await browser.newContext({ viewport: { width: 1000, height: 750 } });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("echo-quality", "low"));
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://127.0.0.1:" + server.port); await mkdir("test-results", { recursive: true });
  await page.locator("#choose-character").click();
  for (const config of CHARACTERS) {
    await page.locator('[data-character="' + config.id + '"]').click();
    await page.waitForFunction(() => !document.getElementById("character-confirm").disabled, null, { timeout: 45000 });
    await page.waitForTimeout(500);
    await page.locator("#character-preview").screenshot({ path: "test-results/model-" + config.id + ".png" });
    result.push(await page.evaluate(async (id) => {
      if (id === "capsule") return { id, preserved: true };
      const { prepareCharacter, instantiateCharacter } = await import("/js/model-assets.js"), T = await import("three"), { RigAnimation } = await import("/js/rig-animation.js");
      const template = await prepareCharacter(id), model = instantiateCharacter(template), animation = new RigAnimation(model), initial = new T.Box3().setFromObject(model, true);
      animation.update({ moving: false, hp: 100 }, 0, 0, true); model.updateMatrixWorld(true);
      const idle = new T.Box3().setFromObject(model, true), q = animation.roles.leftLeg?.bone.quaternion.clone();
      animation.update({ moving: true, sprinting: true, hp: 100, y: 0 }, 1 / 30, 0.13, true);
      const animate = q?.angleTo(animation.roles.leftLeg.bone.quaternion) || 0;
      animation.update({ hp: 100, y: 0.3 }, 1 / 30, 0.13, true);
      return { id, size: initial.getSize(new T.Vector3()).toArray(), idleMin: idle.min.toArray(), rig: template.userData.rig, roles: Object.keys(animation.roles), animationAngle: animate, clips: model.animations.length };
    }, config.id));
  }
  for (const model of result.slice(1)) { assert.ok(Math.abs(model.size[1] - 1.6) < 0.001); assert.ok(model.animationAngle > 0.01, model.id + " tem animação"); assert.ok(model.idleMin[1] > -0.2, model.id + " acima do chão"); }
  // Salvar/recarregar a escolha e iniciar com o FBX real, não um substituto.
  await page.locator("#character-confirm").click(); await page.reload();
  assert.ok((await page.locator("#selected-character").textContent()).includes("Agnes"));
  await page.locator("#connect").click(); await page.locator("#hud").waitFor({ state: "visible", timeout: 45000 });
  const sim = server.rooms.get(await page.locator("#code").textContent()).sim; sim.spawnClock = Infinity;
  assert.equal([...sim.players.values()][0].character, "agnes");
  await page.waitForFunction(() => window.echoDiagnostics().character === "agnes");
  if (!(await page.evaluate(() => !!document.pointerLockElement))) await page.locator("#resume").click();
  await page.keyboard.press("v"); await page.waitForFunction(() => window.echoDiagnostics().thirdPerson);
  // O segundo explorador usa um FBX diferente; ambos precisam ver a escolha.
  const guest = await page.context().newPage();
  guest.on("pageerror", e => errors.push(e.message)); guest.on("console", m => { if(m.type()==="error")errors.push(m.text()); });
  await guest.goto("http://127.0.0.1:"+server.port);
  await guest.locator("#choose-character").click(); await guest.locator('[data-character="metal-sonic"]').click();
  await guest.waitForFunction(() => !document.getElementById("character-confirm").disabled, null, {timeout:45000});
  await guest.locator("#character-confirm").click(); await guest.locator("#join-tab").click();
  await guest.locator("#room").fill(await page.locator("#code").textContent());
  await guest.locator("#connect").click(); await guest.locator("#hud").waitFor({state:"visible",timeout:45000});
  await guest.waitForFunction(() => window.echoDiagnostics().character === "metal-sonic");
  await guest.waitForFunction(() => window.echoDiagnostics().remoteCharacters.includes("agnes"),null,{timeout:45000});
  await page.bringToFront();
  await page.waitForFunction(() => window.echoDiagnostics().remoteCharacters.includes("metal-sonic"),null,{timeout:45000});
  const host = [...sim.players.values()][0], { supply } = await import("../shared/world.js");
  let kit; for(let x=-1;x<=1&&!kit;x++)for(let z=-1;z<=1;z++){const item=supply(x,z,sim.mapSeed);if(item.type==="med"){kit=item;break;}}
  assert.ok(kit); Object.assign(host,{x:kit.x,z:kit.z,hp:40});
  await page.waitForFunction(()=>Number(document.getElementById("health-text").textContent)===40);
  if (!(await page.evaluate(() => !!document.pointerLockElement))) await page.locator("#resume").click();
  await page.keyboard.press("e");
  for(let i=0;i<100&&!sim.used.has(kit.id);i++) await page.waitForTimeout(50);
  assert.ok(sim.used.has(kit.id)); assert.equal(host.hp,85,"Modelo novo mantém cura de 45 HP");
  await page.waitForFunction(()=>Number(document.getElementById("health-text").textContent)===85);
  await page.keyboard.press("v"); if(!await page.evaluate(()=>window.echoDiagnostics().thirdPerson))await page.keyboard.press("v");
  const previousAmmo=host.ammo; await page.mouse.down();await page.mouse.up();
  for(let i=0;i<100&&host.ammo===previousAmmo;i++)await page.waitForTimeout(50);
  assert.equal(host.ammo,previousAmmo-1,"Pistola do FBX funciona em terceira pessoa");
  await page.screenshot({path:"test-results/characters-multiplayer.png"});
  result.push({ multiplayer:true, healing:45, thirdPersonShot:true });
  const med = await page.evaluate(async () => {
    const { prepareMedkit, instantiateMedkit } = await import("/js/model-assets.js"), { WorldView } = await import("/js/world-view.js"), { World, supply } = await import("/shared/world.js"), T = await import("three");
    await prepareMedkit(); const scene = new T.Scene(), world = new World(17), view = new WorldView(scene, world, "low");
    view.chunkLoader.dispose(); const specs = [];
    for (let x = -2; x <= 2 && !specs.length; x++) for (let z = -2; z <= 2; z++) if (supply(x, z, 17).type === "med") { view.cx = x; view.cz = z; view.build(x, z); const chunk = view.chunks.get(x + "," + z); specs.push({ oldVisible: chunk.box.visible, medVisible: chunk.medkit.visible, origin: chunk.crate.position.y }); break; }
    const model = instantiateMedkit(), box = new T.Box3().setFromObject(model, true), materials = []; model.traverse((o) => { if (o.isMesh) materials.push({ map: !!o.material.map, normal: !!o.material.normalMap }); }); view.dispose();
    const after = instantiateMedkit(); return { size: box.getSize(new T.Vector3()).toArray(), min: box.min.toArray(), specs, materials, stillCached: !!after };
  });
  assert.ok(Math.max(...med.size) <= 0.681 && Math.max(...med.size) > 0.67); assert.ok(Math.abs(med.min[1] - 0.004) < 0.0001);
  assert.equal(med.specs[0].oldVisible, false); assert.equal(med.specs[0].medVisible, true); assert.equal(med.specs[0].origin, 0); assert.ok(med.materials.every((m) => m.map && m.normal));
  await writeFile("test-results/models-update.json", JSON.stringify({ characters: result, medkit: med, errors }, null, 2));
  assert.deepEqual(errors, []); console.log("PASS: 5 personagens, texturas, rig, escala, animação, escolha persistente, multiplayer, tiro em terceira pessoa e med kit GLB/45 HP.", JSON.stringify({ result, med }));
} catch (error) { console.error("MODEL ERRORS", errors); throw error; }
finally { await browser?.close(); await server.close(); }
