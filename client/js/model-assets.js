import * as T from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { characterConfig, MEDKIT } from "../../shared/characters.js";

// UPDATE: modelos/texturas originais em cache. Parsing, normalização e ajustes
// de rig acontecem uma vez no carregamento, nunca dentro do loop de movimento.
const cache = new Map();
let medkitTemplate = null;
export function shareSkeletons(root) {
  const shared = new Map();
  root.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const skeleton = mesh.skeleton, key = skeleton.bones.map((b) => b.uuid).join("|");
    const previous = shared.get(key);
    if (previous && skeleton.boneInverses.every((m, i) => m.elements.every((v, j) => Math.abs(v - previous.boneInverses[i].elements[j]) < 1e-6))) {
      mesh.skeleton = previous; skeleton.dispose();
    } else shared.set(key, skeleton);
  });
}
export function compactSkeletons(root) {
  root.updateMatrixWorld(true);
  const canonical = new Map(), duplicates = [], bones = [], meshes = [];
  let safe = true;
  root.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o);
    if (!o.isBone) return;
    const first = canonical.get(o.name);
    if (!first) { canonical.set(o.name, o); bones.push(o); }
    else {
      if (o.matrixWorld.elements.some((v, i) => Math.abs(v - first.matrixWorld.elements[i]) > 1e-4)) safe = false;
      duplicates.push(o);
    }
  });
  // Só consolidamos cópias com bind pose IDÊNTICA; rigs com nomes repetidos
  // em poses diferentes continuam intactos. Geometria/UV/skin indices não mudam.
  if (safe && duplicates.length) {
    const parents = bones.map((b) => {
      let p = b.parent;
      while (p?.isBone && p.name === b.name) p = p.parent;
      return p?.isBone ? canonical.get(p.name) : p;
    });
    for (let i = 0; i < bones.length; i++) if (parents[i] && bones[i].parent !== parents[i]) parents[i].attach(bones[i]);
    for (const mesh of meshes) mesh.skeleton.bones = mesh.skeleton.bones.map((b) => canonical.get(b.name));
    for (const duplicate of duplicates) duplicate.removeFromParent();
    root.updateMatrixWorld(true);
  }
  shareSkeletons(root);
  return { bones: bones.length, removed: safe ? duplicates.length : 0 };
}
function markShared(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.userData.sharedAsset = true;
    // Bounding volumes de bind pose ficam inválidos ao animar. O culling já
    // acontece no ator/chunk inteiro, sem calcular bounds skinned todo frame.
    if (o.isSkinnedMesh) o.frustumCulled = false;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.map) m.map.colorSpace = T.SRGBColorSpace;
      m.needsUpdate = true;
    }
  });
}
function normalize(root, config, character) {
  root.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(root, true), size = box.getSize(new T.Vector3());
  if (size.y < 0.000001 || !Number.isFinite(size.y)) throw Error("Modelo sem dimensões válidas: " + config.model);
  const scale = character ? config.height / size.y : config.size / Math.max(size.x, size.y, size.z);
  const center = box.getCenter(new T.Vector3());
  if (character) {
    const feet = []; root.traverse((o) => { if (o.isBone && /^(Left_ankle|Right_ankle|Ankle_[LR]|Foot_[LR])$/.test(o.name) && o.parent?.name !== o.name) feet.push(o.getWorldPosition(new T.Vector3())); });
    if (feet.length) { center.x = feet.reduce((a, b) => a + b.x, 0) / feet.length; center.z = feet.reduce((a, b) => a + b.z, 0) / feet.length; }
  }
  const wrapper = new T.Group(), pivot = new T.Group(); wrapper.add(pivot); pivot.add(root);
  pivot.rotation.y = config.rotationY || 0;
  root.position.x -= center.x; root.position.z -= center.z; root.position.y -= box.min.y;
  pivot.scale.setScalar(scale); pivot.position.y = character ? 0.02 : 0.004;
  wrapper.animations = root.animations || []; wrapper.userData.dimensions = size.multiplyScalar(scale).toArray();
  markShared(wrapper); wrapper.updateMatrixWorld(true); return wrapper;
}
async function loadCharacter(config) {
  const directory = config.model.slice(0, config.model.lastIndexOf("/") + 1), manager = new T.LoadingManager();
  let complete; const imagesReady = new Promise((resolve) => { complete = resolve; });
  const failed = []; manager.onLoad = complete; manager.onError = (url) => failed.push(url);
  manager.setURLModifier((url) => {
    if (/^(blob:|data:)/.test(url) || !/\.(png|jpe?g|webp|tga)$/i.test(url)) return url;
    const filename = url.replace(/\\/g, "/").split("/").pop();
    return directory + "textures/" + (config.aliases?.[filename] || filename);
  });
  const root = await new FBXLoader(manager).loadAsync(config.model);
  await imagesReady;
  if (failed.length) throw Error("Textura ausente em " + config.name + ": " + failed.map((s) => s.split("/").pop()).join(", "));
  const textures = new Map(), loader = new T.TextureLoader();
  const texture = (filename) => {
    if (!textures.has(filename)) textures.set(filename, loader.loadAsync(directory + "textures/" + filename).then((t) => { t.colorSpace = T.SRGBColorSpace; return t; }));
    return textures.get(filename);
  };
  const jobs = [], visited = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (visited.has(m)) continue; visited.add(m);
      if (config.id === "vergil" && m.opacity === 0) {
        m.opacity = 1; m.transparent = false; m.alphaTest = 0.15;
        // O FBX referencia o albedo como alphaMap: seu canal verde apagava a
        // roupa escura. O recorte correto usa apenas o alfa do PNG original.
        if (m.alphaMap === m.map) m.alphaMap = null;
        m.specular.setHex(0x222222); m.shininess = 35;
      }
      if (config.materials) {
        const role = /bdy/.test(m.name) ? "body" : /face|mayu/.test(m.name) ? "face" : /hair/.test(m.name) ? "hair" : /tail/.test(m.name) ? "tail" : /eye/.test(m.name) ? "eye" : null;
        if (role) jobs.push(texture(config.materials[role]).then((t) => { m.map = t; m.color.setHex(0xffffff); m.needsUpdate = true; }));
      }
      // Rosto/cabelo com textura recortada; mantenha cores e UVs originais.
      if (/hair|mayu/.test(m.name)) { m.alphaTest = 0.1; m.side = T.DoubleSide; }
      if (config.id === "metal-sonic") {
        if (/Body|CarPaint/.test(m.name)) jobs.push(loader.loadAsync(directory + "textures/enm_metalsonic_body_nrm.png").then((t) => { m.normalMap = t; m.normalScale.set(0.6, 0.6); m.needsUpdate = true; }));
        if (/Eye|Light/.test(m.name) && m.emissiveMap) { m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.8; }
      }
    }
  });
  await Promise.all(jobs);
  root.userData.rig = compactSkeletons(root);
  const template = normalize(root, config, true); template.userData.rig = root.userData.rig;
  return template;
}
export async function prepareCharacter(id) {
  const config = characterConfig(id); if (!config.model) return null;
  if (!cache.has(config.id)) cache.set(config.id, loadCharacter(config).catch((error) => { cache.delete(config.id); throw error; }));
  return cache.get(config.id);
}
export function instantiateCharacter(template) {
  const instance = clone(template); shareSkeletons(instance); return instance;
}
export async function prepareMedkit() {
  if (!cache.has("medkit")) cache.set("medkit", new GLTFLoader().loadAsync(MEDKIT.model).then((gltf) => {
    gltf.scene.animations = gltf.animations; medkitTemplate = normalize(gltf.scene, MEDKIT, false); return medkitTemplate;
  }).catch((error) => { cache.delete("medkit"); throw error; }));
  return cache.get("medkit");
}
export function instantiateMedkit() { return medkitTemplate ? medkitTemplate.clone(true) : null; }
