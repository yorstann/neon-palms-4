// Palmera Bay: the city itself. A grid of avenues over six districts,
// generated once from the run's seed. Buildings are solid boxes with
// neon signs, palms and lamps dress the sidewalks, the bay takes the
// east edge, and every gameplay landmark (respray, race flag, gang
// corners, Mara's meeting spot, the dock) is placed here so the other
// modules share one map.

import { makeRng, range, pick, clamp } from './random.js';

export const WORLD = { w: 4800, h: 3600 };
export const ROAD_W = 140;
export const ROAD_XS = [300, 900, 1500, 2100, 2700, 3300, 3900];
export const ROAD_YS = [300, 900, 1500, 2100, 2700, 3300];
export const WATER_X = 4420;
export const BEACH_X = 4280;

export const DISTRICTS = [
  { name: 'SUBURBS', x: 0, y: 0, w: 1600, h: 1800, ground: '#3d4a3a', roof: ['#7a5c48', '#8a6a52', '#6e5546'] },
  { name: 'DOWNTOWN', x: 1600, y: 0, w: 1600, h: 1800, ground: '#43454e', roof: ['#5d6472', '#6b7280', '#525a68', '#79808e'] },
  { name: 'INDUSTRIAL', x: 3200, y: 0, w: 1280, h: 1800, ground: '#4c463e', roof: ['#6e6258', '#5f564c', '#77685a'] },
  { name: 'PALM BEACH', x: 0, y: 1800, w: 1600, h: 1800, ground: '#57704c', roof: ['#a08a68', '#96795c', '#b09468'] },
  { name: 'MARINA', x: 1600, y: 1800, w: 1600, h: 1800, ground: '#46525a', roof: ['#7d8a96', '#6d7b88', '#8b98a4'] },
  { name: 'THE DOCKS', x: 3200, y: 1800, w: 1280, h: 1800, ground: '#51483c', roof: ['#746656', '#66594a', '#7d6c58'] },
];

const SIGN_WORDS = ['PALM', 'NEON', 'BAY', 'VICE', 'SOL', 'MAR', 'ORO', 'AZUL', 'NOCHE', 'RITMO', 'COCO', 'OLA'];
const SIGN_COLORS = ['#ff5da2', '#39d0ff', '#ffd23e', '#7CFC98', '#ff8a3e', '#c792ff'];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[1];
}

export function onRoad(x, y) {
  for (const rx of ROAD_XS) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}

export function nearestRoadPoint(x, y) {
  let best = { x, y, d: Infinity };
  for (const rx of ROAD_XS) {
    const d = Math.abs(x - rx);
    if (d < best.d) best = { x: rx, y, d };
  }
  for (const ry of ROAD_YS) {
    const d = Math.abs(y - ry);
    if (d < best.d) best = { x, y: ry, d };
  }
  return best;
}

/** All intersections as {x, y}, west to east, north to south. */
export function intersections() {
  const out = [];
  for (const y of ROAD_YS) for (const x of ROAD_XS) out.push({ x, y });
  return out;
}

