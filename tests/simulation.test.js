import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../server/simulation.js";
import { RELAYS, SPAWN, MONSTERS, supply } from "../shared/world.js";
function target(s, x, z, type = 2) {
  const m = {
    id: "test",
    type,
    x,
    z,
    yaw: Math.PI,
    hp: MONSTERS[type].hp,
    state: "idle",
    path: [],
    pathAt: 0,
    patrolAt: 0,
    alert: 0,
    hurt: 0,
    attack: 0,
  };
  s.monsters.set(m.id, m);
  return m;
}
test("dano, munição, cadência, morte e recarga", () => {
  const s = new Simulation(17),
    p = s.add("p", "P"),
    m = target(s, p.x, p.z - 2);
  s.shoot("p", { yaw: 0, pitch: 0 });
  assert.equal(p.ammo, 11);
  assert.ok(m.hp < 155);
  const hp = m.hp;
  s.shoot("p", { yaw: 0, pitch: 0 });
  assert.equal(m.hp, hp);
  for (let i = 0; i < 3; i++) {
    s.time += 0.3;
    s.shoot("p", { yaw: 0, pitch: 0 });
  }
  assert.equal(m.hp, 0);
  assert.equal(m.state, "dead");
  assert.equal(s.kills, 1);
  s.reload("p");
  const before = p.ammo;
  s.time += 0.3;
  s.shoot("p", { yaw: 0, pitch: 0 });
  assert.equal(p.ammo, before);
  for (let i = 0; i < 51; i++) s.update(1 / 30);
  assert.equal(p.ammo, 12);
  assert.equal(p.reserve, 56);
});
test("tiros bloqueados por paredes; validação de entradas", () => {
  const s = new Simulation(17),
    p = s.add("p", "P"),
    m = target(s, -2, p.z);
  s.shoot("p", { yaw: Math.PI / 2, pitch: 0 });
  assert.equal(m.hp, 155);
  p.hp = 0;
  s.time = 1;
  s.shoot("p", { yaw: 0, pitch: 0 });
  assert.equal(p.ammo, 11);
  s.input("p", { side: NaN, forward: Infinity, yaw: "bad", pitch: 2 });
  assert.equal(p.input.side, 0);
  assert.equal(p.input.forward, 0);
  assert.equal(p.input.pitch, 1.45);
});
test("ataque, morte, reanimação e reset preservando sessão", () => {
  const s = new Simulation(17),
    p = s.add("p", "P");
  s.add("q", "Q");
  const m = target(s, p.x, p.z - 0.8, 0);
  p.hp = 10;
  s.update(1 / 30);
  assert.equal(p.hp, 0);
  assert.equal(m.state, "attack");
  s.interact("q");
  assert.equal(p.hp, 55);
  p.token = "private";
  s.reset();
  assert.equal(s.players.get("p").hp, 100);
  assert.equal(s.players.get("p").token, "private");
  assert.equal(s.monsters.size, 0);
  assert.equal(s.snapshot().players[0].token, undefined);
});
test("suprimentos únicos e extração exige três relés", () => {
  const s = new Simulation(17),
    p = s.add("p", "P"),
    item = supply(0, 0, 17);
  p.x = item.x;
  p.z = item.z;
  p.hp = 40;
  p.reserve = 0;
  s.interact("p");
  assert.ok(s.used.has(item.id));
  const before = [p.hp, p.reserve];
  s.interact("p");
  assert.deepEqual([p.hp, p.reserve], before);
  for (const r of RELAYS) {
    p.x = r.x;
    p.z = r.z;
    s.interact("p");
  }
  assert.equal(s.relays.size, 3);
  assert.equal(s.won, false);
  Object.assign(p, SPAWN);
  s.interact("p");
  assert.equal(s.won, false);
  assert.equal(s.transition.to, 1);
});
test("IA escuta e gera três tipos", () => {
  const s = new Simulation(17),
    p = s.add("p", "P"),
    m = target(s, p.x + 5, p.z);
  p.noise = 2;
  s.update(0.03);
  assert.equal(m.target, "p");
  assert.equal(m.state, "chase");
  s.monsters.clear();
  for (let i = 0; i < 100 && s.nextId < 3; i++) {
    s.time = i;
    s.spawn();
  }
  assert.equal(s.nextId, 3);
  assert.deepEqual(
    new Set([...s.monsters.values()].map((m) => m.type)),
    new Set([0, 1, 2]),
  );
});
test("patrulha escolhe destinos acessíveis sem recalcular a cada frame", () => {
  const s = new Simulation(15);
  s.spawnClock = Infinity;
  const m = target(s, 8, 8, 0);
  s.monsters.delete(m.id);
  m.id = "m0";
  s.monsters.set(m.id, m);
  let calls = 0;
  const path = s.world.path.bind(s.world);
  s.world.path = (...args) => { calls++; return path(...args); };
  for (let i = 0; i < 300; i++) s.update(1 / 30);
  assert.ok(calls < 60, `${calls} buscas em dez segundos de patrulha`);
  assert.ok(Math.hypot(m.x - 8, m.z - 8) > 1, "Entidade deve sair do lugar");
});
