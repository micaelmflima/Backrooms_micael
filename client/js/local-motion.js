import { stepPlayer, HEIGHT, EYE } from "../../shared/world.js";

// UPDATE 1.1.1: a física usa o MESMO passo de 30 Hz do servidor. Cada comando
// é identificado; snapshots confirmam comandos, e apenas os pendentes são
// reaplicados. A câmera interpola poses, sem snaps por distância/chunk.
const STEP = 1 / 30;
const PHYSICS = ["x", "y", "z", "vy", "yaw", "pitch", "stamina", "exhausted", "jumpHeld", "moving", "sprinting", "seq"];
export class LocalMotion {
  constructor(world) {
    this.world = world; this.history = []; this.offset = { x: 0, y: 0, z: 0 };
    this.previous = {}; this.state = null; this.accumulator = 0;
    this.stats = { corrections: 0, maximumError: 0, droppedTime: 0 };
  }
  reset(state, now) {
    this.state = { ...state }; Object.assign(this.previous, state);
    this.history.length = 0; this.offset.x = this.offset.y = this.offset.z = 0;
    this.accumulator = 0; this.last = this.visualAt = now;
    this.sequence = this.sent = state.seq || 0; return this.state;
  }
  advance(now, input, enabled = true) {
    if (!this.state) return;
    // rAF fornece o timestamp de início do quadro, que pode ser ANTERIOR
    // a um timer/snapshot já processado. Nunca volte o relógio para trás.
    if (now <= this.last) return;
    const elapsed = Math.max(0, (now - this.last) / 1000); this.last = now;
    if (!enabled) { this.accumulator = 0; Object.assign(this.previous, this.state); return; }
    // Um atraso gráfico normal não perde tempo de movimento. Um retorno após
    // suspensão longa é limitado e será reconciliado pelo estado da sessão.
    this.accumulator += Math.min(elapsed, 1);
    this.stats.droppedTime += Math.max(0, elapsed - 1);
    while (this.accumulator >= STEP) {
      Object.assign(this.previous, this.state);
      const command = { ...input, seq: ++this.sequence };
      stepPlayer(this.state, command, this.world, STEP);
      this.state.seq = command.seq;
      this.history.push(command);
      if (this.history.length > 256) this.history.shift();
      this.accumulator -= STEP;
    }
  }
  packet(revision) {
    // Lotes pequenos recuperam frames lentos; cada passo consome 1/30 s do
    // orçamento acumulado na autoridade, sem acelerar por pedido do cliente.
    const commands = this.history.filter((c) => c.seq > this.sent).slice(0, 32);
    if (commands.length) this.sent = commands[commands.length - 1].seq;
    return { commands, revision };
  }
  reconcile(authoritative, now) {
    const s = this.state; if (!s) return this.reset(authoritative, now);
    const oldX = s.x, oldY = s.y, oldZ = s.z;
    this.history = this.history.filter((c) => c.seq > authoritative.seq);
    s.hp = authoritative.hp;
    for (const key of PHYSICS) s[key] = authoritative[key];
    for (const command of this.history) { stepPlayer(s, command, this.world, STEP); s.seq = command.seq; }
    const dx = s.x - oldX, dy = s.y - oldY, dz = s.z - oldZ;
    const error = Math.hypot(dx, dy, dz);
    if (error > 0.00001) {
      this.stats.corrections++; this.stats.maximumError = Math.max(error, this.stats.maximumError);
      // Conserve a pose visível durante a correção; retire o erro gradualmente.
      this.previous.x += dx; this.previous.y += dy; this.previous.z += dz;
      this.offset.x -= dx; this.offset.y -= dy; this.offset.z -= dz;
    }
    return s;
  }
  render(now, out = {}) {
    const s = this.state; if (!s) return out;
    const elapsed = Math.max(0, (now - this.visualAt) / 1000); this.visualAt = Math.max(this.visualAt, now);
    const decay = Math.exp(-12 * elapsed), alpha = Math.min(1, this.accumulator / STEP);
    this.offset.x *= decay; this.offset.y *= decay; this.offset.z *= decay;
    Object.assign(out, s);
    out.x = this.previous.x + (s.x - this.previous.x) * alpha;
    out.y = this.previous.y + (s.y - this.previous.y) * alpha;
    out.z = this.previous.z + (s.z - this.previous.z) * alpha;
    // Colisão contínua compartilhada também limita correções visuais: a câmera
    // não atravessa uma parede enquanto acompanha a posição autoritativa.
    this.world.move(out, this.offset.x, this.offset.z);
    out.y = Math.max(0, Math.min(HEIGHT - EYE - 0.01, out.y + this.offset.y));
    return out;
  }
}
