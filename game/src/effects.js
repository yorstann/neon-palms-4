// Transient visual juice: particles (sparks, smoke, muzzle smoke,
// cash flutter, rain splash bursts), skid marks burned into the road,
// screen shake and floating text. Counts are capped so a five-star
// pile-up stays at a steady frame rate.

const MAX_PARTICLES = 420;
const MAX_SKIDS = 700;

export function createEffects() {
  return {
    particles: [],
    skids: [],
    texts: [],
    shake: 0,
  };
}

export function burst(fx, x, y, opts) {
  const {
    count = 8, color = '#ffd23e', speed = 160, life = 0.5,
    size = 3, gravity = 0, drag = 1, spread = Math.PI * 2, angle = 0,
  } = opts;
  for (let i = 0; i < count; i += 1) {
    if (fx.particles.length >= MAX_PARTICLES) return;
    const a = angle + (Math.random() - 0.5) * spread;
    const s = speed * (0.35 + Math.random() * 0.85);
    fx.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: life * (0.6 + Math.random() * 0.7),
      maxLife: life,
      size: size * (0.6 + Math.random() * 0.8),
      color, gravity, drag,
    });
  }
}

export function sparks(fx, x, y, angle) {
  burst(fx, x, y, { count: 10, color: '#ffb03a', speed: 300, life: 0.35, size: 2.4, angle, spread: 1.6, drag: 0.92 });
  burst(fx, x, y, { count: 4, color: '#fff3c4', speed: 180, life: 0.22, size: 1.8, angle, spread: 1.2 });
}

export function smokePuff(fx, x, y, dark) {
  burst(fx, x, y, {
    count: 1, color: dark ? 'rgba(40,40,44,0.5)' : 'rgba(210,210,215,0.45)',
    speed: 26, life: 1.1, size: 9, gravity: -30, drag: 0.98,
  });
}

export function muzzleSmoke(fx, x, y) {
  burst(fx, x, y, { count: 3, color: 'rgba(220,220,225,0.4)', speed: 40, life: 0.6, size: 4, gravity: -18 });
}

export function cashBurst(fx, x, y) {
  burst(fx, x, y, { count: 7, color: '#7dd87d', speed: 130, life: 0.7, size: 3.4, gravity: 260, drag: 0.97 });
}

export function addSkid(fx, x, y, angle) {
  fx.skids.push({ x, y, angle, life: 6 });
  if (fx.skids.length > MAX_SKIDS) fx.skids.splice(0, fx.skids.length - MAX_SKIDS);
}

export function floatText(fx, x, y, text, color = '#ffffff') {
  fx.texts.push({ x, y, text, color, life: 1.4 });
}

export function addShake(fx, amount) {
  fx.shake = Math.min(14, fx.shake + amount);
}

export function updateEffects(fx, dt) {
  for (let i = fx.particles.length - 1; i >= 0; i -= 1) {
    const p = fx.particles[i];
    p.life -= dt;
    if (p.life <= 0) { fx.particles.splice(i, 1); continue; }
    p.vy += (p.gravity || 0) * dt;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = fx.skids.length - 1; i >= 0; i -= 1) {
    fx.skids[i].life -= dt;
    if (fx.skids[i].life <= 0) fx.skids.splice(i, 1);
  }
  for (let i = fx.texts.length - 1; i >= 0; i -= 1) {
    const t = fx.texts[i];
    t.life -= dt;
    t.y -= 34 * dt;
    if (t.life <= 0) fx.texts.splice(i, 1);
  }
  fx.shake = Math.max(0, fx.shake - dt * 26);
}

export function drawSkids(ctx, fx, cam) {
  ctx.save();
  for (const s of fx.skids) {
    const sx = s.x - cam.x;
    const sy = s.y - cam.y;
    if (sx < -30 || sy < -30 || sx > cam.w + 30 || sy > cam.h + 30) continue;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(s.angle);
    ctx.fillStyle = `rgba(18,18,20,${Math.min(0.5, s.life * 0.12)})`;
    ctx.fillRect(-9, -2.4, 18, 4.8);
    ctx.restore();
  }
  ctx.restore();
}

export function drawParticles(ctx, fx, cam) {
  for (const p of fx.particles) {
    const sx = p.x - cam.x;
    const sy = p.y - cam.y;
    if (sx < -20 || sy < -20 || sx > cam.w + 20 || sy > cam.h + 20) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawTexts(ctx, fx, cam) {
  ctx.save();
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const t of fx.texts) {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x - cam.x, t.y - cam.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
