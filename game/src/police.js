// The PBPD response: pursuit cars that hunt and ram, officers who get
// out and close in on foot, roadblocks thrown across the avenues from
// three stars, spike strips from four, and the helicopter that hangs
// its searchlight over you at four and five. The busted meter lives
// here too: stand still in reach of the law and it fills.

import { ROAD_XS, ROAD_YS, collideCircle } from './city.js';
import { range, clamp, dist, angleDelta } from './random.js';
import { makeCar, driveCar, steerTo, randomRoadPoint } from './vehicles.js';

export function createPolice() {
  return {
    cars: [],
    officers: [],
    heli: null,
    blocks: [],
    spawnTimer: 0,
    blockTimer: 0,
    bustedMeter: 0,
  };
}

/** How many pursuit cars each star level keeps on the street. */
function wantedCars(stars) {
  return [0, 1, 2, 3, 4, 6][stars] || 0;
}

export function updatePolice(game, dt) {
  const pol = game.police;
  const p = game.player;
  const stars = game.stars;
  pol.spawnTimer -= dt;
  pol.blockTimer -= dt;

  // Spawn pursuit cars just out of sight on the road network.
  const wantCars = wantedCars(stars);
  if (stars > 0 && pol.cars.length < wantCars && pol.spawnTimer <= 0) {
    pol.spawnTimer = 1.4;
    const spot = spawnSpot(game);
    if (spot) {
      const car = makeCar('police', spot.x, spot.y, spot.angle, game.rng);
      car.driver = 'police';
      pol.cars.push(car);
      game.cars.push(car);
    }
  }
  // Cull units that are wrecked and far away, or when the heat is gone.
  for (let i = pol.cars.length - 1; i >= 0; i -= 1) {
    const car = pol.cars[i];
    const d = dist(car.x, car.y, p.x, p.y);
    if ((car.dead && d > 700) || (stars === 0 && d > 900)) {
      removeCar(game, car);
      pol.cars.splice(i, 1);
    }
  }

  // Drive the pursuit.
  for (const car of pol.cars) {
    if (car.dead) continue;
    const lead = 0.35;
    const tx = p.x + (p.car ? Math.cos(p.car.angle) * p.car.speed * lead : 0);
    const ty = p.y + (p.car ? Math.sin(p.car.angle) * p.car.speed * lead : 0);
    const input = steerTo(car, tx, ty, dt, { throttle: 1 });
    if (dist(car.x, car.y, p.x, p.y) < 60) input.throttle = 0.4; // nose in, don't orbit
    driveCar(game, car, dt, input);
    car.lightPhase = (car.lightPhase || 0) + dt * 9;
    // Officers bail out when the player is on foot and close.
    if (!p.car && dist(car.x, car.y, p.x, p.y) < 150 && Math.abs(car.speed) < 60 && pol.officers.length < stars + 1) {
      if (!car.spawnedOfficer || game.time - car.spawnedOfficer > 9) {
        car.spawnedOfficer = game.time;
        pol.officers.push(makeOfficer(car.x + 20, car.y + 10));
      }
    }
  }

  // Officers on foot.
  for (let i = pol.officers.length - 1; i >= 0; i -= 1) {
    const off = pol.officers[i];
    if (off.health <= 0) { pol.officers.splice(i, 1); continue; }
    if (stars === 0 || dist(off.x, off.y, p.x, p.y) > 1100) { pol.officers.splice(i, 1); continue; }
    updateOfficer(game, off, dt);
  }

  // Roadblocks from three stars, spikes from four.
  if (stars >= 3 && pol.blockTimer <= 0 && pol.blocks.length < (stars >= 4 ? 2 : 1)) {
    pol.blockTimer = 14;
    const block = makeRoadblock(game);
    if (block) pol.blocks.push(block);
  }
  for (let i = pol.blocks.length - 1; i >= 0; i -= 1) {
    const b = pol.blocks[i];
    if (dist(b.x, b.y, p.x, p.y) > 1500 || stars < 3) {
      for (const c of b.cars) removeCar(game, c);
      pol.blocks.splice(i, 1);
      continue;
    }
    // Spike strip: crossing it on the strip line pops the tyres.
    if (b.spikes && p.car && game.time >= p.car.flatUntil) {
      const along = b.horizontal ? Math.abs(p.car.y - b.y) : Math.abs(p.car.x - b.x);
      const across = b.horizontal ? Math.abs(p.car.x - b.x) : Math.abs(p.car.y - b.y);
      if (along < 12 && across < 95 && Math.abs(p.car.speed) > 60) {
        p.car.flatUntil = game.time + 6;
        game.sfx.pop();
        game.fxShake = Math.max(game.fxShake || 0, 5);
      }
    }
  }

  // The helicopter at four stars and up.
  if (stars >= 4) {
    if (!pol.heli) pol.heli = { x: p.x - 500, y: p.y - 400, angle: 0, phase: 0 };
    const h = pol.heli;
    const orbit = 150;
    const wantX = p.x + Math.cos(game.time * 0.45) * orbit;
    const wantY = p.y + Math.sin(game.time * 0.45) * orbit - 40;
    h.x += (wantX - h.x) * Math.min(1, dt * 1.6);
    h.y += (wantY - h.y) * Math.min(1, dt * 1.6);
    h.angle = Math.atan2(p.y - h.y, p.x - h.x);
    h.phase += dt * 28;
  } else if (pol.heli) {
    pol.heli.x += Math.cos(pol.heli.angle) * 500 * dt;
    pol.heli.y += Math.sin(pol.heli.angle) * 500 * dt;
    if (dist(pol.heli.x, pol.heli.y, p.x, p.y) > 1300) pol.heli = null;
  }

  updateBusted(game, dt);
}

