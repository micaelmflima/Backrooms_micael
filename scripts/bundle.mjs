// NOVO: reúne o projeto completo em um arquivo Node executável, sem CDN.
// As fontes continuam separadas para desenvolvimento e são preservadas byte a byte.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
async function collect(relative) {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = relative ? relative + "/" + e.name : e.name;
    if (e.isDirectory()) await collect(name);
    else if (e.isFile()) {
      const bytes = await readFile(path.join(root, name));
      const binary = /\.(png|jpe?g|ico|woff2?|zip|exe|fbx|glb|bin|tga)$/i.test(name);
      files.push({ name, encoding: binary ? "base64" : "utf8", content: bytes.toString(binary ? "base64" : "utf8") });
    }
  }
}
for (const dir of ["client", "server", "shared", "electron", "assets", "scripts", "tests", "docs", "original", "backups"]) await collect(dir);
for (const name of ["package.json", "package-lock.json", "README.md", "LEIA_PRIMEIRO.txt", "LICENSE", "iniciar.bat", "iniciar.sh", "gerar-exe.bat", ".gitignore"]) {
  files.push({ name, encoding: "utf8", content: await readFile(path.join(root, name), "utf8") });
}
const json = JSON.stringify(files, null, 2);
const hash = createHash("sha256").update(json).digest("hex");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const header = [
  "#!/usr/bin/env node",
  "'use strict';",
  "// BACKROOMS ECHO " + pkg.version + " — CÓDIGO COMPLETO EM UM ÚNICO ARQUIVO.",
  "// Execute: node Backrooms-ECHO-Completo.cjs (Node.js 22+).",
  "// --extract-only: extrai as fontes sem instalar nem iniciar o servidor.",
  "// Este arquivo inclui cliente 3D, servidor, multiplayer, campanha, desktop,",
  "// recursos, documentação e testes. A primeira instalação requer internet.",
  "// A pasta extraída é própria desta versão; nunca substitui o jogo anterior.",
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const cp = require('node:child_process');",
  "const crypto = require('node:crypto');",
  "const version = " + JSON.stringify(pkg.version) + ";",
  "const payloadHash = " + JSON.stringify(hash) + ";",
  "// Fontes completas, com nomes e codificação explícitos. Não há trechos omitidos.",
  "const files = " + json + ";",
];
const launcher = [
  "function main() {",
  "  if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Instale Node.js LTS 22 ou superior.');",
  "  const actual = crypto.createHash('sha256').update(JSON.stringify(files, null, 2)).digest('hex');",
  "  if (actual !== payloadHash) throw Error('Arquivo alterado: gere novamente com npm run bundle.');",
  "  const root = path.join(__dirname, 'Backrooms-ECHO-' + version + '-' + payloadHash.slice(0, 8));",
  "  const marker = path.join(root, '.echo-bundle.json');",
  "  if (!fs.existsSync(marker)) {",
  "    if (fs.existsSync(root) && fs.readdirSync(root).length) throw Error('A extração anterior está incompleta. Renomeie essa pasta e execute novamente: ' + root);",
  "    fs.mkdirSync(root, { recursive: true });",
  "    for (const f of files) {",
  "      const target = path.join(root, f.name);",
  "      fs.mkdirSync(path.dirname(target), { recursive: true });",
  "      fs.writeFileSync(target, Buffer.from(f.content, f.encoding), { flag: 'wx' });",
  "    }",
  "    fs.writeFileSync(marker, JSON.stringify({ version, payloadHash }));",
  "  }",
  "  console.log('Projeto completo: ' + root);",
  "  if (process.argv.includes('--extract-only')) return;",
  "  const missing = ['express', 'socket.io', 'three'].some((name) => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')));",
  "  if (missing) {",
  "    console.log('Instalando dependências locais do navegador. Aguarde...');",
  "    const win = process.platform === 'win32';",
  "    const install = cp.spawnSync(win ? 'cmd.exe' : 'npm', win ? ['/d', '/s', '/c', 'npm install --omit=dev'] : ['install', '--omit=dev'], { cwd: root, stdio: 'inherit' });",
  "    if (install.error) throw install.error;",
  "    if (install.status !== 0) throw Error('Instalação falhou. Confira a conexão e execute novamente.');",
  "  }",
  "  console.log('Mantenha esta janela aberta enquanto joga.');",
  "  const child = cp.spawn(process.execPath, ['server/index.js', '--open'], { cwd: root, stdio: 'inherit' });",
  "  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });",
  "  child.on('exit', (code) => { process.exitCode = code || 0; });",
  "  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!child.killed) child.kill(signal); });",
  "}",
  "try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }",
];
const output = path.resolve(process.argv[2] || path.join(root, "Backrooms-ECHO-Completo.cjs"));
await writeFile(output, header.concat(launcher).join("\n") + "\n");
console.log(output + " — " + files.length + " arquivos, SHA-256 " + hash);
