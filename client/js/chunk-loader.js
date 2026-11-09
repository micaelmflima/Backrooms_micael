// UPDATE 1.1.1: cache assíncrona. Nunca desloca o mundo nem a posição do jogador.
export class ChunkLoader {
  constructor(world) {
    this.world = world; this.pending = new Map(); this.serial = 0;
    this.completed = 0; this.worker = null;
    try {
      this.worker = new Worker(new URL("./chunk-worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data: d }) => {
        if (d.seed !== world.seed || d.level !== world.level) return;
        const key = d.chunk.cx + "," + d.chunk.cz; this.pending.delete(key);
        world.cache.set(key, d.chunk); this.completed++;
        if (world.cache.size > 256) world.cache.delete(world.cache.keys().next().value);
      };
      this.worker.onerror = () => { this.worker?.terminate(); this.worker = null; this.pending.clear(); };
    } catch { /* Sem Worker, a montagem gradual existente continua disponível. */ }
  }
  request(cx, cz) {
    const key = cx + "," + cz;
    if (!this.worker || this.world.cache.has(key) || this.pending.has(key)) return;
    const id = ++this.serial; this.pending.set(key, id);
    this.worker.postMessage({ id, seed: this.world.seed, level: this.world.level, cx, cz });
  }
  prefetch(cx, cz) {
    for (let radius = 0; radius <= 2; radius++)
      for (let z = cz - radius; z <= cz + radius; z++) for (let x = cx - radius; x <= cx + radius; x++)
        if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) === radius) this.request(x, z);
  }
  ready(cx, cz) {
    if (!this.worker || this.world.cache.has(cx + "," + cz)) return true;
    this.request(cx, cz); return false;
  }
  dispose() { this.worker?.terminate(); this.worker = null; this.pending.clear(); }
}