function updateBusted(game, dt) {
  const pol = game.police;
  const p = game.player;
  if (game.stars === 0 || game.screen !== 'play') { pol.bustedMeter = Math.max(0, pol.bustedMeter - dt * 0.5); return; }
  let pressure = 0;
  const reach = p.car ? 95 : 60;
  for (const car of pol.cars) {
    if (!car.dead && dist(car.x, car.y, p.x, p.y) < reach + 30) pressure = Math.max(pressure, 1);
  }
  for (const off of pol.officers) {
    if (dist(off.x, off.y, p.x, p.y) < reach) pressure = Math.max(pressure, 1.4);
  }
  const playerSpeed = p.car ? Math.abs(p.car.speed) : Math.hypot(p.vx || 0, p.vy || 0);
  if (pressure > 0 && playerSpeed < 55) {
    pol.bustedMeter += dt * 0.5 * pressure;
  } else {
    pol.bustedMeter = Math.max(0, pol.bustedMeter - dt * 0.35);
  }
  if (pol.bustedMeter >= 1) {
    pol.bustedMeter = 0;
    game.busted();
  }
}

function spawnSpot(game) {
  const p = game.player;
  for (let tries = 0; tries < 20; tries += 1) {
    const spot = randomRoadPoint(game, 40);
    if (!spot) continue;
    const d = dist(spot.x, spot.y, p.x, p.y);
    if (d > 620 && d < 1150) return spot;
  }
  return null;
}

function makeOfficer(x, y) {
  return { x, y, angle: 0, health: 40, legPhase: Math.random() * 6, shootTimer: 1 + Math.random() };
}

function updateOfficer(game, off, dt) {
  const p = game.player;
  const d = dist(off.x, off.y, p.x, p.y);
  const want = Math.atan2(p.y - off.y, p.x - off.x);
  off.angle = want;
  if (d > 120) {
    off.x += Math.cos(want) * 128 * dt;
    off.y += Math.sin(want) * 128 * dt;
    off.legPhase += dt * 11;
  } else if (d < 70) {
    off.x -= Math.cos(want) * 60 * dt;
    off.y -= Math.sin(want) * 60 * dt;
  }
  collideCircle(game.city, off, 9);
  // Officers shoot when the player is armed and in the open.
  off.shootTimer -= dt;
  if (off.shootTimer <= 0 && d < 330 && p.armed) {
    off.shootTimer = 1.1 + Math.random() * 0.7;
    game.enemyShoot(off, 0.16);
  }
}

function makeRoadblock(game) {
  const p = game.player;
  // Throw the block across an avenue a few hundred metres ahead of
  // the player's line of travel.
  const heading = p.car ? p.car.angle : p.angle;
  const bx = p.x + Math.cos(heading) * 560;
  const by = p.y + Math.sin(heading) * 560;
  let rx = null;
  let ry = null;
  let bd = Infinity;
  for (const x of ROAD_XS) { const d = Math.abs(x - bx); if (d < bd) { bd = d; rx = x; } }
  bd = Infinity;
  for (const y of ROAD_YS) { const d = Math.abs(y - by); if (d < bd) { bd = d; ry = y; } }
  const horizontal = Math.abs(by - ry) < Math.abs(bx - rx);
  const x = horizontal ? rx : rx;
  const y = horizontal ? ry : ry;
  const cars = [];
  const n = 2;
  for (let i = 0; i < n; i += 1) {
    const off = (i - (n - 1) / 2) * 52;
    const car = makeCar('police', horizontal ? x + off : x, horizontal ? y : y + off, horizontal ? Math.PI / 2 : 0, game.rng);
    car.driver = 'block';
    cars.push(car);
    game.cars.push(car);
  }
  return { x, y, horizontal, cars, spikes: game.stars >= 4 };
}

function removeCar(game, car) {
  const i = game.cars.indexOf(car);
  if (i >= 0) game.cars.splice(i, 1);
}

/** Is the player inside the helicopter's searchlight cone? */
export function inSearchlight(game) {
  const h = game.police.heli;
  if (!h) return false;
  const p = game.player;
  return dist(h.x, h.y, p.x, p.y) < 190;
}
