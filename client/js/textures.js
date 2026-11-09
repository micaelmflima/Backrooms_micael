import * as T from "three";
import { random } from "/shared/world.js";
const textureCache = new Map(); // NOVO: cada textura é gerada uma vez por tema.
// Recursos locais: sem CDN, texturas prontas ou downloads durante a partida.
export function texture(kind, v = 0, level = 0) {
  const key = level + ":" + kind + ":" + v;
  if (textureCache.has(key)) return textureCache.get(key);
  if (level > 0 || kind === "organic" || kind === "water") {
    const t = themedTexture(kind, v, level);
    textureCache.set(key, t);
    return t;
  }
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d"),
    rng = random(1847 + v * 178),
    pal = {
      wall: [
        [161, 149, 91],
        [148, 145, 103],
        [147, 126, 80],
      ],
      carpet: [
        [92, 83, 51],
        [77, 87, 67],
        [89, 70, 49],
      ],
      ceiling: [
        [176, 174, 147],
        [160, 169, 152],
        [166, 150, 126],
      ],
    },
    base = pal[kind][v],
    im = x.createImageData(512, 512);
  for (let y = 0; y < 512; y++)
    for (let xx = 0; xx < 512; xx++) {
      const i = (y * 512 + xx) * 4,
        g =
          (rng() - 0.5) * (kind === "carpet" ? 44 : 15) +
          Math.sin(xx * 0.014) * Math.cos(y * 0.017) * 8 -
          (kind === "wall" ? Math.pow(y / 512, 5) * 24 : 0);
      for (let k = 0; k < 3; k++) im.data[i + k] = base[k] + g;
      im.data[i + 3] = 255;
    }
  x.putImageData(im, 0, 0);
  if (kind === "wall") {
    x.strokeStyle = "#655a3329";
    for (let y = -30; y < 530; y += 48)
      for (let a = -20; a < 530; a += 35) {
        const xx = a + (((y / 48) | 0) % 2) * 17;
        x.beginPath();
        x.moveTo(xx, y - 15);
        x.bezierCurveTo(xx + 17, y, xx - 17, y, xx, y + 15);
        x.bezierCurveTo(xx + 9, y, xx - 9, y, xx, y - 15);
        x.stroke();
      }
    for (let a = 0; a < 512; a += 128) {
      x.fillStyle = "#423f201c";
      x.fillRect(a, 0, 2, 512);
      x.fillStyle = "#ede0a316";
      x.fillRect(a + 2, 0, 1, 512);
    }
    for (let i = 0; i < 30; i++) {
      const a = rng() * 512,
        b = rng() * 512,
        r = 10 + rng() * 70,
        g = x.createRadialGradient(a, b, 0, a, b, r);
      g.addColorStop(0, "#3d39261b");
      g.addColorStop(1, "#3d392600");
      x.fillStyle = g;
      x.fillRect(a - r, b - r, r * 2, r * 2);
    }
  } else if (kind === "ceiling") {
    for (let i = 0; i < 512; i += 128) {
      x.fillStyle = "#514f3f";
      x.fillRect(i, 0, 3, 512);
      x.fillRect(0, i, 512, 3);
      x.fillStyle = "#e5e0bc";
      x.fillRect(i + 3, 0, 1, 512);
      x.fillRect(0, i + 3, 512, 1);
    }
    for (let i = 0; i < 1500; i++) {
      x.fillStyle = "#252b2427";
      x.fillRect(rng() * 512, rng() * 512, 1, 2);
    }
  } else
    for (let i = 0; i < 24000; i++) {
      x.fillStyle = rng() > 0.5 ? "#beb88a23" : "#141b142a";
      x.fillRect(rng() * 512, rng() * 512, 0.8, 2 + rng() * 3);
    }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  textureCache.set(key, t);
  return t;
}
// NOVO: concreto, ferrugem, azulejos, água e pele orgânica são recursos locais.
function themedTexture(kind, v, level) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d"), rng = random(3187 + v * 179 + level * 891);
  const palettes = [null, ["#777c78", "#505653", "#60696a"],
    ["#777468", "#484b40", "#535b51"], ["#b3d0d2", "#7cabb7", "#c4d8d8"]];
  x.fillStyle = kind === "organic" ? ["#4b5044", "#625747", "#6d7470"][v]
    : kind === "water" ? "#276d82" : palettes[level][kind === "wall" ? 0 : kind === "carpet" ? 1 : 2];
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 13000; i++) {
    x.fillStyle = rng() > 0.5 ? "#e4e9d915" : "#050b1025";
    x.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 3);
  }
  if (kind === "organic") {
    for (let i = 0; i < 65; i++) {
      x.strokeStyle = i % 3 ? "#151a16a0" : "#ad7b6650";
      x.lineWidth = 0.7 + rng() * 1.4; x.beginPath();
      const a = rng() * 256, b = rng() * 256;
      x.moveTo(a, b); x.bezierCurveTo(a + 22, b + 8, a - 13, b + 45, a + 18, b + 80); x.stroke();
    }
  } else if (kind === "water") {
    x.strokeStyle = "#a4e9ee33"; x.lineWidth = 1.5;
    for (let row = 0; row < 22; row++) {
      x.beginPath();
      for (let a = 0; a <= 256; a += 4) {
        const b = row * 12 + Math.sin(a * 0.055 + row * 1.8) * 9;
        if (a) x.lineTo(a, b); else x.moveTo(a, b);
      }
      x.stroke();
    }
  } else if (level === 3) {
    for (let a = 0; a < 256; a += 32) {
      x.fillStyle = "#38586688"; x.fillRect(a, 0, 2, 256); x.fillRect(0, a, 256, 2);
      x.fillStyle = "#e2ffff77"; x.fillRect(a + 2, 0, 1, 256); x.fillRect(0, a + 2, 256, 1);
    }
    if (kind === "wall") { x.fillStyle = "#30607899"; x.fillRect(0, 190, 256, 32); }
  } else {
    x.strokeStyle = level === 2 ? "#43322588" : "#323b3877";
    for (let i = 0; i < 25; i++) {
      const a = rng() * 256, b = rng() * 256;
      x.beginPath(); x.moveTo(a, b); x.lineTo(a + rng() * 35, b + rng() * 70); x.stroke();
    }
    if (kind === "wall") for (let a = 0; a < 256; a += 64) {
      x.fillStyle = "#131c1c55"; x.fillRect(a, 0, 2, 256); x.fillRect(0, a, 256, 2);
    }
    if (level === 2) for (let i = 0; i < 16; i++) {
      x.fillStyle = "#72452b35"; x.fillRect(rng() * 256, rng() * 256, rng() * 30, rng() * 90);
    }
  }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function labelTexture(text, sub = "", color = "#d8cc94") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#292f20";
  x.fillRect(0, 0, 512, 256);
  x.strokeStyle = color;
  x.lineWidth = 4;
  x.strokeRect(12, 12, 488, 232);
  x.fillStyle = color;
  x.font = "bold 80px monospace";
  x.textAlign = "center";
  x.fillText(text, 256, 125);
  x.font = "23px monospace";
  x.fillText(sub, 256, 185);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
