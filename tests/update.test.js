import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import * as T from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { Simulation } from "../server/simulation.js";
import { World, freshPlayer, stepPlayer } from "../shared/world.js";
import { LocalMotion } from "../client/js/local-motion.js";
import { CHARACTERS } from "../shared/characters.js";
import { compactSkeletons } from "../client/js/model-assets.js";

// Rede simulada com atraso/jitter: compare previsão e autoridade após replays.
test("movimento contínuo: comandos confirmados com jitter e fronteiras positivas/negativas", () => {
  const sim = new Simulation(17); sim.spawnClock = Infinity;
  const server = sim.add("host", "QA"), motion = new LocalMotion(new World(17));
  Object.assign(server, { x: 17.6, z: 17.6 }); motion.reset(server, 0);
  let now = 0; const packets = [], snapshots = [], pose = {}, errors = [];
  for (let tick = 1; tick <= 1200; tick++) {
    now = tick * 1000 / 30;
    const input = { yaw: 0, pitch: 0, side: tick < 300 ? 1 : -1, forward: 0, jump: tick === 20, sprint: tick < 240 };
    motion.advance(now + 0.0001, input);
    const packet = motion.packet(sim.revision); packets.push({ at: tick + 2 + tick % 3, packet });
    while (packets.length && packets[0].at <= tick) sim.input("host", packets.shift().packet);
    sim.update(1 / 30);
    if (tick % 2 === 0) snapshots.push({ at: tick + 3 + tick % 2, state: { ...server } });
    while (snapshots.length && snapshots[0].at <= tick) {
      const before = motion.render(now, {}); motion.reconcile(snapshots.shift().state, now); const after = motion.render(now, {});
      errors.push(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z));
    }
    motion.render(now, pose); assert.ok(!motion.world.blocked(pose.x, pose.z));
  }
  assert.ok(server.x < 0, "Cruza fronteira negativa");
  assert.ok(Math.max(...errors) < 1e-7, "Receber snapshot não teleporta a câmera");
  assert.ok(motion.stats.maximumError < 1e-7, "Passos iguais eliminam o erro de previsão");
  assert.ok(motion.history.length < 15, "Histórico confirmado é descartado");
});
test("velocidade não muda com FPS; um frame de 400ms não perde tempo", () => {
  const positions = [];
  for (const frames of [60, 144, 15]) {
    const motion = new LocalMotion(new World(17)), p = freshPlayer("p", "QA"); Object.assign(p, { x: 8, z: 17.6 }); motion.reset(p, 0);
    for (let frame = 1; frame <= frames * 4; frame++) motion.advance(frame * 1000 / frames + 1e-5, { side: 1, yaw: 0 });
    positions.push(motion.state.x);
  }
  assert.ok(Math.max(...positions) - Math.min(...positions) < 1e-8);
  const motion = new LocalMotion(new World(17)), p = freshPlayer("p", "QA"); motion.reset(p, 0);
  motion.advance(400.001, { side: 1, yaw: 0 }); assert.equal(motion.history.length, 12);
});
test("servidor limita comandos por tick, valida revisão e mantém escolha nos quatro níveis", () => {
  const sim = new Simulation(17), p = sim.add("p", "QA", "#dd3355", "agnes"); sim.spawnClock = Infinity;
  sim.input("p", { revision: sim.revision - 1, commands: [{ seq: 1, side: 1 }] }); assert.equal(p.commandMode, undefined);
  sim.input("p", { revision: sim.revision, commands: Array.from({ length: 30 }, (_, i) => ({ seq: i + 1, side: 1 })) });
  sim.update(1 / 30); assert.equal(p.seq, 1); assert.equal(p.inputQueue.length, 29);
  for (let level = 0; level < 4; level++) { sim.loadLevel(level); assert.equal(sim.players.get("p").character, "agnes"); }
  assert.equal(sim.add("q", "QA", "", "../../oops").character, "capsule");
});
test("timestamp antigo de rAF não duplica tempo já processado pelo timer/socket", () => {
  const motion = new LocalMotion(new World(17)); motion.reset(freshPlayer("p", "QA"), 0);
  for (let tick = 1; tick <= 300; tick++) {
    const now = tick * 1000 / 30 + 0.00001;
    motion.advance(now, { side: 1 }); motion.advance(now - 18, { side: 1 });
  }
  assert.equal(motion.sequence, 300);
});
test("FBX originais: consolidar ossos repetidos preserva a bind pose e cada vértice amostrado", () => {
  globalThis.window = { URL: globalThis.URL };
  const manager = new T.LoadingManager(); manager.addHandler(/.*/, { setPath() { return this; }, load() { return new T.Texture(); } });
  for (const config of CHARACTERS.filter((c) => c.model)) {
    const bytes = fs.readFileSync("." + config.model), root = new FBXLoader(manager).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ""); root.updateMatrixWorld(true);
    const meshes = []; root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    const samples = meshes.map((mesh) => {
      mesh.skeleton.update(); const points = [];
      for (let i = 0; i < mesh.geometry.attributes.position.count; i += 97) points.push([i, mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(mesh.matrixWorld)]);
      return points;
    });
    const before = new T.Box3().setFromObject(root, true), result = compactSkeletons(root), after = new T.Box3().setFromObject(root, true);
    assert.ok(before.min.distanceTo(after.min) < 1e-5 && before.max.distanceTo(after.max) < 1e-5, config.name);
    meshes.forEach((mesh, index) => {
      mesh.skeleton.update(); for (const [i, point] of samples[index]) assert.ok(point.distanceTo(mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(mesh.matrixWorld)) < 1e-4, config.name + " vértice " + i);
    });
    if (["vergil", "agnes"].includes(config.id)) assert.ok(result.removed > 0);
  }
});
test("modelos e texturas copiados preservam SHA-256 dos arquivos enviados", () => {
  const manifest = JSON.parse(fs.readFileSync("assets/models/manifest.json"));
  for (const item of manifest) assert.equal(createHash("sha256").update(fs.readFileSync(item.file)).digest("hex"), item.sha256, item.file);
});

