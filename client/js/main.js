import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import {
  World,
  CELL,
  CHUNK,
  EYE,
  SPAWN,
  RELAYS,
  MONSTERS,
  rayBox,
  supply,
} from "/shared/world.js";
import { WorldView } from "./world-view.js";
import { ActorPool, Weapon } from "./actors.js";
import { ShotEffects } from "./shot-effects.js";
import { LEVELS, levelConfig, exitReady } from "/shared/levels.js";
import { DEFAULT_PLAYER_COLOR } from "/shared/config.js";
import { cameraPosition } from "/shared/weapon.js";
import { AudioEngine } from "./audio.js";
import { Network } from "./network.js";
import { LocalMotion } from "./local-motion.js";
import { PlayerCharacters } from "./player-characters.js";
import { CharacterMenu } from "./character-menu.js";
import { prepareMedkit } from "./model-assets.js";
import { characterConfig } from "/shared/characters.js";
const $ = (id) => document.getElementById(id),
  canvas = $("game");
let quality = "high";
try {
  quality = localStorage.getItem("echo-quality") === "low" ? "low" : "high";
} catch {}
$("quality").value = quality;
let renderer;
try {
  renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (e) {
  $("error").textContent =
    "WebGL 2 indisponível. Ative a aceleração gráfica e atualize o driver de vídeo.";
  throw e;
}
renderer.setPixelRatio(
  quality === "low" ? 0.85 : Math.min(devicePixelRatio, 1.5),
);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = quality === "high";
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
const scene = new T.Scene();
scene.background = new T.Color(0x171b10);
scene.fog = new T.FogExp2(0x272b19, 0.039);
const hemisphere = new T.HemisphereLight(0xe2dfae, 0x3c3824, 0.85), ambient = new T.AmbientLight(0xa39e76, 0.14);
scene.add(hemisphere, ambient);
const camera = new T.PerspectiveCamera(
  76,
  innerWidth / innerHeight,
  0.055,
  100,
);
camera.rotation.order = "YXZ";
camera.position.set(SPAWN.x, EYE, SPAWN.z);
const flashlight = new T.SpotLight(0xffedc5, 34, 25, Math.PI / 7, 0.6, 1.4);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(1024, 1024);
flashlight.shadow.bias = -0.00035;
flashlight.shadow.normalBias = 0.035;
flashlight.shadow.radius = 3;
flashlight.shadow.camera.near = 0.2;
scene.add(flashlight, flashlight.target);
const gunlight = new T.PointLight(0xffbe64, 0, 6);
scene.add(gunlight);
let gunlightTime = 0;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new T.Vector2(innerWidth, innerHeight),
  0.24,
  0.4,
  0.92,
);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grain = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    amount: { value: 0.027 },
  },
  vertexShader:
    "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader:
    "uniform sampler2D tDiffuse;uniform float time;uniform float amount;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float n=fract(sin(dot(vUv+fract(time),vec2(12.9898,78.233)))*43758.5453);c+=(n-.5)*amount;c*=1.-.012*sin(vUv.y*1100.+time*2.);gl_FragColor=vec4(c,1.);}",
});
composer.addPass(grain);
const audio = new AudioEngine(),
  weapon = new Weapon(), actorPool = new ActorPool(scene),
  characterActors = new PlayerCharacters(scene), shotEffects = new ShotEffects(scene);
let self = characterActors.acquire("capsule");
self.root.visible = false;
$("player-color").value = DEFAULT_PLAYER_COLOR;
const characterMenu = new CharacterMenu(() => {}, () => $("player-color").value);
const pendingPlayers = new Map();
const pendingShots = new Map();
let thirdPerson = false, transitioning = false, shotSequence = 0, lastShot = null;
const muzzle = new T.Vector3(), aimDirection = new T.Vector3(), shotPose = {},
  fpsSamples = new Float32Array(180);
let fpsFrames = 0, fpsElapsed = 0, sampleCursor = 0, shadowClock = 0;
let world = new World(17),
  view = new WorldView(scene, world, quality),
  active = false,
  mode = "host",
  session = null,
  snapshot = null,
  local = null,
  locked = false,
  ended = false,
  lightOn = true,
  reduced = false;
let time = 0,
  last = performance.now(),
  shotAt = -10,
  footClock = 0,
  noticeUntil = 0,
  hitUntil = 0,
  damage = 0,
  uiClock = 0,
  networkStatus = "",
  jumpUntil = 0,
  aimYaw = 0,
  aimPitch = 0,
  lookAfter = 0,
  skipLookEvents = 0,
  pointerAnchorX = null,
  pointerAnchorY = null,
  invite = "";
