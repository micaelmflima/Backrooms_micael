import * as T from "three";
// NOVO: projéteis visuais, rastros, clarão e impactos usam pools fixos.
// O dano continua hitscan autoritativo, preservando o combate anterior.
export class ShotEffects {
  constructor(scene) {
    this.scene = scene; this.cursor = 0; this.markCursor = 0; this.shots = []; this.marks = [];
    this.normal = new T.Vector3(); this.axis = new T.Vector3(0, 0, 1);
    this.bulletGeo = new T.SphereGeometry(0.022, 6, 4); this.flashGeo = new T.IcosahedronGeometry(0.075, 0);
    this.markGeo = new T.CircleGeometry(0.065, 8);
    this.lineMat = new T.LineBasicMaterial({ color: 0xffd998, transparent: true, opacity: 0.72, toneMapped: false, depthWrite: false });
    this.bulletMat = new T.MeshBasicMaterial({ color: new T.Color(0xffdb99).multiplyScalar(2.2), toneMapped: false });
    this.markMat = new T.MeshBasicMaterial({ color: 0x17190f, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let i = 0; i < 24; i++) {
      const geometry = new T.BufferGeometry(); geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(6), 3));
      const root = new T.Group(), line = new T.Line(geometry, this.lineMat), bullet = new T.Mesh(this.bulletGeo, this.bulletMat), flash = new T.Mesh(this.flashGeo, this.bulletMat);
      line.frustumCulled = false; root.add(line, bullet, flash); root.visible = false; scene.add(root);
      this.shots.push({ root, line, bullet, flash, geometry, origin: new T.Vector3(), end: new T.Vector3(), tip: new T.Vector3(), direction: new T.Vector3(), active: false, key: "", started: 0, frames: 0, distance: 0 });
    }
    for (let i = 0; i < 60; i++) { const mark = new T.Mesh(this.markGeo, this.markMat); mark.visible = false; scene.add(mark); this.marks.push(mark); }
  }
  fire(key, origin, point, reduced = false) {
    let s = this.shots.find((shot) => shot.active && shot.key === key);
    if (!s) { s = this.shots[this.cursor++ % this.shots.length]; s.started = performance.now() / 1000; s.frames = 0; }
    s.origin.set(origin.x, origin.y, origin.z); s.end.set(point.x, point.y, point.z);
    s.direction.subVectors(s.end, s.origin); s.distance = s.direction.length(); s.direction.normalize();
    s.active = true; s.key = key; s.reduced = reduced; s.root.visible = true; s.flash.position.copy(s.origin);
    return s;
  }
  impact(point, normal) {
    const mark = this.marks[this.markCursor++ % this.marks.length];
    this.normal.set(normal.x, normal.y, normal.z);
    if (this.normal.lengthSq() < 0.5) return;
    mark.position.set(point.x, point.y, point.z).addScaledVector(this.normal, 0.014);
    mark.quaternion.setFromUnitVectors(this.axis, this.normal); mark.visible = true;
  }
  update(now) {
    for (const s of this.shots) if (s.active) {
      const elapsed = now - s.started, travel = Math.min(s.distance, Math.max(0, elapsed) * 180);
      s.tip.copy(s.origin).addScaledVector(s.direction, travel); s.bullet.position.copy(s.tip);
      s.bullet.visible = travel < s.distance; s.flash.visible = !s.reduced && s.frames < 2;
      const tail = Math.max(0, travel - 5), a = s.geometry.attributes.position.array;
      a[0] = s.origin.x + s.direction.x * tail; a[1] = s.origin.y + s.direction.y * tail; a[2] = s.origin.z + s.direction.z * tail;
      a[3] = s.tip.x; a[4] = s.tip.y; a[5] = s.tip.z;
      if (s.frames < 2) { a[0] = s.origin.x; a[1] = s.origin.y; a[2] = s.origin.z; }
      s.geometry.attributes.position.needsUpdate = true;
      if (elapsed > Math.max(0.16, s.distance / 180 + 0.1) && s.frames > 1) { s.active = false; s.root.visible = false; }
      s.frames++;
    }
  }
  clear() { for (const s of this.shots) { s.active = false; s.root.visible = false; } for (const m of this.marks) m.visible = false; }
  get activeCount() { let n = 0; for (const s of this.shots) if (s.active) n++; return n; }
}
