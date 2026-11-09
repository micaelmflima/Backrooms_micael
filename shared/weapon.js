import { EYE } from "./world.js";
// NOVO: câmera e disparo usam a mesma base espacial no servidor e no cliente.
export function rotateOffset(p, x, y, z) {
  const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  const yp = y * cp - z * sp, zp = y * sp + z * cp;
  return { x: p.x + x * Math.cos(p.yaw) + zp * Math.sin(p.yaw),
    y: EYE + p.y + yp, z: p.z - x * Math.sin(p.yaw) + zp * Math.cos(p.yaw) };
}
export const eyePosition = (p) => ({ x: p.x, y: EYE + p.y, z: p.z });
export function cameraPosition(p, thirdPerson, world, out = {}) {
  const eye = eyePosition(p);
  if (!thirdPerson) { Object.assign(out, eye); return out; }
  const desired = rotateOffset(p, 0.55, 0.32, 2.6);
  const dx = desired.x - eye.x, dy = desired.y - eye.y, dz = desired.z - eye.z;
  const distance = Math.hypot(dx, dy, dz);
  const ray = world.ray(eye, { x: dx / distance, y: dy / distance, z: dz / distance }, distance);
  const fraction = Math.min(1, Math.max(0, ray.distance - 0.18) / distance);
  out.x = eye.x + dx * fraction; out.y = eye.y + dy * fraction; out.z = eye.z + dz * fraction;
  return out;
}
export function defaultMuzzle(p) {
  // A arma sobreposta usa câmera de 60°, o mundo usa 76°. Corrija a projeção.
  const ratio = Math.tan(38 * Math.PI / 180) / Math.tan(30 * Math.PI / 180);
  return rotateOffset(p, 0.24 * ratio, -0.25 * ratio, -0.82);
}
export function direction(p) {
  const cp = Math.cos(p.pitch);
  return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
}
