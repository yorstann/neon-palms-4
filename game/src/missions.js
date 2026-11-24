// Story and side work. Mara Voss, a fixer who works out of a Downtown
// doorway, runs a seven-job campaign that chains the city's systems:
// theft, timed delivery, a chase, a four-star escape, a checkpoint
// run, a dock shootout, and the Neon Exodus finale. Between jobs the
// city pays for itself: taxi fares, twenty hidden packages, gang
// corners that shoot first, and the marina street race.

import { dist, range, pick } from './random.js';
import { makeCar, steerTo, driveCar } from './vehicles.js';
import { sidewalkPoint } from './pedestrians.js';

export function createMissionState() {
  return {
    idx: 0,            // next story mission to offer
    phase: 'offer',    // offer | intro | active | done
    step: 0,
    data: {},
    timer: 0,
    failedNote: '',
  };
}

export function createSideState() {
  return {
    fare: null,        // {ped, dest, fare}
    race: null,        // race object while running
    gang: [],          // live gang members (story + corners)
    cornerTimer: 20,
  };
}

// ------------------------------------------------------------------
// Dialogue: a queue of [speaker, line]; the HUD draws it and E (or a
// click) advances. Missions wait for it to drain.
// ------------------------------------------------------------------
export function say(game, lines) {
  game.dialogue = { lines, i: 0 };
}
export function dialogueDone(game) {
  return !game.dialogue;
}

// ------------------------------------------------------------------
// Gang members: hostile shooters used by corners and story shootouts.
// ------------------------------------------------------------------
export function spawnGang(game, x, y, count, spread = 90) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: x + range(game.rng, -spread, spread),
      y: y + range(game.rng, -spread, spread),
      angle: range(game.rng, 0, Math.PI * 2),
      health: 60,
      shootTimer: range(game.rng, 0.6, 1.6),
      strafe: game.rng() < 0.5 ? 1 : -1,
      legPhase: range(game.rng, 0, 6),
    });
  }
  game.side.gang.push(...out);
  return out;
}

export function updateGang(game, dt) {
  const p = game.player;
  const gang = game.side.gang;
  for (let i = gang.length - 1; i >= 0; i -= 1) {
    const g = gang[i];
    if (g.health <= 0) {
      gang.splice(i, 1);
      game.dropCash(g.x, g.y);
      game.commitCrime('selfDefence', g.x, g.y, 0.25);
      continue;
    }
    const d = dist(g.x, g.y, p.x, p.y);
    g.angle = Math.atan2(p.y - g.y, p.x - g.x);
    if (d < 430 && d > 150) {
      g.x += Math.cos(g.angle) * 105 * dt;
      g.y += Math.sin(g.angle) * 105 * dt;
      g.legPhase += dt * 10;
    } else if (d <= 150) {
      // Strafe sideways while shooting, like they mean it.
      g.x += Math.cos(g.angle + Math.PI / 2) * g.strafe * 44 * dt;
      g.y += Math.sin(g.angle + Math.PI / 2) * g.strafe * 44 * dt;
      if (game.rng() < dt * 0.25) g.strafe *= -1;
    }
    g.shootTimer -= dt;
    if (g.shootTimer <= 0 && d < 380) {
      g.shootTimer = range(game.rng, 0.8, 1.5);
      game.enemyShoot(g, 0.3);
    }
  }
  // Free-roam corners re-man themselves away from the story.
  const side = game.side;
  side.cornerTimer -= dt;
  if (side.cornerTimer <= 0) {
    side.cornerTimer = 45;
    const corner = pick(game.rng, game.city.gangCorners);
    if (dist(corner.x, corner.y, p.x, p.y) > 700 && side.gang.length < 6) {
      spawnGang(game, corner.x, corner.y, 3, 60);
    }
  }
}

