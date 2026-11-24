// Neon Palms — a top-down open-world crime game in Palmera Bay.
// This module owns the game state and the fixed-step loop, wires the
// other modules together (city, vehicles, pedestrians, police,
// missions, weather, effects, HUD) and draws the world. Everything is
// original: the city, the people, the story and the art are drawn in
// code at runtime; there are no external assets.

import { buildCity, districtAt, pointInSolid, DISTRICTS, ROAD_XS, ROAD_YS, ROAD_W, WATER_X, BEACH_X, WORLD } from './city.js';
import { makeRng, range, pick, clamp, dist } from './random.js';
import { attachInput, held, pressed, mouse, endFrame } from './input.js';
import { createPlayer, updatePlayer, finishReload, hurtPlayer } from './player.js';
import { seedTraffic, updateTrafficCar, separateCars, CAR_TYPES } from './vehicles.js';
import { seedPeds, updatePed, knockDown, sidewalkPoint } from './pedestrians.js';
import { createPolice, updatePolice, inSearchlight } from './police.js';
import {
  createMissionState, createSideState, buildMissions, updateMissions,
  updateTaxi, updateGang, tryStartRace, updateRace,
} from './missions.js';
import { createWeather, updateWeather, drawRain, WEATHER_CLEAR } from './weather.js';
import { createEffects, updateEffects, drawSkids, drawParticles, drawTexts, burst, sparks, addShake, floatText } from './effects.js';
import { drawHUD, drawDialogue, drawTitle, drawPause, drawHelp, drawEndScreen } from './hud.js';
import { sfx, engineSound, sirenSound, rotorSound, radioSound, rainSound } from './audio.js';
import { loadSave, storeSave, hasSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const VIEW = { w: 1280, h: 720 };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.w;
canvas.height = VIEW.h;
attachInput(canvas);

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 20261124) >>> 0;
const shotName = params.get('shot');

// ------------------------------------------------------------------
// Game state
// ------------------------------------------------------------------
function newGame(fromSave) {
  const rng = makeRng(seed);
  const city = buildCity(seed);
  const game = {
    rng, city,
    time: 0,
    dt: STEP,
    playSeconds: 0,
    screen: 'title',
    prevScreen: 'title',
    frozen: false,
    player: createPlayer(1560, 1620),
    cars: [],
    peds: [],
    bullets: [],
    pickups: [],
    packages: [],
    packagesFound: new Set(),
    police: createPolice(),
    msn: createMissionState(),
    side: createSideState(),
    weather: createWeather(rng),
    fx: createEffects(),
    camera: { x: 0, y: 0, w: VIEW.w, h: VIEW.h },
    money: 250,
    heat: 0,
    stars: 0,
    lastCrimeAt: -99,
    lastShotAt: 0, lastShotX: 0, lastShotY: 0,
    clockMinutes: 17 * 60 + 20,
    clockText: '17:20',
    weatherTag: 'CLEAR',
    objective: '',
    marker: null,
    raceMarker: null,
    dialogue: null,
    toastText: '',
    toastUntil: 0,
    interactHint: '',
    interactPressed: false,
    radioStation: null,
    missionIndex: 0,
    hasSaveFile: hasSave(),
    saveSoon: false,
    hurtFlash: 0,
    resprayTimer: 0,
    audioCrash: 0,
    sfx,
  };
  game.missions = buildMissions(game);
  game.cars = seedTraffic(game);
  game.peds = seedPeds(game, 42);
  // Hidden packages: on sidewalks, in alleys, by the water.
  for (let i = 0; i < 20; i += 1) {
    const spot = sidewalkPoint(game) || { x: 400 + i * 180, y: 400 };
    game.packages.push({ x: spot.x, y: spot.y, id: i });
  }
  // Wire the cross-module helpers the other files call.
  game.commitCrime = (kind, x, y, mult = 1) => commitCrime(game, kind, x, y, mult);
  game.addHeat = (n) => { game.heat = clamp(game.heat + n, 0, 5.6); game.lastCrimeAt = game.time; };
  game.clearHeat = () => { game.heat = 0; };
  game.markShot = (x, y) => { game.lastShotAt = game.time; game.lastShotX = x; game.lastShotY = y; };
  game.spawnBullet = (x, y, angle, owner, dmg) => spawnBullet(game, x, y, angle, owner, dmg);
  game.enemyShoot = (shooter, miss) => enemyShoot(game, shooter, miss);
  game.dropCash = (x, y) => {
    game.pickups.push({ x: x + range(rng, -8, 8), y: y + range(rng, -8, 8), amount: Math.floor(range(rng, 12, 46)), life: 25 });
  };
  game.toast = (text) => { game.toastText = text; game.toastUntil = game.time + 3.4; };
  game.failMission = (why) => {
    game.msn.phase = 'offer';
    game.msn.step = 0;
    game.msn.data = {};
    game.marker = null;
    game.toast(why);
    sfx.phone();
  };
  game.busted = () => enterEndScreen(game, 'busted');
  game.wasted = () => enterEndScreen(game, 'wasted');
  game.hurtPlayer = (n) => hurtPlayer(game, n);

  if (fromSave) {
    const data = loadSave();
    if (data) {
      game.money = data.money;
      game.msn.idx = data.missionIndex;
      game.missionIndex = data.missionIndex;
      game.packagesFound = new Set(data.packagesFound || []);
      game.player.x = data.player.x;
      game.player.y = data.player.y;
      game.player.health = clamp(data.player.health || 100, 30, 100);
      game.playSeconds = data.playSeconds || 0;
    }
  }
  return game;
}

