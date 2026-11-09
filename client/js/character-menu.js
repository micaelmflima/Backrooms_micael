import * as T from "three";
import { CHARACTERS, characterConfig } from "../../shared/characters.js";
import { PlayerCharacters } from "./player-characters.js";
// UPDATE: menu separado. O preview só renderiza enquanto estiver visível e
// usa o MESMO modelo/rig do jogo. Escolha persistente não muda os controles.
export class CharacterMenu {
  constructor(onChoose, color) {
    this.onChoose = onChoose; this.color = color; this.opened = false;
    const $ = (id) => document.getElementById(id); this.$ = $;
    try { this.selected = characterConfig(localStorage.getItem("echo-character")).id; } catch { this.selected = "capsule"; }
    this.scene = new T.Scene(); this.scene.background = new T.Color(0x18201c);
    this.scene.add(new T.HemisphereLight(0xe3edda, 0x3c4131, 2.5));
    const key = new T.DirectionalLight(0xffecce, 3); key.position.set(3, 4, 5); this.scene.add(key);
    const rim = new T.DirectionalLight(0x8bbdd0, 2); rim.position.set(-3, 2, -3); this.scene.add(rim);
    const floor = new T.Mesh(new T.CircleGeometry(1.3, 40), new T.MeshStandardMaterial({ color: 0x353f35, roughness: 0.85 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.006; this.scene.add(floor);
    this.camera = new T.PerspectiveCamera(34, 1, 0.01, 12); this.camera.position.set(2.4, 1.4, 3.8); this.camera.lookAt(0, 0.86, 0);
    this.pool = new PlayerCharacters(this.scene);
    for (const config of CHARACTERS) {
      const button = document.createElement("button"); button.className = "character-card"; button.dataset.character = config.id;
      const img = document.createElement("img"); img.src = config.thumbnail; img.alt = ""; img.onerror = () => { img.hidden = true; };
      const text = document.createElement("span"); text.textContent = config.name; button.append(img, text); button.onclick = () => this.preview(config.id); $("character-list").append(button);
    }
    $("choose-character").onclick = () => this.open(); $("character-cancel").onclick = () => this.close();
    $("character-confirm").onclick = () => {
      if (!this.actor || this.actor.character !== this.previewId) return;
      this.selected = this.previewId; try { localStorage.setItem("echo-character", this.selected); } catch {}
      this.refresh(); this.onChoose(this.selected); this.close();
    };
    this.refresh();
  }
  refresh() { this.$("selected-character").textContent = characterConfig(this.selected).name; }
  open() {
    this.opened = true; this.$("characters").hidden = false;
    if (!this.renderer) {
      this.renderer = new T.WebGLRenderer({ canvas: this.$("character-preview"), antialias: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.toneMapping = T.ACESFilmicToneMapping;
    }
    this.preview(this.selected); this.last = 0; this.draw(performance.now());
  }
  close() { this.opened = false; this.$("characters").hidden = true; cancelAnimationFrame(this.frame); this.$("choose-character").focus(); }
  async preview(id) {
    this.previewId = id; this.$("character-confirm").disabled = true; this.$("character-description").textContent = "Carregando modelo e texturas…";
    for (const button of this.$("character-list").children) button.classList.toggle("selected", button.dataset.character === id);
    if (this.actor) { this.pool.release(this.actor); this.actor = null; }
    try {
      await this.pool.prepare(id); if (!this.opened || this.previewId !== id) return;
      this.actor = this.pool.acquire(id, "", this.color()); this.actor.nameTag.visible = false;
      this.$("character-confirm").disabled = false;
      this.$("character-description").textContent = id === "capsule" ? "Personagem original preservado. Cor ajustável no lobby." : "Modelo e texturas enviados · animações geradas sobre o rig original.";
    } catch (error) { if (this.previewId === id) this.$("character-description").textContent = "Falha ao carregar: " + error.message; }
  }
  draw(now) {
    if (!this.opened) return; this.frame = requestAnimationFrame((t) => this.draw(t));
    if (now - this.last < 1000 / 30) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 30; this.last = now;
    const canvas = this.$("character-preview"), width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    if (this.width !== width || this.height !== height) { this.width = width; this.height = height; this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); }
    if (this.actor) { this.actor.update({ x: 0, y: 0, z: 0, yaw: -Math.PI + Math.sin(now / 5000) * 0.24, pitch: 0, hp: 100, connected: true, moving: false, color: this.color() }, dt, now / 1000); this.actor.nameTag.visible = false; }
    this.renderer.render(this.scene, this.camera);
  }
}
