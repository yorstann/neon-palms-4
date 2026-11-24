// Deterministic screenshot scenes behind ?shot=title|downtown|chase|race.
// Each scene arranges the real game state — the same city, cars, police
// and weather the player gets — into one composed frame, freezes the
// simulation, and lets the boot code paint it. Same seed, same frame.

import { clamp, dist } from './random.js';
import { makeCar } from './vehicles.js';
import { setWeather, WEATHER_CLEAR, WEATHER_DRIZZLE, WEATHER_STORM } from './weather.js';
import { RACE_CPS } from './missions.js';

function setClock(game, hour, minute) {
  game.clockMinutes = hour * 60 + minute;
  game.clockText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function focusCamera(game, x, y) {
  game.camera.x = clamp(x - 640, 0, 4800 - 1280);
  game.camera.y = clamp(y - 360, 0, 3600 - 720);
}

function trafficNear(game, x, y, count) {
  let placed = 0;
  for (const car of game.cars) {
    if (placed >= count) break;
    if (car.driver === 'traffic' && dist(car.x, car.y, x, y) > 500) {
      car.x = x + (placed % 3 - 1) * 190;
      car.y = y + Math.floor(placed / 3) * 170 - 80;
      car.angle = placed % 2 ? 0 : Math.PI / 2;
      car.speed = 120;
      placed += 1;
    }
  }
}

function pedsNear(game, x, y, count) {
  let placed = 0;
  for (const ped of game.peds) {
    if (placed >= count) break;
    ped.x = x + (placed % 4 - 1.5) * 90;
    ped.y = y + Math.floor(placed / 4) * 80 - 30;
    ped.state = 'walk';
    placed += 1;
  }
}

export function stageShot(game, name) {
  game.frozen = true;
  const p = game.player;
  if (name === 'downtown') return sceneDowntown(game, p);
  if (name === 'chase') return sceneChase(game, p);
  if (name === 'race') return sceneRace(game, p);
  return sceneTitle(game, p);
}

function sceneTitle(game, p) {
  game.screen = 'title';
  setClock(game, 19, 5); // rainy dusk
  setWeather(game.weather, WEATHER_STORM, 0.85);
  game.weatherTag = WEATHER_STORM;
  p.x = 1560;
  p.y = 1620;
  trafficNear(game, 1500, 1500, 6);
  pedsNear(game, 1500, 1560, 6);
  focusCamera(game, 1500, 1420);
}

function sceneDowntown(game, p) {
  game.screen = 'play';
  setClock(game, 13, 40);
  setWeather(game.weather, WEATHER_CLEAR, 0);
  game.weatherTag = WEATHER_CLEAR;
  p.x = 1562;
  p.y = 1568;
  p.angle = -0.5;
  p.armed = true;
  game.money = 640;
  game.objective = 'Meet Mara — new work: "First Wheels"';
  game.marker = { x: game.city.maraSpot.x, y: game.city.maraSpot.y };
  trafficNear(game, 1500, 1500, 7);
  pedsNear(game, 1500, 1500, 9);
  focusCamera(game, p.x, p.y);
}

function sceneChase(game, p) {
  game.screen = 'play';
  setClock(game, 23, 40); // night, full storm
  setWeather(game.weather, WEATHER_STORM, 0.95);
  game.weatherTag = WEATHER_STORM;
  // The player, mid-flight east along the 1500 avenue.
  const car = makeCar('sports', 2260, 1532, 0, game.rng);
  car.driver = 'player';
  car.speed = 395;
  car.color = '#ff5da2';
  game.cars.push(car);
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  game.heat = 5.3;
  game.stars = 5;
  game.money = 2875;
  game.objective = 'Escape to the marina — lose them at the flag!';
  game.marker = { x: game.city.marina.x, y: game.city.marina.y };
  game.radioStation = 1;
  // Pursuit: two behind, one alongside.
  const spots = [
    { x: 2080, y: 1568 }, { x: 2020, y: 1470 }, { x: 2400, y: 1620 },
  ];
  for (const s of spots) {
    const cop = makeCar('police', s.x, s.y, 0.2, game.rng);
    cop.driver = 'police';
    cop.speed = 360;
    cop.lightPhase = game.rng() * 2;
    game.cars.push(cop);
    game.police.cars.push(cop);
  }
  // Roadblock across the avenue ahead, spikes down.
  const blockCars = [];
  for (const off of [-30, 30]) {
    const bc = makeCar('police', 2700, 1500 + off, Math.PI / 2, game.rng);
    bc.driver = 'block';
    game.cars.push(bc);
    blockCars.push(bc);
  }
  game.police.blocks.push({ x: 2700, y: 1500, horizontal: false, cars: blockCars, spikes: true });
  // The helicopter hangs its light over the player.
  game.police.heli = { x: 2500, y: 1340, angle: 2.2, phase: 3 };
  trafficNear(game, 1500, 900, 3);
  focusCamera(game, p.x + 40, p.y);
}

function sceneRace(game, p) {
  game.screen = 'play';
  setClock(game, 18, 35); // dusk drizzle
  setWeather(game.weather, WEATHER_DRIZZLE, 0.45);
  game.weatherTag = WEATHER_DRIZZLE;
  // On the 1500 avenue, racing east toward checkpoint 3 at (3300, 1500).
  const car = makeCar('sports', 3020, 1532, 0, game.rng);
  car.driver = 'player';
  car.speed = 330;
  car.color = '#39d0ff';
  game.cars.push(car);
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  game.money = 1720;
  // Two rivals: one just ahead in the other lane, one on the tail.
  const rivalA = makeCar('sports', 3190, 1568, 0, game.rng);
  rivalA.driver = 'rival';
  rivalA.speed = 320;
  rivalA.raceCp = 2;
  const rivalB = makeCar('sedan', 2880, 1470, 0, game.rng);
  rivalB.driver = 'rival';
  rivalB.speed = 300;
  rivalB.raceCp = 1;
  game.cars.push(rivalA, rivalB);
  game.side.race = {
    rivals: [rivalA, rivalB],
    cp: 2, timer: 47.3, finished: false, playerDone: false, position: 2,
  };
  game.raceMarker = RACE_CPS[2];
  game.objective = 'Marina Street Race — beat them to the flag!';
  focusCamera(game, p.x, p.y);
}
