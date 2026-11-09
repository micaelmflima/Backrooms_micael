import * as T from "three";
import { texture } from "./textures.js";
import { DEFAULT_PLAYER_COLOR } from "/shared/config.js";
// ALTERADO: geometrias compartilhadas, criaturas articuladas e explorador original
// em forma de cápsula. Nenhum modelo ou textura é baixado durante a partida.
const boxGeo = new T.BoxGeometry(1, 1, 1), sphereGeo = new T.SphereGeometry(1, 14, 10),
  boneGeo = new T.CylinderGeometry(0.65, 1, 1, 8), capsuleGeo = new T.CapsuleGeometry(1, 1, 4, 12),
  coneGeo = new T.ConeGeometry(1, 1, 6), ribGeo = new T.TorusGeometry(1, 0.09, 5, 12, Math.PI),
  torsoGeo = new T.LatheGeometry([new T.Vector2(0.11, 0), new T.Vector2(0.21, 0.13), new T.Vector2(0.16, 0.35), new T.Vector2(0.27, 0.55), new T.Vector2(0.2, 0.76), new T.Vector2(0.1, 0.85)], 14),
  cloakGeo = new T.LatheGeometry([new T.Vector2(0.33, 0), new T.Vector2(0.23, 0.16), new T.Vector2(0.29, 0.6), new T.Vector2(0.23, 0.85), new T.Vector2(0.12, 1.0)], 12);
