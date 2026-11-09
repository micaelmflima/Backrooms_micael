import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { Simulation } from "./simulation.js";
import { GAME_VERSION } from "../shared/config.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// ALTERADO: algumas redes restritas não permitem enumerar interfaces locais.
function localAddresses() {
  try { return Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address); }
  catch { return []; }
}
export async function startServer({
  port = Number(process.env.PORT) || 3000,
  host = "0.0.0.0",
} = {}) {
  const app = express(),
    http = createServer(app),
    io = new Server(http, {
      cors: { origin: true },
      maxHttpBufferSize: 8192,
      pingInterval: 5000,
      pingTimeout: 25000,
    }),
    rooms = new Map();
  app.disable("x-powered-by");
  app.use((_q, r, next) => {
    r.setHeader("X-Content-Type-Options", "nosniff");
    r.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: http: https: ws: wss:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    next();
  });
  app.get("/health", (_q, r) =>
    r.json({ ok: true, game: "backrooms-echo", version: GAME_VERSION }),
  );
  app.get("/api/info", (_q, r) =>
    r.json({
      port: http.address()?.port,
      addresses: localAddresses(),
    }),
  );
  app.use(
    "/vendor/three",
    express.static(path.join(ROOT, "node_modules/three")),
  );
  app.use("/shared", express.static(path.join(ROOT, "shared")));
  app.use("/assets", express.static(path.join(ROOT, "assets")));
  app.use(express.static(path.join(ROOT, "client")));
  const snapshot = (r) => ({
    ...r.sim.snapshot(),
    hostConnected: !!r.sim.players.get(r.host)?.connected,
  });
  function closeRoom(r, reason) {
    io.to(r.code).emit("closed", reason);
    rooms.delete(r.code);
    for (const s of io.sockets.sockets.values())
      if (s.data.code === r.code) {
        s.leave(r.code);
        s.data.code = null;
      }
  }
  io.on("connection", (s) => {
    let budget = 160,
      last = Date.now();
    s.use((_packet, next) => {
      const now = Date.now();
      budget = Math.min(160, budget + (now - last) * 0.1);
      last = now;
      if (budget-- >= 0) next();
    });
    const resolve = () => {
      const r = rooms.get(s.data.code);
      return r && r.sim.players.get(s.data.pid)?.socket === s.id ? r : null;
    };
    s.on("enter", (d = {}, ack = () => {}) => {
      if (typeof ack !== "function" || !d || typeof d !== "object") return;
      if (s.data.code) return ack({ error: "Você já está em uma sala." });
      const name =
        String(d.name || "Explorador")
          .trim()
          .slice(0, 24) || "Explorador";
      let r, pid, token;
      if (d.token && typeof d.code === "string") {
        r = rooms.get(d.code.toUpperCase());
        const old =
          r && [...r.sim.players.values()].find((p) => p.token === d.token);
        if (old && (!old.connected || !io.sockets.sockets.has(old.socket))) {
          pid = old.id;
          token = old.token;
          old.connected = true;
          old.socket = s.id;
          old.disconnectedAt = 0;
        } else
          return ack({
            error: "Sessão encerrada ou já conectada. Entre novamente.",
            expired: true,
          });
      } else if (d.mode === "host") {
        if (rooms.size >= 30) return ack({ error: "Servidor cheio." });
        let code;
        do {
          code = randomBytes(3).toString("hex").toUpperCase();
        } while (rooms.has(code));
        const seed =
          typeof d.seed === "string" && d.seed.trim()
            ? Array.from(d.seed.slice(0, 80)).reduce(
                (h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0,
                17,
              )
            : randomBytes(4).readUInt32LE();
        r = {
          code,
          host: null,
          sim: new Simulation(seed, (e, p) => io.to(code).emit(e, p)),
        };
        rooms.set(code, r);
      } else {
        const code = String(d.code || "")
          .toUpperCase()
          .trim();
        r = code
          ? rooms.get(code)
          : rooms.size === 1
            ? [...rooms.values()][0]
            : null;
        if (!r)
          return ack({
            error:
              "Sala não encontrada. Confira o endereço e informe o código se houver várias salas.",
          });
      }
      if (!pid) {
        if (r.sim.players.size >= 2)
          return ack({ error: "Sala cheia: limite de dois jogadores." });
        pid = randomBytes(8).toString("hex");
        token = randomBytes(24).toString("hex");
        const p = r.sim.add(pid, name, d.color, d.character);
        p.token = token;
        p.socket = s.id;
        if (!r.host) r.host = pid;
      }
      s.data.code = r.code;
      s.data.pid = pid;
      s.join(r.code);
      ack({
        id: pid,
        token,
        code: r.code,
        seed: r.sim.seed,
        host: r.host,
        snapshot: snapshot(r),
      });
      io.to(r.code).emit("notice", `${r.sim.players.get(pid).name} conectado.`);
    });
    s.on("input", (d) => resolve()?.sim.input(s.data.pid, d));
    // A mesma pausa aplicada ao relógio precisa bloquear ações instantâneas.
    const playing = () => {
      const r = resolve();
      return r?.sim.players.get(r.host)?.connected ? r : null;
    };
    s.on("shoot", (d) => playing()?.sim.queueShot(s.data.pid, d));
    s.on("reload", (d) => playing()?.sim.queueReload(s.data.pid, d));
    s.on("interact", (d) => {
      const r = playing(); if (!r) return;
      const completed = !!r.sim.transition || r.sim.won;
      r.sim.queueInteract(s.data.pid, d);
      // NOVO: marcos da campanha usam entrega confiável, não snapshots voláteis.
      if (!completed && (r.sim.transition || r.sim.won))
        io.to(r.code).emit("stage-complete", snapshot(r));
    });
    s.on("restart", () => {
      const r = resolve();
      if (r && r.host === s.data.pid) {
        r.sim.reset();
        io.to(r.code).emit("reset", snapshot(r));
      }
    });
    s.on("next-level", () => {
      const r = resolve();
      if (r && r.host === s.data.pid && r.sim.players.get(r.host)?.connected && r.sim.transition) {
        r.sim.continueLevel();
        io.to(r.code).emit("stage-start", snapshot(r));
      }
    });
    s.on("echo", (ack) => {
      if (typeof ack === "function") ack();
    });
    s.on("leave", () => {
      const r = resolve();
      if (!r) return;
      if (r.host === s.data.pid) closeRoom(r, "O host encerrou a sala.");
      else {
        r.sim.players.delete(s.data.pid);
        s.leave(r.code);
        s.data.code = null;
      }
    });
    s.on("disconnect", () => {
      const r = resolve();
      if (r) {
        const p = r.sim.players.get(s.data.pid);
        p.connected = false;
        p.input = {};
        p.inputQueue = []; p.commandMode = false; p.commandReceived = p.seq; p.physicsCredit = 0;
        p.pendingShots = [];
        p.moving = false;
        p.disconnectedAt = Date.now();
        io.to(r.code).emit(
          "notice",
          `${p.name} desconectou. Vaga reservada por 45 segundos.`,
        );
      }
    });
  });
  // 30 Hz de simulação; snapshots a 15 Hz. Nenhum segredo de sessão é transmitido.
  let tick = 0, simulationClock = performance.now(), simulationAccumulator = 0;
  const timer = setInterval(() => {
    // UPDATE: setInterval pode atrasar com carga. Recuperar passos fixos evita
    // que o relógio do servidor fique para trás da previsão local.
    const now = performance.now();
    simulationAccumulator += Math.min(1, Math.max(0, (now - simulationClock) / 1000)); simulationClock = now;
    const steps = Math.floor((simulationAccumulator + 1e-9) * 30);
    simulationAccumulator -= steps / 30;
    for (const r of rooms.values()) {
      for (const [id, p] of r.sim.players)
        if (!p.connected && Date.now() - p.disconnectedAt > 45000) {
          if (id === r.host) {
            closeRoom(r, "O host ficou offline. Crie uma nova sala.");
            break;
          }
          r.sim.players.delete(id);
        }
      if (!rooms.has(r.code)) continue;
      const completed = !!r.sim.transition || r.sim.won;
      if (r.sim.players.get(r.host)?.connected) for (let step = 0; step < steps; step++) r.sim.update(1 / 30);
      if (!completed && (r.sim.transition || r.sim.won)) io.to(r.code).emit("stage-complete", snapshot(r));
      if (steps && Math.floor((tick + steps) / 2) !== Math.floor(tick / 2)) io.to(r.code).volatile.emit("snapshot", snapshot(r));
    }
    tick += steps;
  }, 1000 / 30);
  try {
    await new Promise((resolve, reject) => {
      http.once("error", reject);
      http.listen(port, host, resolve);
    });
  } catch (e) {
    clearInterval(timer);
    io.close();
    throw e;
  }
  return {
    http,
    io,
    rooms,
    port: http.address().port,
    close: async () => {
      clearInterval(timer);
      await new Promise((r) => io.close(r));
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  startServer()
    .then((s) => {
      const url = `http://localhost:${s.port}`;
      console.log(
        `BACKROOMS ECHO\n${url}\nMantenha esta janela aberta enquanto joga. Ctrl+C encerra.`,
      );
      process.send?.({ type: "ready", port: s.port });
      if (process.argv.includes("--open")) {
        const [cmd, args] =
          process.platform === "win32"
            ? ["cmd", ["/c", "start", "", url]]
            : process.platform === "darwin"
              ? ["open", [url]]
              : ["xdg-open", [url]];
        const c = spawn(cmd, args, { stdio: "ignore", detached: true });
        c.on("error", () => {});
        c.unref();
      }
      const stop = () => s.close().then(() => process.exit(0));
      process.on("SIGTERM", stop);
      process.on("SIGINT", stop);
      process.on("message", (m) => {
        if (m === "shutdown") stop();
      });
    })
    .catch((e) => {
      console.error(
        e.code === "EADDRINUSE"
          ? "Porta ocupada. Feche a outra instância ou use PORT=3001."
          : e,
      );
      process.send?.({ type: "error", message: e.message });
      process.exit(1);
    });
