// Geração e física compartilhadas: navegador e servidor executam a mesma matemática.
export const CELL = 3.2,
  CHUNK = 12,
  HEIGHT = 3.05,
  EYE = 1.62,
  SPAWN = { x: 8, z: 8 };
export function hash(x, z, seed = 17) {
  let h =
    Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
export function random(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class World {
  constructor(seed = 17, level = 0) {
    this.seed = seed >>> 0;
    this.level = level;
    this.cache = new Map();
  }
  chunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const rng = random(hash(cx, cz, this.seed)),
      grid = new Uint8Array(144).fill(1),
      carve = (x, z) => (grid[z * 12 + x] = 0),
      stack = [[1, 1]];
    carve(1, 1);
    while (stack.length) {
      const [x, z] = stack.at(-1),
        ns = [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ].filter(
          ([a, b]) =>
            x + a >= 1 &&
            x + a <= 9 &&
            z + b >= 1 &&
            z + b <= 9 &&
            grid[(z + b) * 12 + x + a],
        );
      if (!ns.length) {
        stack.pop();
        continue;
      }
      const [a, b] = ns[Math.floor(rng() * ns.length)];
      carve(x + a / 2, z + b / 2);
      carve(x + a, z + b);
      stack.push([x + a, z + b]);
    }
    // Portais fixos garantem continuidade entre todos os setores.
    for (let i = 0; i < 12; i++) {
      carve(5, i);
      carve(i, 5);
    }
    for (let r = 0; r < (this.level === 2 ? 2 : 4); r++) {
      const x = 1 + Math.floor(rng() * 4) * 2,
        z = 1 + Math.floor(rng() * 4) * 2;
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 3; b++) carve(x + a, z + b);
    }
    // NOVO: armazém e piscinas têm áreas amplas, sem mudar o Level 0 original.
    if (this.level === 1 || this.level === 3)
      for (let r = 0; r < 3; r++) {
        const x = 1 + Math.floor(rng() * 3) * 2, z = 1 + Math.floor(rng() * 3) * 2;
        for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) carve(x + a, z + b);
      }
    if (cx === 0 && cz === 0)
      for (let x = 1; x <= 4; x++) for (let z = 1; z <= 4; z++) carve(x, z);
    const data = { cx, cz, grid, variant: hash(cx, cz, this.seed + 11) % 3 };
    this.cache.set(key, data);
    if (this.cache.size > 256)
      this.cache.delete(this.cache.keys().next().value);
    return data;
  }
  solid(gx, gz) {
    const cx = Math.floor(gx / 12),
      cz = Math.floor(gz / 12);
    return this.chunk(cx, cz).grid[(gz - cz * 12) * 12 + gx - cx * 12] === 1;
  }
  blocked(x, z, r = 0.27) {
    for (const dx of [-r, r])
      for (const dz of [-r, r])
        if (
          this.solid(Math.floor((x + dx) / CELL), Math.floor((z + dz) / CELL))
        )
          return true;
    return false;
  }
  move(p, dx, dz, r = 0.27) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
    for (let i = 0; i < n; i++) {
      if (!this.blocked(p.x + dx / n, p.z, r)) p.x += dx / n;
      if (!this.blocked(p.x, p.z + dz / n, r)) p.z += dz / n;
    }
  }
  // Raycast DDA contra paredes, chão e teto.
  ray(o, d, max = 70) {
    let gx = Math.floor(o.x / CELL),
      gz = Math.floor(o.z / CELL);
    const sx = d.x >= 0 ? 1 : -1,
      sz = d.z >= 0 ? 1 : -1,
      dtx = d.x === 0 ? Infinity : Math.abs(CELL / d.x),
      dtz = d.z === 0 ? Infinity : Math.abs(CELL / d.z);
    let tx =
        d.x === 0 ? Infinity : ((gx + (sx > 0 ? 1 : 0)) * CELL - o.x) / d.x,
      tz = d.z === 0 ? Infinity : ((gz + (sz > 0 ? 1 : 0)) * CELL - o.z) / d.z,
      dist = max,
      normal = { x: 0, y: 0, z: 0 },
      surface = false;
    const plane =
      d.y > 0 ? (HEIGHT - o.y) / d.y : d.y < 0 ? -o.y / d.y : Infinity;
    if (plane >= 0 && plane < dist) {
      dist = plane;
      normal = { x: 0, y: d.y > 0 ? -1 : 1, z: 0 };
      surface = true;
    }
    for (let i = 0; i < 150; i++) {
      let t, n;
      if (tx < tz) {
        t = tx;
        gx += sx;
        tx += dtx;
        n = { x: -sx, y: 0, z: 0 };
      } else {
        t = tz;
        gz += sz;
        tz += dtz;
        n = { x: 0, y: 0, z: -sz };
      }
      if (t > dist) break;
      if (this.solid(gx, gz)) {
        dist = t;
        normal = n;
        surface = true;
        break;
      }
    }
    return {
      distance: dist,
      normal,
      surface,
      point: { x: o.x + d.x * dist, y: o.y + d.y * dist, z: o.z + d.z * dist },
    };
  }
  visible(a, b, max = 25) {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      d = Math.hypot(dx, dz);
    return (
      d < max &&
      (d < 0.01 ||
        this.ray(
          { x: a.x, y: 1, z: a.z },
          { x: dx / d, y: 0, z: dz / d },
          d + 0.02,
        ).distance >=
          d - 0.03)
    );
  }
  path(a, b, limit = 900) {
    const start = [Math.floor(a.x / CELL), Math.floor(a.z / CELL)],
      goal = [Math.floor(b.x / CELL), Math.floor(b.z / CELL)],
      key = (x, z) => `${x},${z}`,
      q = [start],
      parents = new Map([[key(...start), null]]);
    let found;
    for (let i = 0; i < q.length && i < limit; i++) {
      const [x, z] = q[i];
      if (x === goal[0] && z === goal[1]) {
        found = [x, z];
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          nz = z + dz,
          k = key(nx, nz);
        if (!parents.has(k) && !this.solid(nx, nz)) {
          parents.set(k, [x, z]);
          q.push([nx, nz]);
        }
      }
    }
    if (!found) return [];
    const out = [];
    for (let p = found; parents.get(key(...p)); p = parents.get(key(...p)))
      out.push({ x: (p[0] + 0.5) * CELL, z: (p[1] + 0.5) * CELL });
    return out.reverse();
  }
}
export function freshPlayer(id, name, index = 0) {
  return {
    id,
    name,
    x: SPAWN.x + index * 0.8,
    z: SPAWN.z,
    y: 0,
    vy: 0,
    yaw: 0,
    pitch: 0,
    hp: 100,
    stamina: 1,
    exhausted: false,
    ammo: 12,
    reserve: 60,
    reload: 0,
    shotAt: -10,
    noise: 0,
    moving: false,
    sprinting: false,
    jumpHeld: false,
    seq: 0,
  };
}
export function stepPlayer(p, i, w, dt) {
  if (p.hp <= 0) {
    p.moving = p.sprinting = false;
    return;
  }
  p.yaw = i.yaw || 0;
  p.pitch = Math.max(-1.45, Math.min(1.45, i.pitch || 0));
  let sx = i.side || 0,
    f = i.forward || 0;
  const len = Math.hypot(sx, f);
  if (len > 1) {
    sx /= len;
    f /= len;
  }
  p.moving = len > 0.01;
  if (p.stamina < 0.03) p.exhausted = true;
  if (p.stamina > 0.3) p.exhausted = false;
  p.sprinting = !!i.sprint && p.moving && !p.exhausted;
  p.stamina = Math.max(
    0,
    Math.min(1, p.stamina + dt * (p.sprinting ? -0.2 : 0.14)),
  );
  const speed = p.sprinting ? 5.7 : 3.35;
  w.move(
    p,
    (sx * Math.cos(p.yaw) - f * Math.sin(p.yaw)) * speed * dt,
    (-sx * Math.sin(p.yaw) - f * Math.cos(p.yaw)) * speed * dt,
  );
  if (i.jump && !p.jumpHeld && p.y <= 0) p.vy = 4.1;
  p.jumpHeld = !!i.jump;
  p.vy -= 12 * dt;
  p.y = Math.max(0, p.y + p.vy * dt);
  if (!p.y) p.vy = 0;
  p.seq = i.seq || 0;
}
export const MONSTERS = [
  {
    name: "O Alongado",
    hp: 110,
    speed: 2.55,
    damage: 19,
    height: 2.62,
    radius: 0.36,
    sight: 22,
  },
  {
    name: "Rastejante",
    hp: 75,
    speed: 3.8,
    damage: 12,
    height: 0.92,
    radius: 0.48,
    sight: 17,
  },
  {
    name: "Sem Rosto",
    hp: 155,
    speed: 1.95,
    damage: 27,
    height: 1.98,
    radius: 0.43,
    sight: 19,
  },
];
export const RELAYS = [
  { id: "A", x: 9.5 * CELL, z: 1.5 * CELL },
  { id: "B", x: 17.5 * CELL, z: 5.5 * CELL },
  { id: "C", x: 5.5 * CELL, z: 17.5 * CELL },
];
export function supply(cx, cz, seed) {
  return {
    id: `${cx},${cz}`,
    x: (cx * 12 + 7.5) * CELL,
    z: (cz * 12 + 5.5) * CELL,
    type: hash(cx, cz, seed) % 3 === 0 ? "med" : "ammo",
  };
}
export function rayBox(o, d, min, max) {
  let near = 0,
    far = Infinity;
  for (const axis of ["x", "y", "z"]) {
    if (Math.abs(d[axis]) < 1e-8) {
      if (o[axis] < min[axis] || o[axis] > max[axis]) return Infinity;
      continue;
    }
    let a = (min[axis] - o[axis]) / d[axis],
      b = (max[axis] - o[axis]) / d[axis];
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return Infinity;
  }
  return near;
}
