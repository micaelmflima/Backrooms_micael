import { World } from "/shared/world.js";
// UPDATE 1.1.1: geração da grade fora da thread que desenha o jogo.
let world;
self.onmessage = ({ data: d }) => {
  if (!world || world.seed !== d.seed || world.level !== d.level) world = new World(d.seed, d.level);
  const c = world.chunk(d.cx, d.cz), grid = c.grid.slice();
  self.postMessage({ id: d.id, seed: d.seed, level: d.level,
    chunk: { cx: c.cx, cz: c.cz, variant: c.variant, grid } }, [grid.buffer]);
};
