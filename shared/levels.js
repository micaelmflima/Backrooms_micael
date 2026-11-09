import { hash } from "./world.js";
// NOVO: definições compartilhadas da campanha; a autoridade permanece no host.
export const LEVELS = [
  { id: 0, name: "Salas amarelas", theme: "yellow", item: "CHAVE", progress: "Chaves",
    action: "PEGAR CHAVE", exit: "PORTA DE SAÍDA", objective: "ENCONTRE AS 3 CHAVES",
    fog: 0x272b19, background: 0x171b10, density: 0.039, light: 0xffe9ad,
    ambient: 0xe2dfae, ground: 0x3c3824, speed: 1, maximum: 7, spawn: 6, survival: 0 },
  { id: 1, name: "Depósito", theme: "warehouse", item: "GERADOR", progress: "Geradores",
    action: "LIGAR GERADOR", exit: "ELEVADOR", objective: "LIGUE OS 3 GERADORES",
    fog: 0x1b2327, background: 0x10171a, density: 0.043, light: 0xcbd8e0,
    ambient: 0xabbcc4, ground: 0x202831, speed: 1.12, maximum: 8, spawn: 5, survival: 0 },
  { id: 2, name: "Túneis de manutenção", theme: "pipes", item: "FUSÍVEL", progress: "Fusíveis",
    action: "COLETAR FUSÍVEL", exit: "ESCOTILHA", objective: "RECUPERE OS 3 FUSÍVEIS",
    fog: 0x26261d, background: 0x12150f, density: 0.052, light: 0xe5b56d,
    ambient: 0xc2b494, ground: 0x24241b, speed: 1.24, maximum: 9, spawn: 4.4, survival: 0 },
  { id: 3, name: "Piscinas silenciosas", theme: "pools", item: "SELO", progress: "Selos",
    action: "COLETAR SELO", exit: "ÚLTIMA PORTA", objective: "COLETE 3 SELOS E SOBREVIVA",
    fog: 0x2c5362, background: 0x132c37, density: 0.032, light: 0xb2e4f2,
    ambient: 0xc1e9ee, ground: 0x244653, speed: 1.34, maximum: 10, spawn: 3.8, survival: 60 },
];
export const levelConfig = (index) => LEVELS[Math.max(0, Math.min(3, index | 0))];
export const levelSeed = (seed, index) => index === 0 ? seed >>> 0 : hash(index, 991, seed);
export const exitReady = (state) => state.relays.length === 3 &&
  (state.levelElapsed || 0) >= levelConfig(state.level).survival;
