// Everything drawn over the world: the HUD (health, armour, cash,
// clock, stars, weapon, speedo, weather), the live minimap, Mara's
// dialogue box, phone toasts, the race standings, and the full-screen
// states — title, pause, help, busted and wasted.

import { WORLD, ROAD_XS, ROAD_YS, WATER_X } from './city.js';
import { STATIONS } from './audio.js';
import { clamp } from './random.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function bar(ctx, x, y, w, h, frac, color, back = 'rgba(10,10,14,0.65)') {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * clamp(frac, 0, 1)), h - 2);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,12,18,0.62)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
}

export function drawHUD(ctx, game, view) {
  const p = game.player;
  const W = view.w;
  ctx.save();
  ctx.font = `600 15px ${FONT}`;
  ctx.textBaseline = 'alphabetic';

  // Top-left: vitals.
  panel(ctx, 14, 14, 208, 64);
  ctx.fillStyle = '#ff6b5e';
  ctx.fillText('HEALTH', 24, 36);
  bar(ctx, 92, 25, 118, 12, p.health / 100, '#e33f2f');
  ctx.fillStyle = '#7ec3ff';
  ctx.fillText('ARMOUR', 24, 60);
  bar(ctx, 92, 49, 118, 12, p.armor / 100, '#4a7ab5');

  // Top-centre: objective.
  if (game.objective) {
    ctx.font = `700 17px ${FONT}`;
    const wText = ctx.measureText(game.objective).width + 34;
    panel(ctx, (W - wText) / 2, 14, wText, 34);
    ctx.fillStyle = '#ffd23e';
    ctx.textAlign = 'center';
    ctx.fillText(game.objective, W / 2, 37);
    ctx.textAlign = 'left';
    ctx.font = `600 15px ${FONT}`;
  }

  // Top-right: cash, clock, stars, weather.
  panel(ctx, W - 232, 14, 218, 86);
  ctx.fillStyle = '#7dd87d';
  ctx.font = `800 22px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`$${game.money.toLocaleString('en-US')}`, W - 26, 42);
  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = '#e8ecf2';
  ctx.fillText(`${game.clockText}  ·  ${game.weatherTag}`, W - 26, 64);
  // Wanted stars.
  for (let i = 0; i < 5; i += 1) {
    const x = W - 196 + i * 38;
    const y = 74;
    ctx.fillStyle = i < game.stars ? '#ffd23e' : 'rgba(255,255,255,0.18)';
    star(ctx, x, y, 11);
  }
  ctx.textAlign = 'left';

  // Busted meter.
  if (game.police.bustedMeter > 0.02) {
    ctx.font = `800 19px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5147';
    ctx.fillText('BUSTED?', W / 2, 120);
    bar(ctx, W / 2 - 90, 128, 180, 10, game.police.bustedMeter, '#ff5147');
    ctx.textAlign = 'left';
  }

  // Bottom-left: weapon + radio.
  panel(ctx, 14, view.h - 66, 208, 52);
  ctx.fillStyle = '#e8ecf2';
  ctx.font = `700 16px ${FONT}`;
  if (p.car) {
    const st = game.radioStation;
    ctx.fillText(st === null ? 'RADIO OFF — Q' : `♪ ${STATIONS[st].name}`, 24, view.h - 34);
  } else {
    const reloading = game.time < p.reloadUntil;
    ctx.fillText(reloading ? 'RELOADING…' : `PISTOL  ${p.mag} / ${p.ammo}`, 24, view.h - 34);
  }

  // Bottom-right above the map: speed.
  if (p.car) {
    ctx.font = `800 30px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    const kmh = Math.round(Math.abs(p.car.speed) * 0.36);
    ctx.fillText(`${kmh}`, W - 190, view.h - 24);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = '#aab3c0';
    ctx.fillText('KM/H', W - 152, view.h - 24);
    ctx.textAlign = 'left';
  }

  // Race HUD.
  const race = game.side.race;
  if (race) {
    panel(ctx, W / 2 - 150, 58, 300, 40);
    ctx.font = `800 19px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#39d0ff';
    const mins = Math.floor(race.timer / 60);
    const secs = (race.timer % 60).toFixed(1).padStart(4, '0');
    ctx.fillText(`POS ${race.position || 1}/3 · CP ${Math.min(race.cp + 1, 8)}/8 · ${mins}:${secs}`, W / 2, 85);
    ctx.textAlign = 'left';
  }

  // Mission-fail / info toast (phone style), bottom centre.
  if (game.toastText && game.time < game.toastUntil) {
    ctx.font = `600 16px ${FONT}`;
    const wText = ctx.measureText(game.toastText).width + 36;
    panel(ctx, (W - wText) / 2, view.h - 118, wText, 36);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(game.toastText, W / 2, view.h - 94);
    ctx.textAlign = 'left';
  }

  // Interact hint.
  if (game.interactHint) {
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23e';
    ctx.fillText(game.interactHint, W / 2, view.h - 140);
    ctx.textAlign = 'left';
  }

  drawMinimap(ctx, game, view);
  ctx.restore();
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawMinimap(ctx, game, view) {
  const size = 168;
  const x0 = view.w - size - 14;
  const y0 = view.h - size - 14;
  const s = size / WORLD.w;
  ctx.save();
  panel(ctx, x0 - 4, y0 - 4, size + 8, size + 8);
  ctx.beginPath();
  ctx.rect(x0, y0, size, size * (WORLD.h / WORLD.w));
  ctx.clip();
  const mh = size * (WORLD.h / WORLD.w);
  ctx.fillStyle = '#20262e';
  ctx.fillRect(x0, y0, size, mh);
  ctx.fillStyle = '#274b63';
  ctx.fillRect(x0 + WATER_X * s, y0, size - WATER_X * s, mh);
  ctx.strokeStyle = '#4a5160';
  ctx.lineWidth = 1;
  for (const rx of ROAD_XS) {
    ctx.beginPath(); ctx.moveTo(x0 + rx * s, y0); ctx.lineTo(x0 + rx * s, y0 + mh); ctx.stroke();
  }
  for (const ry of ROAD_YS) {
    ctx.beginPath(); ctx.moveTo(x0, y0 + ry * s); ctx.lineTo(x0 + size, y0 + ry * s); ctx.stroke();
  }
  // Police blips.
  ctx.fillStyle = '#4a9eff';
  for (const car of game.police.cars) dot(ctx, x0 + car.x * s, y0 + car.y * s, 2.4);
  if (game.police.heli) {
    ctx.fillStyle = '#9fd0ff';
    dot(ctx, x0 + game.police.heli.x * s, y0 + game.police.heli.y * s, 2.8);
  }
  // Gang blips.
  ctx.fillStyle = '#ff5147';
  for (const g of game.side.gang) dot(ctx, x0 + g.x * s, y0 + g.y * s, 2.2);
  // Mission / race marker.
  const marker = game.raceMarker || game.marker;
  if (marker) {
    ctx.fillStyle = '#ffd23e';
    dot(ctx, x0 + marker.x * s, y0 + marker.y * s, 3.6);
  }
  // Player arrow.
  const p = game.player;
  const px = x0 + p.x * s;
  const py = y0 + p.y * s;
  ctx.translate(px, py);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -3.6);
  ctx.lineTo(-4, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------------
// Dialogue box: Mara (and you) at the bottom of the screen.
// ------------------------------------------------------------------
export function drawDialogue(ctx, game, view) {
  const d = game.dialogue;
  if (!d) return;
  const [speaker, line] = d.lines[d.i];
  const h = 92;
  const y = view.h - h - 16;
  ctx.save();
  panel(ctx, 90, y, view.w - 180, h);
  ctx.font = `800 15px ${FONT}`;
  ctx.fillStyle = speaker === 'MARA' ? '#ff5da2' : '#39d0ff';
  ctx.fillText(speaker, 112, y + 26);
  ctx.font = `400 17px ${FONT}`;
  ctx.fillStyle = '#f2f4f8';
  wrapText(ctx, line, 112, y + 52, view.w - 224, 21);
  ctx.font = `600 12px ${FONT}`;
  ctx.fillStyle = '#8b93a3';
  ctx.textAlign = 'right';
  ctx.fillText('E ▸', view.w - 112, y + h - 10);
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

// ------------------------------------------------------------------
// Full-screen states.
// ------------------------------------------------------------------
export function drawTitle(ctx, game, view) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,8,16,0.45)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.font = `900 92px ${FONT}`;
  ctx.fillStyle = '#ff5da2';
  ctx.fillText('NEON', view.w / 2, 208);
  ctx.fillStyle = '#39d0ff';
  ctx.fillText('PALMS', view.w / 2, 298);
  ctx.font = `600 19px ${FONT}`;
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText('An open-world crime story in Palmera Bay', view.w / 2, 344);
  ctx.font = `500 16px ${FONT}`;
  ctx.fillStyle = '#c6cdd8';
  ctx.fillText('Steal cars. Run jobs for Mara Voss. Outrun the PBPD.', view.w / 2, 376);
  ctx.font = `700 21px ${FONT}`;
  ctx.fillStyle = '#ffd23e';
  const items = ['NEW GAME — ENTER'];
  if (game.hasSaveFile) items.push('CONTINUE — C');
  items.push('HOW TO PLAY — H');
  items.forEach((t, i) => ctx.fillText(t, view.w / 2, 448 + i * 36));
  ctx.font = `500 13px ${FONT}`;
  ctx.fillStyle = '#8b93a3';
  ctx.fillText('WASD drive · E enter/exit · mouse aim, click shoot · F melee · Q radio · P pause', view.w / 2, view.h - 30);
  ctx.restore();
}

