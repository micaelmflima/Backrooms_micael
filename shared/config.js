// NOVO: cor padrão do explorador. Também pode ser escolhida no lobby.
export const DEFAULT_PLAYER_COLOR = "#d95948";
export const GAME_VERSION = "1.1.1";
export function playerColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase() : DEFAULT_PLAYER_COLOR;
}
