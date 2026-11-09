import {
  World,
  CELL,
  CHUNK,
  EYE,
  SPAWN,
  MONSTERS,
  RELAYS,
  hash,
  random,
  freshPlayer,
  stepPlayer,
  supply,
  rayBox,
} from "../shared/world.js";
import { LEVELS, levelConfig, levelSeed } from "../shared/levels.js";
import { eyePosition, cameraPosition, defaultMuzzle, direction } from "../shared/weapon.js";
import { playerColor } from "../shared/config.js";
import { characterConfig } from "../shared/characters.js";
// O servidor do host é a autoridade de física, IA, munição, dano e objetivos.
export class Simulation {
  constructor(seed, emit = () => {}) {
    this.seed = seed;
    this.emit = emit;
    this.players = new Map();
    this.reset();
  }
  reset() {
    this.time = 0;
    this.kills = 0;
    this.won = false;
    this.loadLevel(0, true);
  }
  // NOVO: troca de nível mantém a sala, seed base e identidade dos jogadores.
  loadLevel(level, restart = false) {
    this.revision = (this.revision || 0) + 1;
    this.level = level;
    this.mapSeed = levelSeed(this.seed, level);
    this.world = new World(this.mapSeed, level);
    this.levelElapsed = 0;
    this.transition = null;
    this.monsters = new Map();
    this.nextId = 0;
    this.spawnClock = 2;
    this.relays = new Set();
    this.used = new Set();
    let i = 0;
    for (const [id, p] of this.players)
      this.players.set(id, {
        ...p,
        ...freshPlayer(id, p.name, i++),
        hp: restart ? 100 : Math.max(55, p.hp),
        ammo: restart ? 12 : p.ammo,
        reserve: restart ? 60 : Math.min(120, p.reserve + 24),
        input: {},
        inputQueue: [], pendingShots: [], commandMode: false, commandReceived: 0, physicsCredit: 0,
        lastInput: this.time,
        connected: p.connected,
      });
  }
  add(id, name, color, character) {
    const p = {
      ...freshPlayer(id, name, this.players.size),
      input: {},
      physicsCredit: 0,
      lastInput: this.time,
      connected: true,
      color: playerColor(color),
      character: characterConfig(character).id,
    };
    this.players.set(id, p);
    return p;
  }
  input(id, d) {
    const p = this.players.get(id);
    if (!p || !d || typeof d !== "object") return;
    const n = (v, a, b) =>
      Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : 0;
    const sanitize = (c) => ({ forward: n(c.forward, -1, 1), side: n(c.side, -1, 1),
      yaw: n(c.yaw, -1e5, 1e5), pitch: n(c.pitch, -1.45, 1.45),
      sprint: !!c.sprint, jump: !!c.jump, seq: n(c.seq, 0, 1e12) });
    // UPDATE 1.1.1: comandos confirmados, com passo fixo autoritativo. A revisão
    // descarta entradas em trânsito de um nível/reinício anterior.
    if (Array.isArray(d.commands)) {
      if (d.revision !== this.revision || d.commands.length > 32) return;
      if (!p.commandMode) p.physicsCredit = Math.min(1, Math.max(0, this.time - p.lastInput));
      p.commandMode = true; p.inputQueue ||= [];
      for (const c of d.commands) {
        if (!c || !Number.isSafeInteger(c.seq) || c.seq <= (p.commandReceived || p.seq) || p.inputQueue.length >= 64) continue;
        p.inputQueue.push(sanitize(c)); p.commandReceived = c.seq;
      }
    } else {
      // Compatibilidade com os clientes/testes anteriores.
      p.commandMode = false; p.inputQueue = []; p.input = sanitize(d);
    }
    p.lastInput = this.time;
  }
  reload(id) {
    const p = this.players.get(id);
    if (
      !p ||
      !p.connected ||
      p.hp <= 0 ||
      p.reload > 0 ||
      p.ammo >= 12 ||
      p.reserve <= 0 ||
      this.won
      || this.transition
    )
      return;
    p.reload = 1.65;
    this.emit("effect", { type: "reload", id, x: p.x, y: 1, z: p.z });
  }
  // UPDATE: o cano visual acompanha a previsão. Espere o comando de movimento
  // correspondente antes de validar um tiro, em vez de aumentar seu alcance
  // permitido ou disparar de uma posição antiga. Entradas antigas continuam.
  queueShot(id, aim) {
    const p = this.players.get(id);
    if (!p || !p.connected || p.hp <= 0 || this.won || this.transition || !aim) return;
    if (p.commandMode && Number.isSafeInteger(aim.seq) && aim.seq > p.seq) {
      if (aim.seq > p.commandReceived || !Number.isFinite(aim.yaw) || !Number.isFinite(aim.pitch)) return;
      p.pendingShots ||= [];
      if (p.pendingShots.length < 8) p.pendingShots.push({ ...aim, action: "shoot", expires: this.time + 3 });
    } else this.shoot(id, aim);
  }
  queueReload(id, command) {
    const p = this.players.get(id);
    if (!p || !p.connected || p.hp <= 0 || this.won || this.transition) return;
    if (p.commandMode && Number.isSafeInteger(command?.seq) && command.seq > p.seq) {
      if (command.seq > p.commandReceived) return;
      p.pendingShots ||= [];
      if (p.pendingShots.length < 8) p.pendingShots.push({ action: "reload", seq: command.seq, expires: this.time + 3 });
    } else this.reload(id);
  }
  queueInteract(id, command) {
    const p = this.players.get(id);
    if (!p || !p.connected || p.hp <= 0 || this.won || this.transition) return;
    if (p.commandMode && Number.isSafeInteger(command?.seq) && command.seq > p.seq) {
      if (command.seq > p.commandReceived) return;
      p.pendingShots ||= [];
      if (p.pendingShots.length < 8) p.pendingShots.push({ action: "interact", seq: command.seq, expires: this.time + 3 });
    } else this.interact(id);
  }
  confirmedShots(p) {
    while (p.pendingShots?.length) {
      const shot = p.pendingShots[0];
      if (shot.expires < this.time || p.hp <= 0) { p.pendingShots.shift(); continue; }
      if (shot.seq > p.seq) break;
      p.pendingShots.shift();
      if (shot.action === "reload") this.reload(p.id);
      else if (shot.action === "interact") this.interact(p.id);
      else this.shoot(p.id, shot);
    }
  }
  shoot(id, aim) {
    const p = this.players.get(id);
    if (
      !p ||
      !p.connected ||
      p.hp <= 0 ||
      p.reload > 0 ||
      p.ammo <= 0 ||
      this.time - p.shotAt < 0.22 ||
      this.won ||
      this.transition ||
      !aim ||
      !Number.isFinite(aim.yaw) ||
      !Number.isFinite(aim.pitch)
    )
      return;
    if (aim.origin && (!["x", "y", "z"].every((k) => Number.isFinite(aim.origin[k])) ||
      Math.hypot(aim.origin.x - p.x, aim.origin.y - (EYE + p.y), aim.origin.z - p.z) > 1.6)) return;
    p.yaw = Math.max(-1e5, Math.min(1e5, aim.yaw));
    p.pitch = Math.max(-1.45, Math.min(1.45, aim.pitch));
    p.ammo--;
    p.shotAt = this.time;
    p.noise = 1.8;
    // NOVO: primeiro ache o alvo da mira; em seguida lance o raio do CANO
    // até esse alvo. A origem recebida é limitada ao alcance físico da arma.
    const camera = cameraPosition(p, !!aim.thirdPerson, this.world), look = direction(p);
    const sight = this.world.ray(camera, look);
    let aimDistance = sight.distance;
    for (const m of this.monsters.values()) {
      if (m.hp <= 0) continue;
      const t = MONSTERS[m.type];
      aimDistance = Math.min(aimDistance, rayBox(camera, look,
        { x: m.x - t.radius, y: 0, z: m.z - t.radius },
        { x: m.x + t.radius, y: t.height, z: m.z + t.radius }));
    }
    const point = { x: camera.x + look.x * aimDistance,
      y: camera.y + look.y * aimDistance, z: camera.z + look.z * aimDistance };
    const o = aim.origin ? { ...aim.origin } : defaultMuzzle(p);
    const length = Math.hypot(point.x - o.x, point.y - o.y, point.z - o.z) || 1;
    const d = { x: (point.x - o.x) / length, y: (point.y - o.y) / length, z: (point.z - o.z) / length };
    const eye = eyePosition(p), reach = Math.hypot(o.x - eye.x, o.y - eye.y, o.z - eye.z);
    const obstruction = reach > 0.001 ? this.world.ray(eye,
      { x: (o.x - eye.x) / reach, y: (o.y - eye.y) / reach, z: (o.z - eye.z) / reach }, reach) : null;
    const wall = this.world.ray(o, d, 70);
    // Arma encostada numa parede não pode atingir entidades do outro lado.
    const blockedBarrel = obstruction?.surface && obstruction.distance < reach - 0.025;
    let hit = null,
      dist = wall.distance;
    for (const m of blockedBarrel ? [] : this.monsters.values()) {
      if (m.hp <= 0) continue;
      const t = MONSTERS[m.type],
        r = rayBox(
          o,
          d,
          { x: m.x - t.radius, y: 0, z: m.z - t.radius },
          { x: m.x + t.radius, y: t.height, z: m.z + t.radius },
        );
      if (r < dist) {
        dist = r;
        hit = m;
      }
    }
    if (hit) {
      const head = o.y + d.y * dist > MONSTERS[hit.type].height * 0.8;
      hit.hp = Math.max(0, hit.hp - (head ? 60 : 34));
      hit.hurt = 0.22;
      hit.alert = 8;
      hit.target = p.id;
      hit.state = hit.hp ? "hurt" : "dead";
      if (!hit.hp) {
        hit.deadAt = this.time;
        this.kills++;
      }
    }
    this.emit("effect", {
      type: "shot",
      id,
      origin: o,
      point: blockedBarrel ? obstruction.point : { x: o.x + d.x * dist, y: o.y + d.y * dist, z: o.z + d.z * dist },
      normal: blockedBarrel ? obstruction.normal : wall.normal,
      surface: !hit && (blockedBarrel || wall.surface),
      shotId: Number.isSafeInteger(aim.shotId) ? aim.shotId : 0,
      hit: hit?.id || null,
      killed: !!hit && !hit.hp,
    });
  }
  interact(id) {
    const p = this.players.get(id);
    if (!p || !p.connected || p.hp <= 0 || this.won || this.transition) return;
    const close = (o) =>
      Math.hypot(p.x - o.x, p.z - o.z) < 2.8 && this.world.visible(p, o, 3);
    for (const r of RELAYS)
      if (!this.relays.has(r.id) && close(r)) {
        this.relays.add(r.id);
        p.noise = 2;
        this.emit(
          "notice",
          `${levelConfig(this.level).item} ${r.id}: ${this.relays.size}/3.`,
        );
        return;
      }
    if (this.relays.size === 3 && this.levelElapsed >= levelConfig(this.level).survival && close(SPAWN)) {
      if (this.level === LEVELS.length - 1) this.won = true;
      else this.transition = { from: this.level, to: this.level + 1 };
      return;
    }
    const cx = Math.floor(p.x / (CELL * CHUNK)),
      cz = Math.floor(p.z / (CELL * CHUNK));
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let z = cz - 1; z <= cz + 1; z++) {
        const s = supply(x, z, this.mapSeed);
        if (
          this.used.has(s.id) ||
          !close(s) ||
          (s.type === "med" && p.hp >= 100) ||
          (s.type === "ammo" && p.reserve >= 120)
        )
          continue;
        if (s.type === "med") p.hp = Math.min(100, p.hp + 45);
        else p.reserve = Math.min(120, p.reserve + 36);
        this.used.add(s.id);
        this.emit("effect", { type: "pickup", id, x: s.x, y: 1, z: s.z });
        return;
      }
    for (const q of this.players.values())
      if (q.id !== id && q.hp <= 0 && q.connected && close(q)) {
        q.hp = 55;
        q.y = q.vy = 0;
        this.emit("notice", `${q.name} foi reanimado.`);
        return;
      }
  }
  // NOVO: a tela de conclusão permanece até o host continuar. Ninguém perde
  // a transição por ter uma GPU lenta, e a IA fica pausada durante a passagem.
  continueLevel() { if (this.transition) this.loadLevel(this.transition.to); }
  spawn() {
    const alive = [...this.players.values()].filter(
      (p) => p.connected && p.hp > 0,
    );
    if (!alive.length) return;
    const p = alive[this.nextId % alive.length],
      rng = random(hash(this.nextId, Math.floor(this.time), this.seed));
    for (let tries = 0; tries < 45; tries++) {
      const a = rng() * Math.PI * 2,
        r = 19 + rng() * 12,
        x = (Math.floor((p.x + Math.cos(a) * r) / CELL) + 0.5) * CELL,
        z = (Math.floor((p.z + Math.sin(a) * r) / CELL) + 0.5) * CELL;
      if (
        this.world.blocked(x, z, 0.5) ||
        alive.some(
          (q) =>
            Math.hypot(q.x - x, q.z - z) < 16 ||
            this.world.visible(q, { x, z }, 30),
        )
      )
        continue;
      const type = this.nextId % 3,
        id = `m${this.nextId++}`;
      this.monsters.set(id, {
        id,
        type,
        x,
        z,
        yaw: 0,
        hp: MONSTERS[type].hp,
        state: "idle",
        target: null,
        alert: 0,
        hurt: 0,
        attack: 0,
        path: [],
        pathAt: 0,
        patrolAt: 0,
      });
      return;
    }
  }
  update(dt) {
    if (this.won) return;
    this.time += dt;
    if (this.transition) {
      return;
    }
    this.levelElapsed += dt;
    for (const p of this.players.values()) {
      if (this.transition || this.won) break;
      if (!p.connected) continue;
      if (p.commandMode) {
        // UPDATE: crédito de tempo autoritativo recupera comandos que ficaram
        // esperando durante um frame lento. Não permite andar mais rápido:
        // cada passo gasta tempo já transcorrido no servidor (máximo 1 s).
        p.physicsCredit = Math.min(1, (p.physicsCredit || 0) + dt);
        while (!this.transition && !this.won && p.inputQueue?.length && p.physicsCredit + 1e-9 >= 1 / 30) {
          const command = p.inputQueue.shift(); p.input = command;
          stepPlayer(p, command, this.world, 1 / 30); p.seq = command.seq;
          this.confirmedShots(p);
          p.physicsCredit = Math.max(0, p.physicsCredit - 1 / 30);
        }
        if (!p.inputQueue?.length && this.time - p.lastInput > 0.5) {
          p.moving = p.sprinting = false;
          // Não execute física sem um comando confirmável: gravidade/stamina
          // seriam contadas de novo quando chegasse o lote atrasado. Clientes
          // conectados enviam também comandos de repouso; o crédito limitado
          // recupera todos esses passos quando o transporte volta a responder.
        }
      } else stepPlayer(p, this.time - p.lastInput < 0.5 ? p.input : { yaw: p.yaw, pitch: p.pitch }, this.world, dt);
      if (p.reload > 0) {
        p.reload -= dt;
        if (p.reload <= 0) {
          const n = Math.min(12 - p.ammo, p.reserve);
          p.ammo += n;
          p.reserve -= n;
          p.reload = 0;
        }
      }
      p.noise = Math.max(0, p.noise - dt);
    }
    if (this.transition || this.won) return;
    this.spawnClock -= dt;
    if (this.spawnClock <= 0) {
      this.spawnClock = levelConfig(this.level).spawn;
      if ([...this.monsters.values()].filter((m) => m.hp > 0).length < levelConfig(this.level).maximum)
        this.spawn();
    }
    const alive = [...this.players.values()].filter(
      (p) => p.hp > 0 && p.connected,
    );
    this.updateMonsters(dt, alive);
  }
  // A IA mantém a implementação existente. Separação permite congelar só
  // as criaturas nos testes, sem esconder seus colliders durante tiros.
  updateMonsters(dt, alive) {
    for (const [id, m] of this.monsters) {
      if (m.hp <= 0) {
        if (this.time - m.deadAt > 5) this.monsters.delete(id);
        continue;
      }
      if (
        alive.length &&
        alive.every((p) => Math.hypot(p.x - m.x, p.z - m.z) > 95)
      ) {
        this.monsters.delete(id);
        continue;
      }
      const type = MONSTERS[m.type];
      m.attack = Math.max(0, m.attack - dt);
      m.hurt = Math.max(0, m.hurt - dt);
      m.alert = Math.max(0, m.alert - dt);
      let target = null,
        best = Infinity;
      for (const p of alive) {
        const d = Math.hypot(p.x - m.x, p.z - m.z),
          a = Math.atan2(p.x - m.x, p.z - m.z),
          seen =
            (Math.cos(a - m.yaw) > 0.05 || d < 5) &&
            this.world.visible(m, p, type.sight),
          heard =
            d < (p.noise > 0 ? 30 : p.sprinting ? 13 : p.moving ? 4.5 : 0);
        if ((seen || heard || (m.target === p.id && m.alert > 0)) && d < best) {
          target = p;
          best = d;
          if (seen || heard) m.alert = 7;
        }
      }
      if (target) {
        m.target = target.id;
        if (best < 1.35 && this.world.visible(m, target, 1.6)) {
          m.state = m.hurt > 0 ? "hurt" : "attack";
          m.yaw = Math.atan2(target.x - m.x, target.z - m.z);
          if (m.attack <= 0 && m.hurt <= 0) {
            m.attack = 1.1;
            target.hp = Math.max(0, target.hp - type.damage);
            this.emit("effect", {
              type: "hurt",
              id: target.id,
              monster: m.id,
              x: m.x,
              y: 1,
              z: m.z,
            });
          }
          continue;
        }
        m.state = m.hurt > 0 ? "hurt" : "chase";
        if (this.time >= m.pathAt) {
          m.path = this.world.path(m, target);
          m.pathAt = this.time + 0.65;
        }
      } else {
        m.target = null;
        m.state = m.hurt > 0 ? "hurt" : "patrol";
        if (this.time >= m.patrolAt) {
          const rng = random(
            hash(Number(id.slice(1)), Math.floor(this.time / 3), this.seed),
          );
          m.path = [];
          // Destinos em paredes não são rotas. Faça tentativas limitadas e
          // espere antes de tentar de novo, mesmo quando nenhuma rota existe.
          for (let attempt = 0; attempt < 12 && !m.path.length; attempt++) {
            const dest = {
              x: (Math.floor((m.x + (rng() - 0.5) * 22) / CELL) + 0.5) * CELL,
              z: (Math.floor((m.z + (rng() - 0.5) * 22) / CELL) + 0.5) * CELL,
            };
            if (!this.world.blocked(dest.x, dest.z, type.radius))
              m.path = this.world.path(m, dest, 300);
          }
          m.patrolAt = this.time + (m.path.length ? 5 : 0.8);
        }
      }
      if (m.hurt > 0) continue;
      let dest = m.path[0];
      if (target && this.world.visible(m, target, 10)) dest = target;
      if (dest) {
        const dx = dest.x - m.x,
          dz = dest.z - m.z,
          d = Math.hypot(dx, dz);
        if (d < 0.18) {
          m.path.shift();
          continue;
        }
        m.yaw = Math.atan2(dx, dz);
        const step = Math.min(d, type.speed * levelConfig(this.level).speed * (target ? 1 : 0.4) * dt);
        this.world.move(m, (dx / d) * step, (dz / d) * step, type.radius);
      } else m.state = "idle";
    }
  }
  snapshot() {
    return {
      time: this.time,
      won: this.won,
      kills: this.kills,
      level: this.level,
      mapSeed: this.mapSeed,
      revision: this.revision,
      levelElapsed: this.levelElapsed,
      transition: this.transition ? { ...this.transition } : null,
      relays: [...this.relays],
      used: [...this.used],
      players: [...this.players.values()].map(
        ({
          input,
          inputQueue, pendingShots, commandMode, commandReceived, physicsCredit,
          lastInput,
          shotAt,
          noise,
          token,
          socket,
          disconnectedAt,
          ...p
        }) => p,
      ),
      monsters: [...this.monsters.values()].map(
        ({ path, pathAt, patrolAt, target, alert, attack, deadAt, ...m }) => m,
      ),
    };
  }
}
