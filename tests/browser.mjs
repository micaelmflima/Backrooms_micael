import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { startServer } from "../server/index.js";
const server = await startServer({ port: 0, host: "127.0.0.1" }),
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  }),
  errors = [];
let room;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, timeout = 8000) {
  const t = Date.now();
  while (!check()) {
    if (Date.now() - t > timeout) throw Error("Estado não chegou ao servidor.");
    await sleep(50);
  }
}
await mkdir("test-results", { recursive: true });
try {
  const ctx = await browser.newContext({
    viewport: { width: 1000, height: 650 },
  });
  await ctx.addInitScript(() => localStorage.setItem("echo-quality", "low"));
  const a = await ctx.newPage(),
    capture = (p) => {
      p.on("pageerror", (e) => errors.push(e.message));
      p.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
    };
  capture(a);
  const url = `http://127.0.0.1:${server.port}`;
  await a.goto(url);
  await a.waitForTimeout(1500);
  await a.screenshot({ path: "test-results/lobby.png" });
  await a.locator("#name").fill("Host QA");
  await a.locator("#seed").fill("echo-qa");
  await a.locator("#connect").click();
  await a.locator("#hud").waitFor({ state: "visible" });
  const code = await a.locator("#code").textContent();
  room = server.rooms.get(code);
  room.sim.spawnClock = 1e6;
  const b = await ctx.newPage();
  capture(b);
  await b.goto(url);
  await b.locator("#join-tab").click();
  await b.locator("#name").fill("Cliente QA");
  await b.locator("#room").fill(code);
  await b.locator("#connect").click();
  await b.locator("#hud").waitFor({ state: "visible" });
  assert.equal(room.sim.players.size, 2);
  await b.waitForFunction(
    () => document.getElementById("teammate").textContent.includes("Host QA"),
    {},
    { timeout: 20000 },
  );
  await a.bringToFront();
  await a.evaluate(() => document.exitPointerLock());
  await a.locator("#pause").waitFor({ state: "visible" });
  await a.locator("#resume").click();
  await a.locator("#pause").waitFor({ state: "hidden" });
  assert.equal(await a.evaluate(() => document.pointerLockElement?.id), "game");
  const host = room.sim.players.get(room.host),
    start = { x: host.x, z: host.z };
  await a.keyboard.down("w");
  await until(() => Math.hypot(host.x - start.x, host.z - start.z) > 0.3);
  await a.keyboard.up("w");
  const ammo = host.ammo;
  await a.mouse.down();
  await a.mouse.up();
  await until(() => host.ammo === ammo - 1);
  await a.keyboard.press("r");
  await until(() => host.ammo === 12);
  assert.equal(host.reserve, 59);
  assert.ok(Math.abs(host.pitch) < 0.1, 'A câmera não deve saltar ao capturar o mouse.');
  await a.keyboard.down("Space");
  await until(() => host.y > 0);
  await a.keyboard.up("Space");
  await until(() => host.y === 0);
  await a.screenshot({ path: "test-results/gameplay.png" });
  const guest = [...room.sim.players.values()].find((p) => p.id !== room.host),
    gid = guest.id,
    oldSocket = guest.socket;
  server.io.sockets.sockets.get(guest.socket).conn.close();
  await until(
    () =>
      room.sim.players.get(gid).connected &&
      room.sim.players.get(gid).socket !== oldSocket,
  );
  await b.reload();
  await b.locator("#hud").waitFor({ state: "visible" });
  assert.equal(room.sim.players.size, 2);
  // O host reinicia enquanto o outro jogador está com o mouse capturado.
  await b.bringToFront();
  if (!(await b.evaluate(() => !!document.pointerLockElement)))
    await b.locator("#resume").click();
  await b.waitForFunction(() => document.pointerLockElement?.id === "game");
  await b.keyboard.down("w");
  await a.evaluate(() => document.getElementById("restart-pause").click());
  await b.locator("#pause").waitFor({ state: "visible" });
  await b.waitForFunction(() => document.pointerLockElement === null, null, { timeout: 3000 });
  await b.keyboard.up("w");
  await b.waitForTimeout(250);
  assert.equal(room.sim.players.get(gid).moving, false, "Menu deve interromper movimento");
  await b.locator("#resume").click();
  await b.locator("#pause").waitFor({ state: "hidden" });
  room.sim.players.get(room.host).hp = 0;
  await a.bringToFront();
  await a.locator("#end").waitFor({ state: "visible" });
  await a.locator("#restart").click();
  await a.locator("#end").waitFor({ state: "hidden" });
  assert.equal(room.sim.players.get(room.host).hp, 100);
  await a.locator("#leave").click();
  await a.locator("#lobby").waitFor({ state: "visible" });
  await b.locator("#lobby").waitFor({ state: "visible" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: WebGL, 2 jogadores, movimento, tiro, recarga, pulo, reconexão, F5, morte e reinício.",
  );
} catch (e) {
  console.error("BROWSER ERRORS", errors);
  for (const [i, p] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await p
      .screenshot({ path: `test-results/failure-${i}.png` })
      .catch(() => {});
  throw e;
} finally {
  await browser.close();
  await server.close();
}