// ------------------------------------------------------------------
// Step helpers. Each returns true when its step is complete and sets
// the objective line + marker the HUD and renderer read.
// ------------------------------------------------------------------
function at(game, x, y, r) {
  const p = game.player;
  return dist(p.x, p.y, x, y) < r;
}
function gotoStep(x, y, label, r = 60) {
  return (game) => {
    game.objective = label;
    game.marker = { x, y };
    return at(game, x, y, r);
  };
}
function dialogueStep(lines) {
  let started = false;
  return (game) => {
    if (!started) { started = true; say(game, lines); }
    return dialogueDone(game);
  };
}
function timerGotoStep(x, y, seconds, label) {
  let started = false;
  return (game, data) => {
    if (!started) { started = true; data.timer = seconds; }
    data.timer -= game.dt;
    game.objective = `${label} — ${Math.max(0, Math.ceil(data.timer))}s`;
    game.marker = { x, y };
    if (data.timer <= 0) { game.failMission('Out of time. Mara hates waiting.'); return false; }
    return at(game, x, y, 70);
  };
}

// ------------------------------------------------------------------
// The seven missions.
// ------------------------------------------------------------------
export function buildMissions(game) {
  const M = game.city.maraSpot;
  const D = game.city.dock;
  const MARINA = game.city.marina;
  return [
    {
      title: 'First Wheels',
      start: M, pay: 400,
      intro: [
        ['MARA', 'You must be the new driver. I am Mara Voss — I move problems for people who pay.'],
        ['MARA', 'First test: bring me a sports car. Any colour. The owner does not need to agree.'],
        ['YOU', 'And if the city disagrees?'],
        ['MARA', 'Then lose the stars, and use Shine & Go if you must. Go.'],
      ],
      steps: [
        (g) => {
          g.objective = 'Steal a SPORTS car';
          g.marker = null;
          return !!(g.player.car && g.player.car.type === 'sports');
        },
        gotoStep(MARINA.x, MARINA.y, 'Deliver the car to the marina', 90),
        dialogueStep([['MARA', 'Clean lines, full tank. You pass. There is more work when you want it.']]),
      ],
    },
    {
      title: 'Hot Package',
      start: M, pay: 650,
      intro: [
        ['MARA', 'A crate in the Industrial district is suddenly very popular.'],
        ['MARA', 'Pick it up, take it to the docks, do not stop for autographs. The clock is real.'],
      ],
      steps: [
        gotoStep(3350, 950, 'Pick up the crate in Industrial', 70),
        (g, data) => {
          if (!data.armed) { data.armed = true; g.addHeat(2.2); g.toast('The crate is hot — move!'); }
          if (!data.inner) data.inner = timerGotoStep(D.x, D.y, 150, 'Deliver the crate to the docks');
          return data.inner(g, data);
        },
        dialogueStep([['MARA', 'On time and mostly intact. The bay provides.']]),
      ],
    },
    {
      title: 'Tailspin',
      start: M, pay: 800,
      intro: [
        ['MARA', 'A courier owes me a car and an apology. He is driving the car.'],
        ['MARA', 'Ram him until his wheels give up. Try not to collect the whole police force.'],
      ],
      steps: [
        (g, data) => {
          if (!data.target) {
            const car = makeCar('sedan', 2750, 1550, 0, g.rng);
            car.driver = 'target';
            car.color = '#e8e3d8';
            data.target = car;
            g.cars.push(car);
          }
          const t = data.target;
          g.objective = 'Disable the courier\'s car';
          g.marker = { x: t.x, y: t.y };
          // The courier flees the player and folds when wrecked.
          const away = Math.atan2(t.y - g.player.y, t.x - g.player.x);
          const flee = { x: t.x + Math.cos(away) * 500, y: t.y + Math.sin(away) * 500 };
          driveCar(g, t, g.dt, steerTo(t, flee.x, flee.y, g.dt, { throttle: 0.92 }));
          if (t.health <= 25 || t.dead) {
            g.toast('Courier stopped!');
            return true;
          }
          return false;
        },
        dialogueStep([['MARA', 'He walked home. The car is mine now. Efficient.']]),
      ],
    },
    {
      title: 'Four Star Getaway',
      start: M, pay: 1000,
      intro: [
        ['MARA', 'This one is loud. The moment you roll, the whole bay will know.'],
        ['MARA', 'Get to the Suburbs safehouse with the heat on you. Do not get caught standing still.'],
      ],
      steps: [
        (g, data) => {
          if (!data.lit) { data.lit = true; g.addHeat(4.4); g.toast('Every siren in the bay just woke up'); }
          g.objective = 'Reach the Suburbs safehouse — stay moving!';
          g.marker = { x: 620, y: 620 };
          return at(g, 620, 620, 85);
        },
        (g, data) => {
          g.clearHeat();
          if (!data.dlg) data.dlg = dialogueStep([['MARA', 'Four stars and you still made tea time. Impressive.']]);
          return data.dlg(g, data);
        },
      ],
    },
    {
      title: 'Checkpoint Run',
      start: M, pay: 900,
      intro: [
        ['MARA', 'A client pays for speed, not excuses. Six checkpoints, two minutes.'],
        ['MARA', 'Any car. Any route. The bay is your shortcut.'],
      ],
      steps: [
        (g, data) => {
          const cps = data.cps || (data.cps = [
            { x: 2100, y: 900 }, { x: 2700, y: 900 }, { x: 3300, y: 1500 },
            { x: 2700, y: 2100 }, { x: 2100, y: 2700 }, { x: 1500, y: 2100 },
          ]);
          if (data.cp === undefined) { data.cp = 0; data.timer = 120; }
          data.timer -= g.dt;
          const cp = cps[data.cp];
          g.objective = `Checkpoint ${data.cp + 1}/6 — ${Math.max(0, Math.ceil(data.timer))}s`;
          g.marker = cp;
          if (data.timer <= 0) { g.failMission('Too slow. The client walked.'); return false; }
          if (at(g, cp.x, cp.y, 85)) {
            data.cp += 1;
            g.sfx.checkpoint();
            if (data.cp >= cps.length) return true;
          }
          return false;
        },
        dialogueStep([['MARA', 'Fast and only slightly illegal. Perfect.']]),
      ],
    },
    {
      title: 'Dockside Diplomacy',
      start: M, pay: 1300,
      intro: [
        ['MARA', 'The dock crew stopped paying their cut and started buying guns.'],
        ['MARA', 'Go down there and renegotiate. Bring the crate back to me after.'],
      ],
      steps: [
        gotoStep(D.x, D.y, 'Go to the docks', 120),
        (g, data) => {
          if (!data.spawned) {
            data.spawned = true;
            data.crew = spawnGang(g, D.x, D.y, 5, 130);
            g.toast('The crew objects to your diplomacy');
          }
          g.objective = `Clear the dock crew — ${g.side.gang.length} standing`;
          g.marker = { x: D.x, y: D.y };
          return data.spawned && g.side.gang.length === 0;
        },
        gotoStep(M.x, M.y, 'Return to Mara', 70),
        dialogueStep([['MARA', 'Diplomacy concluded. The docks pay again.']]),
      ],
    },
    {
      title: 'Neon Exodus',
      start: M, pay: 3000,
      intro: [
        ['MARA', 'Last job, biggest noise. A yacht at the docks holds a drive worth a fortune.'],
        ['MARA', 'Take it, survive the welcoming committee, then run — four stars, roadblocks, the helicopter, all of it.'],
        ['MARA', 'Finish at the marina and we are both ghosts. Do not stop moving.'],
      ],
      steps: [
        gotoStep(D.x, D.y, 'Go to the dock heist', 120),
        (g, data) => {
          if (!data.spawned) {
            data.spawned = true;
            spawnGang(g, D.x, D.y, 6, 150);
            g.toast('Grab the drive — the crew is awake!');
          }
          g.objective = `Fight through the dock crew — ${g.side.gang.length} standing`;
          g.marker = { x: D.x, y: D.y };
          return data.spawned && g.side.gang.length === 0;
        },
        (g, data) => {
          if (!data.lit) { data.lit = true; g.addHeat(4.6); g.toast('RUN. Four stars and the helicopter is up.'); }
          g.objective = 'Escape to the marina — lose them at the flag!';
          g.marker = { x: MARINA.x, y: MARINA.y };
          return at(g, MARINA.x, MARINA.y, 100);
        },
        (g, data) => {
          g.clearHeat();
          if (!data.dlg) data.dlg = dialogueStep([
            ['MARA', 'You came through fire and half the PBPD. The drive is safe.'],
            ['MARA', 'Palmera Bay is yours now, driver. Keep the neon on.'],
          ]);
          return data.dlg(g, data);
        },
      ],
    },
  ];
}