test("tiro e recarga esperam a posição confirmada; mantêm dano/cadência/munição", () => {
  const sim = new Simulation(17), p = sim.add("p", "QA"); sim.spawnClock = Infinity;
  sim.input("p", { revision: sim.revision, commands: Array.from({length:6},(_,i)=>({seq:i+1,side:1,yaw:0,pitch:0})) });
  sim.queueShot("p", {seq:4,yaw:0,pitch:0,shotId:1}); sim.queueReload("p",{seq:6});
  for(let i=0;i<3;i++)sim.update(1/30); assert.equal(p.ammo,12);
  sim.update(1/30); assert.equal(p.ammo,11); assert.equal(p.reload,0);
  sim.update(1/30); sim.update(1/30); assert.ok(p.reload>0);
  for(let i=0;i<55;i++)sim.update(1/30);
  assert.equal(p.ammo,12); assert.equal(p.reserve,59);
  assert.ok(!("pendingShots" in sim.snapshot().players[0]));
});
test("lote atrasado não conta gravidade/stamina duas vezes", () => {
  const sim=new Simulation(17),p=sim.add("p","QA"),motion=new LocalMotion(new World(17));sim.spawnClock=Infinity;motion.reset(p,0);
  motion.advance(1000/30+0.001,{side:1,sprint:true,jump:true});sim.input("p",motion.packet(sim.revision));sim.update(1/30);motion.reconcile(p,1000/30);
  for(let i=0;i<30;i++)sim.update(1/30);
  motion.advance(1000+1000/30+0.001,{side:1,sprint:true,jump:false});sim.input("p",motion.packet(sim.revision));sim.update(1/30);
  motion.reconcile(p,1100);assert.ok(motion.stats.maximumError<1e-8);assert.equal(p.seq,motion.sequence);
});
test("coleta usa a posição confirmada e mantém 45 HP/uso único", async () => {
  const {supply,RELAYS}=await import("../shared/world.js"),sim=new Simulation(17),p=sim.add("p","QA");sim.spawnClock=Infinity;
  let kit;for(let x=-2;x<=2&&!kit;x++)for(let z=-2;z<=2;z++){const s=supply(x,z,17);if(s.type==="med"&&RELAYS.every(r=>Math.hypot(r.x-s.x,r.z-s.z)>5)){kit=s;break;}}
  Object.assign(p,{x:kit.x,z:kit.z,hp:40});sim.input("p",{revision:sim.revision,commands:Array.from({length:6},(_,i)=>({seq:i+1,yaw:0}))});sim.queueInteract("p",{seq:4});
  for(let i=0;i<3;i++)sim.update(1/30);assert.equal(p.hp,40);sim.update(1/30);assert.equal(p.hp,85);assert.ok(sim.used.has(kit.id));
  sim.queueInteract("p",{seq:6});sim.update(1/30);sim.update(1/30);assert.equal(p.hp,85);
});
