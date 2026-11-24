// Pedestrians: Palmera Bay's walkers. They stroll the sidewalks block
// by block, gossip in pairs, run when the shooting starts or a car
// mounts the kerb at them, and drop a little cash when they go down.
// A fallen walker near a witness is how most wanted stars begin.

import { ROAD_XS, ROAD_YS, ROAD_W, collideCircle } from './city.js';
import { range, pick, clamp, dist } from './random.js';

const SHIRTS = ['#e8e3d8', '#c94f42', '#4a7ab5', '#f2b21b', '#5da464', '#ff5da2', '#39d0ff', '#8a6fc9', '#e8843e'];
const SKINS = ['#f2c9a0', '#d9a06b', '#a06a3c', '#7a4a26', '#ffe0bd'];

export function makePed(rng, x, y) {
  return {
    x, y,
    angle: range(rng, 0, Math.PI * 2),
    speed: 0,
    walkSpeed: range(rng, 46, 78),
    target: null,
    state: 'walk',       // walk | flee | down | fare
    stateTimer: 0,
    shirt: pick(rng, SHIRTS),
    skin: pick(rng, SKINS),
    legPhase: range(rng, 0, 6),
    cashDropped: false,
    wantsTaxi: false,
  };
}

export function seedPeds(game, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const spot = sidewalkPoint(game);
    if (spot) peds.push(makePed(game.rng, spot.x, spot.y));
  }
  return peds;
}

/** A point on a sidewalk: just off a road, not inside a building. */
export function sidewalkPoint(game) {
  const { rng } = game;
  for (let tries = 0; tries < 24; tries += 1) {
    const vertical = rng() < 0.5;
    let x;
    let y;
    if (vertical) {
      const rx = pick(rng, ROAD_XS);
      x = rx + (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + range(rng, 8, 22));
      y = range(rng, 140, 3460);
    } else {
      const ry = pick(rng, ROAD_YS);
      y = ry + (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + range(rng, 8, 22));
      x = range(rng, 140, 4200);
    }
    const probe = { x, y };
    const before = { x, y };
    collideCircle(game.city, probe, 10);
    if (Math.abs(probe.x - before.x) < 1 && Math.abs(probe.y - before.y) < 1) return { x, y };
  }
  return null;
}

function pickTarget(game, ped) {
  const spot = sidewalkPoint(game);
  if (spot) ped.target = spot;
}

export function updatePed(game, ped, dt) {
  const p = game.player;
  if (ped.state === 'down') return;

  // Danger sense: gunfire is handled by callers setting state; here we
  // react to fast cars and to the player sprinting up with a gun out.
  const danger = senseDanger(game, ped);
  if (danger && ped.state !== 'fare') {
    ped.state = 'flee';
    ped.stateTimer = range(game.rng, 1.6, 2.8);
    ped.fleeFrom = danger;
  }

  if (ped.state === 'flee') {
    ped.stateTimer -= dt;
    const from = ped.fleeFrom || p;
    const away = Math.atan2(ped.y - from.y, ped.x - from.x);
    ped.angle = turnToward(ped.angle, away, 8 * dt);
    ped.speed = 165;
    if (ped.stateTimer <= 0) ped.state = 'walk';
  } else if (ped.state === 'fare') {
    ped.speed = 0;
    ped.angle += Math.sin(game.time * 1.4 + ped.legPhase) * 0.1 * dt;
    return;
  } else {
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 14) pickTarget(game, ped);
    if (ped.target) {
      const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
      ped.angle = turnToward(ped.angle, want, 5 * dt);
    }
    ped.speed = ped.walkSpeed;
  }

  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  ped.legPhase += dt * (ped.speed > 100 ? 13 : 8);
  collideCircle(game.city, ped, 9);
}

function senseDanger(game, ped) {
  const p = game.player;
  if (p.car && Math.abs(p.car.speed) > 200 && dist(ped.x, ped.y, p.car.x, p.car.y) < 120) return p.car;
  if (!p.car && p.firing > 0 && dist(ped.x, ped.y, p.x, p.y) < 240) return p;
  if (game.lastShotAt && game.time - game.lastShotAt < 0.4 && dist(ped.x, ped.y, game.lastShotX, game.lastShotY) < 300) {
    return { x: game.lastShotX, y: game.lastShotY };
  }
  return null;
}

function turnToward(angle, want, maxStep) {
  let d = (want - angle) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return angle + clamp(d, -maxStep, maxStep);
}

/** Knock a walker down; returns true if this was a fresh knockdown. */
export function knockDown(game, ped, cause) {
  if (ped.state === 'down') return false;
  ped.state = 'down';
  ped.speed = 0;
  return true;
}