let game = newGame(false);
game.missionIndex = 0;

function enterEndScreen(g, kind) {
  if (g.screen !== 'play') return;
  g.screen = kind;
  if (kind === 'busted') {
    sfx.busted();
    g.money = Math.max(0, g.money - Math.floor(g.money * 0.1));
    if (g.player.car) {
      const i = g.cars.indexOf(g.player.car);
      if (i >= 0) g.cars.splice(i, 1);
      g.player.car = null;
    }
  } else {
    sfx.wasted();
    g.money = Math.max(0, g.money - Math.floor(g.money * 0.05));
    if (g.player.car) { g.player.car.driver = null; g.player.car = null; }
  }
  g.heat = 0;
  g.police = createPolice();
  g.side.gang = [];
}

function respawn(g) {
  const at = g.screen === 'busted' ? g.city.jail : g.city.hospital;
  g.player.x = at.x;
  g.player.y = at.y;
  g.player.health = 100;
  g.player.armor = 0;
  g.screen = 'play';
}

// ------------------------------------------------------------------
// Wanted system
// ------------------------------------------------------------------
const CRIME_HEAT = {
  assault: 0.8, carjack: 1.0, runover: 1.7, shooting: 0.55,
  shootPed: 1.5, assaultCop: 2.1, selfDefence: 0.3, carDamage: 0.25,
};

function commitCrime(g, kind, x, y, mult = 1) {
  let witnessed = false;
  for (const ped of g.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, x, y) < 300) { witnessed = true; break; }
  }
  if (!witnessed) {
    for (const car of g.police.cars) if (dist(car.x, car.y, x, y) < 620) { witnessed = true; break; }
  }
  if (!witnessed && inSearchlight(g)) witnessed = true;
  const base = CRIME_HEAT[kind] || 0.5;
  g.heat = clamp(g.heat + base * (witnessed ? 1 : 0.3) * mult, 0, 5.6);
  g.lastCrimeAt = g.time;
}

function updateWanted(g, dt) {
  const anyCopNear = g.police.cars.some((c) => dist(c.x, c.y, g.player.x, g.player.y) < 680);
  const seen = anyCopNear || inSearchlight(g);
  if (!seen && g.time - g.lastCrimeAt > 3.5) {
    const rainHelp = g.weather.intensity > 0.3 ? 1.3 : 1;
    g.heat = Math.max(0, g.heat - dt * 0.115 * rainHelp);
  }
  g.stars = g.heat < 0.25 ? 0 : g.heat < 1.4 ? 1 : g.heat < 2.4 ? 2 : g.heat < 3.4 ? 3 : g.heat < 4.4 ? 4 : 5;
}

// ------------------------------------------------------------------
// Bullets
// ------------------------------------------------------------------
function spawnBullet(g, x, y, angle, owner, dmg) {
  g.bullets.push({
    x, y,
    vx: Math.cos(angle) * 1150,
    vy: Math.sin(angle) * 1150,
    owner, dmg, life: 0.55,
  });
  if (g.bullets.length > 240) g.bullets.splice(0, g.bullets.length - 240);
}

function enemyShoot(g, shooter, missChance) {
  const p = g.player;
  const base = Math.atan2(p.y - shooter.y, p.x - shooter.x);
  const spread = (g.rng() - 0.5) * 0.34 + (g.rng() < missChance ? (g.rng() - 0.5) * 0.8 : 0);
  spawnBullet(g, shooter.x + Math.cos(base) * 15, shooter.y + Math.sin(base) * 15, base + spread, 'enemy', 9);
  g.markShot(shooter.x, shooter.y);
  sfx.shot();
}

