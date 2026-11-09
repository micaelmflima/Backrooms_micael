import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World,
  CELL,
  CHUNK,
  SPAWN,
  RELAYS,
  freshPlayer,
  stepPlayer,
  rayBox,
} from "../shared/world.js";
test("mapa determinístico, conectado e com bordas compatíveis", () => {
  for (const seed of [0, 17, 999, 4294967295]) {
    const a = new World(seed),
      b = new World(seed);
    for (let cx = -3; cx <= 3; cx++)
      for (let cz = -3; cz <= 3; cz++) {
        const grid = a.chunk(cx, cz).grid;
        assert.deepEqual(grid, b.chunk(cx, cz).grid);
        const seen = new Set(),
          q = [[5, 5]];
        for (let i = 0; i < q.length; i++) {
          const [x, z] = q[i],
            key = `${x},${z}`;
          if (seen.has(key)) continue;
          seen.add(key);
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = x + dx,
              nz = z + dz;
            if (
              nx >= 0 &&
              nx < 12 &&
              nz >= 0 &&
              nz < 12 &&
              !grid[nz * 12 + nx] &&
              !seen.has(`${nx},${nz}`)
            )
              q.push([nx, nz]);
          }
        }
        assert.equal(seen.size, [...grid].filter((v) => !v).length);
        for (const [x, z] of [
          [5, 0],
          [5, 11],
          [0, 5],
          [11, 5],
        ])
          assert.equal(grid[z * 12 + x], 0);
      }
    for (const r of RELAYS) assert.ok(a.path(SPAWN, r, 8000).length);
  }
});
test("colisão impede atravessar paredes; pulo retorna ao chão", () => {
  const w = new World(17),
    p = freshPlayer("p", "P");
  w.move(p, -100, 0);
  assert.ok(!w.blocked(p.x, p.z));
  assert.ok(p.x >= CELL + 0.26);
  for (let i = 0; i < 180; i++) stepPlayer(p, { jump: i < 2 }, w, 1 / 60);
  assert.equal(p.y, 0);
  assert.equal(p.vy, 0);
});
test("raycast parede, teto, chão e volumes paralelos", () => {
  const w = new World(17),
    o = { ...SPAWN, y: 1.6 };
  assert.equal(w.ray(o, { x: -1, y: 0, z: 0 }).normal.x, 1);
  assert.equal(w.ray(o, { x: 0, y: -1, z: 0 }).distance, 1.6);
  assert.equal(w.ray(o, { x: 0, y: 1, z: 0 }).normal.y, -1);
  assert.equal(
    rayBox(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: -1, y: 0, z: 3 },
      { x: 1, y: 2, z: 4 },
    ),
    3,
  );
  assert.equal(
    rayBox(
      { x: 5, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: -1, y: 0, z: 3 },
      { x: 1, y: 2, z: 4 },
    ),
    Infinity,
  );
});
test("cache limitada e regeneração em coordenadas negativas", () => {
  const w = new World(812);
  for (let x = -500; x < 500; x++) w.chunk(x, 0);
  assert.equal(w.cache.size, 256);
  assert.deepEqual(w.chunk(-500, 0), new World(812).chunk(-500, 0));
});
