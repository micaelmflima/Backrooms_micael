// Fixtures locais tornam combate e extração reproduzíveis sem esperar spawns.
// Nenhuma API de depuração é adicionada ao servidor entregue.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { startServer } from "../server/index.js";
import { MONSTERS, RELAYS, SPAWN, EYE } from "../shared/world.js";

const server = await startServer({ port: 0, host: "127.0.0.1" });
let browser;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw Error("Estado de combate não chegou.");
    await sleep(50);
  }
}
try {
  browser = await chromium.launch({ headless: true, args: [
    "--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
  ] });
  const page = await browser.newPage({ viewport: { width: 700, height: 460 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}`);
  // Verifique a origem visual real, sem adicionar comandos de depuração ao jogo.
  await page.evaluate(async () => {
    const { Weapon } = await import("/js/actors.js"), { ShotEffects } = await import("/js/shot-effects.js");
    const muzzle = Weapon.prototype.getMuzzleWorld, fire = ShotEffects.prototype.fire;
    window.shotEvidence = { count: 0, maximumError: 0, lastMuzzle: null };
    Weapon.prototype.getMuzzleWorld = function(...args) {
      const p = muzzle.apply(this, args); window.shotEvidence.lastMuzzle = { x: p.x, y: p.y, z: p.z }; return p;
    };
    ShotEffects.prototype.fire = function(key, origin, ...args) {
      const e = window.shotEvidence, p = e.lastMuzzle;
      if (p) { e.count++; e.maximumError = Math.max(e.maximumError, Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z)); }
      return fire.call(this, key, origin, ...args);
    };
  });
  await page.locator("#seed").fill("review-combat");
  await page.locator("#connect").click();
  await page.locator("#hud").waitFor({ state: "visible" });
  const room = server.rooms.get(await page.locator("#code").textContent());
  const sim = room.sim, player = sim.players.get(room.host);
  sim.spawnClock = Infinity;
  // Para inspecionar os rigs, congele apenas a IA nesta cena de teste.
  const update = sim.updateMonsters.bind(sim);
  sim.updateMonsters = () => {}; // Só IA: tiros confirmados continuam vendo os colliders.
  Object.assign(player, { x: 8, z: 13, yaw: 0, pitch: 0, input: {} });
  for (let type = 0; type < 3; type++) {
    const id = `m${type}`;
    sim.monsters.set(id, {
      id, type, x: 5 + type * 3, z: 7.5, yaw: 0,
      hp: MONSTERS[type].hp, state: "idle", path: [], pathAt: 0,
      patrolAt: 0, alert: 0, hurt: 0, attack: 0,
    });
  }
  if (!(await page.evaluate(() => !!document.pointerLockElement)))
    await page.locator("#resume").click();
  await page.waitForTimeout(2000);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/monsters-high.png" });
  assert.equal(await page.locator("#quality").inputValue(), "high");
  // Mira via eventos de mouse; o disparo percorre cliente, socket e raycast.
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) document.dispatchEvent(new MouseEvent("mousemove"));
  });
  for (let type = 0; type < 3; type++) {
    const monster = sim.monsters.get(`m${type}`);
    const dx = monster.x - player.x, dz = monster.z - player.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(MONSTERS[type].height * 0.6 - EYE, Math.hypot(dx, dz));
    await page.evaluate(({ dx, dy }) => {
      const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 100));
      for (let i = 0; i < count; i++) document.dispatchEvent(new MouseEvent("mousemove", {
        movementX: dx / count, movementY: dy / count,
      }));
    }, { dx: (player.yaw - yaw) / 0.0018, dy: (player.pitch - pitch) / 0.0018 });
    await until(() => Math.abs(player.yaw - yaw) < 0.02 && Math.abs(player.pitch - pitch) < 0.02);
    while (monster.hp > 0) {
      const hp = monster.hp;
      if (!player.ammo) {
        await page.keyboard.press("r");
        await until(() => player.ammo === 12);
      }
      await page.mouse.down(); await page.mouse.up();
      try { await until(() => monster.hp < hp); }
      catch (error) {
        console.error({ type, hp, remaining: monster.hp, ammo: player.ammo,
          yaw: player.yaw, pitch: player.pitch, x: player.x, z: player.z,
          locked: await page.evaluate(() => !!document.pointerLockElement),
          clientAmmo: await page.locator("#ammo").textContent() });
        throw error;
      }
      await page.waitForTimeout(650);
    }
    assert.equal(monster.state, "dead");
  }
  assert.equal(sim.kills, 3);
  const evidence = await page.evaluate(() => window.shotEvidence);
  assert.ok(evidence.count >= 3, "Projéteis devem ser adicionados à cena");
  assert.ok(evidence.maximumError < 0.000001, "O tracer deve começar na ponta física do cano");
  await page.screenshot({ path: "test-results/combat.png" });
  // Reative IA real e confira um ataque chegando até o HUD.
  sim.updateMonsters = update;
  sim.monsters.clear();
  sim.monsters.set("m9", {
    id: "m9", type: 0, x: player.x, z: player.z - 1,
    yaw: 0, hp: 110, state: "idle", path: [], pathAt: 0,
    patrolAt: 0, alert: 0, hurt: 0, attack: 0,
  });
  await until(() => player.hp < 100);
  await page.waitForFunction(() => Number(document.getElementById("health-text").textContent) < 100);
  sim.monsters.clear();
  // A campanha completa é exercitada em campaign-browser; aqui valide a porta
  // do último nível e a vitória após o combate em qualidade Alta.
  sim.loadLevel(3); sim.spawnClock = Infinity;
  await page.locator("#pause").waitFor({ state: "visible" });
  await page.locator("#resume").click();
  for (const relay of RELAYS) {
    Object.assign(sim.players.get(room.host), { x: relay.x, z: relay.z });
    await page.waitForTimeout(700); await page.keyboard.press("e");
    await until(() => sim.relays.has(relay.id));
  }
  sim.levelElapsed = 60;
  Object.assign(sim.players.get(room.host), SPAWN);
  await page.waitForTimeout(700); await page.keyboard.press("e");
  await page.locator("#end").waitFor({ state: "visible" });
  assert.equal(await page.locator("#end-title").textContent(), "Você encontrou a saída.");
  assert.equal(await page.evaluate(() => document.pointerLockElement), null);
  await page.screenshot({ path: "test-results/victory.png" });
  assert.deepEqual(errors, []);
  console.log("PASS: qualidade Alta, três rigs, origem no cano, mira, dano/morte dos três tipos, ataque no HUD e vitória.");
} catch (error) {
  console.error("ERROS DO NAVEGADOR", errors);
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