function updateBullets(g, dt) {
  const p = g.player;
  for (let i = g.bullets.length - 1; i >= 0; i -= 1) {
    const b = g.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0;
    if (!dead && pointInSolid(g.city, b.x, b.y)) {
      sparks(g.fx, b.x, b.y, Math.atan2(-b.vy, -b.vx));
      dead = true;
    }
    if (!dead && b.owner === 'player') {
      for (const gang of g.side.gang) {
        if (dist(b.x, b.y, gang.x, gang.y) < 13) { gang.health -= b.dmg; dead = true; break; }
      }
      if (!dead) for (const off of g.police.officers) {
        if (dist(b.x, b.y, off.x, off.y) < 13) {
          off.health -= b.dmg;
          commitCrime(g, 'assaultCop', off.x, off.y);
          dead = true; break;
        }
      }
      if (!dead) for (const ped of g.peds) {
        if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 12) {
          knockDown(g, ped, 'shot');
          commitCrime(g, 'shootPed', ped.x, ped.y);
          g.dropCash(ped.x, ped.y);
          dead = true; break;
        }
      }
      if (!dead) for (const car of g.cars) {
        if (car.driver !== 'player' && dist(b.x, b.y, car.x, car.y) < car.w * 0.55) {
          car.health -= b.dmg * 0.7;
          if (car.driver === 'police' || car.driver === 'block') commitCrime(g, 'assaultCop', car.x, car.y, 0.5);
          else commitCrime(g, 'carDamage', car.x, car.y);
          dead = true; break;
        }
      }
    }
    if (!dead && b.owner === 'enemy') {
      if (p.car) {
        if (dist(b.x, b.y, p.car.x, p.car.y) < p.car.w * 0.55) {
          p.car.health -= b.dmg * 0.5;
          if (g.rng() < 0.4) hurtPlayer(g, b.dmg * 0.5);
          dead = true;
        }
      } else if (dist(b.x, b.y, p.x, p.y) < 12) {
        hurtPlayer(g, b.dmg);
        dead = true;
      }
    }
    if (dead) g.bullets.splice(i, 1);
  }
}

// ------------------------------------------------------------------
// Per-step update
// ------------------------------------------------------------------
function step(g, dt) {
  g.dt = dt;
  if (g.frozen) return;
  g.time += dt;

  // Menu / screen state changes.
  if (g.screen === 'title') {
    if (pressed('enter')) startRun(g, false);
    else if (pressed('c') && g.hasSaveFile) startRun(g, true);
    else if (pressed('h')) { g.prevScreen = 'title'; g.screen = 'help'; }
    idleWorld(g, dt);
    return;
  }
  if (g.screen === 'help') {
    if (pressed('h') || pressed('escape')) g.screen = g.prevScreen;
    return;
  }
  if (g.screen === 'pause') {
    if (pressed('p') || pressed('escape')) g.screen = 'play';
    if (pressed('s')) { storeSave(g); g.toast('Saved'); g.saveSoon = false; }
    return;
  }
  if (g.screen === 'busted' || g.screen === 'wasted') {
    if (pressed('enter')) respawn(g);
    return;
  }
  if (pressed('p') || pressed('escape')) { g.screen = 'pause'; return; }
  if (pressed('h')) { g.prevScreen = 'play'; g.screen = 'help'; return; }

  g.playSeconds += dt;
  g.clockMinutes = (g.clockMinutes + dt * 0.5) % (24 * 60);
  const hh = Math.floor(g.clockMinutes / 60);
  const mm = Math.floor(g.clockMinutes % 60);
  g.clockText = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  updateWeather(g.weather, dt, sfx);
  g.weatherTag = g.weather.state;
  rainSound(g.screen === 'play' ? g.weather.intensity : 0);

  // Interactions that share the E key with car entry: dialogue first,
  // then the race flag (in a car), then mission offers.
  g.interactPressed = false;
  g.interactHint = '';
  if (g.dialogue) {
    if (pressed('e') || mouse.clicked) {
      g.dialogue.i += 1;
      if (g.dialogue.i >= g.dialogue.lines.length) g.dialogue = null;
    }
  } else if (g.player.car && g.side.race === null) {
    const flag = g.city.raceFlag;
    if (dist(g.player.x, g.player.y, flag.x, flag.y) < 95) {
      g.interactHint = 'E — START THE MARINA STREET RACE';
      if (pressed('e')) { tryStartRace(g); g.interactPressed = true; }
    }
  }
  if (!g.dialogue && !g.interactPressed && pressed('e')) g.interactPressed = true;

  updatePlayer(g, dt);
  if (g.player.reloadAt && g.time >= g.player.reloadAt) {
    g.player.reloadAt = 0;
    finishReload(g);
  }

  for (const car of g.cars) {
    if (car.driver === 'traffic') updateTrafficCar(g, car, dt);
  }
  separateCars(g, dt);
  for (const ped of g.peds) updatePed(g, ped, dt);
  updatePolice(g, dt);
  updateWanted(g, dt);
  updateMissions(g, dt);
  if (!g.side.race) updateTaxi(g, dt);
  updateRace(g, dt);
  updateGang(g, dt);
  updateBullets(g, dt);
  updatePickups(g, dt);
  updateRespray(g, dt);
  updateEffects(g.fx, dt);
  g.missionIndex = g.msn.idx;

  // Soundscape.
  if (g.audioCrash) { sfx.crash(g.audioCrash > 1); g.audioCrash = 0; addShake(g.fx, 3); }
  engineSound(g.player.car ? clamp(Math.abs(g.player.car.speed) / 560, 0, 1) : null);
  sirenSound(g.police.cars.length > 0 && g.stars > 0);
  rotorSound(g.police.heli ? clamp(1.2 - dist(g.police.heli.x, g.police.heli.y, g.player.x, g.player.y) / 900, 0, 1) : 0);
  radioSound(g.player.car ? g.radioStation : null);
  g.hurtFlash = Math.max(0, g.hurtFlash - dt);

  if (g.saveSoon) { storeSave(g); g.saveSoon = false; g.hasSaveFile = true; }

  // Camera follows the action.
  const focus = g.player;
  g.camera.x = clamp(focus.x - VIEW.w / 2, 0, Math.max(0, WORLD.w - VIEW.w));
  g.camera.y = clamp(focus.y - VIEW.h / 2, 0, Math.max(0, WORLD.h - VIEW.h));
}

