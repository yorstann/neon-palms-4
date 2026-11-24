// The player: one person on foot in Palmera Bay, or whatever car they
// are sitting in. On foot you walk, run, punch, shoot and steal cars;
// in a car the shared driving model takes over and the radio works.
// Crimes are reported through game.commitCrime so the wanted system
// can weigh witnesses.

import { collideCircle } from './city.js';
import { clamp, dist } from './random.js';
import { held, pressed, mouse } from './input.js';
import { driveCar } from './vehicles.js';
import { knockDown } from './pedestrians.js';
import { muzzleSmoke } from './effects.js';

export function createPlayer(x, y) {
  return {
    x, y,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,
    health: 100,
    armor: 0,
    car: null,
    armed: true,
    ammo: 90,
    mag: 12,
    reloadUntil: 0,
    fireTimer: 0,
    firing: 0,           // >0 while a shot is fresh (peds react)
    legPhase: 0,
    moving: false,
  };
}

export function updatePlayer(game, dt) {
  const p = game.player;
  p.fireTimer -= dt;
  p.firing = Math.max(0, p.firing - dt);
  if (p.car) updateInCar(game, dt);
  else updateOnFoot(game, dt);
}

function updateOnFoot(game, dt) {
  const p = game.player;
  let mx = 0;
  let my = 0;
  if (held('w', 'arrowup')) my -= 1;
  if (held('s', 'arrowdown')) my += 1;
  if (held('a', 'arrowleft')) mx -= 1;
  if (held('d', 'arrowright')) mx += 1;
  const run = held('shift');
  const speed = run ? 335 : 205;
  const len = Math.hypot(mx, my) || 1;
  p.vx = (mx / len) * (mx || my ? speed : 0);
  p.vy = (my / len) * (mx || my ? speed : 0);
  p.moving = !!(mx || my);
  if (p.moving) {
    p.angle = Math.atan2(my, mx);
    p.legPhase += dt * (run ? 13 : 9.5);
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  collideCircle(game.city, p, 11);

  // Aim at the mouse (screen to world).
  const cam = game.camera;
  const aimX = cam.x + mouse.x;
  const aimY = cam.y + mouse.y;
  const aim = Math.atan2(aimY - p.y, aimX - p.x);
  if (mouse.down || mouse.clicked) p.angle = aim;

  // Shooting: pistol, 12-round mag, R reloads.
  if ((mouse.down || mouse.clicked) && p.armed) {
    if (game.time < p.reloadUntil) {
      // still reloading
    } else if (p.fireTimer <= 0) {
      if (p.mag > 0) {
        p.mag -= 1;
        p.fireTimer = 0.16;
        p.firing = 0.25;
        game.spawnBullet(p.x + Math.cos(aim) * 16, p.y + Math.sin(aim) * 16, aim, 'player', 34);
        muzzleSmoke(game.fx, p.x + Math.cos(aim) * 22, p.y + Math.sin(aim) * 22);
        game.markShot(p.x, p.y);
        game.sfx.shot();
      } else {
        p.fireTimer = 0.3;
        game.sfx.dryFire();
        startReload(game);
      }
    }
  }
  if (pressed('r')) startReload(game);

  // Melee: F swings at whoever is close.
  if (pressed('f')) {
    let hit = false;
    for (const ped of game.peds) {
      if (ped.state !== 'down' && dist(p.x, p.y, ped.x, ped.y) < 40) {
        knockDown(game, ped, 'melee');
        game.commitCrime('assault', ped.x, ped.y);
        hit = true;
      }
    }
    for (const off of game.police.officers) {
      if (dist(p.x, p.y, off.x, off.y) < 42) {
        off.health -= 20;
        hit = true;
        game.commitCrime('assaultCop', off.x, off.y);
      }
    }
    if (hit) game.sfx.punch();
  }

  // Enter a car with E: nearest door within reach. A traffic driver
  // gets dragged out — a witnessed carjacking if anyone is watching.
  if (pressed('e')) {
    const car = nearestCar(game, p.x, p.y, 58);
    if (car && !car.dead) enterCar(game, car);
  }
}

function startReload(game) {
  const p = game.player;
  if (p.mag >= 12 || p.ammo <= 0 || game.time < p.reloadUntil) return;
  p.reloadUntil = game.time + 0.9;
  p.reloadAt = game.time + 0.9;
  game.sfx.reload();
}

export function finishReload(game) {
  const p = game.player;
  const take = Math.min(12 - p.mag, p.ammo);
  p.mag += take;
  p.ammo -= take;
}

function nearestCar(game, x, y, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const car of game.cars) {
    if (car.driver === 'block') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function enterCar(game, car) {
  const p = game.player;
  if (car.driver === 'traffic') {
    game.commitCrime('carjack', car.x, car.y);
    // The driver bails and runs.
    const ped = game.peds.find((q) => q.state !== 'down' && dist(q.x, q.y, car.x, car.y) < 30);
    if (ped) { ped.state = 'flee'; ped.stateTimer = 2.4; ped.fleeFrom = p; }
  }
  car.driver = 'player';
  p.car = car;
  game.sfx.door();
}

function updateInCar(game, dt) {
  const p = game.player;
  const car = p.car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;

  const input = {
    throttle: (held('w', 'arrowup') ? 1 : 0) + (held('s', 'arrowdown') ? -1 : 0),
    steer: (held('a', 'arrowleft') ? -1 : 0) + (held('d', 'arrowright') ? 1 : 0),
  };
  if (held(' ')) { // handbrake: hard decel, tails slide via skid marks
    car.speed -= car.speed * 3.2 * dt;
  }
  driveCar(game, car, dt, input);
  game.cameraShakeFromSpeed = Math.abs(car.speed) > 420 ? 0.6 : 0;

  // Running people over is a crime with witnesses.
  for (const ped of game.peds) {
    if (ped.state !== 'down' && Math.abs(car.speed) > 60 && dist(ped.x, ped.y, car.x, car.y) < 26) {
      if (knockDown(game, ped, 'runover')) {
        game.commitCrime('runover', ped.x, ped.y);
        game.dropCash(ped.x, ped.y);
      }
    }
  }
  for (const off of game.police.officers) {
    if (Math.abs(car.speed) > 60 && dist(off.x, off.y, car.x, car.y) < 27) {
      off.health -= 60;
      game.commitCrime('assaultCop', off.x, off.y);
    }
  }

  // Radio: Q cycles the stations (the HUD names the one playing),
  // X switches it off.
  if (pressed('q')) {
    game.radioStation = game.radioStation === null ? 0 : (game.radioStation + 1) % 3;
  }
  if (pressed('x')) game.radioStation = null;

  // Exit with E at low speed, stepping out on the left side.
  if (pressed('e') && Math.abs(car.speed) < 45) {
    car.driver = null;
    p.car = null;
    p.x = car.x + Math.cos(car.angle - Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle - Math.PI / 2) * 34;
    collideCircle(game.city, p, 11);
    game.sfx.door();
  }
}

/** Damage the player, armour first. Returns true if it was lethal. */
export function hurtPlayer(game, amount) {
  const p = game.player;
  if (game.screen !== 'play') return false;
  let left = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, left * 0.6);
    p.armor -= absorbed;
    left -= absorbed;
  }
  p.health -= left;
  game.hurtFlash = 0.35;
  if (p.health <= 0) {
    p.health = 0;
    game.wasted();
    return true;
  }
  return false;
}

export function healPlayer(game, amount) {
  const p = game.player;
  p.health = clamp(p.health + amount, 0, 100);
}
