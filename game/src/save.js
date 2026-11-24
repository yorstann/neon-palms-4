// localStorage persistence: cash, story progress, packages found,
// position and the car you were driving, so Continue picks the city
// back up where you left it. Everything is best-effort: a browser
// that refuses storage simply starts fresh every visit.

const SAVE_KEY = 'neon-palms.save.v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function storeSave(game) {
  try {
    const p = game.player;
    const data = {
      money: game.money,
      missionIndex: game.missionIndex,
      packagesFound: [...game.packagesFound],
      player: { x: p.x, y: p.y, health: p.health },
      carType: p.car ? p.car.type : null,
      playSeconds: game.playSeconds,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: the run simply is not kept */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function hasSave() {
  return loadSave() !== null;
}