function startRun(g, cont) {
  const fresh = newGame(cont);
  fresh.screen = 'play';
  fresh.missions = buildMissions(fresh);
  game = fresh;
  sfx.phone();
}

function idleWorld(g, dt) {
  // Title screen: the city lives on behind the logo, camera drifting.
  for (const car of g.cars) if (car.driver === 'traffic') updateTrafficCar(g, car, dt);
  for (const ped of g.peds) updatePed(g, ped, dt);
  updateWeather(g.weather, dt, null);
  updateEffects(g.fx, dt);
  const t = g.time + dt;
  g.time = t;
  g.camera.x = clamp(1500 + Math.cos(t * 0.05) * 500 - VIEW.w / 2, 0, WORLD.w - VIEW.w);
  g.camera.y = clamp(1500 + Math.sin(t * 0.04) * 400 - VIEW.h / 2, 0, WORLD.h - VIEW.h);
}

function updatePickups(g, dt) {
  const p = g.player;
  for (let i = g.pickups.length - 1; i >= 0; i -= 1) {
    const pk = g.pickups[i];
    pk.life -= dt;
    if (pk.life <= 0) { g.pickups.splice(i, 1); continue; }
    if (!p.car && dist(p.x, p.y, pk.x, pk.y) < 26) {
      g.money += pk.amount;
      sfx.cash();
      floatText(g.fx, pk.x, pk.y - 14, `+$${pk.amount}`, '#7dd87d');
      g.pickups.splice(i, 1);
    }
  }
  // Hidden packages.
  for (const pkg of g.packages) {
    if (g.packagesFound.has(pkg.id)) continue;
    if (dist(p.x, p.y, pkg.x, pkg.y) < 30) {
      g.packagesFound.add(pkg.id);
      g.money += 100;
      sfx.pickup();
      burst(g.fx, pkg.x, pkg.y, { count: 14, color: '#ffd23e', speed: 150, life: 0.6, size: 3 });
      g.toast(`Hidden package ${g.packagesFound.size}/20 — +$100`);
      if (g.packagesFound.size >= 20) { g.money += 1000; g.toast('All 20 packages! Bonus +$1000'); }
      g.saveSoon = true;
    }
  }
}

function updateRespray(g, dt) {
  const p = g.player;
  const shop = g.city.respray;
  const inside = p.car && p.x > shop.x && p.x < shop.x + shop.w && p.y > shop.y && p.y < shop.y + shop.h;
  if (inside && Math.abs(p.car.speed) < 12 && g.stars > 0) {
    g.resprayTimer += dt;
    g.interactHint = g.money >= 250 ? 'SHINE & GO — respraying…' : 'SHINE & GO — $250 to clear your stars';
    if (g.resprayTimer > 0.9 && g.money >= 250) {
      g.money -= 250;
      g.heat = 0;
      p.car.health = Math.min(100, p.car.health + 55);
      sfx.spray();
      g.toast('Fresh paint. The PBPD loses your scent.');
      g.resprayTimer = 0;
    }
  } else g.resprayTimer = 0;
}

// ------------------------------------------------------------------
// Rendering
// ------------------------------------------------------------------
function darkness(g) {
  const hour = g.clockMinutes / 60;
  if (hour >= 7 && hour < 17.5) return 0;
  if (hour >= 17.5 && hour < 20) return (hour - 17.5) / 2.5 * 0.85;
  if (hour >= 20 || hour < 5) return 0.85;
  return 0.85 - ((hour - 5) / 2) * 0.85; // 5:00–7:00 dawn
}

function duskWarmth(g) {
  const hour = g.clockMinutes / 60;
  if (hour >= 16.5 && hour < 19.5) return 1 - Math.abs(hour - 18) / 1.5;
  if (hour >= 5.5 && hour < 7.5) return 0.5;
  return 0;
}

