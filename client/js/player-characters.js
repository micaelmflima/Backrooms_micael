import * as T from "three";
import { Actor } from "./actors.js";
import { prepareCharacter, instantiateCharacter } from "./model-assets.js";
import { RigAnimation } from "./rig-animation.js";
import { characterConfig } from "../../shared/characters.js";
const gunGeometry = new T.BoxGeometry(0.075, 0.065, 0.31), barrelGeometry = new T.CylinderGeometry(0.019, 0.019, 0.08, 8);
const gunMaterial = new T.MeshStandardMaterial({ color: 0x303a32, metalness: 0.3, roughness: 0.5 });
const shadowGeometry = new T.CircleGeometry(0.43, 18);
class ImportedPlayer {
  constructor(scene, id, template) {
    Object.assign(this, { scene, character: id, player: true, root: new T.Group(), temp: new T.Vector3(), initial: false, death: 0 });
    this.model = instantiateCharacter(template); this.root.add(this.model); scene.add(this.root);
    this.animation = new RigAnimation(this.model);
    this.shadow = new T.Mesh(shadowGeometry, new T.MeshBasicMaterial({ color: 0x020402, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.014; this.root.add(this.shadow);
    this.nameCanvas = document.createElement("canvas"); this.nameCanvas.width = 512; this.nameCanvas.height = 64;
    this.nameTexture = new T.CanvasTexture(this.nameCanvas); this.nameTexture.colorSpace = T.SRGBColorSpace;
    this.nameTag = new T.Sprite(new T.SpriteMaterial({ map: this.nameTexture, transparent: true, depthWrite: false }));
    this.nameTag.position.y = 1.93; this.nameTag.scale.set(2.4, 0.3, 1); this.root.add(this.nameTag);
    this.gun = new T.Group(); this.root.add(this.gun);
    const slide = new T.Mesh(gunGeometry, gunMaterial), barrel = new T.Mesh(barrelGeometry, gunMaterial);
    slide.position.z = 0.12; barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.29; slide.castShadow = true; this.gun.add(slide, barrel);
    this.muzzle = new T.Object3D(); this.muzzle.position.z = 0.33; this.gun.add(this.muzzle);
    this.animation.update({ moving: false }, 0, 0, true);
  }
  setColor() { /* Texturas e cores dos FBX enviados permanecem originais. */ }
  setName(name) {
    if (this.name === name) return; this.name = name;
    const c = this.nameCanvas, x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height); x.font = "26px monospace"; x.textAlign = "center"; x.fillStyle = "#d6dfbc"; x.fillText(String(name).slice(0, 24), 256, 42); this.nameTexture.needsUpdate = true;
  }
  reset(name = "") { this.initial = false; this.death = 0; this.model.rotation.set(0, 0, 0); this.root.visible = true; this.nameTag.visible = true; this.setName(name); }
  update(s, dt, t) {
    if (!this.initial) { this.root.position.set(s.x, s.y || 0, s.z); this.root.rotation.y = (s.yaw || 0) + Math.PI; this.initial = true; }
    this.root.position.x = T.MathUtils.damp(this.root.position.x, s.x, 14, dt); this.root.position.z = T.MathUtils.damp(this.root.position.z, s.z, 14, dt); this.root.position.y = s.y || 0;
    const desired = (s.yaw || 0) + Math.PI;
    this.root.rotation.y += Math.atan2(Math.sin(desired - this.root.rotation.y), Math.cos(desired - this.root.rotation.y)) * Math.min(1, dt * 14);
    this.root.visible = s.connected !== false;
    this.death = s.hp <= 0 ? Math.min(1, this.death + dt * 1.6) : 0;
    this.model.rotation.z = this.death * 1.48;
    if (!this.death) this.animation.update(s, dt, t);
    this.root.updateMatrixWorld(true);
    const hand = this.animation.roles.rightHand?.bone;
    if (hand) { hand.getWorldPosition(this.temp); this.root.worldToLocal(this.temp); this.gun.position.copy(this.temp); }
    else this.gun.position.set(-0.37, 0.96, 0.12);
    this.gun.rotation.x = -(s.pitch || 0);
  }
  getMuzzle(out) { this.root.updateMatrixWorld(true); return this.muzzle.getWorldPosition(out); }
  dispose() {
    this.root.removeFromParent(); this.shadow.material.dispose(); this.nameTexture.dispose(); this.nameTag.material.dispose();
    const skeletons = new Set(); this.model.traverse((o) => { if (o.isSkinnedMesh) skeletons.add(o.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
  }
}
export class PlayerCharacters {
  constructor(scene) { this.scene = scene; this.templates = new Map(); this.free = new Map(); this.all = []; }
  async prepare(id) {
    id = characterConfig(id).id;
    if (id !== "capsule" && !this.templates.has(id)) this.templates.set(id, await prepareCharacter(id));
  }
  acquire(id, name = "", color) {
    id = characterConfig(id).id;
    if (id !== "capsule" && !this.templates.has(id)) throw Error("Prepare o personagem antes de usá-lo: " + id);
    const list = this.free.get(id), actor = list?.pop() || (id === "capsule" ? new Actor(this.scene, 0, true) : new ImportedPlayer(this.scene, id, this.templates.get(id)));
    if (!this.all.includes(actor)) this.all.push(actor);
    actor.character = id; actor.reset(name, color); actor.nameTag.visible = true; return actor;
  }
  release(actor) {
    actor.root.visible = false;
    if (!this.free.has(actor.character)) this.free.set(actor.character, []);
    this.free.get(actor.character).push(actor);
  }
}
