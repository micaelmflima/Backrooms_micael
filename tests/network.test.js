import { test } from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { startServer } from "../server/index.js";
import { RELAYS, SPAWN } from "../shared/world.js";
const connect = (url) =>
    new Promise((res, rej) => {
      const s = io(url, { forceNew: true, reconnection: false });
      s.once("connect", () => res(s));
      s.once("connect_error", rej);
    }),
  enter = (s, d) => new Promise((r) => s.emit("enter", d, r)),
  next = (s, e) => new Promise((r) => s.once(e, r));
test(
  "dois jogadores, sala cheia, segredos, movimentos, tiros, reconexão e autoridade",
  { timeout: 10000 },
  async () => {
    const server = await startServer({ port: 0, host: "127.0.0.1" }),
      url = `http://127.0.0.1:${server.port}`,
      sockets = [];
    try {
      assert.equal(
        (await fetch(url + "/health").then((r) => r.json())).ok,
        true,
      );
      const a = await connect(url),
        b = await connect(url),
        c = await connect(url);
      sockets.push(a, b, c);
      const h = await enter(a, { mode: "host", name: "Host", seed: "test" }),
        j = await enter(b, { mode: "join", name: "Cliente", code: h.code });
      assert.equal(h.id, h.host);
      assert.equal(j.seed, h.seed);
      assert.equal(j.snapshot.players.length, 2);
      assert.match((await enter(c, { code: h.code })).error, /cheia/);
      for (const p of j.snapshot.players) {
        assert.equal(p.token, undefined);
        assert.equal(p.socket, undefined);
      }
      const room = server.rooms.get(h.code),
        before = room.sim.players.get(h.id).z;
      a.emit("input", { forward: 1, side: 0, yaw: 0, pitch: 0, seq: 1 });
      await next(b, "snapshot");
      await next(b, "snapshot");
      assert.ok(room.sim.players.get(h.id).z < before);
      const shot = next(b, "effect");
      a.emit("shoot", { yaw: 0, pitch: 0 });
      assert.equal((await shot).type, "shot");
      b.emit("restart");
      await next(b, "snapshot");
      assert.equal(room.sim.players.get(h.id).ammo, 11);
      b.disconnect();
      await next(a, "snapshot");
      const d = await connect(url);
      sockets.push(d);
      const resumed = await enter(d, { code: h.code, token: j.token });
      assert.equal(resumed.id, j.id);
      const reset = next(d, "reset");
      a.emit("restart");
      assert.equal((await reset).players.find((p) => p.id === h.id).ammo, 12);
      const closed = next(d, "closed");
      a.emit("leave");
      assert.match(await closed, /encerrou/);
    } finally {
      for (const s of sockets) s.disconnect();
      await server.close();
    }
  },
);
test("host desconectado pausa também tiros, recarga e interações", async () => {
  const server = await startServer({ port: 0, host: "127.0.0.1" });
  const sockets = [];
  try {
    const url = `http://127.0.0.1:${server.port}`;
    const a = await connect(url), b = await connect(url);
    sockets.push(a, b);
    const h = await enter(a, { mode: "host" });
    const j = await enter(b, { code: h.code });
    const room = server.rooms.get(h.code), guest = room.sim.players.get(j.id);
    a.disconnect();
    while (room.sim.players.get(h.id).connected) await next(b, "snapshot");
    Object.assign(guest, { x: RELAYS[0].x, z: RELAYS[0].z, ammo: 10 });
    const time = room.sim.time;
    b.emit("shoot", { yaw: 0, pitch: 0 });
    b.emit("reload");
    b.emit("interact");
    await new Promise((resolve) => b.emit("echo", resolve));
    assert.equal(guest.ammo, 10, "Tiro não deve consumir munição na pausa");
    assert.equal(guest.reload, 0);
    assert.equal(room.sim.relays.size, 0);
    assert.equal(room.sim.time, time);
    const c = await connect(url); sockets.push(c);
    await enter(c, { code: h.code, token: h.token });
    b.emit("interact");
    await new Promise((resolve) => b.emit("echo", resolve));
    assert.equal(room.sim.relays.size, 1, "Interação volta após reconexão");
  } finally {
    for (const s of sockets) s.disconnect();
    await server.close();
  }
});

test("conclusão chega aos dois jogadores; só o host pode trocar o nível", { timeout: 10000 }, async () => {
  const server = await startServer({ port: 0, host: "127.0.0.1" }), sockets = [];
  try {
    const url = `http://127.0.0.1:${server.port}`, a = await connect(url), b = await connect(url);
    sockets.push(a, b);
    const h = await enter(a, { mode: "host", color: "#287ccc" });
    const j = await enter(b, { code: h.code, color: "#d95948" });
    const sim = server.rooms.get(h.code).sim;
    sim.spawnClock = Infinity; sim.relays = new Set(RELAYS.map((r) => r.id));
    Object.assign(sim.players.get(h.id), SPAWN, { ammo: 7 });
    const doneA = next(a, "stage-complete"), doneB = next(b, "stage-complete");
    a.emit("interact");
    const [da, db] = await Promise.all([doneA, doneB]);
    assert.deepEqual(da.transition, { from: 0, to: 1 });
    assert.deepEqual(db.transition, da.transition);
    b.emit("next-level"); await new Promise((r) => b.emit("echo", r));
    assert.equal(sim.level, 0, "O cliente não deve avançar a sala sozinho");
    const startA = next(a, "stage-start"), startB = next(b, "stage-start");
    a.emit("next-level");
    const [sa, sb] = await Promise.all([startA, startB]);
    assert.equal(sa.level, 1); assert.equal(sb.mapSeed, sa.mapSeed);
    assert.equal(sa.players.find((p) => p.id === h.id).ammo, 7);
    assert.equal(sb.players.find((p) => p.id === j.id).color, "#d95948");
    assert.equal(sa.transition, null); assert.equal(sa.relays.length, 0);
  } finally { for (const s of sockets) s.disconnect(); await server.close(); }
});
