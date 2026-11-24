// Vehicles: five body types with their own pace and paint, parked cars
// to steal, lane-following traffic that tours the avenue grid, and the
// shared arcade driving model the player, the police and the race
// rivals all steer through.

import { ROAD_XS, ROAD_YS, ROAD_W, onRoad, pointInSolid, collideCircle } from './city.js';
import { range, pick, clamp, angleDelta, dist } from './random.js';
import { addSkid, sparks, smokePuff } from './effects.js';

export const CAR_TYPES = {
  sedan: { w: 46, h: 24, top: 430, accel: 340, grip: 3.4, colors: ['#c94f42', '#4a7ab5', '#b5b9be', '#5da464', '#8a6fc9', '#d8d3c8'] },
  taxi: { w: 46, h: 24, top: 430, accel: 340, grip: 3.4, colors: ['#f2b21b'] },
  sports: { w: 48, h: 23, top: 575, accel: 470, grip: 3.9, colors: ['#ff5da2', '#39d0ff', '#e33f2f', '#ffd23e'] },
  truck: { w: 62, h: 30, top: 335, accel: 250, grip: 2.7, colors: ['#7d8894', '#96795c', '#5f7263'] },
  police: { w: 47, h: 24, top: 505, accel: 420, grip: 3.7, colors: ['#20242c'] },
};

let nextCarId = 1;

export function makeCar(type, x, y, angle, rng) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId++,
    type, spec,
    x, y, angle,
    speed: 0,
    steer: 0,
    w: spec.w, h: spec.h,
    color: type === 'police' ? '#20242c' : pick(rng, spec.colors),
    health: 100,
    driver: null,        // 'traffic' | 'police' | 'player' | 'rival' | null (parked)
    // traffic routing
    target: null,
    cruise: range(rng, 0.55, 0.8),
    stuck: 0,
    // damage flavour
    smokeTimer: 0,
    flatUntil: 0,        // spike-strip flat tyre: slow + wobble until this time
    dead: false,
    rivalIndex: 0,
    raceCp: 0,
  };
}

/** Scatter parked cars along the avenues and a working traffic fleet. */
export function seedTraffic(game) {
  const { rng, city } = game;
  const cars = [];
  for (let i = 0; i < 46; i += 1) {
    const spot = randomRoadPoint(game, 90);
    if (!spot) continue;
    const type = pick(rng, ['sedan', 'sedan', 'taxi', 'sports', 'truck']);
    const car = makeCar(type, spot.x + range(rng, -18, 18), spot.y + range(rng, -18, 18), spot.angle, rng);
    cars.push(car);
  }
  for (let i = 0; i < 20; i += 1) {
    const spot = randomRoadPoint(game, 40);
    if (!spot) continue;
    const type = pick(rng, ['sedan', 'sedan', 'taxi', 'sports']);
    const car = makeCar(type, spot.x, spot.y, spot.angle, rng);
    car.driver = 'traffic';
    car.target = nextWaypoint(game, car);
    cars.push(car);
  }
  return cars;
}

export function randomRoadPoint(game, margin) {
  const { rng } = game;
  for (let tries = 0; tries < 30; tries += 1) {
    const vertical = rng() < 0.5;
    if (vertical) {
      const x = pick(rng, ROAD_XS) + range(rng, -ROAD_W / 2 + margin * 0.4, ROAD_W / 2 - margin * 0.4);
      const y = range(rng, 120, 3480);
      if (!pointInSolid(game.city, x, y)) return { x, y, angle: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
    } else {
      const x = range(rng, 120, 4200);
      const y = pick(rng, ROAD_YS) + range(rng, -ROAD_W / 2 + margin * 0.4, ROAD_W / 2 - margin * 0.4);
      if (!pointInSolid(game.city, x, y)) return { x, y, angle: rng() < 0.5 ? 0 : Math.PI };
    }
  }
  return null;
}

/** Choose the next intersection a traffic car heads for, biased onward. */
export function nextWaypoint(game, car) {
  const { rng } = game;
  let best = null;
  let bestScore = -Infinity;
  for (const ix of ROAD_XS) {
    for (const iy of ROAD_YS) {
      const d = dist(car.x, car.y, ix, iy);
      if (d < 60) continue;
      // Prefer targets roughly ahead and not absurdly far.
      const ahead = Math.cos(car.angle) * (ix - car.x) + Math.sin(car.angle) * (iy - car.y);
      const score = ahead - d * 0.35 + rng() * 220;
      if (score > bestScore) { bestScore = score; best = { x: ix, y: iy }; }
    }
  }
  return best || { x: 1500, y: 1500 };
}

/**
 * The arcade driving model. `input` is {throttle -1..1, steer -1..1}.
 * Returns the impact speed if the car struck the world this step.
 */
export function driveCar(game, car, dt, input) {
  const spec = car.spec;
  const now = game.time;
  const flat = now < car.flatUntil;
  const top = spec.top * (flat ? 0.45 : 1) * (car.health <= 0 ? 0 : 1);
  const accel = spec.accel * (flat ? 0.6 : 1);

  if (input.throttle > 0) car.speed += accel * input.throttle * dt;
  else if (input.throttle < 0) {
    car.speed += (car.speed > 8 ? -accel * 1.15 : accel * input.throttle * 0.55) * dt;
  } else {
    car.speed -= car.speed * 0.55 * dt;
    if (Math.abs(car.speed) < 2) car.speed = 0;
  }
  car.speed = clamp(car.speed, -170, top);

  const speedRatio = clamp(Math.abs(car.speed) / 160, 0, 1);
  const wobble = flat ? Math.sin(now * 22) * 0.12 : 0;
  car.angle += input.steer * spec.grip * 0.62 * speedRatio * dt * (car.speed < 0 ? -1 : 1);
  car.angle += wobble * dt * clamp(Math.abs(car.speed) / 120, 0, 1);
  car.steer = input.steer;

  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  car.x += vx * dt;
  car.y += vy * dt;

  // World collision: the car is a circle of roughly its half-width.
  const before = Math.abs(car.speed);
  const impact = collideCarWorld(game, car);
  if (impact) {
    car.health -= before * 0.045;
    car.speed *= -0.22;
    if (before > 130) {
      sparks(game.fx, car.x + Math.cos(car.angle) * car.w * 0.5, car.y + Math.sin(car.angle) * car.w * 0.5, car.angle);
      game.audioCrash = Math.max(game.audioCrash || 0, before > 260 ? 2 : 1);
    }
  }

  // Burnt rubber when cornering hard or launching.
  if (Math.abs(car.speed) > 130 && Math.abs(input.steer) > 0.6) {
    addSkid(game.fx, car.x - Math.cos(car.angle) * 14, car.y - Math.sin(car.angle) * 14, car.angle);
  }
  if (car.health < 45 && car.health > 0) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      car.smokeTimer = 0.16;
      smokePuff(game.fx, car.x, car.y, car.health < 22);
    }
  }
  if (car.health <= 0 && !car.dead) car.dead = true;
  return impact ? before : 0;
}

