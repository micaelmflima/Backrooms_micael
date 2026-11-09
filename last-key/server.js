'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomInt, randomBytes } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.avif': 'image/avif'
};

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    const file = path.resolve(PUBLIC, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(PUBLIC + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const info = await fs.promises.stat(file);
    if (!info.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    res.writeHead(error instanceof URIError ? 400 : 404).end();
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const GRACE_MS = 30_000;

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function member(socket) {
  return { socket, token: randomBytes(18).toString('hex') };
}

function announce(room) {
  room.members.forEach((person, slot) => {
    if (!person?.socket) return;
    send(person.socket, {
      type: 'room', code: room.code, slot, token: person.token,
      paired: room.members.every(entry => entry?.socket), started: room.started,
      remaining: room.deadline ? Math.max(0, room.deadline - Date.now()) : 0
    });
  });
}

function removeRoom(room, reason) {
  if (rooms.get(room.code) !== room) return;
  rooms.delete(room.code);
  clearTimeout(room.timer);
  for (const person of room.members) {
    if (person?.socket) {
      send(person.socket, { type: 'expired', reason });
      person.socket.room = null;
    }
  }
}

function detach(socket, intentional = false) {
  const room = socket.room;
  if (!room || rooms.get(room.code) !== room) return;
  const slot = room.members.findIndex(person => person?.socket === socket);
  if (slot < 0) return;
  socket.room = null;
  room.members[slot].socket = null;
  if (!room.started && slot === 1) {
    room.members[1] = null;
    announce(room);
    return;
  }
  if (intentional || !room.started) {
    removeRoom(room, 'A sala foi encerrada.');
    return;
  }
  if (!room.deadline) {
    room.deadline = Date.now() + GRACE_MS;
    room.timer = setTimeout(() => removeRoom(room, 'O prazo de reconexão acabou.'), GRACE_MS);
  }
  announce(room);
}

wss.on('connection', socket => {
  socket.alive = true;
  socket.on('error', () => {});
  socket.on('pong', () => { socket.alive = true; });
  socket.on('close', () => detach(socket));

  socket.on('message', (data, binary) => {
    if (binary) return;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    const error = reason => send(socket, { type: 'error', reason });
    const room = socket.room;
    const slot = room?.members.findIndex(person => person?.socket === socket);

    if (msg.type === 'ping') return send(socket, { type: 'pong', sent: msg.sent });
    if (msg.type === 'leave') return detach(socket, true);

    if (!room && msg.type === 'create_room') {
      if (rooms.size >= 1000) return error('Servidor cheio. Tente novamente em instantes.');
      let code;
      do {
        code = Array.from({ length: 4 }, () => LETTERS[randomInt(LETTERS.length)]).join('');
      } while (rooms.has(code));
      const next = { code, members: [member(socket), null], started: false, deadline: 0 };
      rooms.set(code, next);
      socket.room = next;
      announce(next);
      return;
    }

    if (!room && (msg.type === 'join_room' || msg.type === 'resume')) {
      const next = rooms.get(typeof msg.code === 'string' ? msg.code.toUpperCase() : '');
      if (!next) return error('Sala não encontrada ou encerrada.');
      if (msg.type === 'resume') {
        const person = next.members.find(entry => entry?.token === msg.token);
        if (!person || !next.started) return error('A reconexão não está disponível.');
        if (person.socket) {
          person.socket.room = null;
          person.socket.terminate();
        }
        person.socket = socket;
        if (next.members.every(entry => entry?.socket)) {
          clearTimeout(next.timer);
          next.deadline = 0;
        }
      } else {
        if (next.members[1] || next.started || !next.members[0]?.socket) return error('Esta sala já está ocupada.');
        next.members[1] = member(socket);
      }
      socket.room = next;
      announce(next);
      if (next.members.every(person => person?.socket) && next.start) {
        send(next.members[1].socket, next.start);
      }
      return;
    }

    if (!room || slot < 0 || !room.members.every(person => person?.socket)) return;
    const peer = room.members[1 - slot].socket;
    if (msg.type === 'start' && slot === 0 && Number.isInteger(msg.seed) &&
        msg.seed >= 0 && msg.seed <= 0xffffffff && Number.isSafeInteger(msg.round)) {
      room.started = true;
      room.start = { type: 'start', seed: msg.seed, round: msg.round };
      send(peer, room.start);
      return;
    }
    if (!room.started) return;
    if ((slot === 1 && msg.type === 'input') ||
        (slot === 0 && (msg.type === 'snapshot' || msg.type === 'event'))) {
      if (peer.bufferedAmount < 256 * 1024) send(peer, msg);
    }
  });
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.alive) socket.terminate();
    else {
      socket.alive = false;
      socket.ping();
    }
  }
}, 5_000);
wss.on('close', () => clearInterval(heartbeat));

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log('Last Key pronto em http://localhost:' + server.address().port));
