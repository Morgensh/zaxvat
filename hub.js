// ═══════════════════════════════════════════════════════════════════
// hub.js — Центр игры
//
// Единая точка для всего что связано с "внешним миром":
//   • статистика игрока
//   • таблица лидеров
//   • авторизация
//   • аналитика событий
//   • онлайн/мультиплеер (в будущем)
//
// Сейчас всё работает локально.
// Чтобы подключить бэкенд — раскомментируй fetch() строки
// и укажи свой API_URL.
// ═══════════════════════════════════════════════════════════════════

const HUB_VERSION = '1.0.0';
const API_URL     = 'https://your-api.example.com'; // TODO: заменить на свой адрес

// ── Локальная статистика ───────────────────────────────────────────
const _stats = {
  totalKills:      0,
  totalDeaths:     0,
  totalTimePlayed: 0,   // мс
  bestKillStreak:  0,
  sessions:        [],  // последние 50 сессий
};

// Загружаем сохранённые данные
try {
  const saved = localStorage.getItem('wns_stats');
  if (saved) Object.assign(_stats, JSON.parse(saved));
} catch (e) {}

function _save() {
  try { localStorage.setItem('wns_stats', JSON.stringify(_stats)); } catch (e) {}
}

// ══════════════════════════════════════════════════════════════════
// PUBLIC API — используй эти методы из game.js
// ══════════════════════════════════════════════════════════════════
export const Hub = {

  // ── Вызывается один раз при старте игры ───────────────────────
  async onGameStart() {
    console.log(`[Hub v${HUB_VERSION}] Game started`);

    // TODO: загрузить данные авторизованного игрока
    // const player = await fetch(`${API_URL}/me`, { headers: authHeaders() }).then(r => r.json());
  },

  // ── Вызывается при Game Over ───────────────────────────────────
  async reportGameOver({ kills, timePlayed }) {
    // Обновляем локальную статистику
    _stats.totalKills      += kills;
    _stats.totalDeaths     += 1;
    _stats.totalTimePlayed += timePlayed;
    if (kills > _stats.bestKillStreak) _stats.bestKillStreak = kills;

    _stats.sessions.push({ kills, timePlayed, date: Date.now() });
    if (_stats.sessions.length > 50) _stats.sessions.shift();
    _save();

    console.log(`[Hub] Game over — kills: ${kills}, time: ${(timePlayed/1000).toFixed(1)}s`);

    // TODO: отправить результат на сервер
    // await fetch(`${API_URL}/game-over`, {
    //   method:  'POST',
    //   headers: { 'Content-Type': 'application/json', ...authHeaders() },
    //   body:    JSON.stringify({ kills, timePlayed }),
    // });
  },

  // ── Локальная статистика ───────────────────────────────────────
  getLocalStats() {
    return { ..._stats };
  },

  // ── Таблица лидеров ────────────────────────────────────────────
  async getLeaderboard() {
    // TODO: получить с сервера
    // return await fetch(`${API_URL}/leaderboard`).then(r => r.json());

    // Пока — локальный топ из твоих сессий
    return [..._stats.sessions]
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 10);
  },

  // ── Авторизация ────────────────────────────────────────────────
  async login(token) {
    // TODO: JWT / OAuth
    // const data = await fetch(`${API_URL}/auth`, {
    //   method: 'POST',
    //   body:   JSON.stringify({ token }),
    // }).then(r => r.json());
    // localStorage.setItem('wns_token', data.token);
    console.log('[Hub] login called — not implemented yet');
  },

  async logout() {
    localStorage.removeItem('wns_token');
    console.log('[Hub] logout');
  },

  // ── Аналитика событий ──────────────────────────────────────────
  // Используй для отслеживания любых игровых событий
  track(event, data = {}) {
    console.log(`[Hub] ${event}`, data);

    // TODO: подключить Mixpanel / Amplitude / свою аналитику
    // analytics.track(event, data);
  },

  // ── Вспомогательный метод для заголовков авторизации ──────────
  // (внутренний, используется в fetch запросах выше)
  _authHeaders() {
    const token = localStorage.getItem('wns_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};