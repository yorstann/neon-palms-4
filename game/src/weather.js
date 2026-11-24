// Palmera Bay weather: a slow front that rolls in off the water.
// Clear skies give way to drizzle, then a proper storm with lightning,
// then it blows out again. The state drives rain streaks, splashes,
// puddle shimmer, wet-road reflections and the HUD weather tag, and
// the rain cools wanted heat decay a touch (harder to be seen).

import { range } from './random.js';

export const WEATHER_CLEAR = 'CLEAR';
export const WEATHER_DRIZZLE = 'DRIZZLE';
export const WEATHER_STORM = 'STORM';

export function createWeather(rng) {
  return {
    state: WEATHER_CLEAR,
    intensity: 0,          // 0 clear .. 1 full storm, eased toward target
    target: 0,
    timer: range(rng, 35, 60),
    flash: 0,              // lightning flash brightness, decays fast
    flashTimer: range(rng, 4, 9),
    puddle: 0,             // how soaked the ground is, lags the rain
    rng,
  };
}

/** Force a state (screenshot scenes and the finale use this). */
export function setWeather(w, state, intensity) {
  w.state = state;
  w.target = intensity;
  w.intensity = intensity;
  w.puddle = Math.min(1, intensity + 0.25);
  w.timer = 9999;
}

export function updateWeather(w, dt, sfx) {
  w.timer -= dt;
  if (w.timer <= 0) {
    if (w.state === WEATHER_CLEAR) {
      w.state = WEATHER_DRIZZLE;
      w.target = 0.45;
      w.timer = range(w.rng, 25, 45);
    } else if (w.state === WEATHER_DRIZZLE) {
      if (w.rng() < 0.6) {
        w.state = WEATHER_STORM;
        w.target = 1;
        w.timer = range(w.rng, 20, 35);
      } else {
        w.state = WEATHER_CLEAR;
        w.target = 0;
        w.timer = range(w.rng, 40, 70);
      }
    } else {
      w.state = WEATHER_DRIZZLE;
      w.target = 0.4;
      w.timer = range(w.rng, 15, 25);
    }
  }
  const ease = w.target > w.intensity ? 0.25 : 0.12;
  w.intensity += (w.target - w.intensity) * Math.min(1, dt * ease * 4);
  w.puddle += ((w.intensity > 0.05 ? 1 : 0) - w.puddle) * Math.min(1, dt * 0.05);

  if (w.state === WEATHER_STORM && w.intensity > 0.7) {
    w.flashTimer -= dt;
    if (w.flashTimer <= 0) {
      w.flash = 1;
      w.flashTimer = range(w.rng, 3, 10);
      if (sfx) setTimeout(() => sfx.thunder(), 350 + w.rng() * 500);
    }
  }
  if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 3.2);
  return w;
}

/** Rain streaks + ring splashes, drawn in screen space over the world. */
export function drawRain(ctx, w, view, rng) {
  if (w.intensity <= 0.03) return;
  const drops = Math.floor(240 * w.intensity);
  ctx.save();
  ctx.strokeStyle = 'rgba(190,215,255,0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < drops; i += 1) {
    const x = rng() * view.w;
    const y = rng() * view.h;
    const len = 12 + w.intensity * 14;
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.22, y + len);
  }
  ctx.stroke();
  // Splashes: quick expanding rings on the ground plane.
  ctx.strokeStyle = 'rgba(200,225,255,0.35)';
  ctx.lineWidth = 1;
  const rings = Math.floor(50 * w.intensity);
  for (let i = 0; i < rings; i += 1) {
    const x = rng() * view.w;
    const y = rng() * view.h;
    const r = 2 + rng() * 5;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
