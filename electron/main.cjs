const { app, BrowserWindow, dialog, session } = require("electron");
const path = require("node:path");
const { fork } = require("node:child_process");
let server,
  window,
  quitting = false,
  ready = false,
  port = 3000;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler(
      (contents, permission, cb) => {
        let local = false;
        try {
          local =
            new URL(contents.getURL()).origin === `http://localhost:${port}`;
        } catch {}
        cb(
          local &&
            ["pointerLock", "fullscreen", "clipboard-sanitized-write"].includes(
              permission,
            ),
        );
      },
    );
    let retry = false;
    function boot(p) {
      server = fork(path.join(__dirname, "..", "server", "index.js"), [], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(p) },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      let log = "";
      server.stdout.on("data", () => {});
      server.stderr.on("data", (d) => {
        log = (log + d).slice(-3000);
      });
      server.on("message", (m) => {
        if (m.type !== "ready") return;
        port = m.port;
        ready = true;
        window = new BrowserWindow({
          width: 1440,
          height: 900,
          minWidth: 900,
          minHeight: 620,
          backgroundColor: "#11150d",
          title: "Backrooms ECHO",
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            backgroundThrottling: false,
          },
        });
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.webContents.on("will-navigate", (e, u) => {
          if (new URL(u).origin !== `http://localhost:${port}`)
            e.preventDefault();
        });
        window.loadURL(`http://localhost:${port}`);
        window.on("closed", () => {
          window = null;
          app.quit();
        });
      });
      server.on("error", (e) => {
        dialog.showErrorBox("Falha ao iniciar", e.message);
        app.quit();
      });
      server.on("exit", (code) => {
        if (quitting) return;
        if (!ready && !retry && log.includes("Porta ocupada")) {
          retry = true;
          boot(3001);
          return;
        }
        dialog.showErrorBox("Servidor encerrado", `Código ${code}. ${log}`);
        app.quit();
      });
    }
    boot(3000);
  });
  app.on("before-quit", () => {
    quitting = true;
    if (server?.connected) server.send("shutdown");
    setTimeout(() => server?.kill(), 1200).unref();
  });
  app.on("window-all-closed", () => app.quit());
}
