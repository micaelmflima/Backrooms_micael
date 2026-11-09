// UPDATE 1.1.1: adicione uma entrada para cada novo personagem. Altura visual
// não muda o collider, a câmera ou os controles compartilhados do explorador.
export const CHARACTERS = [
  { id: "capsule", name: "Explorador original", thumbnail: "/assets/characters/capsule.png", model: null },
  { id: "vergil", name: "Vergil", thumbnail: "/assets/characters/vergil.png", model: "/assets/models/vergil/model.fbx", height: 1.6, rotationY: 0,
    aliases: { "combined_image_8914660307.png": "combined_image_8914660307-Photoroom.png" } },
  { id: "metal-sonic", name: "Metal Sonic", thumbnail: "/assets/characters/metal-sonic.png", model: "/assets/models/metal-sonic/model.fbx", height: 1.6, rotationY: 0,
    aliases: { "enm_metalsonic_body_abd.png": "enm_metalsonic_body_alb.png" } },
  { id: "fenomeno", name: "Fenomeno", thumbnail: "/assets/characters/fenomeno.png", model: "/assets/models/fenomeno/model.fbx", height: 1.6, rotationY: 0,
    materials: { body: "tex_bdy1127_00_diff.png", face: "tex_chr1127_00_face_diff.png", eye: "tex_chr1127_00_eye0.png", hair: "tex_chr1127_00_hair_shad_c.png", tail: "tex_tail0001_00_1127_diff.png" } },
  { id: "agnes", name: "Agnes Tachyon", thumbnail: "/assets/characters/agnes.png", model: "/assets/models/agnes/model.fbx", height: 1.6, rotationY: 0 },
];
export function characterConfig(id) { return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0]; }
export const MEDKIT = { model: "/assets/models/medkit/model.glb", size: 0.68, rotationY: 0 };