// ------------------------------------------------------------------
// Mission state machine.
// ------------------------------------------------------------------
export function updateMissions(game, dt) {
  const msn = game.msn;
  if (msn.phase === 'done') { game.marker = null; return; }
  const def = game.missions[msn.idx];
  if (!def) { msn.phase = 'done'; return; }

  if (msn.phase === 'offer') {
    game.objective = `Meet Mara — new work: "${def.title}"`;
    game.marker = { x: def.start.x, y: def.start.y };
    if (at(game, def.start.x, def.start.y, 64) && game.interactPressed) {
      msn.phase = 'intro';
      say(game, def.intro);
      game.sfx.phone();
    }
    return;
  }
  if (msn.phase === 'intro') {
    game.objective = def.title;
    if (dialogueDone(game)) {
      msn.phase = 'active';
      msn.step = 0;
      msn.data = {};
    }
    return;
  }
  // active
  const stepFn = def.steps[msn.step];
  if (!stepFn) { finishMission(game, def); return; }
  // Note: a step may call game.failMission, which resets the state
  // back to 'offer'; its false return then simply ends this step.
  const done = stepFn(game, msn.data);
  if (done) {
    msn.step += 1;
    msn.data = {};
    if (msn.step >= def.steps.length) finishMission(game, def);
  }
}

