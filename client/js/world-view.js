import * as T from "three";
import { CELL, CHUNK, HEIGHT, SPAWN, RELAYS, hash, random, supply } from "/shared/world.js";
import { levelConfig } from "/shared/levels.js";
import { texture, labelTexture } from "./textures.js";
import { ChunkLoader } from "./chunk-loader.js";
import { instantiateMedkit } from "./model-assets.js";
const SIZE = CELL * CHUNK, CAPACITY = 16;
// ALTERADO: chunks reutilizáveis, uma montagem por quadro, luzes em cache e
// geometria instanciada para paredes, luminárias, umidade, vigas e canos.
export class WorldView {
  constructor(scene, world, quality = "high") {
    Object.assign(this, { scene, world, quality, chunks: new Map(), pool: [],
      fixtures: [], lights: [], selected: [], queue: [], clock: -1, cx: null, cz: null,
      stats: { builds: 0, maxBuildMs: 0, buildsThisFrame: 0, lightingUpdates: 0, capacity: CAPACITY } });
    this.cfg = levelConfig(world.level);
    this.chunkLoader = new ChunkLoader(world);
    this.dummy = new T.Object3D(); this.temp = new T.Vector3();
    this.frustum = new T.Frustum(); this.projection = new T.Matrix4();
    this.wallGeo = new T.BoxGeometry(CELL, HEIGHT, CELL);
    this.trimGeo = new T.BoxGeometry(CELL + 0.025, 0.13, CELL + 0.025);
    this.floorGeo = new T.PlaneGeometry(SIZE, SIZE);
    this.fixtureGeo = new T.BoxGeometry(1.45, 0.06, 0.48);
    this.frameGeo = new T.BoxGeometry(1.62, 0.12, 0.64);
    this.wetGeo = new T.CircleGeometry(1, 14);
    this.pipeGeo = new T.CylinderGeometry(0.1, 0.1, CELL, 8);
    this.beamGeo = new T.BoxGeometry(0.13, HEIGHT, 0.13);
    this.crateGeo = new T.BoxGeometry(0.65, 0.5, 0.44);
    this.bandGeo = new T.BoxGeometry(0.12, 0.52, 0.46);
    this.poolGeo = new T.PlaneGeometry(CELL * 2.7, CELL * 2.7);
    this.materials = [0, 1, 2].map((v) => {
      const wall = texture("wall", v, world.level), floor = texture("carpet", v, world.level), ceil = texture("ceiling", v, world.level);
      floor.repeat.set(CHUNK, CHUNK); ceil.repeat.set(CHUNK / 2, CHUNK / 2);
      return { wall: new T.MeshStandardMaterial({ map: wall, bumpMap: wall, bumpScale: 0.025, roughness: world.level === 3 ? 0.43 : 0.93 }),
        floor: new T.MeshStandardMaterial({ map: floor, bumpMap: floor, bumpScale: 0.055, roughness: world.level === 3 ? 0.45 : 0.79 }),
        ceiling: new T.MeshStandardMaterial({ map: ceil, bumpMap: ceil, bumpScale: 0.012, roughness: 1 }) };
    });
    this.trimMat = new T.MeshStandardMaterial({ color: world.level === 0 ? 0x514c32 : 0x414b50, roughness: 0.9 });
    this.frameMat = new T.MeshStandardMaterial({ color: 0x444a3d, roughness: 0.65 });
    this.fixtureMat = new T.MeshStandardMaterial({ color: 0xece5c4, emissive: this.cfg.light, emissiveIntensity: 2.1 });
    this.brokenMat = this.fixtureMat.clone(); this.brokenMat.emissiveIntensity = 0.08;
    this.pipeMat = new T.MeshStandardMaterial({ color: world.level === 2 ? 0x68492e : 0x4c605d, metalness: 0.6, roughness: 0.58 });
    this.wetMat = new T.MeshStandardMaterial({ color: 0x292b1c, transparent: true, opacity: 0.23, roughness: 0.2, depthWrite: false });
    this.crateMat = [new T.MeshStandardMaterial({ color: 0x65734b, roughness: 0.75 }), new T.MeshStandardMaterial({ color: 0xa59877, roughness: 0.75 })];
    this.bandMat = [new T.MeshStandardMaterial({ color: 0xd6be68 }), new T.MeshStandardMaterial({ color: 0xa9412c })];
    this.waterMap = world.level === 3 ? texture("water", 0, 3) : null;
    this.waterMat = new T.MeshStandardMaterial({ color: 0x8acddb, map: this.waterMap, metalness: 0.15, roughness: 0.15, transparent: true, opacity: 0.76, depthWrite: false });
    for (let i = 0; i < CAPACITY; i++) this.pool.push(this.createChunk());
    for (let i = 0; i < (quality === "high" ? 4 : 3); i++) {
      const l = new T.PointLight(this.cfg.light, 23, 11, 2); l.castShadow = false; scene.add(l); this.lights.push(l);
    }
    this.objectives = new T.Group(); scene.add(this.objectives); this.relays = [];
    this.makeObjectives();
  }
  instance(geo, mat, capacity) {
    const m = new T.InstancedMesh(geo, mat, capacity); m.count = 0;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage); return m;
  }
  createChunk() {
    const group = new T.Group(); group.visible = false; this.scene.add(group);
    const floor = new T.Mesh(this.floorGeo, this.materials[0].floor); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    const ceiling = new T.Mesh(this.floorGeo, this.materials[0].ceiling); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = HEIGHT;
    const walls = this.instance(this.wallGeo, this.materials[0].wall, 144), trim = this.instance(this.trimGeo, this.trimMat, 144);
    walls.castShadow = walls.receiveShadow = true;
    const frames = this.instance(this.frameGeo, this.frameMat, 36), bulbs = this.instance(this.fixtureGeo, this.fixtureMat, 36);
    const failures = this.instance(this.fixtureGeo, this.brokenMat, 36);
    const wet = this.instance(this.wetGeo, this.wetMat, 6), pipes = this.instance(this.pipeGeo, this.pipeMat, 80), beams = this.instance(this.beamGeo, this.frameMat, 12);
    const crate = new T.Group(), box = new T.Mesh(this.crateGeo, this.crateMat[0]), band = new T.Mesh(this.bandGeo, this.bandMat[0]);
    const medkit = instantiateMedkit();
    box.castShadow = true; crate.add(box, band); if (medkit) crate.add(medkit);
    const water = new T.Mesh(this.poolGeo, this.waterMat); water.rotation.x = -Math.PI / 2; water.position.y = 0.035; water.visible = false;
    group.add(floor, ceiling, walls, trim, frames, bulbs, failures, wet, pipes, beams, crate, water);
    return { group, floor, ceiling, walls, trim, frames, bulbs, failures, wet, pipes, beams, crate, box, band, water, medkit,
      fixtures: Array.from({ length: 36 }, () => ({ pos: new T.Vector3(), phase: 0, broken: false, off: false })),
      fixtureCount: 0, bounds: new T.Box3(), stamp: 0, key: null, cx: 0, cz: 0 };
  }
  // UPDATE: cada chunk do pool recebe uma cópia visual uma única vez. Não
  // altera supply(), coleta (2,8 m), cura (45), spawn, som ou estado usado.
  installMedkits() {
    for (const c of this.pool) if (!c.medkit) {
      c.medkit = instantiateMedkit(); if (!c.medkit) continue;
      c.crate.add(c.medkit);
      if (c.item) this.setSupplyModel(c);
    }
  }
  setSupplyModel(c) {
    const med = c.item.type === "med", type = med ? 1 : 0;
    c.crate.position.y = med ? 0 : 0.3;
    c.box.visible = c.band.visible = !med;
    c.box.material = this.crateMat[type]; c.band.material = this.bandMat[type];
    if (c.medkit) c.medkit.visible = med;
  }
  matrix(mesh, index, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const d = this.dummy; d.position.set(x, y, z); d.scale.set(sx, sy, sz); d.rotation.set(rx, ry, rz); d.updateMatrix(); mesh.setMatrixAt(index, d.matrix);
  }
  build(cx, cz) {
    if (!this.chunkLoader.ready(cx, cz)) return false;
    const started = performance.now(), key = cx + "," + cz;
    let c = this.pool.find((c) => c.key === null);
    if (!c) {
      for (const candidate of this.pool)
        if ((Math.abs(candidate.cx - this.cx) > 1 || Math.abs(candidate.cz - this.cz) > 1) && (!c || candidate.stamp < c.stamp)) c = candidate;
    }
    if (!c) return;
    if (c.key) this.chunks.delete(c.key);
    const data = this.world.chunk(cx, cz), mat = this.materials[data.variant], rng = random(hash(cx, cz, this.world.seed));
    Object.assign(c, { key, cx, cz, stamp: performance.now(), fixtureCount: 0 });
    c.group.position.set(cx * SIZE, 0, cz * SIZE); c.group.visible = true;
    c.floor.position.set(SIZE / 2, 0, SIZE / 2); c.ceiling.position.set(SIZE / 2, HEIGHT, SIZE / 2);
    c.floor.material = mat.floor; c.ceiling.material = mat.ceiling; c.walls.material = mat.wall;
    c.bounds.min.set(cx * SIZE, 0, cz * SIZE); c.bounds.max.set((cx + 1) * SIZE, HEIGHT, (cz + 1) * SIZE);
    let walls = 0, frames = 0, bulbs = 0, failures = 0, pipes = 0, beams = 0;
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const px = (x + 0.5) * CELL, pz = (z + 0.5) * CELL;
      if (data.grid[z * CHUNK + x]) {
        this.matrix(c.walls, walls, px, HEIGHT / 2, pz); this.matrix(c.trim, walls++, px, 0.065, pz);
        continue;
      }
      if ((x & 1) && (z & 1) && (x + z) % 4 === 2) {
        const f = c.fixtures[c.fixtureCount++]; f.pos.set(cx * SIZE + px, HEIGHT - 0.11, cz * SIZE + pz);
        f.phase = rng() * 20; f.broken = rng() < 0.12; f.off = rng() < 0.12;
        this.matrix(c.frames, frames++, px, HEIGHT - 0.11, pz);
        this.matrix(f.off ? c.failures : c.bulbs, f.off ? failures++ : bulbs++, px, HEIGHT - 0.19, pz);
      }
      if (this.world.level === 2 && (x === 5 || z === 5) && pipes < 78) {
        this.matrix(c.pipes, pipes++, px + 0.95, HEIGHT - 0.34, pz, 1, 1, 1, Math.PI / 2, 0, 0);
        this.matrix(c.pipes, pipes++, px - 0.95, HEIGHT - 0.42, pz, 0.65, 1, 0.65, Math.PI / 2, 0, 0);
      }
      if (this.world.level === 1 && x === 5 && z % 3 === 0 && beams < 12)
        this.matrix(c.beams, beams++, px + 1.32, HEIGHT / 2, pz);
    }
    let wet = 0;
    for (let i = 0; i < 6; i++) {
      const x = 1 + Math.floor(rng() * 10), z = 1 + Math.floor(rng() * 10);
      if (data.grid[z * CHUNK + x]) continue;
      const size = 0.4 + rng() * 0.75;
      this.matrix(c.wet, wet++, (x + 0.5) * CELL, 0.009, (z + 0.5) * CELL, size, size * (0.3 + rng() * 0.6), 1, -Math.PI / 2, 0, rng() * 6);
    }
    for (const [mesh, count] of [[c.walls, walls], [c.trim, walls], [c.frames, frames], [c.bulbs, bulbs], [c.failures, failures], [c.wet, wet], [c.pipes, pipes], [c.beams, beams]]) {
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
    c.water.visible = false;
    if (this.world.level === 3) outer: for (let z = 2; z < 9; z++) for (let x = 2; x < 9; x++) {
      let clear = true;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (data.grid[(z + b) * 12 + x + a]) clear = false;
      if (clear) { c.water.position.set((x + 0.5) * CELL, 0.035, (z + 0.5) * CELL); c.water.visible = true; break outer; }
    }
    c.item = supply(cx, cz, this.world.seed); const type = c.item.type === "ammo" ? 0 : 1;
    c.crate.position.set(c.item.x - cx * SIZE, 0.3, c.item.z - cz * SIZE); c.box.material = this.crateMat[type]; c.band.material = this.bandMat[type];
    this.setSupplyModel(c);
    this.chunks.set(key, c); this.refreshFixtures();
    this.stats.builds++; this.stats.buildsThisFrame++; this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, performance.now() - started);
    return true;
  }
  refreshFixtures() {
    this.fixtures.length = 0;
    for (const c of this.chunks.values()) if (Math.abs(c.cx - this.cx) <= 1 && Math.abs(c.cz - this.cz) <= 1)
      for (let i = 0; i < c.fixtureCount; i++) this.fixtures.push(c.fixtures[i]);
    this.clock = -1;
  }
  makeObjectives() {
    const metal = new T.MeshStandardMaterial({ color: 0x434b40, metalness: 0.6, roughness: 0.58 });
    for (const r of RELAYS) {
      const g = new T.Group(); g.position.set(r.x, 0, r.z);
      let body;
      if (this.world.level === 0) {
        body = new T.Mesh(new T.TorusGeometry(0.13, 0.035, 8, 16), new T.MeshStandardMaterial({ color: 0xd4b752, metalness: 0.7, roughness: 0.28 }));
        body.position.y = 0.9;
        const stem = new T.Mesh(new T.BoxGeometry(0.34, 0.06, 0.06), body.material); stem.position.set(0.27, 0.9, 0); g.add(stem);
        const tooth = new T.Mesh(new T.BoxGeometry(0.06, 0.15, 0.06), body.material); tooth.position.set(0.37, 0.85, 0); g.add(tooth);
      } else if (this.world.level === 1) {
        body = new T.Mesh(new T.BoxGeometry(0.78, 1.2, 0.55), metal); body.position.y = 0.6;
        for (let i = 0; i < 5; i++) { const vent = new T.Mesh(new T.BoxGeometry(0.5, 0.025, 0.02), this.frameMat); vent.position.set(0, 0.35 + i * 0.09, 0.29); g.add(vent); }
      } else {
        body = new T.Mesh(new T.CylinderGeometry(0.085, 0.085, 0.48, 12), new T.MeshStandardMaterial({ color: this.world.level === 2 ? 0x8db8b4 : 0x8abde0, emissive: 0x16475a, emissiveIntensity: 0.4, metalness: 0.35 }));
        body.rotation.z = Math.PI / 2; body.position.y = 0.9;
      }
      body.castShadow = true; g.add(body);
      const sign = new T.Mesh(new T.PlaneGeometry(0.55, 0.28), new T.MeshBasicMaterial({ map: labelTexture(r.id, this.cfg.item) })); sign.position.set(0, 1.42, 0.3); g.add(sign);
      const lamp = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), new T.MeshBasicMaterial({ color: 0xeac36a })); lamp.position.y = 1.67; g.add(lamp);
      this.objectives.add(g); this.relays.push({ g, body, lamp, id: r.id });
    }
    this.door = new T.Group(); this.door.position.set(SPAWN.x, 0, SPAWN.z - 2.9);
    const panel = new T.Mesh(new T.BoxGeometry(1.65, 2.4, 0.13), new T.MeshStandardMaterial({ color: this.world.level === 0 ? 0x544b32 : 0x374f56, roughness: 0.7 })); panel.position.y = 1.2; this.door.add(panel);
    this.doorLamp = new T.Mesh(new T.PlaneGeometry(1.25, 0.48), new T.MeshBasicMaterial({ map: labelTexture("E / 0" + this.world.level, this.cfg.exit) })); this.doorLamp.position.set(0, 2.58, 0.09); this.door.add(this.doorLamp);
    this.doorPanel = panel; this.objectives.add(this.door);
    this.extraction = new T.Mesh(new T.RingGeometry(0.8, 1, 32), new T.MeshBasicMaterial({ color: 0xbaa876, transparent: true, opacity: 0.5, side: T.DoubleSide }));
    this.extraction.rotation.x = -Math.PI / 2; this.extraction.position.set(SPAWN.x, 0.025, SPAWN.z); this.objectives.add(this.extraction);
  }
  update(pos, t, used = [], active = [], reduced = false, ready = false, camera = null, dt = 1 / 60) {
    this.stats.buildsThisFrame = 0;
    const cx = Math.floor(pos.x / SIZE), cz = Math.floor(pos.z / SIZE);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx; this.cz = cz; this.queue.length = 0;
      this.chunkLoader.prefetch(cx, cz);
      const wanted = [];
      for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) wanted.push({ x, z, d: Math.abs(x - cx) + Math.abs(z - cz) });
      wanted.sort((a, b) => a.d - b.d);
      for (const q of wanted) {
        const c = this.chunks.get(q.x + "," + q.z);
        if (!c) this.queue.push(q); else c.stamp = performance.now();
      }
      this.refreshFixtures();
    }
    // Apenas uma montagem por quadro; os objetos/buffers já existem no pool.
    if (this.queue.length) { const q = this.queue[0]; if (this.build(q.x, q.z)) this.queue.shift(); }
    // Antecipe um setor antes da fronteira, usando tempo ocioso do mesmo pool.
    if (!this.queue.length) {
      const lx = pos.x - cx * SIZE, lz = pos.z - cz * SIZE;
      const px = lx < 8 ? cx - 2 : lx > SIZE - 8 ? cx + 2 : cx;
      const pz = lz < 8 ? cz - 2 : lz > SIZE - 8 ? cz + 2 : cz;
      if ((px !== cx || pz !== cz) && !this.chunks.has(px + "," + pz) && !this.stats.buildsThisFrame) this.build(px, pz);
    }
    if (camera) { camera.updateMatrixWorld(); this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.projection); }
    for (const c of this.chunks.values()) {
      c.group.visible = Math.abs(c.cx - cx) <= 1 && Math.abs(c.cz - cz) <= 1 && (!camera || this.frustum.intersectsBox(c.bounds));
      c.crate.visible = !used.includes(c.item.id);
    }
    if (t - this.clock > 0.2 || this.clock < 0) {
      this.clock = t; this.selected.length = 0; this.stats.lightingUpdates++;
      for (const f of this.fixtures) {
        const d = f.pos.distanceToSquared(pos);
        if (d > 160) continue;
        let i = 0; while (i < this.selected.length && this.selected[i].distance <= d) i++;
        if (i < this.lights.length) { f.distance = d; this.selected.splice(i, 0, f); if (this.selected.length > this.lights.length) this.selected.pop(); }
      }
    }
    for (let i = 0; i < this.lights.length; i++) {
      const f = this.selected[i], l = this.lights[i];
      if (!f) { l.intensity = 0; continue; }
      l.position.copy(f.pos); l.position.y -= 0.23;
      const flicker = f.off ? 0.03 : f.broken && !reduced ? Math.sin(t * 22 + f.phase) > 0.6 ? 0.08 : Math.sin(t * 7 + f.phase) > 0.2 ? 0.65 : 1 : 1;
      l.intensity = 23 * flicker;
    }
    this.fixtureMat.emissiveIntensity = reduced ? 2.1 : 2.1 + Math.sin(t * 7) * 0.04;
    for (const r of this.relays) { const done = active.includes(r.id); r.lamp.material.color.setHex(done ? 0x88e5a6 : 0xeac36a); r.body.visible = this.world.level === 1 || !done; }
    this.extraction.material.color.setHex(ready ? 0x88e5a6 : 0xbaa876);
    this.doorPanel.position.y = T.MathUtils.damp(this.doorPanel.position.y, ready ? 3.3 : 1.2, 4, dt);
    if (this.waterMap && !reduced) this.waterMap.offset.set(t * 0.009, t * 0.006);
  }
  dispose() {
    this.chunkLoader.dispose();
    const geos = new Set(), materials = new Set();
    for (const c of this.pool) { this.scene.remove(c.group); c.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.isMesh && !o.userData.sharedAsset) { geos.add(o.geometry); materials.add(o.material); } }); }
    this.scene.remove(this.objectives);
    this.objectives.traverse((o) => { if (o.isMesh) { geos.add(o.geometry); materials.add(o.material); if (o.material.map) o.material.map.dispose(); } });
    for (const geo of geos) geo.dispose();
    for (const m of materials) m.dispose();
    this.brokenMat.dispose(); this.waterMat.dispose();
    for (const l of this.lights) this.scene.remove(l);
    this.chunks.clear(); this.pool.length = 0; this.fixtures.length = 0;
  }
}
