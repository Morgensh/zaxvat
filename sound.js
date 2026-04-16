// ═══════════════════════════════════════════════════════════════════
// sound.js — Звуковые эффекты (Web Audio API, без внешних файлов)
// ═══════════════════════════════════════════════════════════════════

let _ctx = null;

function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

// Общий слой: шум → фильтр → огибающая
function noiseLayer(ctx, now, { dur, freq0, freq1, q, gain }) {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(freq0, now);
  filt.frequency.exponentialRampToValueAtTime(Math.max(freq1, 20), now + dur);
  filt.Q.value = q;

  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(filt);
  filt.connect(g);
  g.connect(ctx.destination);
  src.start(now);
  src.stop(now + dur + 0.02);
}

// Щелчок затвора (короткий тон)
function clickLayer(ctx, now, { freq, gain, dur }) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq * 2.5, now);
  osc.frequency.exponentialRampToValueAtTime(freq, now + dur * 0.5);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.005);
}

// ── Звуки оружия ──────────────────────────────────────────────────
const WEAPON_SOUNDS = {
  pistol: {
    layers: [
      { dur: 0.14, freq0: 900, freq1: 100, q: 0.7, gain: 0.85 },
    ],
    click: { freq: 220, gain: 0.28, dur: 0.05 },
  },
  shotgun: {
    layers: [
      { dur: 0.32, freq0: 380, freq1: 55, q: 0.28, gain: 1.4  }, // низкий удар
      { dur: 0.16, freq0: 1600, freq1: 300, q: 0.6, gain: 0.5 }, // высокий треск
      { dur: 0.08, freq0: 4000, freq1: 800, q: 1.2, gain: 0.3 }, // искра
    ],
    click: { freq: 130, gain: 0.4, dur: 0.06 },
  },
  auto: {
    layers: [
      { dur: 0.09, freq0: 720, freq1: 130, q: 0.95, gain: 0.70 },
    ],
    click: { freq: 240, gain: 0.20, dur: 0.035 },
  },
};

// ══════════════════════════════════════════════════════════════════
export const Sound = {
  // Разблокировать контекст после жеста пользователя
  resume() {
    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (_) {}
  },

  shoot(weaponKey) {
    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') ctx.resume();
      const now    = ctx.currentTime;
      const preset = WEAPON_SOUNDS[weaponKey] || WEAPON_SOUNDS.pistol;

      for (const l of preset.layers) noiseLayer(ctx, now, l);
      if (preset.click) clickLayer(ctx, now, preset.click);
    } catch (_) {
      // AudioContext может быть заблокирован на старых браузерах — молча пропускаем
    }
  },
};