function finishMission(game, def) {
  game.money += def.pay;
  game.sfx.cash();
  game.toast(`Mission complete: ${def.title} — +$${def.pay}`);
  game.msn.idx += 1;
  game.msn.phase = game.msn.idx >= game.missions.length ? 'done' : 'offer';
  game.msn.step = 0;
  game.msn.data = {};
  game.marker = null;
  game.saveSoon = true;
}

// ------------------------------------------------------------------
// Taxi fares: in a cab, marked walkers hail you. Pick up, deliver,
// get paid by distance plus a hurry-up tip.
// ------------------------------------------------------------------
export function updateTaxi(game, dt) {
  const side = game.side;
  const p = game.player;
  if (!side.fare) {
    if (p.car && p.car.type === 'taxi' && Math.abs(p.car.speed) < 30) {
      for (const ped of game.peds) {
        if (ped.wantsTaxi && ped.state === 'walk' && dist(ped.x, ped.y, p.x, p.y) < 52) {
          const dest = sidewalkPoint(game) || { x: 1500, y: 1500 };
          const fare = Math.round(dist(ped.x, ped.y, dest.x, dest.y) / 22);
          side.fare = { ped, dest, fare, timer: 0 };
          ped.state = 'fare';
          game.toast(`Fare: $${fare} — follow the marker`);
          game.sfx.pickup();
          break;
        }
      }
    }
    // Occasionally flag a walker as hailing.
    if (game.rng() < dt * 0.05) {
      const ped = pick(game.rng, game.peds);
      if (ped && ped.state === 'walk') ped.wantsTaxi = true;
    }
    return;
  }
  const fare = side.fare;
  fare.timer += dt;
  game.objective = `Taxi fare — $${fare.fare} waiting`;
  game.marker = { x: fare.dest.x, y: fare.dest.y };
  if (dist(p.x, p.y, fare.dest.x, fare.dest.y) < 75 && p.car && Math.abs(p.car.speed) < 40) {
    const tip = fare.timer < 75 ? Math.round(fare.fare * 0.35) : 0;
    game.money += fare.fare + tip;
    game.sfx.cash();
    game.toast(`Fare paid $${fare.fare}${tip ? ` + $${tip} tip` : ''}`);
    fare.ped.state = 'walk';
    fare.ped.wantsTaxi = false;
    side.fare = null;
  }
  if (!p.car || p.car.type !== 'taxi') {
    fare.ped.state = 'walk';
    fare.ped.wantsTaxi = false;
    side.fare = null;
    game.toast('Fare lost — stay in the cab next time');
  }
}