const keys = new Set(),
  monsters = new Map(),
  players = new Map(),
  lastAudio = new Map(),
  forward = new T.Vector3(),
  lightOffset = new T.Vector3(0.12, -0.13, 0);
const motion = new LocalMotion(world), renderPose = {};
const network = new Network(receive, event, (status) => {
  networkStatus = status;
  if (status !== "CONECTADO") keys.clear();
});
function notice(text, seconds = 5) {
  $("notice").textContent = text;
  noticeUntil = time + seconds;
}
function clearActors() {
  for (const a of monsters.values()) actorPool.release(a);
  for (const a of players.values()) characterActors.release(a);
  pendingPlayers.clear();
  pendingShots.clear();
  monsters.clear();
  players.clear();
  lastAudio.clear();
  shotEffects.clear(); self.root.visible = false;
}
function rebuild(seed, level = 0) {
  view.dispose();
  world = new World(seed, level);
  motion.world = world;
  view = new WorldView(scene, world, quality);
  clearActors();
  const cfg = levelConfig(level);
  scene.background.setHex(cfg.background); scene.fog.color.setHex(cfg.fog); scene.fog.density = cfg.density;
  hemisphere.color.setHex(cfg.ambient); hemisphere.groundColor.setHex(cfg.ground);
  ambient.color.setHex(cfg.ambient); flashlight.color.setHex(cfg.light);
  audio.setLevel(level);
}
function receive(s) {
  snapshot = s;
  if (!active || !session) return;
  const changed = world.seed !== s.mapSeed || world.level !== s.level;
  if (changed) {
    rebuild(s.mapSeed, s.level); local = null; transitioning = false; ended = false;
    $("transition").hidden = $("end").hidden = true;
    keys.clear();
  }
  const p = s.players.find((p) => p.id === session.id);
  if (!p) return;
  const now = performance.now();
  if (!local) local = motion.reset(p, now);
  else {
    if (p.hp < local.hp) {
      damage = 0.65;
      audio.hurt();
    }
    advanceMotion(now);
    motion.reconcile(p, now);
    for (const k of [
      "hp",
      "reserve",
      "reload",
      "connected",
    ])
      local[k] = p[k];
    for (const [id, expires] of pendingShots) if (performance.now() > expires) pendingShots.delete(id);
    local.ammo = Math.max(0, p.ammo - pendingShots.size);
  }
  if (changed) { aimYaw = p.yaw; aimPitch = p.pitch; showPause(); }
  if (s.transition && !transitioning) {
    transitioning = true; locked = false; keys.clear(); document.exitPointerLock();
    $("pause").hidden = true; $("transition").hidden = false;
    $("next-level").textContent = "LEVEL 0" + s.transition.to + " · " + LEVELS[s.transition.to].name;
    $("advance-level").hidden = session.id !== session.host;
    $("transition-help").textContent = session.id === session.host ? "Continue quando estiver pronto. A passagem pausa as criaturas." : "Aguardando o host continuar a expedição.";
  }
  weapon.setColor(p.color); self.setColor(p.color);
  ensureSelf(p);
  const present = new Set();
  for (const m of s.monsters) {
    present.add(m.id);
    if (!monsters.has(m.id)) monsters.set(m.id, actorPool.acquire(m.type));
  }
  for (const [id, a] of monsters)
    if (!present.has(id)) {
      actorPool.release(a);
      monsters.delete(id);
      lastAudio.delete(id);
    }
  const pp = new Set();
  for (const p of s.players)
    if (p.id !== session.id) {
      pp.add(p.id);
      ensureRemote(p);
    }
  for (const [id, a] of players)
    if (!pp.has(id)) {
      characterActors.release(a);
      players.delete(id);
      lastAudio.delete(id);
    }
}
// UPDATE: os modelos carregam fora do frame. O companheiro conserva a escolha
// em reconexões e mudanças de nível, sem trocar por um personagem substituto.
function ensureSelf(p) {
  const id = characterConfig(p.character).id;
  if (self.character === id) return;
  const currentSession = session;
  characterActors.prepare(id).then(() => {
    if (!active || session !== currentSession || characterConfig(snapshot?.players.find((q) => q.id === session.id)?.character).id !== id || self.character === id) return;
    characterActors.release(self); self = characterActors.acquire(id, p.name, p.color); self.root.visible = false;
  }).catch((error) => notice("Não foi possível carregar seu personagem: " + error.message, 8));
}
function ensureRemote(p) {
  const id = characterConfig(p.character).id, existing = players.get(p.id);
  if (existing?.character === id || pendingPlayers.has(p.id)) return;
  if (existing) { characterActors.release(existing); players.delete(p.id); }
  const token = {}; pendingPlayers.set(p.id, token);
  characterActors.prepare(id).then(() => {
    if (pendingPlayers.get(p.id) !== token) return;
    pendingPlayers.delete(p.id);
    if (active && snapshot?.players.some((q) => q.id === p.id)) players.set(p.id, characterActors.acquire(id, p.name, p.color));
  }).catch((error) => {
    if (pendingPlayers.get(p.id) === token) { pendingPlayers.delete(p.id); notice("Modelo do companheiro: " + error.message, 8); }
  });
}
function event(type, d) {
  if (type === "stage-complete" || type === "stage-start") { receive(d); ui(); return; }
  if (type === "notice") {
    notice(d);
    return;
  }
  if (type === "closed") {
    leave(false);
    $("error").textContent = d;
    return;
  }
  if (type === "reset") {
    transitioning = false; $("transition").hidden = true;
    clearActors();
    local = null;
    snapshot = d;
    ended = false;
    $("end").hidden = true;
    receive(d);
    aimYaw = local?.yaw || 0;
    aimPitch = local?.pitch || 0;
    shotAt = -10;
    notice("Nova expedição iniciada.");
    showPause();
    return;
  }
  if (type === "rejoined") {
    session = { ...d };
    local = null;
    receive(d.snapshot);
    aimYaw = local?.yaw || 0;
    aimPitch = local?.pitch || 0;
    notice("Conexão recuperada.");
    showPause();
    return;
  }
  if (type !== "effect" || !active) return;
  const own = d.id === session.id;
  if (d.type === "shot") {
    if (own) pendingShots.delete(d.shotId);
    if (!own) audio.shot(d.origin);
    if (own && d.hit) {
      hitUntil = time + 0.16;
      if (d.killed) notice("Entidade neutralizada.", 1.5);
    }
    if (d.surface) {
      audio.impact(d.point);
      addMark(d.point, d.normal);
    }
    shotEffects.fire(d.id + ":" + d.shotId, d.origin, d.point, reduced);
    if (!own && !reduced) {
      gunlight.position.set(d.origin.x, d.origin.y, d.origin.z);
      gunlightTime = 0.06;
    }
  } else if (d.type === "reload") {
    if (!own) audio.reload(d);
  } else if (d.type === "pickup") audio.pickup();
}
function addMark(p, n) {
  shotEffects.impact(p, n);
}
function readInput() {
  return {
    forward: locked ? Number(keys.has("KeyW")) - Number(keys.has("KeyS")) : 0,
    side: locked ? Number(keys.has("KeyD")) - Number(keys.has("KeyA")) : 0,
    sprint: locked && (keys.has("ShiftLeft") || keys.has("ShiftRight")),
    jump: locked && (keys.has("Space") || time < jumpUntil),
    yaw: aimYaw,
    pitch: aimPitch,
  };
}
// UPDATE: previsão e envio compartilham comandos; nunca arredondam coordenadas.
function advanceMotion(now = performance.now()) {
  motion.advance(now, readInput(), active && local && network.ready() && snapshot?.hostConnected && !transitioning && !snapshot?.won);
}
function sendMotion() {
  if (!active || !local || transitioning || !network.ready()) return;
  advanceMotion();
  network.send("input", motion.packet(snapshot.revision));
}
async function lock() {
  if (!active || ended || transitioning) return;
  await audio.start();
  try {
    await canvas.requestPointerLock();
  } catch {
    notice("Clique em CONTINUAR para capturar o mouse.");
  }
}
function showPause() {
  if (!active || ended || transitioning) return;
  // Reinício e reconexão também abrem o menu por evento do servidor.
  // Libere o cursor e zere entradas antes de exibir botões clicáveis.
  locked = false;
  keys.clear();
  jumpUntil = 0;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  sendMotion();
  $("pause").hidden = false;
  $("restart-pause").hidden = session.id !== session.host;
}
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  keys.clear();
  lookAfter = performance.now() + 120;
  skipLookEvents = 2;
  pointerAnchorX = pointerAnchorY = null;
  if (locked) $("pause").hidden = true;
  else showPause();
});
document.addEventListener("pointerlockerror", () => {
  if (active) notice("Clique em CONTINUAR para capturar o mouse.");
});
document.addEventListener("mousemove", (e) => {
  // Alguns navegadores enviam um deslocamento artificial ao prender o cursor.
  // Descartar esses eventos evita que a câmera salte ao voltar de outra janela.
  if (skipLookEvents > 0) { skipLookEvents--; return; }
  if (!document.hasFocus() || Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
  if (
    locked &&
    !ended &&
    document.pointerLockElement === canvas &&
    performance.now() > lookAfter
  ) {
    // UPDATE: em Pointer Lock, clientX/Y ficam fixos. Uma mudança absoluta
    // indica reposicionamento do cursor ao focar/clicar outra janela/menu.
    // Descarte esse delta artificial, sem amortecer o movimento real do mouse.
    if (e.isTrusted && (pointerAnchorX !== e.clientX || pointerAnchorY !== e.clientY)) {
      pointerAnchorX = e.clientX; pointerAnchorY = e.clientY; return;
    }
    const s = Number($("sensitivity").value) * 0.00045;
    aimYaw -= e.movementX * s;
    aimPitch = Math.max(-1.45, Math.min(1.45, aimPitch - e.movementY * s));
  }
});
window.addEventListener("blur", () => {
  keys.clear();
  if (locked) document.exitPointerLock();
});
document.addEventListener("keydown", (e) => {
  if (!active || !locked) return;
  if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code))
    e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === "Space") jumpUntil = time + 0.18;
  if (
    e.code === "KeyR" &&
    local.hp > 0 &&
    local.ammo < 12 &&
    local.reserve > 0 &&
    local.reload <= 0
  ) {
    local.reload = 1.65;
    sendMotion(); network.send("reload", { seq: motion.sequence });
    audio.reload();
  }
  if (e.code === "KeyE") { sendMotion(); network.send("interact", { seq: motion.sequence }); }
  if (e.code === "KeyF") lightOn = !lightOn;
  if (e.code === "KeyV") thirdPerson = !thirdPerson;
  if (e.code === "Space") sendMotion();
});
document.addEventListener("keyup", (e) => keys.delete(e.code));
document.addEventListener("mousedown", (e) => {
  if (
    e.button !== 0 ||
    !active ||
    !locked ||
    ended ||
    transitioning ||
    !network.socket?.connected ||
    !snapshot.hostConnected
  )
    return;
  // A cadência usa tempo real: o relógio visual é limitado em frames lentos.
  const shotTime = performance.now() / 1000;
  if (
    local.hp > 0 &&
    local.reload <= 0 &&
    local.ammo > 0 &&
    shotTime - shotAt >= 0.24
  ) {
    shotAt = shotTime;
    local.ammo--;
    sendMotion();
    // NOVO: o marcador da arma é convertido de sua câmera sobreposta ao mundo.
    motion.render(performance.now(), shotPose);
    Object.assign(shotPose, { yaw: aimYaw, pitch: aimPitch });
    const cp = cameraPosition(shotPose, thirdPerson, world);
    camera.position.set(cp.x, cp.y, cp.z); camera.rotation.set(aimPitch, aimYaw, 0, "YXZ"); camera.updateMatrixWorld();
    if (thirdPerson) { self.update(shotPose, 1 / 60, time); self.root.position.set(shotPose.x, shotPose.y, shotPose.z); self.root.rotation.y = aimYaw + Math.PI; self.getMuzzle(muzzle); }
    else weapon.getMuzzleWorld(camera, muzzle);
    camera.getWorldDirection(aimDirection);
    const point = world.ray(camera.position, aimDirection);
    let distance = point.distance;
    for (const m of snapshot.monsters) if (m.hp > 0) {
      const cfg = MONSTERS[m.type]; distance = Math.min(distance, rayBox(camera.position, aimDirection,
        { x: m.x - cfg.radius, y: 0, z: m.z - cfg.radius }, { x: m.x + cfg.radius, y: cfg.height, z: m.z + cfg.radius }));
    }
    const origin = { x: muzzle.x, y: muzzle.y, z: muzzle.z }, target = {
      x: camera.position.x + aimDirection.x * distance, y: camera.position.y + aimDirection.y * distance, z: camera.position.z + aimDirection.z * distance };
    const shotId = ++shotSequence;
    pendingShots.set(shotId, performance.now() + 3500);
    shotEffects.fire(session.id + ":" + shotId, origin, target, reduced);
    lastShot = { yaw: aimYaw, pitch: aimPitch, origin, thirdPerson, shotId, seq: motion.sequence };
    network.send("shoot", lastShot);
    weapon.shoot(reduced);
    audio.shot();
    if (!reduced) {
      gunlight.position.copy(muzzle);
      gunlightTime = 0.04;
    }
  } else if (local.ammo <= 0 && local.reload <= 0)
    notice(
      local.reserve > 0
        ? "Carregador vazio. R para recarregar."
        : "Sem munição. Procure suprimentos.",
      2,
    );
});
function setMode(v) {
  mode = v;
  $("host-fields").hidden = v !== "host";
  $("join-fields").hidden = v !== "join";
  $("host-tab").classList.toggle("selected", v === "host");
  $("join-tab").classList.toggle("selected", v === "join");
  $("connect").innerHTML =
    v === "host"
      ? "INICIAR EXPLORAÇÃO <span>↗</span>"
      : "ENTRAR NA EXPEDIÇÃO <span>↗</span>";
}
$("host-tab").onclick = () => setMode("host");
$("join-tab").onclick = () => setMode("join");
$("address").value = location.origin;
$("connect").onclick = async () => {
  $("error").textContent = "";
  $("connect").disabled = true;
  try {
    await audio.start();
    $("error").textContent = "Carregando personagem e kit médico…";
    await Promise.all([characterActors.prepare(characterMenu.selected), prepareMedkit()]);
    view.installMedkits(); $("error").textContent = "";
    const result = await network.connect({
      mode,
      name: $("name").value,
      seed: $("seed").value,
      color: $("player-color").value,
      character: characterMenu.selected,
      code: $("room").value.trim().toUpperCase(),
      url:
        mode === "join"
          ? $("address").value.trim() || location.origin
          : location.origin,
    });
    begin(result);
    await lock();
  } catch (e) {
    $("error").textContent = e.message;
  } finally {
    $("connect").disabled = false;
  }
};
function begin(r) {
  session = r;
  active = true;
  local = null;
  ended = false;
  aimYaw = aimPitch = 0;
  lightOn = true;
  transitioning = false; $("transition").hidden = true;
  rebuild(r.snapshot.mapSeed, r.snapshot.level);
  $("lobby").hidden = true;
  $("hud").hidden = false;
  $("end").hidden = true;
  $("code").textContent = r.code;
  receive(r.snapshot);
  aimYaw = local?.yaw || 0;
  aimPitch = local?.pitch || 0;
  showPause();
  prepareInvite();
  notice(levelConfig(r.snapshot.level).objective + ". A saída está no ponto de partida.", 7);
}
async function prepareInvite() {
  let address = network.url;
  if (session.id === session.host &&
      ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname))
    try {
      const d = await fetch("/api/info").then((r) => r.json());
      if (d.addresses.length) address = `http://${d.addresses[0]}:${d.port}`;
    } catch {}
  if (!session) return;
  invite = `${address} — sala ${session.code}`;
  $("invite").textContent = `Envie ao amigo: ${invite}`;
}
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(invite);
    notice("Endereço e código copiados.");
  } catch {
    notice(invite, 12);
  }
};
$("resume").onclick = lock;
$("advance-level").onclick = () => network.send("next-level");
function leave(send = true) {
  network.close(send);
  active = ended = false;
  transitioning = false; $("transition").hidden = true;
  session = local = snapshot = null;
  keys.clear();
  document.exitPointerLock();
  $("hud").hidden = $("pause").hidden = $("end").hidden = true;
  $("lobby").hidden = false;
  clearActors();
  if (world.seed !== 17) rebuild(17);
}
$("leave").onclick = () => leave();
$("end-leave").onclick = () => leave();
$("restart").onclick = $("restart-pause").onclick = () =>
  network.send("restart");
