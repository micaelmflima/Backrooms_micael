import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { startServer } from "../server/index.js";
import { RELAYS, SPAWN, MONSTERS } from "../shared/world.js";
const server = await startServer({ port: 0, host: "127.0.0.1" });
let browser, simForDebug; const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, timeout = 20000) { const t = Date.now(); while (!check()) { if (Date.now() - t > timeout) throw Error("Estado da campanha não chegou"); await sleep(40); } }
async function resume(page) { await page.bringToFront(); if (!(await page.evaluate(() => !!document.pointerLockElement))) { await page.locator("#pause").waitFor({ state: "visible" }); await page.locator("#resume").click(); } await page.waitForFunction(() => !!document.pointerLockElement); }
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--disable-renderer-backgrounding"] });
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  await context.addInitScript(() => localStorage.setItem("echo-quality", "low"));
  const a = await context.newPage(), b = await context.newPage();
  for (const page of [a, b]) { page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); }
  const url = "http://127.0.0.1:" + server.port;
  await a.goto(url); await a.locator("#name").fill("Azul QA");
  await a.evaluate(() => document.getElementById("player-color").value = "#287ccc");
  await a.locator("#connect").click(); await a.locator("#hud").waitFor({ state: "visible" });
  const code = await a.locator("#code").textContent(), room = server.rooms.get(code), sim = room.sim;
  simForDebug = sim; sim.spawnClock = Infinity;
  await b.goto(url); await b.locator("#join-tab").click(); await b.locator("#name").fill("Coral QA");
  await b.locator("#room").fill(code); await b.locator("#connect").click(); await b.locator("#hud").waitFor({ state: "visible" });
  const hostId = room.host, guestId = [...sim.players.keys()].find((id) => id !== hostId);
  assert.equal(sim.players.get(hostId).color, "#287ccc");
  await resume(b); await b.waitForTimeout(300);
  await b.evaluate(() => { for (let i = 0; i < 3; i++) document.dispatchEvent(new MouseEvent("mousemove")); for (let i = 0; i < 20; i++) document.dispatchEvent(new MouseEvent("mousemove", { movementX: -Math.PI / 0.0018 / 20 })); });
  await b.keyboard.press("Escape");
  Object.assign(sim.players.get(hostId), { x: 8, z: 13 });
  Object.assign(sim.players.get(guestId), { x: 11.8, z: 9 });
  await resume(a); await a.keyboard.press("v");
  await a.waitForFunction(() => window.echoDiagnostics().thirdPerson);
  await mkdir("test-results", { recursive: true });
  await a.waitForTimeout(1300); await a.screenshot({ path: "test-results/explorers.png" });
  // Rigs são inspecionados nesta cena; a iluminação Alta é coberta por combat-browser.
  const update = sim.updateMonsters.bind(sim); sim.updateMonsters = () => {};
  for (let type = 0; type < 3; type++) sim.monsters.set("m" + type, { id: "m" + type, type, x: 5 + type * 3, z: 6, yaw: 0, hp: MONSTERS[type].hp, state: "idle", path: [], pathAt: 0, patrolAt: 0, alert: 0, hurt: 0, attack: 0 });
  await a.waitForTimeout(1200); await a.screenshot({ path: "test-results/creatures-upgraded.png" });
  sim.updateMonsters = update; sim.monsters.clear();
  for (let level = 0; level < 4; level++) {
    assert.equal(sim.level, level); sim.spawnClock = Infinity;
    await resume(a);
    await a.waitForFunction((l) => window.echoDiagnostics().level === l, level);
    await b.waitForFunction((l) => window.echoDiagnostics().level === l, level);
    assert.match(await a.locator("#relay-marks").textContent(), /0\/3/);
    await a.waitForTimeout(1100); await a.screenshot({ path: "test-results/level-" + level + ".png" });
    let host = sim.players.get(hostId);
    Object.assign(host, SPAWN); await a.waitForTimeout(700); await a.keyboard.press("e");
    assert.equal(sim.transition, null); assert.equal(sim.won, false);
    for (const r of RELAYS) { Object.assign(host, { x: r.x, z: r.z }); await a.waitForTimeout(700); await a.keyboard.press("e"); await until(() => sim.relays.has(r.id)); }
    await a.waitForFunction(() => document.getElementById("relay-marks").textContent.includes("3/3"));
    Object.assign(host, SPAWN); await a.waitForTimeout(700);
    if (level === 3) { sim.levelElapsed = 59; await a.keyboard.press("e"); assert.equal(sim.won, false); sim.levelElapsed = 60; }
    await a.keyboard.press("e");
    if (level < 3) {
      await a.locator("#transition").waitFor({ state: "visible" });
      await b.locator("#transition").waitFor({ state: "visible" });
      assert.equal(await a.evaluate(() => document.pointerLockElement), null);
      await a.locator("#advance-level").click();
      await until(() => sim.level === level + 1); sim.spawnClock = Infinity;
      await a.locator("#transition").waitFor({ state: "hidden" });
      await b.locator("#transition").waitFor({ state: "hidden" });
      assert.equal(sim.players.get(hostId).color, "#287ccc"); assert.equal(sim.players.size, 2);
    }
  }
  await a.locator("#end").waitFor({ state: "visible" }); await b.locator("#end").waitFor({ state: "visible" });
  assert.equal(sim.won, true);
  await a.screenshot({ path: "test-results/campaign-victory.png" });
  await a.locator("#restart").click(); await until(() => sim.level === 0 && !sim.won);
  await a.locator("#end").waitFor({ state: "hidden" });
  await a.waitForFunction(() => document.getElementById("level-label").textContent === "LEVEL 00");
  assert.deepEqual(errors, []);
  console.log("PASS: cápsula/cores, câmera V, três rigs, 4 níveis sincronizados, portas, sobrevivência, vitória e reinício.");
} catch (e) {
  console.error("ERROS", errors, "SIM", simForDebug && { level:simForDebug.level, transition:simForDebug.transition, relays:[...simForDebug.relays], players:[...simForDebug.players.values()].map(({x,z,hp,connected})=>({x,z,hp,connected})) });
  for(const p of browser?.contexts().flatMap(c=>c.pages())||[]) console.error("UI",await p.evaluate(()=>({locked:!!document.pointerLockElement,pause:!document.getElementById("pause").hidden,transition:!document.getElementById("transition").hidden,objective:document.getElementById("objective-text").textContent,progress:document.getElementById("relay-marks").textContent,level:window.echoDiagnostics?.().level})));
  for (const [i, p] of (browser?.contexts().flatMap((c) => c.pages()) || []).entries()) await p.screenshot({ path: "test-results/campaign-failure-" + i + ".png" }).catch(() => {});
  throw e;
} finally { await browser?.close(); await server.close(); }
