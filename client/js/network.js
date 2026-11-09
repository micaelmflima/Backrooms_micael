// IP/hostname sem protocolo usa a porta padrão do jogo. URLs completas
// preservam a porta informada, inclusive as portas implícitas 80 e 443.
export function resolveGameAddress(value, page = location) {
  const address = String(value || "").trim();
  if (!address) return page.origin;
  const explicit = /^[a-z][a-z\d+.-]*:\/\//i.test(address);
  let parsed;
  try { parsed = new URL(explicit ? address : "http://" + address); }
  catch { throw Error("Use um endereço HTTP ou HTTPS válido."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
    throw Error("Use um endereço HTTP ou HTTPS válido.");
  const authority = address.split(/[/?#]/)[0];
  if (!explicit && !/:\d+$/.test(authority)) parsed.port = "3000";
  if (page.protocol === "https:" && parsed.protocol === "http:")
    throw Error("Esta página usa HTTPS. Use uma URL HTTPS do host.");
  return parsed.origin;
}

export class Network {
  constructor(onState, onEvent, onStatus) {
    Object.assign(this, {
      onState,
      onEvent,
      onStatus,
      socket: null,
      session: null,
      ping: 0,
    });
  }
  async connect(options) {
    this.close(false);
    const url = resolveGameAddress(options.url);
    this.url = url;
    const socket = io(url, {
      reconnection: true,
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
      timeout: 8000,
      transports: ["websocket", "polling"],
      tryAllTransports: true,
    });
    this.socket = socket;
    let initial = true;
    return new Promise((resolve, reject) => {
      socket.on("connect", () => {
        this.onStatus("SINCRONIZANDO");
        const request = this.session
          ? {
              code: this.session.code,
              token: this.session.token,
              name: options.name,
            }
          : { ...options };
        socket.timeout(8000).emit("enter", request, (err, result) => {
          if (err || result?.error) {
            const msg = err ? "O servidor não respondeu." : result.error;
            if (initial) {
              initial = false;
              clearInterval(this.timer);
              socket.disconnect();
              reject(Error(msg));
            } else {
              this.onEvent("closed", msg);
              this.close();
            }
            return;
          }
          this.session = {
            id: result.id,
            token: result.token,
            code: result.code,
            seed: result.seed,
            host: result.host,
          };
          sessionStorage.setItem(
            "echo-session",
            JSON.stringify({ ...this.session, url, name: options.name }),
          );
          this.onState(result.snapshot);
          this.onStatus("CONECTADO");
          if (initial) {
            initial = false;
            resolve({ ...result, url });
          } else this.onEvent("rejoined", result);
        });
      });
      socket.on("connect_error", () => {
        this.onStatus("SEM CONEXÃO");
        if (initial) {
          initial = false;
          clearInterval(this.timer);
          socket.disconnect();
          reject(
            Error(
              "Não foi possível conectar. Confira IP, porta, firewall e se o host está aberto.",
            ),
          );
        }
      });
      socket.on("disconnect", () => this.onStatus("RECONECTANDO…"));
      socket.on("snapshot", this.onState);
      for (const ev of ["effect", "notice", "reset", "closed", "stage-complete", "stage-start"])
        socket.on(ev, (d) => this.onEvent(ev, d));
      this.timer = setInterval(() => {
        if (this.ready()) {
          const t = performance.now();
          socket.timeout(3500).emit("echo", (err) => {
            if (!err) this.ping = Math.round(performance.now() - t);
          });
        }
      }, 2000);
    });
  }
  // ALTERADO: não escreva enquanto o transporte já estiver fechando.
  ready() {
    const engine = this.socket?.io?.engine, transport = engine?.transport;
    return !!this.socket?.connected && engine?.readyState === "open" &&
      (transport?.name !== "websocket" || transport.ws?.readyState === 1);
  }
  send(e, d) {
    if (this.ready()) this.socket.emit(e, d);
  }
  close(leave = true) {
    clearInterval(this.timer);
    if (this.socket) {
      if (leave) this.send("leave");
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this.socket = null;
    this.session = null;
    sessionStorage.removeItem("echo-session");
  }
}