export function buildCity(seed) {
  const rng = makeRng(seed ^ 0x9e3779b9);
  const buildings = [];
  const palms = [];
  const lamps = [];
  const props = [];

  // Buildings fill each block between avenues, two by two, set back
  // from the sidewalk. Downtown grows towers; the suburbs stay low.
  for (let bx = 0; bx < ROAD_XS.length - 1; bx += 1) {
    for (let by = 0; by < ROAD_YS.length - 1; by += 1) {
      const x0 = ROAD_XS[bx] + ROAD_W / 2 + 26;
      const x1 = ROAD_XS[bx + 1] - ROAD_W / 2 - 26;
      const y0 = ROAD_YS[by] + ROAD_W / 2 + 26;
      const y1 = ROAD_YS[by + 1] - ROAD_W / 2 - 26;
      const district = districtAt((x0 + x1) / 2, (y0 + y1) / 2);
      const cellW = (x1 - x0) / 2;
      const cellH = (y1 - y0) / 2;
      for (let cx = 0; cx < 2; cx += 1) {
        for (let cy = 0; cy < 2; cy += 1) {
          if (rng() < 0.08) continue; // the odd empty lot
          const pad = range(rng, 8, 22);
          const w = cellW - pad * 2;
          const h = cellH - pad * 2;
          const tall = district.name === 'DOWNTOWN'
            ? range(rng, 60, 150)
            : district.name === 'INDUSTRIAL' || district.name === 'THE DOCKS'
              ? range(rng, 18, 40)
              : range(rng, 12, 30);
          const sign = rng() < 0.4
            ? { text: pick(rng, SIGN_WORDS), color: pick(rng, SIGN_COLORS) }
            : null;
          buildings.push({
            x: x0 + cx * cellW + pad,
            y: y0 + cy * cellH + pad,
            w, h, tall,
            color: pick(rng, district.roof),
            sign,
            district: district.name,
          });
        }
      }
      // Palms and lamps along the block corners.
      for (const [px, py] of [[x0 - 14, y0 - 14], [x1 + 14, y0 - 14], [x0 - 14, y1 + 14], [x1 + 14, y1 + 14]]) {
        if (rng() < 0.55) palms.push({ x: px + range(rng, -6, 6), y: py + range(rng, -6, 6), s: range(rng, 0.8, 1.25) });
        else lamps.push({ x: px, y: py });
      }
    }
  }

  // Beach palms marching down to the water.
  for (let y = 160; y < WORLD.h - 120; y += range(rng, 90, 170)) {
    palms.push({ x: BEACH_X + range(rng, 10, 90), y, s: range(rng, 0.9, 1.4) });
  }
  // Dock cranes and container stacks in the south-east.
  for (let i = 0; i < 5; i += 1) {
    props.push({ kind: 'crane', x: 3560 + i * 170, y: 3060, s: 1 });
  }
  for (let i = 0; i < 14; i += 1) {
    props.push({
      kind: 'container',
      x: 3380 + (i % 7) * 130 + range(rng, -8, 8),
      y: 3180 + Math.floor(i / 7) * 130,
      color: pick(rng, ['#b5524a', '#4a7ab5', '#4ab57a', '#b58a4a']),
    });
  }

  const city = {
    buildings, palms, lamps, props,
    respray: { x: 2135, y: 1535, w: 130, h: 130, name: 'SHINE & GO' },
    raceFlag: { x: 2460, y: 2700 },
    maraSpot: { x: 1560, y: 1560 },
    dock: { x: 3980, y: 2980 },
    marina: { x: 2560, y: 2560 },
    hospital: { x: 940, y: 940 },
    jail: { x: 940, y: 2140 },
    gangCorners: [
      { x: 3350, y: 950, district: 'INDUSTRIAL' },
      { x: 2750, y: 2750, district: 'MARINA' },
      { x: 950, y: 3350, district: 'PALM BEACH' },
    ],
  };
  return city;
}

/** Solid AABBs the world collides with (buildings + containers). */
export function solids(city) {
  const out = [];
  for (const b of city.buildings) out.push(b);
  for (const p of city.props) {
    if (p.kind === 'container') out.push({ x: p.x - 52, y: p.y - 20, w: 104, h: 40 });
  }
  return out;
}

/** Push a circle at (x, y) radius r out of every solid; returns impact speed lost. */
export function collideCircle(city, body, r) {
  let impact = 0;
  const list = city._solids || (city._solids = solids(city));
  for (const s of list) {
    const nx = clamp(body.x, s.x, s.x + s.w);
    const ny = clamp(body.y, s.y, s.y + s.h);
    const dx = body.x - nx;
    const dy = body.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      const push = r - d;
      if (d2 > 0.01) {
        body.x += (dx / d) * push;
        body.y += (dy / d) * push;
      } else {
        // Centre inside the box: leave through the nearest face.
        const left = body.x - s.x;
        const right = s.x + s.w - body.x;
        const top = body.y - s.y;
        const bottom = s.y + s.h - body.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) body.x = s.x - r;
        else if (min === right) body.x = s.x + s.w + r;
        else if (min === top) body.y = s.y - r;
        else body.y = s.y + s.h + r;
      }
      impact = Math.max(impact, 1);
    }
  }
  // Keep everything inside the world and out of the bay.
  body.x = clamp(body.x, r, WORLD.w - r);
  body.y = clamp(body.y, r, WORLD.h - r);
  if (body.x > WATER_X - r && !body.onBridge) body.x = WATER_X - r;
  return impact;
}

/** Is the segment-free point inside any solid? Used for spawn checks. */
export function pointInSolid(city, x, y) {
  const list = city._solids || (city._solids = solids(city));
  for (const s of list) {
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return true;
  }
  return false;
}