export function drawPause(ctx, game, view) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,8,12,0.66)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.font = `800 44px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('PAUSED', view.w / 2, 240);
  ctx.font = `600 18px ${FONT}`;
  ctx.fillStyle = '#c6cdd8';
  ctx.fillText(`Cash $${game.money.toLocaleString('en-US')} · Packages ${game.packagesFound.size}/20 · Playtime ${Math.floor(game.playSeconds / 60)}m`, view.w / 2, 292);
  ctx.fillText('P or ESC — resume      S — save now', view.w / 2, 340);
  ctx.restore();
}

export function drawHelp(ctx, game, view) {
  ctx.save();
  ctx.fillStyle = 'rgba(6,8,12,0.82)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.font = `800 38px ${FONT}`;
  ctx.fillStyle = '#39d0ff';
  ctx.fillText('HOW TO PLAY', view.w / 2, 120);
  ctx.font = `500 17px ${FONT}`;
  ctx.fillStyle = '#e8ecf2';
  const lines = [
    'WASD / arrows — walk and drive · SHIFT — run · SPACE — handbrake',
    'E — enter/exit cars, talk, start jobs · F — melee · R — reload',
    'Mouse — aim · click / hold — shoot · Q — radio · X — radio off',
    'Crimes raise your stars when witnessed. Police pursue, block and spike.',
    'Lose the heat by hiding, or pay Shine & Go (pink sign) to respray it away.',
    'Work Mara\'s seven jobs, run taxi fares, find 20 packages, win the marina race.',
    'Busted fills if you dawdle next to the law. Wasted sends you to the hospital.',
    '',
    'Press H or ESC to go back',
  ];
  lines.forEach((t, i) => ctx.fillText(t, view.w / 2, 176 + i * 32));
  ctx.restore();
}

export function drawEndScreen(ctx, game, view, kind) {
  ctx.save();
  ctx.fillStyle = kind === 'busted' ? 'rgba(20,30,70,0.55)' : 'rgba(70,10,10,0.55)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.font = `900 84px ${FONT}`;
  ctx.fillStyle = kind === 'busted' ? '#7ec3ff' : '#ff5147';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', view.w / 2, 300);
  ctx.font = `600 18px ${FONT}`;
  ctx.fillStyle = '#f2f4f8';
  ctx.fillText(
    kind === 'busted'
      ? 'The PBPD impounds your ride and takes a cut of your cash.'
      : 'You wake up at Palmera General. The city keeps your car.',
    view.w / 2, 348,
  );
  ctx.fillStyle = '#ffd23e';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText('Press ENTER to get back out there', view.w / 2, 404);
  ctx.restore();
}