// ------------------------------------------------------------------
// The marina street race: 8 checkpoints against two rivals.
// ------------------------------------------------------------------
export const RACE_CPS = [
  { x: 2700, y: 2700 }, { x: 3300, y: 2100 }, { x: 3300, y: 1500 },
  { x: 2700, y: 900 }, { x: 2100, y: 900 }, { x: 2100, y: 1500 },
  { x: 2100, y: 2100 }, { x: 2700, y: 2700 },
];

export function tryStartRace(game) {
  const p = game.player;
  if (!p.car || game.side.race) return false;
  const flag = game.city.raceFlag;
  if (dist(p.x, p.y, flag.x, flag.y) > 95) return false;
  const rivals = [];
  const types = ['sports', 'sedan'];
  for (let i = 0; i < 2; i += 1) {
    const car = makeCar(types[i], flag.x - 60 + i * 56, flag.y + 70, -Math.PI / 2, game.rng);
    car.driver = 'rival';
    car.rivalIndex = i;
    car.raceCp = 0;
    rivals.push(car);
    game.cars.push(car);
  }
  game.side.race = { rivals, cp: 0, timer: 0, finished: false, playerDone: false };
  game.sfx.raceGo();
  game.toast('RACE! Follow the glowing checkpoints');
  return true;
}

export function updateRace(game, dt) {
  const race = game.side.race;
  if (!race) return;
  race.timer += dt;
  const p = game.player;

  // Rivals chase the same checkpoints with a rubber band.
  for (const car of race.rivals) {
    if (car.dead) continue;
    const cp = RACE_CPS[car.raceCp % RACE_CPS.length];
    const input = steerTo(car, cp.x, cp.y, dt, { throttle: 0.97 });
    driveCar(game, car, dt, input);
    if (dist(car.x, car.y, cp.x, cp.y) < 95) car.raceCp += 1;
  }
  // Player progress.
  if (!race.playerDone) {
    const cp = RACE_CPS[race.cp];
    game.raceMarker = cp;
    if (p.car && dist(p.x, p.y, cp.x, cp.y) < 100) {
      race.cp += 1;
      game.sfx.checkpoint();
      if (race.cp >= RACE_CPS.length) {
        race.playerDone = true;
        finishRace(game);
      }
    }
  }
  // Position: checkpoints cleared, then distance to the next one.
  const score = (who, cpIdx, carPos) => {
    const cp = RACE_CPS[Math.min(cpIdx, RACE_CPS.length - 1)];
    return cpIdx * 10000 - dist(carPos.x, carPos.y, cp.x, cp.y);
  };
  const mine = score('p', race.cp, p);
  let pos = 1;
  for (const car of race.rivals) if (score('r', car.raceCp, car) > mine) pos += 1;
  race.position = pos;
  race.playerScore = mine;
}

function finishRace(game) {
  const race = game.side.race;
  const pos = race.position || 1;
  const prize = [1500, 700, 300][pos - 1] || 300;
  game.money += prize;
  game.sfx.cash();
  game.toast(`Race finished ${pos}${['st', 'nd', 'rd'][pos - 1]} — +$${prize}`);
  for (const car of race.rivals) car.driver = 'traffic';
  game.side.race = null;
  game.raceMarker = null;
  game.saveSoon = true;
}
