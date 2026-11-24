# Neon Palms — Palmera Bay

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/yorstann/neon-palms-4/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/yorstann/neon-palms-4/reward.svg)](https://make.fun/bounty/gta6-01)

An original top-down open-world crime game that runs in the browser —
no build step, no dependencies, just vanilla JavaScript and a canvas.

**Play it:** open `game/index.html`, or serve the folder with
`node serve.ts` and visit http://localhost:8080/.

## The city

Palmera Bay is a six-district coastal city — Solano Heights, Centro,
Coco Walk, Costa Azul, Puerto Oro and the Marina — with lane-following
traffic, crowds on the sidewalks, a day/night cycle and **dynamic
weather**: clear skies, drizzle and full storms with rain streaks,
splashes, puddle shimmer, wet-road neon reflections, lightning and
thunder.

## What you do

- **Story campaign** — seven jobs for fixer Mara Voss, from stealing a
  sports car to the finale, *Neon Exodus*: a dock shootout, a four-star
  escape through a roadblock under the helicopter, and a run to the
  marina. Every mission opens and closes with dialogue.
- **Wanted system** — crimes need witnesses. Heat builds to five stars:
  pursuit cars, on-foot officers, roadblocks at three stars, spike
  strips and a searchlight helicopter at four. Lose them, or respray at
  Shine & Go.
- **Street races** — flag at the marina, two rival drivers, eight
  glowing checkpoints, a position/timer HUD and a cash prize.
- **Side money** — taxi fares with a countdown, twenty hidden packages.
- **Gun combat** — a rival gang holds the east side; pistol, SMG and
  shotgun with pickups, muzzle flash and smoke, collision sparks.
- **Car radio** — three synthesized stations (PALM FM, NEON DRIVE,
  BAY TALK) with the station name on the HUD.
- **Night driving** — headlight cones, neon underglow on your car,
  lamp glow and lit windows across the city.

Progress (cash, packages, missions, best race time) saves to
localStorage automatically.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Shift | Sprint · handbrake |
| E | Talk · enter/exit car · start race |
| Mouse | Aim — click or hold to shoot |
| F | Melee shove |
| Q | Radio station |
| P / Esc | Pause · H help |

## Entry

Built for the make.fun bounty
[gta6-01](https://make.fun/bounty/gta6-01) by
[@yorstan](https://make.fun/r/2qd39n6s). Screenshots in
`screenshots/` are deterministic scenes from the game itself
(`?shot=title|downtown|chase|race&seed=20261124`).
