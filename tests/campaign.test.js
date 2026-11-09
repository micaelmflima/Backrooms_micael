import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../server/simulation.js";
import { World, RELAYS, SPAWN, EYE } from "../shared/world.js";
import { LEVELS, levelSeed, exitReady } from "../shared/levels.js";
import { defaultMuzzle, cameraPosition } from "../shared/weapon.js";
import { DEFAULT_PLAYER_COLOR } from "../shared/config.js";

test("campanha tem quatro mapas alcançáveis e dificuldade crescente", () => {
  for (let level = 0; level < 4; level++) for (const seed of [17, 92, 1091]) {
    const w = new World(levelSeed(seed, level), level);
    for (const r of RELAYS) {
      assert.equal(w.blocked(r.x, r.z), false);
      assert.ok(w.path(SPAWN, r, 4000).length > 0);
    }
    if (level) {
      assert.ok(LEVELS[level].speed > LEVELS[level - 1].speed);
      assert.ok(LEVELS[level].maximum > LEVELS[level - 1].maximum);
    }
  }
});
test("porta exige objetivos, transição preserva identidade e inventário", () => {
  const s = new Simulation(17); let p = s.add("p", "P", "#2365ab");
  p.token = "privado"; p.socket = "socket"; p.ammo = 7; p.reserve = 20;
  for (let level = 0; level < 4; level++) {
    assert.equal(s.level, level);
    s.interact("p"); assert.equal(s.won, false); assert.equal(s.transition, null);
    for (const r of RELAYS) { Object.assign(p, { x: r.x, z: r.z }); s.interact("p"); }
    Object.assign(p, SPAWN);
    if (level === 3) {
      s.levelElapsed = 59; s.interact("p"); assert.equal(s.won, false);
      assert.equal(exitReady(s.snapshot()), false); s.levelElapsed = 60;
    }
    assert.equal(exitReady(s.snapshot()), true); s.interact("p");
    if (level < 3) {
      assert.equal(s.transition.to, level + 1);
      s.shoot("p", { yaw: 0, pitch: 0 }); assert.equal(p.ammo, 7);
      for (let i = 0; i < 108; i++) s.update(1 / 30);
      assert.equal(s.level, level, "A transição aguarda confirmação do host");
      s.continueLevel();
      p = s.players.get("p");
      assert.equal(p.token, "privado"); assert.equal(p.socket, "socket");
      assert.equal(p.color, "#2365ab"); assert.equal(p.ammo, 7);
      assert.equal(s.relays.size, 0);
    }
  }
  assert.equal(s.won, true); s.reset();
  assert.equal(s.level, 0); assert.equal(s.players.get("p").ammo, 12);
  assert.equal(s.players.get("p").color, "#2365ab"); assert.equal(s.won, false);
});
test("cor validada; origem da arma é limitada e fica distinta da câmera", () => {
  const events = [], s = new Simulation(17, (type, data) => events.push([type, data]));
  const p = s.add("p", "P", "invalid"); assert.equal(p.color, DEFAULT_PLAYER_COLOR);
  const muzzle = defaultMuzzle(p);
  assert.notEqual(muzzle.x, p.x); assert.ok(muzzle.z < p.z); assert.ok(muzzle.y < EYE);
  s.shoot("p", { yaw: 0, pitch: 0, origin: { x: 1000, y: 1000, z: 1000 } }); assert.equal(p.ammo, 12);
  s.shoot("p", { yaw: 0, pitch: 0, origin: muzzle, shotId: 8 });
  assert.equal(p.ammo, 11); const shot = events.find((e) => e[1].type === "shot")[1];
  assert.deepEqual(shot.origin, muzzle); assert.equal(shot.shotId, 8); assert.ok(shot.point.z < p.z);
});
test("câmera terceira pessoa não atravessa paredes nem teto", () => {
  const s = new Simulation(17), p = s.add("p", "P");
  p.z = 15.7; p.pitch = -0.9;
  const c = cameraPosition(p, true, s.world);
  assert.ok(c.y < 3.05); assert.equal(s.world.blocked(c.x, c.z, 0.01), false);
});
