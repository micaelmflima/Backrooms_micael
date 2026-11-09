import * as T from "three";
// UPDATE: os quatro FBX têm rig, mas NÃO têm clips. Anime os próprios ossos
// enviados; nenhuma malha é substituída. Eixos são convertidos para o espaço
// de cada pai para suportar rigs exportados com orientações locais diferentes.
const roles = {
  leftLeg: ["Left_leg", "Thigh_L"], rightLeg: ["Right_leg", "Thigh_R"],
  leftKnee: ["Left_knee", "Knee_L", "Calf_L"], rightKnee: ["Right_knee", "Knee_R", "Calf_R"],
  leftArm: ["Left_arm", "Arm_L", "UpperArm_L"], rightArm: ["Right_arm", "Arm_R", "UpperArm_R"],
  leftElbow: ["Left_elbow", "Elbow_L", "ForeArm_L"], rightElbow: ["Right_elbow", "Elbow_R", "ForeArm_R"],
  spine: ["Spine"], chest: ["Chest"], head: ["Head"], rightHand: ["Right_wrist", "Wrist_R", "Hand_R"],
};
export class RigAnimation {
  constructor(model) {
    this.model = model; this.roles = {}; this.q = new T.Quaternion(); this.temp = new T.Quaternion();
    const bones = new Map(); model.updateMatrixWorld(true);
    model.traverse((o) => { if (o.isBone && !bones.has(o.name)) bones.set(o.name, o); });
    for (const [role, names] of Object.entries(roles)) {
      const bone = names.map((name) => bones.get(name)).find(Boolean); if (!bone) continue;
      const inverse = bone.parent.getWorldQuaternion(new T.Quaternion()).invert();
      this.roles[role] = { bone, rest: bone.quaternion.clone(), x: new T.Vector3(1, 0, 0).applyQuaternion(inverse), z: new T.Vector3(0, 0, 1).applyQuaternion(inverse) };
    }
    this.secondary = [];
    for (const [name, bone] of bones) if (/^(Left_Coat_[12]|Right_Coat_[12]|Sp_Hi_Jacket|Sp_Hi_Tail|Sp_Hi_MSkirt)/.test(name) && !/_end|_Handle/.test(name) && this.secondary.length < 18) {
      const inverse = bone.parent.getWorldQuaternion(new T.Quaternion()).invert();
      this.secondary.push({ bone, rest: bone.quaternion.clone(), x: new T.Vector3(1, 0, 0).applyQuaternion(inverse), z: new T.Vector3(0, 0, 1).applyQuaternion(inverse) });
    }
    const clips = model.animations || [];
    if (clips.length) {
      this.mixer = new T.AnimationMixer(model); this.actions = {};
      for (const [state, pattern] of Object.entries({ idle: /idle|stand|rest/i, walk: /walk/i, run: /run|sprint/i, jump: /jump/i })) {
        const clip = clips.find((c) => pattern.test(c.name));
        if (clip) {
          // Transformações de raiz não deslocam o collider nem duplicam movimento.
          const copy = clip.clone(); copy.tracks = copy.tracks.filter((track) => !/^(root|hips|hipstranslation)\.position$/i.test(track.name));
          this.actions[state] = this.mixer.clipAction(copy);
        }
      }
    }
  }
  pose(item, x, z, blend) {
    if (!item) return;
    this.q.setFromAxisAngle(item.x, x); this.temp.setFromAxisAngle(item.z, z);
    this.q.multiply(this.temp).multiply(item.rest); item.bone.quaternion.slerp(this.q, blend);
  }
  update(s, dt, t, instant = false) {
    const state = (s.y || 0) > 0.025 ? "jump" : s.moving ? s.sprinting ? "run" : "walk" : "idle";
    if (this.actions?.[state]) {
      if (this.current !== state) { this.actions[this.current]?.fadeOut(0.18); this.actions[state].reset().fadeIn(0.18).play(); this.current = state; }
      this.mixer.update(dt); return;
    }
    const blend = instant ? 1 : 1 - Math.exp(-14 * dt), running = state === "run", walking = state === "walk" || running;
    const phase = t * (running ? 11 : 6), swing = walking ? Math.sin(phase) * (running ? 0.6 : 0.36) : 0;
    const crouch = state === "jump" ? 0.35 : 0, r = this.roles;
    this.pose(r.leftLeg, swing - crouch, 0, blend); this.pose(r.rightLeg, -swing - crouch, 0, blend);
    this.pose(r.leftKnee, Math.max(0, -swing) * 0.9 + crouch * 1.4, 0, blend);
    this.pose(r.rightKnee, Math.max(0, swing) * 0.9 + crouch * 1.4, 0, blend);
    // T pose -> braços relaxados; o direito segura a pistola adicionada ao rig.
    this.pose(r.leftArm, -swing * 0.5, -1.25, blend);
    this.pose(r.rightArm, -0.45 - (s.pitch || 0) * 0.4 - swing * 0.09, 1.05, blend);
    this.pose(r.leftElbow, -0.12 - Math.abs(swing) * 0.2, 0, blend);
    this.pose(r.rightElbow, -0.75, 0, blend);
    this.pose(r.spine, running ? 0.1 : Math.sin(t * 1.9) * 0.012, 0, blend);
    this.pose(r.chest, Math.sin(t * 1.9) * 0.014, 0, blend);
    this.pose(r.head, -(s.pitch || 0) * 0.25, Math.sin(t * 1.4) * 0.018, blend);
    for (let i = 0; i < this.secondary.length; i++) this.pose(this.secondary[i], (running ? 0.12 : 0) + Math.sin(t * 3 + i) * (walking ? 0.055 : 0.014), 0, blend);
  }
}