function render(g) {
  const cam = g.camera;
  const shake = g.fx.shake;
  const sx = shake ? (Math.random() - 0.5) * shake : 0;
  const sy = shake ? (Math.random() - 0.5) * shake : 0;
  ctx.save();
  ctx.translate(-Math.round(cam.x + sx), -Math.round(cam.y + sy));
  drawWorld(g, cam);
  drawEntities(g, cam);
  ctx.restore();

  // Helicopter searchlight washes over the world in screen space.
  if (g.police.heli && g.screen === 'play') drawSearchlight(g);

  // Night, dusk and weather atmosphere.
  const dark = darkness(g);
  if (dark > 0.01) {
    ctx.fillStyle = `rgba(10,14,38,${dark * 0.55})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
  const warm = duskWarmth(g);
  if (warm > 0.02) {
    ctx.fillStyle = `rgba(255,138,62,${warm * 0.13})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
  if (g.weather.flash > 0) {
    ctx.fillStyle = `rgba(230,238,255,${g.weather.flash * 0.5})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
  if (g.hurtFlash > 0) {
    ctx.fillStyle = `rgba(200,30,20,${g.hurtFlash * 0.35})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
  drawRain(ctx, g.weather, VIEW, g.rng);

  // Overlays by screen.
  if (g.screen === 'title') drawTitle(ctx, g, VIEW);
  else if (g.screen === 'pause') { drawHUD(ctx, g, VIEW); drawPause(ctx, g, VIEW); }
  else if (g.screen === 'help') drawHelp(ctx, g, VIEW);
  else if (g.screen === 'busted' || g.screen === 'wasted') { drawHUD(ctx, g, VIEW); drawEndScreen(ctx, g, VIEW, g.screen); }
  else {
    drawHUD(ctx, g, VIEW);
    drawDialogue(ctx, g, VIEW);
  }
}

function drawWorld(g, cam) {
  const city = g.city;
  const x0 = cam.x - 80;
  const y0 = cam.y - 80;
  const x1 = cam.x + VIEW.w + 80;
  const y1 = cam.y + VIEW.h + 80;
  const dark = darkness(g);
  const wet = g.weather.puddle;

  // District ground.
  for (const dd of DISTRICTS) {
    ctx.fillStyle = dd.ground;
    ctx.fillRect(dd.x, dd.y, dd.w, dd.h);
  }
  // Sand + bay.
  ctx.fillStyle = '#c9b183';
  ctx.fillRect(BEACH_X, 0, WATER_X - BEACH_X, WORLD.h);
  ctx.fillStyle = '#1d5f7a';
  ctx.fillRect(WATER_X, 0, WORLD.w - WATER_X, WORLD.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let y = 60; y < WORLD.h; y += 130) {
    ctx.beginPath();
    ctx.moveTo(WATER_X + 30 + Math.sin(g.time * 0.7 + y) * 8, y);
    ctx.lineTo(WATER_X + 130 + Math.sin(g.time * 0.7 + y) * 8, y);
    ctx.stroke();
  }

  // Roads.
  ctx.fillStyle = wet > 0.3 ? '#33363d' : '#3a3d44';
  for (const rx of ROAD_XS) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.h);
  for (const ry of ROAD_YS) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.w, ROAD_W);
  // Lane dashes.
  ctx.fillStyle = 'rgba(240,220,120,0.5)';
  for (const rx of ROAD_XS) for (let y = 20; y < WORLD.h; y += 64) ctx.fillRect(rx - 2, y, 4, 30);
  for (const ry of ROAD_YS) for (let x = 20; x < WATER_X; x += 64) ctx.fillRect(x, ry - 2, 30, 4);

  // Puddles with a neon shimmer when the ground is soaked.
  if (wet > 0.05) {
    const prng = makeRng(seed ^ 0xbeef);
    for (let i = 0; i < 110; i += 1) {
      const vertical = prng() < 0.5;
      const px = vertical ? pick(prng, ROAD_XS) + range(prng, -46, 46) : range(prng, 100, 4200);
      const py = vertical ? range(prng, 80, 3520) : pick(prng, ROAD_YS) + range(prng, -46, 46);
      if (px < x0 || px > x1 || py < y0 || py > y1) continue;
      const shimmer = 0.10 + 0.05 * Math.sin(g.time * 2 + i);
      ctx.fillStyle = `rgba(140,190,235,${shimmer + wet * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(px, py, 26 + (i % 5) * 7, 10 + (i % 3) * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSkids(ctx, g.fx, cam);

  // Respray shop pad.
  const shop = city.respray;
  ctx.fillStyle = '#59324a';
  ctx.fillRect(shop.x, shop.y, shop.w, shop.h);
  ctx.strokeStyle = '#ff5da2';
  ctx.lineWidth = 3;
  ctx.strokeRect(shop.x, shop.y, shop.w, shop.h);
  ctx.fillStyle = '#ff5da2';
  ctx.font = '700 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SHINE & GO', shop.x + shop.w / 2, shop.y + 26);
  ctx.textAlign = 'left';

  // Race flag.
  const flag = city.raceFlag;
  ctx.strokeStyle = '#e8ecf2';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(flag.x, flag.y); ctx.lineTo(flag.x, flag.y - 64); ctx.stroke();
  for (let r = 0; r < 2; r += 1) for (let c = 0; c < 4; c += 1) {
    ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
    ctx.fillRect(flag.x + c * 9, flag.y - 64 + r * 9, 9, 9);
  }
  if (g.side.race) {
    const cp = g.raceMarker;
    if (cp) drawBeacon(g, cp.x, cp.y, '#39d0ff');
  } else if (g.marker) {
    drawBeacon(g, g.marker.x, g.marker.y, '#ffd23e');
  }

  // Hidden packages still unfound.
  for (const pkg of g.packages) {
    if (g.packagesFound.has(pkg.id)) continue;
    if (pkg.x < x0 || pkg.x > x1 || pkg.y < y0 || pkg.y > y1) continue;
    const pulse = 1 + Math.sin(g.time * 4 + pkg.id) * 0.15;
    ctx.fillStyle = 'rgba(255,210,62,0.25)';
    ctx.beginPath(); ctx.arc(pkg.x, pkg.y, 16 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.fillRect(pkg.x - 6, pkg.y - 6, 12, 12);
  }
  // Cash drops.
  for (const pk of g.pickups) {
    ctx.fillStyle = '#7dd87d';
    ctx.fillRect(pk.x - 6, pk.y - 3, 12, 6);
  }

  // Roadblocks: barriers, cones, spike strips.
  for (const b of g.police.blocks) drawRoadblock(g, b);

  // Buildings: shadow, walls, roof, neon.
  for (const b of city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = shade(b.color, -28);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    // Windows: a grid of lit panes at night.
    if (dark > 0.25 && b.tall > 30) {
      ctx.fillStyle = 'rgba(255,214,120,0.75)';
      const cols = Math.floor(b.w / 26);
      const rows = Math.floor(b.h / 26);
      for (let cx = 0; cx < cols; cx += 1) for (let cy = 0; cy < rows; cy += 1) {
        if ((cx * 7 + cy * 13 + b.x) % 3 === 0) ctx.fillRect(b.x + 12 + cx * 26, b.y + 12 + cy * 26, 9, 12);
      }
    }
    if (b.sign) {
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.fillStyle = b.sign.color;
      ctx.globalAlpha = dark > 0.2 ? 1 : 0.75;
      ctx.fillText(b.sign.text, b.x + 8, b.y + 22);
      ctx.globalAlpha = 1;
      // Wet reflection: the sign smeared on the soaked street below.
      if (wet > 0.1) {
        ctx.fillStyle = b.sign.color;
        ctx.globalAlpha = 0.10 * wet + 0.03 * Math.sin(g.time * 3 + b.x);
        ctx.beginPath();
        ctx.ellipse(b.x + b.w / 2, b.y + b.h + 26, b.w * 0.42, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
  // Containers + cranes at the docks.
  for (const p of city.props) {
    if (p.kind === 'container') {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 52, p.y - 20, 104, 40);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeRect(p.x - 52, p.y - 20, 104, 40);
    } else if (p.kind === 'crane') {
      ctx.strokeStyle = '#2c2f36';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - 120);
      ctx.lineTo(p.x + 90, p.y - 120);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x + 78, p.y - 120); ctx.lineTo(p.x + 78, p.y - 70); ctx.stroke();
    }
  }
  // Palms and lamps.
  for (const palm of city.palms) {
    if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
    drawPalm(palm);
  }
  for (const lamp of city.lamps) {
    if (lamp.x < x0 || lamp.x > x1 || lamp.y < y0 || lamp.y > y1) continue;
    ctx.fillStyle = '#22242a';
    ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
    if (dark > 0.15) {
      const grad = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 54);
      grad.addColorStop(0, `rgba(255,205,110,${0.34 * dark})`);
      grad.addColorStop(1, 'rgba(255,205,110,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 54, 0, Math.PI * 2); ctx.fill();
    }
  }
  // District name painted large where you enter it.
  const here = districtAt(g.player.x, g.player.y);
  ctx.font = '900 44px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillText(here.name, here.x + 60, here.y + 90);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const gg = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${gg},${b})`;
}

function drawBeacon(g, x, y, color) {
  const pulse = 1 + Math.sin(g.time * 5) * 0.2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, 30 * pulse, 0, Math.PI * 2); ctx.stroke();
  const grad = ctx.createLinearGradient(x, y - 320, x, y);
  grad.addColorStop(0, 'rgba(255,210,62,0)');
  grad.addColorStop(1, 'rgba(255,210,62,0.20)');
  ctx.fillStyle = color === '#ffd23e' ? grad : 'rgba(57,208,255,0.14)';
  ctx.fillRect(x - 9, y - 320, 18, 320);
  ctx.restore();
}

function drawRoadblock(g, b) {
  ctx.save();
  // Striped barrier across the avenue.
  const len = 150;
  const x0 = b.horizontal ? b.x - len / 2 : b.x - 6;
  const y0 = b.horizontal ? b.y - 6 : b.y - len / 2;
  const w = b.horizontal ? len : 12;
  const h = b.horizontal ? 12 : len;
  for (let i = 0; i < 6; i += 1) {
    ctx.fillStyle = i % 2 ? '#e8ecf2' : '#e33f2f';
    if (b.horizontal) ctx.fillRect(x0 + (w / 6) * i, y0, w / 6, h);
    else ctx.fillRect(x0, y0 + (h / 6) * i, w, h / 6);
  }
  // Cones.
  ctx.fillStyle = '#ff8a3e';
  for (let i = -2; i <= 2; i += 1) {
    const cx = b.horizontal ? b.x + i * 34 : b.x + 20;
    const cy = b.horizontal ? b.y + 20 : b.y + i * 34;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 6);
    ctx.lineTo(cx + 6, cy + 6);
    ctx.lineTo(cx, cy - 8);
    ctx.closePath();
    ctx.fill();
  }
  // Spike strip.
  if (b.spikes) {
    ctx.fillStyle = '#15161a';
    if (b.horizontal) ctx.fillRect(b.x - 95, b.y - 7, 190, 14);
    else ctx.fillRect(b.x - 7, b.y - 95, 14, 190);
    ctx.fillStyle = '#cfd6df';
    for (let i = 0; i < 9; i += 1) {
      const px = b.horizontal ? b.x - 84 + i * 21 : b.x;
      const py = b.horizontal ? b.y : b.y - 84 + i * 21;
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
  }
  ctx.restore();
}

function drawPalm(palm) {
  ctx.save();
  ctx.translate(palm.x, palm.y);
  ctx.scale(palm.s, palm.s);
  ctx.strokeStyle = '#6e5546';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4, -12, 8, -22); ctx.stroke();
  ctx.strokeStyle = '#3f7d3a';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(8, -22);
    ctx.quadraticCurveTo(8 + Math.cos(a) * 13, -22 + Math.sin(a) * 6 - 4, 8 + Math.cos(a) * 22, -22 + Math.sin(a) * 10 + 5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEntities(g, cam) {
  const x0 = cam.x - 90;
  const y0 = cam.y - 90;
  const x1 = cam.x + VIEW.w + 90;
  const y1 = cam.y + VIEW.h + 90;
  const inView = (e) => e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1;

  for (const car of g.cars) if (inView(car)) drawCar(g, car);
  for (const ped of g.peds) if (inView(ped)) drawPed(ped);
  for (const off of g.police.officers) if (inView(off)) drawOfficer(off);
  for (const gang of g.side.gang) if (inView(gang)) drawGang(gang);
  if (!g.player.car) drawPlayer(g);
  if (g.police.heli) drawHeli(g, g.police.heli);

  // Bullets as short tracers.
  ctx.lineWidth = 2.4;
  for (const b of g.bullets) {
    ctx.strokeStyle = b.owner === 'player' ? '#ffe9a3' : '#ff9d8a';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
    ctx.stroke();
  }
  drawParticles(ctx, g.fx, cam);
  drawTexts(ctx, g.fx, cam);
}

function drawCar(g, car) {
  const dark = darkness(g);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Neon underglow on the player's car at night.
  if (car.driver === 'player' && dark > 0.2) {
    ctx.fillStyle = `rgba(255,93,162,${0.30 * dark})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, car.w * 0.72, car.h * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Headlight cones at night.
  if (dark > 0.15 && !car.dead) {
    const grad = ctx.createLinearGradient(car.w / 2, 0, car.w / 2 + 130, 0);
    grad.addColorStop(0, `rgba(255,240,190,${0.20 * dark})`);
    grad.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(car.w / 2, -7);
    ctx.lineTo(car.w / 2 + 130, -34);
    ctx.lineTo(car.w / 2 + 130, 34);
    ctx.lineTo(car.w / 2, 7);
    ctx.closePath();
    ctx.fill();
  }
  // Body + cabin.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h);
  ctx.fillStyle = car.dead ? '#3a3a3e' : car.color;
  ctx.beginPath();
  ctx.roundRect(-car.w / 2, -car.h / 2, car.w, car.h, 6);
  ctx.fill();
  if (car.type === 'police') {
    ctx.fillStyle = '#e8ecf2';
    ctx.fillRect(-car.w * 0.22, -car.h / 2, car.w * 0.44, car.h);
    // Light bar: red/blue strobing.
    const phase = Math.floor((car.lightPhase || 0) % 2);
    ctx.fillStyle = phase ? '#ff3b30' : '#3a7bff';
    ctx.fillRect(-9, -car.h / 2 + 3, 18, 5);
    ctx.fillStyle = phase ? '#3a7bff' : '#ff3b30';
    ctx.fillRect(-9, car.h / 2 - 8, 18, 5);
    if (dark > 0.1) {
      ctx.fillStyle = phase ? 'rgba(255,59,48,0.25)' : 'rgba(58,123,255,0.25)';
      ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = '#1c2733';
  ctx.beginPath();
  ctx.roundRect(-car.w * 0.16, -car.h * 0.36, car.w * 0.4, car.h * 0.72, 4);
  ctx.fill();
  ctx.fillStyle = '#9fd8ef';
  ctx.fillRect(car.w * 0.10, -car.h * 0.30, 5, car.h * 0.6);
  if (car.type === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-7, -6, 14, 12);
    ctx.fillStyle = '#ffd23e';
    ctx.font = '800 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
    ctx.textAlign = 'left';
  }
  if (car.type === 'truck') {
    ctx.fillStyle = shade(car.color, -18);
    ctx.fillRect(-car.w / 2, -car.h / 2, car.w * 0.55, car.h);
  }
  // Wheels.
  ctx.fillStyle = '#101114';
  const flat = g.time < car.flatUntil;
  for (const [wx, wy] of [[-car.w * 0.32, -car.h / 2], [car.w * 0.32, -car.h / 2], [-car.w * 0.32, car.h / 2], [car.w * 0.32, car.h / 2]]) {
    ctx.fillRect(wx - 6, wy - 2.5, 12, 5);
    if (flat && wx > 0) ctx.fillRect(wx - 6, wy - 1, 12, 2);
  }
  ctx.restore();
}

function drawPersonBody(x, y, angle, legPhase, shirt, skin, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (opts.down) {
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = shirt;
    ctx.fillRect(-11, -5, 22, 10);
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(15, 0, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  // Legs scissor with the walk phase.
  ctx.strokeStyle = '#26262c';
  ctx.lineWidth = 3.4;
  const sw = Math.sin(legPhase) * 6;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-3 + sw * 0.4, -6 + sw);
  ctx.moveTo(0, 0); ctx.lineTo(-3 - sw * 0.4, 6 - sw);
  ctx.stroke();
  ctx.rotate(angle);
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.roundRect(-6, -6.4, 13, 12.8, 4);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(4.5, 0, 5.2, 0, Math.PI * 2); ctx.fill();
  if (opts.gun) {
    ctx.strokeStyle = '#15161a';
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(6, 3); ctx.lineTo(17, 3); ctx.stroke();
  }
  if (opts.cap) {
    ctx.fillStyle = '#20365e';
    ctx.beginPath(); ctx.arc(4.5, 0, 5.6, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
  }
  ctx.restore();
}

function drawPed(ped) {
  if (ped.state === 'down') { drawPersonBody(ped.x, ped.y, ped.angle, 0, ped.shirt, ped.skin, { down: true }); return; }
  drawPersonBody(ped.x, ped.y, ped.angle, ped.legPhase, ped.shirt, ped.skin);
  if (ped.wantsTaxi && ped.state === 'walk') {
    ctx.fillStyle = '#ffd23e';
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', ped.x, ped.y - 16);
    ctx.textAlign = 'left';
  }
}

function drawOfficer(off) {
  drawPersonBody(off.x, off.y, off.angle, off.legPhase, '#2b4a77', '#e8c39a', { gun: true, cap: true });
}

function drawGang(gang) {
  drawPersonBody(gang.x, gang.y, gang.angle, gang.legPhase, '#7a2430', '#d9a06b', { gun: true });
}

function drawPlayer(g) {
  const p = g.player;
  drawPersonBody(p.x, p.y, p.angle, p.legPhase, '#0f7d74', '#f2c9a0', { gun: p.armed });
}

function drawHeli(g, h) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(6, 8, 34, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#23262d';
  ctx.beginPath(); ctx.ellipse(0, 0, 32, 12.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-58, -3.4, 34, 6.8);
  ctx.fillStyle = '#9fd8ef';
  ctx.beginPath(); ctx.ellipse(10, 0, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
  // Rotor blur.
  ctx.strokeStyle = 'rgba(230,235,240,0.5)';
  ctx.lineWidth = 3;
  const r = 46;
  const a = h.phase;
  ctx.beginPath();
  ctx.moveTo(Math.cos(a) * -r, Math.sin(a) * -r * 0.3);
  ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.3);
  ctx.stroke();
  ctx.restore();
}

function drawSearchlight(g) {
  const h = g.police.heli;
  const p = g.player;
  const hx = h.x - g.camera.x;
  const hy = h.y - g.camera.y;
  const px = p.x - g.camera.x;
  const py = p.y - g.camera.y;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(px, py, 8, px, py, 165);
  grad.addColorStop(0, 'rgba(255,246,200,0.30)');
  grad.addColorStop(1, 'rgba(255,246,200,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(px, py, 165, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,246,200,0.07)';
  ctx.beginPath();
  ctx.moveTo(hx - 9, hy);
  ctx.lineTo(px - 120, py + 40);
  ctx.lineTo(px + 120, py + 40);
  ctx.lineTo(hx + 9, hy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------
// Boot + main loop. Screenshot scenes stage themselves and freeze.
// ------------------------------------------------------------------
if (shotName) {
  stageShot(game, shotName);
  render(game);
  render(game);
  window.__shotReady = true;
}

let last = performance.now();
let accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min(0.25, (now - last) / 1000);
  last = now;
  accumulator += delta;
  while (accumulator >= STEP) {
    step(game, STEP);
    accumulator -= STEP;
  }
  render(game);
  endFrame();
}
requestAnimationFrame(frame);