$("volume").oninput = () => audio.setVolume(Number($("volume").value) / 100);
$("reduced").onchange = () => {
  reduced = $("reduced").checked;
  grain.uniforms.amount.value = reduced ? 0 : 0.027;
};
$("quality").onchange = () => {
  quality = $("quality").value;
  try {
    localStorage.setItem("echo-quality", quality);
  } catch {}
  renderer.setPixelRatio(
    quality === "low" ? 0.85 : Math.min(devicePixelRatio, 1.5),
  );
  renderer.shadowMap.enabled = quality === "high";
  composer.setPixelRatio(renderer.getPixelRatio());
  view.dispose();
  view = new WorldView(scene, world, quality);
};
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  weapon.camera.aspect = camera.aspect;
  weapon.camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  $("error").textContent = "Contexto gráfico perdido. Recarregue a página.";
  if (active)
    notice(
      "Contexto gráfico perdido. Recarregue a página para reconectar.",
      999,
    );
});
function ui() {
  if (!local || !snapshot) return;
  const cfg = levelConfig(snapshot.level), ready = exitReady(snapshot);
  $("health").style.width = local.hp + "%"; $("health-text").textContent = local.hp;
  $("stamina").style.width = local.stamina * 100 + "%";
  $("ammo").textContent = String(local.ammo).padStart(2, "0"); $("reserve").textContent = local.reserve;
  $("reload-state").textContent = local.reload > 0 ? "RECARREGANDO…" : "R · RECARREGAR";
  $("ping").textContent = network.ping + " ms";
  $("net").textContent = snapshot.hostConnected ? networkStatus : "HOST RECONECTANDO…";
  $("level-label").textContent = "LEVEL 0" + snapshot.level;
  $("sector").textContent = cfg.name + " · " + Math.floor(local.x / (CELL * CHUNK)) + " : " + Math.floor(local.z / (CELL * CHUNK));
  const remaining = Math.max(0, Math.ceil(cfg.survival - snapshot.levelElapsed));
  $("relay-marks").textContent = cfg.progress + ": " + snapshot.relays.length + "/3" + (cfg.survival ? " · Sobreviva: " + remaining + " s" : "");
  let target = null, nearest = Infinity;
  for (const item of RELAYS) if (!snapshot.relays.includes(item.id)) {
    const distance = Math.hypot(item.x - local.x, item.z - local.z);
    if (distance < nearest) { nearest = distance; target = item; }
  }
  const collecting = !!target;
  if (!target) target = SPAWN;
  const distance = Math.hypot(target.x - local.x, target.z - local.z);
  const angle = Math.atan2(-(target.x - local.x), -(target.z - local.z)) - aimYaw;
  const turn = Math.atan2(Math.sin(angle), Math.cos(angle));
  const arrow = Math.abs(turn) < 0.6 ? "↑" : Math.abs(turn) > 2.5 ? "↓" : turn > 0 ? "←" : "→";
  $("objective-text").textContent = collecting ? cfg.objective : ready ? "RETORNE À " + cfg.exit : "SOBREVIVA POR MAIS " + remaining + " s";
  $("objective-distance").textContent = arrow + " " + (collecting ? target.id : cfg.exit) + " / " + Math.round(distance) + " m";
  let prompt = "";
  const near = (o) => Math.hypot(o.x - local.x, o.z - local.z) < 2.8 && world.visible(local, o, 3);
  if (near(target)) prompt = collecting ? "E · " + cfg.action + " " + target.id : ready ? "E · " + (snapshot.level === 3 ? "CONCLUIR EXTRAÇÃO" : "SEGUIR AO PRÓXIMO NÍVEL") : "PORTA TRANCADA · " + remaining + " s";
  // Suprimentos conhecidos vêm do cache visual, em vez de gerar nove objetos por HUD.
  for (const c of view.chunks.values()) if (!snapshot.used.includes(c.item.id) && near(c.item))
    prompt = c.item.type === "ammo" ? local.reserve >= 120 ? "MUNIÇÃO CHEIA" : "E · PEGAR 36 MUNIÇÕES" : local.hp >= 100 ? "VIDA COMPLETA" : "E · USAR KIT MÉDICO";
  const other = snapshot.players.find((p) => p.id !== session.id);
  $("teammate").textContent = other ? other.name.slice(0, 12) + " · " + (other.connected ? other.hp + " HP" : "OFFLINE") : "SOZINHO NO SINAL";
  if (other?.hp <= 0 && near(other)) prompt = "E · REANIMAR COMPANHEIRO";
  $("interact").textContent = local.hp > 0 ? prompt : "";
  const threat = snapshot.monsters.some((m) => m.hp > 0 && (m.state === "chase" || m.state === "attack") && Math.hypot(m.x - local.x, m.z - local.z) < 24);
  $("threat").textContent = threat ? "VOCÊ NÃO ESTÁ SOZINHO" : "";
  audio.update(camera, threat, time, true);
  const shouldEnd = local.hp <= 0 || snapshot.won;
  if (shouldEnd && !ended && !transitioning) {
    ended = true; document.exitPointerLock(); $("pause").hidden = true; $("end").hidden = false;
    $("end-eyebrow").textContent = snapshot.won ? "TRANSMISSÃO RESTAURADA" : "SINAL INTERROMPIDO";
    $("end-title").textContent = snapshot.won ? "Você encontrou a saída." : "Você foi encontrado.";
    $("end-description").textContent = snapshot.won ? "Quatro níveis concluídos em " + Math.floor(snapshot.time / 60) + " min " + Math.floor(snapshot.time % 60) + " s. " + snapshot.kills + " entidades neutralizadas."
      : other && other.hp > 0 ? "Seu companheiro pode se aproximar e pressionar E para reanimar você."
      : session.id === session.host ? "A expedição terminou. Reinicie a campanha para tentar novamente." : "Aguarde o host reiniciar a expedição.";
    $("restart").hidden = session.id !== session.host;
  } else if (!shouldEnd && ended) { ended = false; $("end").hidden = true; showPause(); notice("Você foi reanimado."); }
}
function updateActor(s, dt) {
  const a = monsters.get(s.id) || players.get(s.id); if (!a) return;
  const distanceSq = (s.x - camera.position.x) ** 2 + (s.z - camera.position.z) ** 2;
  a.bounds ||= new T.Sphere(new T.Vector3(), 1.8);
  a.bounds.center.set(s.x, 1 + (s.y || 0), s.z);
  if (distanceSq < 3600 && actorFrustum.intersectsSphere(a.bounds)) a.update(s, dt, time);
  else { a.root.visible = false; a.initial = false; }
  if (s.hp <= 0 || s.connected === false || distanceSq > 2500) return;
  let sounds = lastAudio.get(s.id);
  if (!sounds) { sounds = { step: time + 0.5, growl: time + 4 + Math.random() * 5 }; lastAudio.set(s.id, sounds); }
  if ((s.moving || s.state === "chase" || s.state === "patrol") && time > sounds.step) {
    sounds.step = time + (s.sprinting || s.state === "chase" ? 0.32 : 0.62);
    audio.step({ x: s.x, y: 0.2, z: s.z }, !a.player);
  }
  if (!a.player && time > sounds.growl) { sounds.growl = time + 5 + Math.random() * 8; audio.growl(s, s.type); }
}
function updateActors(dt) {
  for (const m of snapshot.monsters) updateActor(m, dt);
  for (const p of snapshot.players) if (p.id !== session.id) updateActor(p, dt);
}
const actorFrustum = new T.Frustum(), actorProjection = new T.Matrix4(), cameraCoordinates = {};
// ALTERADO: intenções são enviadas em tempo real, independente da taxa de render.
setInterval(sendMotion, 50);
// Diagnóstico somente leitura para reproduzir a avaliação de desempenho.
let lastDrawCalls = 0, lastFps = 0, cameraTime = 0;
window.echoDiagnostics = () => {
  const samples = Array.from(fpsSamples).filter((x) => x > 0).sort((a, b) => a - b);
  return { fps: lastFps, p95FrameMs: samples[Math.floor(samples.length * 0.95)] || 0,
    drawCalls: lastDrawCalls, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    chunks: view.chunks.size, chunkCapacity: 16, build: { ...view.stats }, pointLights: view.lights.length,
    shadowLights: quality === "high" ? 1 : 0, actorPool: actorPool.all.length,
    projectileCapacity: shotEffects.shots.length, projectiles: shotEffects.activeCount, thirdPerson, level: world.level,
    transitioning, snapshotTransition: !!snapshot?.transition, connected: network.ready(),
    motion: { ...motion.stats, pending: motion.history.length },
    pose: local ? { x: local.x, y: local.y, z: local.z } : null,
    camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    cameraTime,
    workerChunks: view.chunkLoader.completed || 0, character: self.character, lastShot,
    remoteCharacters: [...players.values()].map((a) => a.character) };
};
function frame(now) {
  requestAnimationFrame(frame);
  // NOVO: poupe a GPU em abas minimizadas; o servidor e os sockets continuam.
  if (document.hidden || characterMenu.opened) { last = now; return; }
  const elapsed = Math.max(0, (now - last) / 1000), dt = Math.min(elapsed, 0.1);
  last = now; time += elapsed;
  fpsSamples[sampleCursor++ % fpsSamples.length] = elapsed * 1000;
  fpsFrames++; fpsElapsed += elapsed;
  if (fpsElapsed >= 0.5) { lastFps = fpsFrames / fpsElapsed; $("fps").textContent = Math.round(lastFps) + " FPS"; fpsFrames = fpsElapsed = 0; }
  if (active && local) {
    // UPDATE: simule no instante em que o callback REALMENTE executa. O
    // timestamp de rAF pode ter envelhecido enquanto a GPU/thread aguardava.
    cameraTime = performance.now();
    advanceMotion(cameraTime);
    motion.render(cameraTime, renderPose);
    const bob = !thirdPerson && local.moving && locked && !reduced && local.y === 0 ? Math.sin(time * (local.sprinting ? 14 : 9)) * 0.025 : 0;
    local.yaw = aimYaw; local.pitch = aimPitch;
    renderPose.yaw = aimYaw; renderPose.pitch = aimPitch;
    const cp = cameraPosition(renderPose, thirdPerson, world, cameraCoordinates);
    camera.position.set(cp.x, cp.y + bob, cp.z); camera.rotation.set(aimPitch, aimYaw, 0, "YXZ");
    const fov = T.MathUtils.damp(camera.fov, local.sprinting && locked ? 82 : 76, 6, dt);
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(); actorProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); actorFrustum.setFromProjectionMatrix(actorProjection);
    if (local.reload > 0) local.reload = Math.max(0, local.reload - elapsed);
    if (locked && local.moving && local.y === 0 && time > footClock) { footClock = time + (local.sprinting ? 0.3 : 0.46); audio.step(); }
    updateActors(dt);
    if (thirdPerson && local.hp > 0 && !transitioning) { self.update(renderPose, dt, time); self.root.position.set(renderPose.x, renderPose.y, renderPose.z); self.root.rotation.y = aimYaw + Math.PI; self.nameTag.visible = false; }
    else self.root.visible = false;
    weapon.update(dt, time, local, locked);
    uiClock += elapsed; if (uiClock > 0.1) { ui(); uiClock = 0; }
  } else {
    self.root.visible = false; camera.position.set(1.5 * CELL, EYE, 5.5 * CELL);
    camera.rotation.set(-0.015, -Math.PI / 2 + Math.sin(time * 0.12) * 0.08, 0);
    audio.update(camera, false, time, false);
  }
  view.update(camera.position, time, snapshot?.used || [], snapshot?.relays || [], reduced, !!snapshot && exitReady(snapshot), camera, dt);
  camera.getWorldDirection(forward); flashlight.position.copy(camera.position).add(lightOffset); flashlight.target.position.copy(camera.position).addScaledVector(forward, 8);
  flashlight.intensity = lightOn ? active ? 34 : 12 : 0;
  // Uma única luz projeta sombras, com atualização a 20 Hz para limitar custo.
  shadowClock += elapsed;
  if (quality === "high" && shadowClock >= 0.05) { renderer.shadowMap.needsUpdate = true; shadowClock = 0; }
  gunlightTime -= elapsed; gunlight.intensity = gunlightTime > 0 ? 6 : 0;
  shotEffects.update(performance.now() / 1000);
  damage = Math.max(0, damage - elapsed); $("damage").style.opacity = reduced ? Math.min(damage, 0.2) : damage;
  $("hitmarker").style.opacity = time < hitUntil ? 1 : 0;
  if (time > noticeUntil) $("notice").textContent = "";
  grain.uniforms.time.value = time;
  renderer.info.reset();
  if (quality === "high") composer.render(); else renderer.render(scene, camera);
  if (active && local?.hp > 0 && !thirdPerson && !transitioning) weapon.render(renderer);
  lastDrawCalls = renderer.info.render.calls;
}
renderer.info.autoReset = false; renderer.shadowMap.autoUpdate = false;
requestAnimationFrame(frame);
// Retomada por F5: a sessão pertence à aba e expira no servidor em 45 segundos.
try {
  const saved = JSON.parse(sessionStorage.getItem("echo-session") || "null");
  if (saved)
    Promise.all([prepareMedkit(), characterActors.prepare(characterMenu.selected)])
      .then(() => network
      .connect({
        url: saved.url,
        name: saved.name,
        mode: "join",
        code: saved.code,
        token: saved.token,
      }))
      .then(begin)
      .catch((e) => {
        sessionStorage.removeItem("echo-session");
        $("error").textContent = e.message;
      });
} catch {}
const query = new URLSearchParams(location.search);
if (query.get("room")) {
  setMode("join");
  $("room").value = query.get("room");
}