function mesh(g, mat, x, y, z, sx, sy, sz, geo = boxGeo) {
  const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m;
}
function chain(parent, mat, x, y, z, upper, lower, width) {
  const pivot = new T.Group(); pivot.position.set(x, y, z); parent.add(pivot);
  mesh(pivot, mat, 0, -upper / 2, 0, width, upper, width, boneGeo);
  const joint = new T.Group(); joint.position.y = -upper; pivot.add(joint);
  mesh(joint, mat, 0, 0, 0, width * 1.2, width * 1.2, width * 1.2, sphereGeo);
  mesh(joint, mat, 0, -lower / 2, 0, width * 0.7, lower, width * 0.7, boneGeo);
  return { pivot, joint, upper, lower };
}
function spikes(parent, mat, count, placements) {
  const inst = new T.InstancedMesh(coneGeo, mat, count), dummy = new T.Object3D();
  for (let i = 0; i < count; i++) {
    const p = placements(i); dummy.position.set(p[0], p[1], p[2]); dummy.scale.set(p[3], p[4], p[3]);
    dummy.rotation.set(p[5] || 0, 0, p[6] || 0); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
  }
  inst.castShadow = true; parent.add(inst); return inst;
}
let actorSerial = 0;
export class Actor {
  constructor(scene, type = 0, player = false, name = "", color = DEFAULT_PLAYER_COLOR) {
    Object.assign(this, { scene, type, player, root: new T.Group(), rig: new T.Group(), death: 0, phase: actorSerial++ * 1.73, owned: [] });
    this.root.add(this.rig); scene.add(this.root);
    this.material = new T.MeshStandardMaterial(player ? { color, roughness: 0.46, metalness: 0.08 }
      : { color: [0xb4c9ac, 0xc9a78e, 0xc5d0cb][type], map: texture("organic", type), bumpMap: texture("organic", type), bumpScale: 0.028, roughness: 0.88 });
    this.dark = new T.MeshStandardMaterial({ color: 0x151c1a, roughness: 0.57 });
    this.bone = new T.MeshStandardMaterial({ color: type === 1 ? 0xad9379 : 0x807d65, roughness: 0.72 });
    this.eyes = new T.MeshBasicMaterial({ color: new T.Color(type === 2 ? 0x97d9df : 0xffc88b).multiplyScalar(2.6), toneMapped: false });
    if (player) this.makePlayer(color); else this.makeCreature(type);
    this.shadow = new T.Mesh(new T.CircleGeometry(player ? 0.43 : type === 1 ? 0.65 : 0.45, 18), new T.MeshBasicMaterial({ color: 0x020402, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.014; this.root.add(this.shadow);
    if (player) {
      this.nameCanvas = document.createElement("canvas"); this.nameCanvas.width = 512; this.nameCanvas.height = 64;
      this.nameTexture = new T.CanvasTexture(this.nameCanvas); this.nameTexture.colorSpace = T.SRGBColorSpace;
      this.nameTag = new T.Sprite(new T.SpriteMaterial({ map: this.nameTexture, transparent: true, depthWrite: false }));
      this.nameTag.position.y = 1.93; this.nameTag.scale.set(2.4, 0.3, 1); this.root.add(this.nameTag); this.setName(name);
    }
  }
  makePlayer(color) {
    this.body = mesh(this.rig, this.material, 0, 1.0, 0, 0.42, 0.4, 0.34, capsuleGeo);
    mesh(this.rig, this.material, 0, 0.97, -0.37, 0.28, 0.26, 0.18, capsuleGeo);
    mesh(this.rig, this.dark, 0, 0.85, -0.51, 0.29, 0.05, 0.035);
    this.legs = [-1, 1].map((side) => {
      const g = new T.Group(); g.position.set(side * 0.22, 0.47, 0); this.rig.add(g);
      mesh(g, this.material, 0, -0.21, 0, 0.155, 0.17, 0.2, capsuleGeo);
      mesh(g, this.dark, 0, -0.39, 0.03, 0.16, 0.06, 0.22, sphereGeo); return { pivot: g, joint: new T.Group() };
    });
    mesh(this.rig, this.dark, 0, 1.22, 0.3, 0.39, 0.24, 0.14, sphereGeo);
    this.visorMat = new T.MeshPhysicalMaterial({ color: 0x80becf, metalness: 0.15, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0.88 });
    mesh(this.rig, this.visorMat, 0, 1.23, 0.35, 0.35, 0.2, 0.13, sphereGeo);
    mesh(this.rig, new T.MeshBasicMaterial({ color: 0xd8f5f8 }), -0.11, 1.31, 0.465, 0.12, 0.035, 0.012, sphereGeo);
    this.arms = [-1, 1].map((side) => {
      const g = new T.Group(); g.position.set(side * 0.41, 1.02, 0.04); this.rig.add(g);
      mesh(g, this.material, 0, -0.12, 0.02, 0.105, 0.14, 0.12, capsuleGeo);
      mesh(g, this.dark, 0, -0.27, 0.08, 0.1, 0.08, 0.13, sphereGeo); return { pivot: g, joint: new T.Group() };
    });
    const hand = this.arms[0].pivot;
    mesh(hand, this.dark, 0, -0.21, 0.27, 0.075, 0.065, 0.31);
    mesh(hand, this.bone, 0, -0.21, 0.44, 0.026, 0.025, 0.08, boneGeo).rotation.x = Math.PI / 2;
    this.muzzle = new T.Object3D(); this.muzzle.position.set(0, -0.21, 0.5); hand.add(this.muzzle);
    this.setColor(color);
  }
  makeCreature(type) {
    this.head = new T.Group(); this.rig.add(this.head);
    this.arms = []; this.legs = [];
    if (type === 1) {
      this.body = mesh(this.rig, this.material, 0, 0.43, -0.2, 0.32, 0.26, 0.43, sphereGeo);
      mesh(this.rig, this.dark, 0, 0.55, -0.35, 0.22, 0.07, 0.3, sphereGeo);
      this.head.position.set(0, 0.59, 0.33);
      mesh(this.head, this.material, 0, 0, 0, 0.24, 0.22, 0.25, sphereGeo);
      mesh(this.head, this.dark, 0, -0.075, 0.224, 0.16, 0.1, 0.055, sphereGeo);
      for (let i = 0; i < 4; i++) {
        const side = i % 2 ? 1 : -1, z = i < 2 ? 0.24 : -0.34;
        const leg = chain(this.rig, this.material, side * 0.22, 0.52, z, 0.39, 0.4, 0.06);
        leg.side = side; leg.pivot.rotation.z = side * 0.95; leg.joint.rotation.z = -side * 0.75;
        mesh(leg.joint, this.dark, 0, -0.39, 0.1, 0.06, 0.05, 0.2, coneGeo).rotation.x = -0.6; this.legs.push(leg);
      }
      for (const x of [-0.1, 0.1]) mesh(this.head, this.eyes, x, 0.045, 0.22, 0.05, 0.047, 0.038, sphereGeo);
      mesh(this.head, this.eyes, 0, 0.115, 0.19, 0.025, 0.026, 0.025, sphereGeo);
      spikes(this.head, this.bone, 12, (i) => [(i % 6 - 2.5) * 0.037, i < 6 ? -0.07 : -0.15, 0.252, 0.015, 0.08, i < 6 ? Math.PI : 0]);
      spikes(this.rig, this.dark, 6, (i) => [0, 0.67, -0.43 + i * 0.14, 0.033, 0.14, -0.3]);
    } else {
      const tall = type === 0, hip = tall ? 1.16 : 0.73, shoulder = tall ? 2.0 : 1.42;
      this.body = mesh(this.rig, this.material, 0, hip, 0, tall ? 1 : 1.2, tall ? 1 : 0.82, tall ? 0.75 : 0.85, torsoGeo);
      if (!tall) mesh(this.rig, this.dark, 0, 0.55, -0.03, 1, 0.95, 0.8, cloakGeo);
      for (const side of [-1, 1]) {
        const leg = chain(this.rig, this.material, side * 0.12, hip, 0, hip * 0.52, hip * 0.48, tall ? 0.065 : 0.09); this.legs.push(leg);
        mesh(leg.joint, this.dark, 0, -leg.lower + 0.02, 0.07, 0.08, 0.045, 0.19, sphereGeo);
        const arm = chain(this.rig, this.material, side * (tall ? 0.27 : 0.3), shoulder, 0, tall ? 0.62 : 0.39, tall ? 0.58 : 0.38, tall ? 0.055 : 0.073);
        arm.side = side; this.arms.push(arm);
        mesh(arm.joint, this.material, 0, -arm.lower, 0, 0.067, 0.105, 0.045, sphereGeo);
        spikes(arm.joint, this.dark, 3, (i) => [(i - 1) * 0.037, -arm.lower - 0.17, 0.01, 0.012, tall ? 0.23 : 0.17, Math.PI]);
      }
      this.head.position.set(0, tall ? 2.33 : 1.73, 0.015);
      mesh(this.head, this.material, 0, 0, 0, tall ? 0.175 : 0.2, tall ? 0.26 : 0.245, 0.18, sphereGeo);
      this.jaw = mesh(this.head, this.dark, 0, -0.11, 0.165, tall ? 0.105 : 0.073, tall ? 0.17 : 0.13, 0.05, sphereGeo);
      for (const x of [-0.077, 0.077]) {
        mesh(this.head, this.dark, x, 0.035, 0.164, 0.067, 0.065, 0.035, sphereGeo);
        mesh(this.head, this.eyes, x, 0.035, 0.188, tall ? 0.024 : 0.014, tall ? 0.024 : 0.022, 0.018, sphereGeo);
        mesh(this.head, this.bone, x, 0.085, 0.17, 0.08, 0.018, 0.035).rotation.z = x > 0 ? -0.25 : 0.25;
      }
      mesh(this.head, this.dark, 0, -0.005, 0.19, 0.025, 0.035, 0.02, coneGeo);
      spikes(this.head, this.bone, tall ? 12 : 8, (i) => [(i % (tall ? 6 : 4) - (tall ? 2.5 : 1.5)) * 0.027, i < (tall ? 6 : 4) ? -0.065 : -0.2, 0.198, 0.012, 0.06, i < (tall ? 6 : 4) ? Math.PI : 0]);
      const ribs = new T.InstancedMesh(ribGeo, this.bone, tall ? 7 : 4), d = new T.Object3D();
      for (let i = 0; i < ribs.count; i++) { d.position.set(0, hip + 0.23 + i * 0.075, 0.12); d.scale.set(0.2 - i * 0.009, 0.1, 0.06); d.rotation.z = Math.PI; d.updateMatrix(); ribs.setMatrixAt(i, d.matrix); }
      ribs.castShadow = true; this.rig.add(ribs);
      if (!tall) { mesh(this.head, this.bone, -0.15, 0, 0.14, 0.035, 0.2, 0.02).rotation.z = -0.16; mesh(this.head, this.bone, 0.15, 0, 0.14, 0.035, 0.2, 0.02).rotation.z = 0.16; }
    }
  }
  setColor(color) { if (this.player) this.material.color.set(color || DEFAULT_PLAYER_COLOR); }
  setName(name) {
    if (!this.player || this.name === name) return; this.name = name;
    const c = this.nameCanvas, x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height); x.font = "26px monospace"; x.textAlign = "center"; x.fillStyle = "#d6dfbc"; x.fillText(String(name).slice(0, 24), 256, 42); this.nameTexture.needsUpdate = true;
  }
  reset(name = "", color) { this.initial = false; this.death = 0; this.rig.rotation.set(0, 0, 0); this.rig.position.y = 0; this.root.visible = true; if (this.player) { this.setName(name); this.setColor(color); } }
  getMuzzle(out) { this.root.updateMatrixWorld(true); return this.muzzle.getWorldPosition(out); }
  update(s, dt, t) {
    if (!this.initial) { this.root.position.set(s.x, s.y || 0, s.z); this.initial = true; }
    this.root.position.x = T.MathUtils.damp(this.root.position.x, s.x, 14, dt); this.root.position.z = T.MathUtils.damp(this.root.position.z, s.z, 14, dt); this.root.position.y = s.y || 0;
    const desired = this.player ? s.yaw + Math.PI : s.yaw;
    this.root.rotation.y += Math.atan2(Math.sin(desired - this.root.rotation.y), Math.cos(desired - this.root.rotation.y)) * Math.min(1, dt * 14);
    this.root.visible = s.connected !== false;
    const state = s.hp <= 0 ? "dead" : s.state || (s.moving ? s.sprinting ? "chase" : "patrol" : "idle");
    if (state === "dead") { this.material.emissive.setHex(0); this.death = Math.min(1, this.death + dt * 1.6); this.rig.rotation.z = this.death * 1.48; this.rig.position.y = -this.death * 0.08; return; }
    this.death = 0; this.rig.rotation.z = state === "hurt" ? Math.sin(t * 44) * 0.09 : 0;
    const walking = state === "chase" || state === "patrol", running = state === "chase", attack = state === "attack", phase = t * (running ? 11 : 6) + this.phase;
    const swing = walking ? Math.sin(phase) * (this.player ? 0.5 : running ? 0.7 : 0.34) : Math.sin(t * 1.7 + this.phase) * 0.035;
    this.rig.position.y = walking ? Math.abs(Math.sin(phase)) * (this.player ? 0.025 : 0.015) : Math.sin(t * 2 + this.phase) * 0.009;
    this.rig.rotation.x = state === "hurt" ? -0.17 : running ? this.player ? 0.11 : 0.13 : 0;
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i]; leg.pivot.rotation.x = swing * (i % 2 ? 1 : -1);
      if (!this.player) leg.joint.rotation.x = Math.max(0, -swing * (i % 2 ? 1 : -1)) * 0.8;
    }
    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i]; arm.pivot.rotation.x = attack ? -1.5 + Math.sin(t * 13 + i) * 0.5 : -swing * (i % 2 ? 1 : -1) * 0.65;
      if (!this.player) arm.joint.rotation.x = attack ? -0.7 : -0.18;
    }
    if (this.player) { this.arms[0].pivot.rotation.x = -0.2 - s.pitch * 0.45; this.setColor(s.color); }
    else { this.head.rotation.z = Math.sin(t * (this.type === 1 ? 6 : 2.3) + this.phase) * (attack ? 0.16 : 0.05); this.head.rotation.x = attack ? -0.18 : Math.sin(t * 1.9 + this.phase) * 0.025; if (this.jaw) this.jaw.scale.y = attack ? 0.21 : this.type === 0 ? 0.17 : 0.13; }
    this.material.emissive.setHex(state === "hurt" ? 0x782518 : 0); this.material.emissiveIntensity = 0.4;
  }
  dispose() {
    this.scene.remove(this.root); const mats = new Set();
    this.root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.isMesh) mats.add(o.material); });
    for (const m of mats) m.dispose(); this.shadow.geometry.dispose(); this.nameTexture?.dispose(); this.nameTag?.material.dispose();
  }
}
// NOVO: entidades desaparecidas voltam ao pool, conservando rig/material/buffers.
export class ActorPool {
  constructor(scene) { this.scene = scene; this.free = [[], [], [], []]; this.all = []; for (let type = 0; type < 3; type++) for (let i = 0; i < 2; i++) this.release(this.create(type)); }
  create(type, player = false) { const actor = new Actor(this.scene, type, player); this.all.push(actor); return actor; }
  acquire(type, player = false, name = "", color) { const list = this.free[player ? 3 : type]; const actor = list.pop() || this.create(type, player); actor.reset(name, color); return actor; }
  release(actor) { actor.root.visible = false; this.free[actor.player ? 3 : actor.type].push(actor); }
  dispose() { for (const actor of this.all) actor.dispose(); this.all.length = 0; }
}
export class Weapon {
  constructor() {
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(
      60,
      innerWidth / innerHeight,
      0.01,
      10,
    );
    this.rig = new T.Group();
    this.scene.add(this.rig);
    const metal = new T.MeshStandardMaterial({
        color: 0x65706a,
        metalness: 0.3,
        roughness: 0.35,
      }),
      black = new T.MeshStandardMaterial({ color: 0x303a32, roughness: 0.7 }),
      skin = new T.MeshStandardMaterial({ color: 0x8c8264, roughness: 0.9 }),
      sleeve = new T.MeshStandardMaterial({ color: 0x777654, roughness: 0.9 });
    this.sleeveMaterial = sleeve;
    this.tip = new T.Vector3();
    this.rig.position.set(0.24, -0.25, -0.5);
    mesh(this.rig, black, 0, -0.12, 0.015, 0.075, 0.2, 0.09).rotation.x = -0.25;
    this.slide = mesh(this.rig, metal, 0, 0, -0.1, 0.075, 0.065, 0.3);
    mesh(this.rig, black, 0, -0.055, -0.08, 0.063, 0.045, 0.23);
    mesh(this.rig, black, 0, 0.045, -0.21, 0.014, 0.028, 0.021);
    mesh(this.rig, black, 0, 0.045, 0.021, 0.05, 0.019, 0.014);
    for (let i = 0; i < 6; i++)
      mesh(this.rig, black, 0.038, 0, 0.005 - i * 0.015, 0.003, 0.045, 0.004);
    mesh(
      this.rig,
      black,
      0,
      -0.003,
      -0.293,
      0.023,
      0.07,
      0.023,
      boneGeo,
    ).rotation.x = Math.PI / 2;
    // NOVO: marcador físico da ponta do cano, incluindo balanço/recuo/recarga.
    this.muzzle = new T.Object3D(); this.muzzle.position.set(0, 0, -0.333); this.rig.add(this.muzzle);
    mesh(this.rig, skin, 0.017, -0.13, 0.07, 0.1, 0.11, 0.16, sphereGeo);
    mesh(this.rig, sleeve, 0.04, -0.24, 0.22, 0.125, 0.14, 0.35).rotation.x =
      -0.45;
    mesh(this.rig, skin, -0.065, -0.115, 0.015, 0.105, 0.07, 0.16, sphereGeo);
    mesh(this.rig, sleeve, -0.19, -0.2, 0.12, 0.15, 0.12, 0.3).rotation.z =
      -0.7;
    this.mag = mesh(this.rig, black, 0, -0.21, 0.04, 0.065, 0.08, 0.08);
    this.flash = mesh(
      this.rig,
      new T.MeshBasicMaterial({
        color: 0xffd599,
        transparent: true,
        opacity: 0.9,
      }),
      0,
      0,
      -0.333,
      0.095,
      0.095,
      0.095,
      new T.IcosahedronGeometry(1, 0),
    );
    this.flash.visible = false;
    this.light = new T.PointLight(0xffc67d, 0, 2);
    this.light.position.set(0, 0, -0.4);
    this.rig.add(this.light);
    this.scene.add(new T.HemisphereLight(0xf0e4b6, 0x303726, 2));
    const key = new T.DirectionalLight(0xffffff, 2);
    key.position.set(-1, 2, 1);
    this.scene.add(key);
    this.kick = 0;
    this.flashTime = 0;
  }
  shoot(reduced) {
    this.kick = 0.1;
    this.flashTime = reduced ? 0 : 0.08;
    this.flashPending = !reduced;
  }
  setColor(color) { this.sleeveMaterial.color.set(color || DEFAULT_PLAYER_COLOR); }
  getMuzzleWorld(camera, out) {
    this.rig.updateMatrixWorld(true); this.muzzle.getWorldPosition(this.tip);
    const ratio = Math.tan(camera.fov * Math.PI / 360) / Math.tan(this.camera.fov * Math.PI / 360);
    return out.set(this.tip.x * ratio, this.tip.y * ratio, this.tip.z).applyQuaternion(camera.quaternion).add(camera.position);
  }
  update(dt, t, p, locked) {
    this.kick = Math.max(0, this.kick - dt * 0.6);
    this.flashTime -= dt;
    this.flash.visible = this.flashPending || this.flashTime > 0;
    this.flashPending = false;
    this.light.intensity = this.flash.visible ? 5 : 0;
    const bob =
        p?.moving && locked
          ? Math.sin(t * (p.sprinting ? 14 : 9)) * 0.009
          : Math.sin(t * 1.3) * 0.002,
      r = p?.reload > 0 ? Math.sin((1 - p.reload / 1.65) * Math.PI) : 0;
    this.rig.position.set(
      0.24 + bob,
      -0.25 - Math.abs(bob) - r * 0.18,
      -0.5 + this.kick,
    );
    this.rig.rotation.set(this.kick * 2.1 - r * 0.35, 0, -r * 0.7);
    this.slide.position.z = -0.1 + this.kick * 0.45;
    this.mag.position.y = -0.21 - r * 0.15;
  }
  render(r) {
    r.clearDepth();
    r.autoClear = false;
    r.render(this.scene, this.camera);
    r.autoClear = true;
  }
}
