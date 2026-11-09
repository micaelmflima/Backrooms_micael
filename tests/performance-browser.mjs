// Caminhada real pelo corredor central e travessia de fronteiras de chunks.
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const root = path.resolve(process.env.ECHO_BASELINE || ".");
const { startServer } = await import(pathToFileURL(path.join(root, "server/index.js")));
const server = await startServer({ port: 0, host: "127.0.0.1" }); let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  await page.addInitScript(() => localStorage.setItem("echo-quality", "low"));
  await page.route("**/api/info", (route) => route.fulfill({ json: { port: server.port, addresses: [] } }));
  await page.goto("http://127.0.0.1:" + server.port);
  await page.locator("#seed").fill("echo-performance"); await page.locator("#connect").click();
  await page.locator("#hud").waitFor({ state: "visible" });
  const sim = server.rooms.get(await page.locator("#code").textContent()).sim;
  sim.spawnClock = Infinity; const player = [...sim.players.values()][0];
  Object.assign(player, { x: 8, z: 17.6 });
  if (!(await page.evaluate(() => !!document.pointerLockElement))) await page.locator("#resume").click();
  await page.waitForTimeout(3500);
  await page.evaluate(async () => {
    const { WorldView } = await import("/js/world-view.js"), original = WorldView.prototype.build;
    window.chunkBenchmark = { correctionsStart: window.echoDiagnostics().motion.corrections, frame: 0, frames: [], builds: [], drawCalls: [], currentCalls: 0, maxBuildsPerFrame: 0, counts: {}, started: performance.now() };
    // Conte chamadas reais de desenho, inclusive as instanciadas. O renderer
    // Three.js instala render() na instância, não no protótipo da classe.
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function(...args) {
        window.chunkBenchmark.currentCalls++; return original.apply(this, args);
      };
    }
    WorldView.prototype.build = function(...args) {
      const b = window.chunkBenchmark, t = performance.now(); const result = original.apply(this, args);
      b.builds.push(performance.now() - t); b.counts[b.frame] = (b.counts[b.frame] || 0) + 1;
      b.maxBuildsPerFrame = Math.max(b.maxBuildsPerFrame, b.counts[b.frame]); return result;
    };
    let last = performance.now(), lastCameraTime = performance.now(), previousCamera = null; window.chunkBenchmark.motionFrames = [];
    function sample(t) { const b = window.chunkBenchmark; b.frame++; b.frames.push(t - last); const diag = window.echoDiagnostics?.(), sampleTime = performance.now(); if (diag?.camera) { if (previousCamera) b.motionFrames.push({ ms: diag.cameraTime - previousCamera.time, wallMs: sampleTime - lastCameraTime, dx: diag.camera.x - previousCamera.x, dz: diag.camera.z - previousCamera.z }); previousCamera = { ...diag.camera, time: diag.cameraTime }; lastCameraTime = sampleTime; } if (b.currentCalls) b.drawCalls.push(b.currentCalls); b.currentCalls = 0; last = t; if (!b.done) requestAnimationFrame(sample); }
    requestAnimationFrame(sample);
  });
  await page.keyboard.down("d"); await page.keyboard.down("ShiftLeft");
  await page.waitForTimeout(10500); await page.keyboard.up("d"); await page.keyboard.up("ShiftLeft");
  const result = await page.evaluate(() => {
    const b = window.chunkBenchmark; b.done = true; const frames = b.frames.slice(2).sort((a,b) => a-b), calls = b.drawCalls.slice(2).sort((a,b) => a-b);
    return { mode: "WebGL por software, 480x320, qualidade Leve", frames: frames.length,
      medianFrameMs: frames[Math.floor(frames.length/2)], p95FrameMs: frames[Math.floor(frames.length*0.95)],
      medianDrawCalls: calls[Math.floor(calls.length / 2)],
      correctionsStart: b.correctionsStart, motionFrames: b.motionFrames, terrainBuilds: b.builds.length, maxBuildsPerFrame: b.maxBuildsPerFrame,
      maxBuildMs: Math.max(0, ...b.builds), diagnostics: window.echoDiagnostics?.() || null };
  });
  result.distance = player.x - 8; assert.ok(result.distance > 35, "Deve cruzar a fronteira durante caminhada");
  if (!process.env.ECHO_BASELINE) {
    assert.ok(result.maxBuildsPerFrame <= 1);
    assert.ok(result.diagnostics.chunks <= 16); assert.ok(result.diagnostics.pointLights <= 4);
    assert.equal(result.diagnostics.projectileCapacity, 24);
    assert.ok(result.diagnostics.workerChunks > 0, "Worker carregou grades antecipadamente");
    assert.equal(result.diagnostics.motion.corrections, result.correctionsStart, "Previsão/autoridade não divergem ao cruzar chunks após a fixture inicial");
    const jumps = result.motionFrames.filter((f) => Math.hypot(f.dx, f.dz) > 5.7 * f.ms / 1000 + 0.24);
    if (jumps.length) console.error("CAMERA JUMPS",jumps);
    assert.equal(jumps.length, 0, "Câmera percorre a fronteira continuamente, respeitando tempo/velocidade");
  }
  await mkdir("test-results", { recursive: true });
  const name = process.env.ECHO_BASELINE ? "performance-before" : "performance-after";
  await writeFile("test-results/" + name + ".json", JSON.stringify(result, null, 2));
  console.log(name, JSON.stringify(result));
} finally { await browser?.close(); await server.close(); }