function collideCarWorld(game, car) {
  const probe = { x: car.x, y: car.y };
  const hit = collideCircle(game.city, probe, car.w * 0.42);
  car.x = probe.x;
  car.y = probe.y;
  return hit;
}

/** Steer an AI car toward a point; returns the drive input. */
export function steerTo(car, tx, ty, dt, opts = {}) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const delta = angleDelta(car.angle, want);
  const steer = clamp(delta * 2.4, -1, 1);
  let throttle = opts.throttle ?? 0.85;
  if (Math.abs(delta) > 2.2) throttle = 0.25;
  if (opts.slowFor && dist(car.x, car.y, tx, ty) < opts.slowFor) throttle = Math.min(throttle, 0.4);
  return { throttle, steer };
}

/** Traffic behaviour: tour intersections, keep a gap to the car ahead. */
export function updateTrafficCar(game, car, dt) {
  if (!car.target || dist(car.x, car.y, car.target.x, car.target.y) < 90) {
    car.target = nextWaypoint(game, car);
  }
  // Lane offset: drive on the right of the road centre line.
  const dx = car.target.x - car.x;
  const dy = car.target.y - car.y;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const tx = car.target.x + (horizontal ? 0 : (dx >= 0 ? -26 : 26) * Math.sign(Math.cos(car.angle) || 1));
  const ty = car.target.y + (horizontal ? (dy >= 0 ? 26 : -26) * Math.sign(Math.sin(car.angle) || 1) : 0);
  let input = steerTo(car, tx, ty, dt, { throttle: car.cruise });

  // Keep a gap: slow for anything solid ahead.
  const aheadX = car.x + Math.cos(car.angle) * 74;
  const aheadY = car.y + Math.sin(car.angle) * 74;
  for (const other of game.cars) {
    if (other === car) continue;
    if (dist(aheadX, aheadY, other.x, other.y) < 40) { input.throttle = Math.min(input.throttle, 0.05); break; }
  }
  const p = game.player;
  if (!p.car && dist(aheadX, aheadY, p.x, p.y) < 34) input.throttle = Math.min(input.throttle, 0.05);

  const moved = Math.abs(car.speed);
  driveCar(game, car, dt, input);
  if (moved < 12 && input.throttle > 0.3) {
    car.stuck += dt;
    if (car.stuck > 1.6) { car.target = nextWaypoint(game, car); car.stuck = 0; }
  } else car.stuck = 0;
}

/** Simple car-vs-car soft push so traffic does not stack into one blob. */
export function separateCars(game, dt) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = (a.w + b.w) * 0.42;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        const aMovable = a.driver !== 'player';
        const bMovable = b.driver !== 'player';
        if (aMovable) { a.x -= nx * push; a.y -= ny * push; }
        if (bMovable) { b.x += nx * push; b.y += ny * push; }
        if (Math.abs(a.speed) + Math.abs(b.speed) > 240) {
          a.health -= 2.5;
          b.health -= 2.5;
          sparks(game.fx, (a.x + b.x) / 2, (a.y + b.y) / 2, a.angle);
          game.audioCrash = Math.max(game.audioCrash || 0, 1);
        }
        a.speed *= 0.94;
        b.speed *= 0.94;
      }
    }
  }
}

export function isOnRoad(car) {
  return onRoad(car.x, car.y);
}
