// ═══════════════════════════════════════════════════════════════════
// game.js — Игровой движок
// ═══════════════════════════════════════════════════════════════════

import {
  CHARACTERS, ENEMIES_CONFIG, WEAPONS_CONFIG,
  PICKUPS_CONFIG, WEAPON_DROPS_CONFIG,
  MAP_CONFIG, GAME, buildAssetMap,
} from './config.js';
import { Hub } from './hub.js';

(async () => {

  const statusEl   = document.getElementById('status');
  const gameoverEl = document.getElementById('gameover');
  const joyBase    = document.getElementById('joystick-base');
  const joyThumb   = document.getElementById('joystick-thumb');
  const shootBtn   = document.getElementById('shoot-btn');
  const menuEl     = document.getElementById('mainmenu');
  const startBtn   = document.getElementById('start-btn');

  // ── Активные конфиги ──────────────────────────────────────────────
  const CHAR  = CHARACTERS.hero;
  const ENEMY = ENEMIES_CONFIG.zombie;
  const PICKUP = PICKUPS_CONFIG.magazine;
  let currentWeaponKey = 'pistol'; // стартовое оружие — weaponR2

  // ═══════════════════════════════════════════════════════════════
  // PIXI APP
  // ═══════════════════════════════════════════════════════════════
  const app = new PIXI.Application({
    width:           window.innerWidth,
    height:          window.innerHeight,
    backgroundColor: 0x6b6b8a,
    resolution:      Math.min(window.devicePixelRatio || 1, 2),
    autoDensity:     true,
    antialias:       false,
    powerPreference: 'high-performance',
  });
  document.body.appendChild(app.view);
  Object.assign(app.view.style, { position: 'fixed', top: '0', left: '0', width: '100%', height: '100%' });

  let CW = window.innerWidth, CH = window.innerHeight;
  let HW = CW / 2, HH = CH / 2;

  window.addEventListener('resize', () => {
    CW = window.innerWidth; CH = window.innerHeight;
    HW = CW / 2; HH = CH / 2;
    app.renderer.resize(CW, CH);
    groundTiles.forEach(t => { if (t) { t.width = CW; t.height = CH; } });
  });

  // ═══════════════════════════════════════════════════════════════
  // КОНТЕЙНЕРЫ
  // ═══════════════════════════════════════════════════════════════
  const groundLayer    = new PIXI.Container();
  const worldContainer = new PIXI.Container();
  const hudContainer   = new PIXI.Container();
  worldContainer.sortableChildren = true;
  app.stage.addChild(groundLayer);
  app.stage.addChild(worldContainer);
  app.stage.addChild(hudContainer);

  // ── HUD ───────────────────────────────────────────────────────
  const vignetteGfx = new PIXI.Graphics();
  vignetteGfx.beginFill(0xff0000).drawRect(0, 0, 9999, 9999).endFill();
  vignetteGfx.alpha = 0; vignetteGfx.visible = false;
  hudContainer.addChild(vignetteGfx);

  const hpGfx = new PIXI.Graphics();
  hudContainer.addChild(hpGfx);

  const killText = new PIXI.Text('💀 0', { fontFamily: 'monospace', fontSize: 11, fill: 0xbbbbbb });
  hudContainer.addChild(killText);

  const ammoText = new PIXI.Text(`🔫 ${PICKUP.ammoStart}`, { fontFamily: 'monospace', fontSize: 13, fill: 0xffffff });
  hudContainer.addChild(ammoText);

  const noAmmoText = new PIXI.Text('НЕТ ПАТРОНОВ', { fontFamily: 'monospace', fontSize: 16, fill: 0xff3333 });
  noAmmoText.anchor.set(0.5, 0); noAmmoText.visible = false;
  hudContainer.addChild(noAmmoText);

  // Название текущего оружия (мигает при смене)
  const weaponLabelText = new PIXI.Text('', {
    fontFamily: 'monospace', fontSize: 13, fill: 0xffcc44,
    dropShadow: true, dropShadowDistance: 0, dropShadowBlur: 8, dropShadowColor: 0xffaa00,
  });
  weaponLabelText.anchor.set(0, 0); weaponLabelText.alpha = 0;
  hudContainer.addChild(weaponLabelText);
  let weaponLabelTimer = 0;

  // ═══════════════════════════════════════════════════════════════
  // ЗАГРУЗКА РЕСУРСОВ
  // ═══════════════════════════════════════════════════════════════
  PIXI.Assets.setPreferences({ preferWorkers: false, preferCreateImageBitmap: false });

  const assetMap = buildAssetMap();
  const TEX      = {};
  const total    = Object.keys(assetMap).length;
  let   loaded   = 0;

  await Promise.all(Object.entries(assetMap).map(async ([key, url]) => {
    try   { TEX[key] = await PIXI.Assets.load(url); }
    catch { TEX[key] = PIXI.Texture.EMPTY; }
    statusEl.textContent = `Загружаю ${++loaded}/${total}...`;
  }));
  statusEl.textContent = '';

  // Разблокируем кнопку старта
  startBtn.disabled = false;
  startBtn.textContent = '▶  НАЧАТЬ ИГРУ';

  // ═══════════════════════════════════════════════════════════════
  // УТИЛИТЫ ТЕКСТУР
  // ═══════════════════════════════════════════════════════════════
  function detectPixiBounds(texture) {
    if (!texture || texture === PIXI.Texture.EMPTY) return null;
    const resource = texture.baseTexture.resource;
    const src = resource.source || resource._source || resource.bitmap;
    if (!src) return null;
    const MAX = 256;
    const ow  = src.naturalWidth  || src.width  || texture.baseTexture.width;
    const oh  = src.naturalHeight || src.height || texture.baseTexture.height;
    if (!ow || !oh) return null;
    const scale = Math.min(1, MAX / Math.max(ow, oh));
    const w = Math.round(ow * scale), h = Math.round(oh * scale);
    const oc = document.createElement('canvas');
    oc.width = w; oc.height = h;
    const ox = oc.getContext('2d');
    try { ox.drawImage(src, 0, 0, w, h); } catch (e) { return null; }
    let d;
    try { d = ox.getImageData(0, 0, w, h).data; } catch (e) { return null; }
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (d[(y * w + x) * 4 + 3] > 30) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    if (x1 <= x0 || y1 <= y0) return null;
    const p = 2;
    return new PIXI.Rectangle(
      Math.max(0, (x0 - p) / scale), Math.max(0, (y0 - p) / scale),
      (x1 - x0 + p * 2) / scale, (y1 - y0 + p * 2) / scale,
    );
  }

  function croppedTex(rawTex) {
    if (!rawTex || rawTex === PIXI.Texture.EMPTY) return PIXI.Texture.EMPTY;
    const frame = detectPixiBounds(rawTex);
    if (!frame) return rawTex;
    return new PIXI.Texture(rawTex.baseTexture, frame);
  }

  // ── Текстуры персонажей и карты ───────────────────────────────
  const walkTextures  = Array.from({ length: CHAR.frameCount },  (_, i) => croppedTex(TEX[`hero_walk${i}`]));
  const enemyTextures = Array.from({ length: ENEMY.frameCount }, (_, i) => croppedTex(TEX[`zombie_walk${i}`]));
  const rockTextures  = MAP_CONFIG.rocks.map((_, i) => croppedTex(TEX[`rock${i}`]));

  // ── Текстуры оружий ────────────────────────────────────────────
  const weaponTexSets = {};
  for (const key of Object.keys(WEAPONS_CONFIG)) {
    weaponTexSets[key] = {
      sprite:    croppedTex(TEX[`${key}_sprite`]    || PIXI.Texture.EMPTY),
      bullet:    croppedTex(TEX[`${key}_bullet`]    || PIXI.Texture.EMPTY),
      muzzle:    croppedTex(TEX[`${key}_muzzle`]    || PIXI.Texture.EMPTY),
      crosshair: croppedTex(TEX[`${key}_crosshair`] || PIXI.Texture.EMPTY),
    };
  }
  const magazinTex = croppedTex(TEX['magazine_sprite'] || PIXI.Texture.EMPTY);

  // ═══════════════════════════════════════════════════════════════
  // ФОН
  // ═══════════════════════════════════════════════════════════════
  const groundTiles = MAP_CONFIG.grounds.map((g, i) => {
    const t = TEX[`ground${i}`];
    if (!t || t === PIXI.Texture.EMPTY) return null;
    const tile = new PIXI.TilingSprite(t, CW, CH);
    tile.alpha     = g.alpha;
    tile.blendMode = PIXI.BLEND_MODES[g.blend] ?? PIXI.BLEND_MODES.NORMAL;
    groundLayer.addChild(tile);
    return tile;
  });

  // ═══════════════════════════════════════════════════════════════
  // ДИНАМИЧЕСКИЕ КОНСТАНТЫ ОРУЖИЯ
  // (пересчитываются при смене оружия через applyWeapon)
  // ═══════════════════════════════════════════════════════════════
  let WEAPON_W = 0, WEAPON_H = 0, TIP_DX = 0, TIP_DY = 0, BULLET_HIT_RADIUS2 = 0;

  const HAND_OFFSET_X      = 10;
  const HAND_OFFSET_Y      = CHAR.spriteH * 0.22;
  const ENEMY_HIT_RADIUS2  = ENEMY.hitRadius ** 2;
  const MAG_PICKUP_RADIUS2 = PICKUP.pickupRadius ** 2;
  const WDROP_RADIUS2      = WEAPON_DROPS_CONFIG.pickupRadius ** 2;
  const CHUNK_SIZE         = MAP_CONFIG.chunkSize;
  const ENCIRCLE_R         = ENEMY.hitRadius - 8; // ~22px — позиция окружения вплотную к игроку

  function refreshWeaponConstants() {
    const w = WEAPONS_CONFIG[currentWeaponKey];
    WEAPON_W           = w.width;
    WEAPON_H           = w.height;
    TIP_DX             = WEAPON_W * 1.30;
    TIP_DY             = -WEAPON_H * 0.10;
    BULLET_HIT_RADIUS2 = w.bulletRadius ** 2;
  }

  // ═══════════════════════════════════════════════════════════════
  // ВВОД — клавиатура и мышь
  // ═══════════════════════════════════════════════════════════════
  const isMobile = 'ontouchstart' in window;
  const keys     = {};
  const mouse    = { x: HW, y: HH };
  let mouseHeld  = false;
  let autoFireTimer = 0;
  if (!isMobile) document.body.style.cursor = 'none';

  window.addEventListener('keydown',   e => { keys[e.key] = true; });
  window.addEventListener('keyup',     e => { keys[e.key] = false; });
  window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

  window.addEventListener('mousedown', e => {
    if (e.button !== 0 || gameOver) return;
    mouseHeld = true;
    shoot(); // первый выстрел сразу
    autoFireTimer = WEAPONS_CONFIG[currentWeaponKey].fireRate; // следующий через fireRate
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0) mouseHeld = false;
  });

  // Прицел
  let crosshairSprite = null;
  if (!isMobile && TEX['pistol_crosshair'] && TEX['pistol_crosshair'] !== PIXI.Texture.EMPTY) {
    crosshairSprite = new PIXI.Sprite(TEX['pistol_crosshair']);
    crosshairSprite.anchor.set(0.5);
    crosshairSprite.width = crosshairSprite.height = 40;
    crosshairSprite.alpha = 0.85;
    hudContainer.addChild(crosshairSprite);
  }

  // ═══════════════════════════════════════════════════════════════
  // ТАЧ УПРАВЛЕНИЕ
  // ═══════════════════════════════════════════════════════════════
  const joy = { active: false, id: null, bx: 0, by: 0, dx: 0, dy: 0 };
  const JOY_RADIUS = 45, JOY_DEAD = 8;

  if (isMobile) {
    joyBase.style.display  = 'block';
    shootBtn.style.display = 'flex';
    document.getElementById('hint').style.display = 'none';

    const cv = app.view;
    cv.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX > CW * 0.5 || joy.active) continue;
        joy.active = true; joy.id = t.identifier;
        joy.bx = t.clientX; joy.by = t.clientY; joy.dx = 0; joy.dy = 0;
        joyBase.style.left = joy.bx + 'px'; joyBase.style.top = joy.by + 'px';
      }
    }, { passive: false });

    cv.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== joy.id) continue;
        const dx = t.clientX - joy.bx, dy = t.clientY - joy.by;
        const d = Math.sqrt(dx * dx + dy * dy), c = Math.min(d, JOY_RADIUS);
        joy.dx = d > JOY_DEAD ? (dx / d) * (c / JOY_RADIUS) : 0;
        joy.dy = d > JOY_DEAD ? (dy / d) * (c / JOY_RADIUS) : 0;
        joyThumb.style.transform = `translate(calc(-50% + ${joy.dx * JOY_RADIUS}px), calc(-50% + ${joy.dy * JOY_RADIUS}px))`;
        mouse.x = HW + joy.dx * 200; mouse.y = HH + joy.dy * 200;
      }
    }, { passive: false });

    const endJoy = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joy.id) continue;
        joy.active = false; joy.id = null; joy.dx = 0; joy.dy = 0;
        joyThumb.style.transform = 'translate(-50%,-50%)';
      }
    };
    cv.addEventListener('touchend',    endJoy, { passive: false });
    cv.addEventListener('touchcancel', endJoy, { passive: false });

    cv.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches)
        if (t.clientX > CW * 0.5 && !gameOver) shoot();
    }, { passive: false });

    shootBtn.addEventListener('touchstart', e => {
      e.preventDefault(); shootBtn.classList.add('active');
      if (!gameOver) shoot();
    }, { passive: false });
    shootBtn.addEventListener('touchend', () => shootBtn.classList.remove('active'));
  }

  // ═══════════════════════════════════════════════════════════════
  // КАРТА — процедурные камни
  // ═══════════════════════════════════════════════════════════════
  const rocksCache = new Map();

  function seededRand(seed) {
    let s = seed | 0;
    return () => { s = Math.imul(s, 1664525) + 1013904223 | 0; return (s >>> 0) / 0xffffffff; };
  }

  function getChunkRocks(cx, cy) {
    const key = cx * 10000 + cy;
    if (rocksCache.has(key)) return rocksCache.get(key);
    const rand  = seededRand((cx * 73856093) ^ (cy * 19349663));
    const count = Math.floor(rand() * 3);
    const rocks = [];
    for (let i = 0; i < count; i++)
      rocks.push({
        wx: cx * CHUNK_SIZE + rand() * CHUNK_SIZE,
        wy: cy * CHUNK_SIZE + rand() * CHUNK_SIZE,
        type:  Math.floor(rand() * 3),
        scale: 0.035 + rand() * 0.045,
      });
    rocksCache.set(key, rocks);
    return rocks;
  }

  const rockPool = [], activeRockSprites = [];

  function acquireRockSprite() {
    if (rockPool.length) { const s = rockPool.pop(); s.visible = true; return s; }
    const s = new PIXI.Sprite();
    s.anchor.set(0.5); s.alpha = 0.55; s.blendMode = PIXI.BLEND_MODES.MULTIPLY;
    worldContainer.addChild(s);
    return s;
  }

  function updateRocks() {
    for (const s of activeRockSprites) { s.visible = false; rockPool.push(s); }
    activeRockSprites.length = 0;
    const margin = 200;
    const vpL = player.wx - HW - margin, vpR = player.wx + HW + margin;
    const vpT = player.wy - HH - margin, vpB = player.wy + HH + margin;
    const cxMin = Math.floor(vpL / CHUNK_SIZE), cxMax = Math.floor(vpR / CHUNK_SIZE);
    const cyMin = Math.floor(vpT / CHUNK_SIZE), cyMax = Math.floor(vpB / CHUNK_SIZE);
    for (let cx = cxMin; cx <= cxMax; cx++) {
      for (let cy = cyMin; cy <= cyMax; cy++) {
        for (const r of getChunkRocks(cx, cy)) {
          if (r.wx < vpL || r.wx > vpR || r.wy < vpT || r.wy > vpB) continue;
          const tex = rockTextures[r.type];
          if (!tex || tex === PIXI.Texture.EMPTY) continue;
          const s = acquireRockSprite();
          s.texture = tex;
          const maxSide = Math.max(tex.width, tex.height);
          const sz = maxSide * r.scale;
          s.width  = sz * (tex.width  / maxSide);
          s.height = sz * (tex.height / maxSide);
          s.x = r.wx; s.y = r.wy; s.zIndex = r.wy - 100000;
          activeRockSprites.push(s);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // СПРАЙТЫ ИГРОКА И ОРУЖИЯ
  // ═══════════════════════════════════════════════════════════════
  const playerSprite = new PIXI.Sprite(walkTextures[0]);
  playerSprite.anchor.set(0.5);
  playerSprite.height = CHAR.spriteH;
  playerSprite.width  = walkTextures[0] !== PIXI.Texture.EMPTY
    ? Math.round(CHAR.spriteH * (walkTextures[0].width / walkTextures[0].height)) : CHAR.spriteH;
  worldContainer.addChild(playerSprite);

  const weaponSprite = new PIXI.Sprite();
  weaponSprite.anchor.set(0.30, 0.5);
  worldContainer.addChild(weaponSprite);

  // ── Применить новое оружие ────────────────────────────────────
  function applyWeapon(key) {
    currentWeaponKey = key;
    refreshWeaponConstants();
    const w   = WEAPONS_CONFIG[key];
    const tex = weaponTexSets[key];
    weaponSprite.texture = tex.sprite;
    weaponSprite.width   = w.width;
    weaponSprite.height  = w.height;
    if (crosshairSprite && tex.crosshair !== PIXI.Texture.EMPTY)
      crosshairSprite.texture = tex.crosshair;
    autoFireTimer = 0;

    // Показать название оружия
    weaponLabelText.text  = w.label;
    weaponLabelText.alpha = 1;
    weaponLabelTimer      = 2200;
  }
  applyWeapon('pistol');

  // ═══════════════════════════════════════════════════════════════
  // ПУЛ ПУЛЬ
  // ═══════════════════════════════════════════════════════════════
  const bulletPool = [];
  function acquireBullet() {
    if (bulletPool.length) { const s = bulletPool.pop(); s.visible = true; return s; }
    const s = new PIXI.Sprite();
    s.anchor.set(0.5); s.width = s.height = 52;
    worldContainer.addChild(s);
    return s;
  }

  // ═══════════════════════════════════════════════════════════════
  // ПУЛ ВСПЫШЕК
  // ═══════════════════════════════════════════════════════════════
  const muzzlePool = [];
  function acquireMuzzle() {
    if (muzzlePool.length) { const s = muzzlePool.pop(); s.visible = true; return s; }
    const s = new PIXI.Sprite();
    s.anchor.set(0.5); s.width = s.height = 80;
    hudContainer.addChildAt(s, 0);
    return s;
  }

  // ═══════════════════════════════════════════════════════════════
  // ПУЛ ВРАГОВ
  // ═══════════════════════════════════════════════════════════════
  const enemyPool = [];
  function acquireEnemy() {
    if (enemyPool.length) {
      const ec = enemyPool.pop(); ec.visible = true; ec.alpha = 1; return ec;
    }
    const ec = new PIXI.Container();
    const sp = new PIXI.Sprite(enemyTextures[0]);
    sp.anchor.set(0.5);
    ec.addChild(sp); ec._sprite = sp;
    const flashFilter = new PIXI.ColorMatrixFilter();
    flashFilter.brightness(3, false);
    ec._flashFilter = flashFilter;
    worldContainer.addChild(ec);
    return ec;
  }

  // ═══════════════════════════════════════════════════════════════
  // ПУЛ МАГАЗИНОВ
  // ═══════════════════════════════════════════════════════════════
  const pickupPool = [];
  const pickups    = [];

  function acquirePickupSprite() {
    if (pickupPool.length) { const s = pickupPool.pop(); s.visible = true; return s; }
    const s = new PIXI.Sprite(magazinTex !== PIXI.Texture.EMPTY ? magazinTex : PIXI.Texture.WHITE);
    s.anchor.set(0.5); s.width = 44; s.height = 44;
    worldContainer.addChild(s);
    return s;
  }

  function spawnMagazine(wx, wy) {
    const sp = acquirePickupSprite();
    sp.x = wx; sp.y = wy; sp.zIndex = wy - 90000;
    sp.alpha = 1; sp.width = 44; sp.height = 44;
    pickups.push({ wx, wy, sprite: sp, bob: Math.random() * Math.PI * 2 });
  }

  function spawnMagazineNearPlayer() {
    const angle = Math.random() * Math.PI * 2;
    const dist  = PICKUP.spawnMinDist + Math.random() * (PICKUP.spawnMaxDist - PICKUP.spawnMinDist);
    spawnMagazine(player.wx + Math.cos(angle) * dist, player.wy + Math.sin(angle) * dist);
  }

  // ═══════════════════════════════════════════════════════════════
  // ДРОПЫ ОРУЖИЙ
  // ═══════════════════════════════════════════════════════════════
  const weaponDropPool = [];
  const weaponDrops    = [];

  function acquireWeaponDropSprite() {
    if (weaponDropPool.length) { const s = weaponDropPool.pop(); s.visible = true; return s; }
    const s = new PIXI.Sprite();
    s.anchor.set(0.5);
    worldContainer.addChild(s);
    return s;
  }

  function spawnWeaponDrop(wx, wy, weaponKey) {
    const sp  = acquireWeaponDropSprite();
    const w   = WEAPONS_CONFIG[weaponKey];
    const tex = weaponTexSets[weaponKey].sprite;
    sp.texture = tex;
    // Масштаб для дропа — чуть меньше реального
    const targetW = Math.min(w.width * 0.8, 60);
    const ratio   = w.height / w.width;
    sp.width  = targetW;
    sp.height = targetW * ratio;
    sp.x = wx; sp.y = wy;
    sp.zIndex = wy - 89000;
    sp.alpha = 1;
    weaponDrops.push({ wx, wy, weaponKey, sprite: sp, bob: Math.random() * Math.PI * 2 });
  }

  function spawnWeaponDropNear(forceKey) {
    const allKeys = Object.keys(WEAPONS_CONFIG);
    const others  = allKeys.filter(k => k !== currentWeaponKey);
    const key     = forceKey || others[Math.floor(Math.random() * others.length)];
    const angle   = Math.random() * Math.PI * 2;
    const dist    = WEAPON_DROPS_CONFIG.spawnMinDist
                  + Math.random() * (WEAPON_DROPS_CONFIG.spawnMaxDist - WEAPON_DROPS_CONFIG.spawnMinDist);
    spawnWeaponDrop(player.wx + Math.cos(angle) * dist, player.wy + Math.sin(angle) * dist, key);
  }

  // ═══════════════════════════════════════════════════════════════
  // СОСТОЯНИЕ ИГРЫ
  // ═══════════════════════════════════════════════════════════════
  let gameOver        = false;
  let spawnTimer      = 0;
  let killCount       = 0;
  let ammo            = PICKUP.ammoStart;
  let magSpawnTimer   = 0;
  let dropSpawnTimer  = 0;
  let noAmmoTimer     = 0;
  let shakeAmount     = 0;
  let gameStartTime   = 0;
  let enemySpawnCount = 0;

  const player = {
    wx: 0, wy: 0,
    frame: 0, frameTimer: 0, frameDelay: 85,
    speed: CHAR.speed,
    facingLeft: false, moving: false,
    hp: CHAR.maxHp,
    damageCooldown: 0, hitFlash: 0,
  };

  const bullets       = [];
  const muzzleFlashes = [];
  const enemies       = [];

  // ═══════════════════════════════════════════════════════════════
  // ХЕЛПЕРЫ
  // ═══════════════════════════════════════════════════════════════
  function getAngleToMouse() { return Math.atan2(mouse.y - HH, mouse.x - HW); }

  const _handPos = { x: 0, y: 0 };
  function getHandPos() {
    const flip = player.facingLeft ? -1 : 1;
    _handPos.x = HW + HAND_OFFSET_X * flip;
    _handPos.y = HH + HAND_OFFSET_Y;
    return _handPos;
  }

  function getBarrelTip() {
    const h = getHandPos(), a = getAngleToMouse();
    const ca = Math.cos(a), sa = Math.sin(a);
    const sx = h.x + ca * TIP_DX - sa * TIP_DY;
    const sy = h.y + sa * TIP_DX + ca * TIP_DY;
    return { sx, sy, wx: player.wx + (sx - HW), wy: player.wy + (sy - HH) };
  }

  function updateAmmoHUD() {
    ammoText.text       = `🔫 ${ammo}`;
    ammoText.style.fill = ammo <= PICKUP.ammoLow ? 0xff4444 : 0xffffff;
  }

  // ═══════════════════════════════════════════════════════════════
  // ВЫСТРЕЛ
  // ═══════════════════════════════════════════════════════════════
  function shoot() {
    const w = WEAPONS_CONFIG[currentWeaponKey];
    if (w.fireMode === 'auto' && bullets.length >= w.maxBullets) return;
    if (ammo <= 0) {
      noAmmoTimer = 1500; noAmmoText.visible = true; return;
    }

    ammo = Math.max(0, ammo - w.ammoPerShot);
    updateAmmoHUD();
    shakeAmount = w.fireMode === 'auto' ? 4 : 7;

    const tip       = getBarrelTip();
    const baseAngle = getAngleToMouse();
    const texSet    = weaponTexSets[currentWeaponKey];

    // ── Пули ─────────────────────────────────────────────────────
    for (let b = 0; b < w.bulletsPerShot; b++) {
      // Угловой разброс (для автомата)
      const spread = w.angleSpread ? (Math.random() - 0.5) * w.angleSpread * 2 : 0;
      const angle  = baseAngle + spread;

      // Перпендикулярный сдвиг (для дробовика — 2 параллельные пули)
      let bwx = tip.wx, bwy = tip.wy;
      if (w.bulletsPerShot > 1 && w.perpSpread > 0) {
        const perpAngle = baseAngle + Math.PI / 2;
        const offset    = (b - (w.bulletsPerShot - 1) / 2) * w.perpSpread;
        bwx += Math.cos(perpAngle) * offset;
        bwy += Math.sin(perpAngle) * offset;
      }

      const bs = acquireBullet();
      bs.texture = texSet.bullet;
      bs.x = bwx; bs.y = bwy; bs.rotation = angle; bs.alpha = 1;
      bullets.push({
        wx: bwx, wy: bwy,
        vx: Math.cos(angle) * w.bulletSpeed,
        vy: Math.sin(angle) * w.bulletSpeed,
        life: 1, sprite: bs,
      });
    }

    // ── Вспышка ───────────────────────────────────────────────────
    const ms = acquireMuzzle();
    ms.texture = texSet.muzzle;
    ms.x = tip.sx; ms.y = tip.sy; ms.rotation = baseAngle; ms.alpha = 1;
    muzzleFlashes.push({ life: 1, sprite: ms });
  }

  // ═══════════════════════════════════════════════════════════════
  // СПАВН ВРАГА — с угловым слотом для окружения
  // ═══════════════════════════════════════════════════════════════
  function spawnEnemy() {
    if (enemies.length >= GAME.maxEnemies) return;

    // Угол спавна — откуда появится враг
    const spawnAngle = Math.random() * Math.PI * 2;
    const dist       = GAME.spawnRadius + Math.random() * 200;
    const ex         = player.wx + Math.cos(spawnAngle) * dist;
    const ey         = player.wy + Math.sin(spawnAngle) * dist;

    // Предпочтительный угол для окружения (8 равных секторов по кругу)
    const SLOTS = 8;
    const preferredAngle = ((enemySpawnCount % SLOTS) / SLOTS) * Math.PI * 2;
    enemySpawnCount++;

    const ec = acquireEnemy();
    ec.x = ex; ec.y = ey;
    const sp = ec._sprite;
    sp.texture = enemyTextures[0]; sp.height = ENEMY.spriteH;
    sp.width   = Math.round(ENEMY.spriteH * (enemyTextures[0].width / enemyTextures[0].height || 1));

    enemies.push({
      wx: ex, wy: ey,
      frame: 0, frameTimer: 0, frameDelay: ENEMY.frameDelay,
      hp: ENEMY.hp, hitFlash: 0,
      dead: false, dying: 0,
      ec,
      preferredAngle,  // угол, с которого враг занимает позицию вокруг игрока
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // HUD — HP бар
  // ═══════════════════════════════════════════════════════════════
  let _lastHp = -1;
  function drawHealthBar() {
    if (player.hp === _lastHp) return;
    _lastHp = player.hp;
    const barW = 200, barH = 14;
    const barX = HW - barW / 2, barY = 16;
    const ratio = player.hp / CHAR.maxHp;
    hpGfx.clear();
    hpGfx.beginFill(0x000000, 0.55).drawRect(barX - 3, barY - 3, barW + 6, barH + 6).endFill();
    hpGfx.beginFill(0x222222).drawRect(barX, barY, barW, barH).endFill();
    const r = Math.round(255 * (1 - ratio));
    const g = Math.round(210 * ratio);
    hpGfx.beginFill((r << 16) | (g << 8) | 30).drawRect(barX, barY, barW * ratio, barH).endFill();
    hpGfx.lineStyle(1, 0xFFFFFF, 0.2).drawRect(barX, barY, barW, barH);
    killText.x = barX + barW + 10; killText.y = barY - 1;
    ammoText.anchor.set(0, 0);
    ammoText.x = barX; ammoText.y = barY + barH + 6;
    noAmmoText.x = HW; noAmmoText.y = barY + barH + 32;
    weaponLabelText.x = barX; weaponLabelText.y = barY + barH + 24;
  }

  // ═══════════════════════════════════════════════════════════════
  // ЖДЁМ КЛИКА НА ГЛАВНОМ ЭКРАНЕ
  // ═══════════════════════════════════════════════════════════════
  await new Promise(resolve => {
    startBtn.addEventListener('click', () => {
      menuEl.style.display = 'none';
      resolve();
    }, { once: true });
  });

  // ═══════════════════════════════════════════════════════════════
  // СТАРТ ИГРЫ
  // ═══════════════════════════════════════════════════════════════
  gameStartTime = Date.now();
  await Hub.onGameStart();

  // Начальные спавны
  spawnEnemy(); spawnEnemy(); spawnEnemy();
  spawnMagazineNearPlayer(); spawnMagazineNearPlayer(); spawnMagazineNearPlayer();
  // Один дроп оружия рядом со стартом
  spawnWeaponDropNear();
  updateAmmoHUD();
  drawHealthBar();

  // ═══════════════════════════════════════════════════════════════
  // ИГРОВОЙ ЦИКЛ
  // ═══════════════════════════════════════════════════════════════
  app.ticker.maxFPS = 60;
  app.ticker.add(() => {
    if (gameOver) return;
    const dt = Math.min(app.ticker.deltaMS, 50);
    const w  = WEAPONS_CONFIG[currentWeaponKey];

    // ── Авто-огонь (зажатая кнопка) ──────────────────────────────
    if (mouseHeld && w.fireMode === 'auto') {
      autoFireTimer -= dt;
      if (autoFireTimer <= 0) {
        shoot();
        autoFireTimer = w.fireRate;
      }
    }

    // ── Спавн врагов ──────────────────────────────────────────────
    spawnTimer += dt;
    if (spawnTimer >= GAME.spawnInterval) {
      spawnTimer = 0; spawnEnemy();
      if (killCount > 5)  spawnEnemy();
      if (killCount > 15) spawnEnemy();
    }

    // ── Спавн магазинов ───────────────────────────────────────────
    magSpawnTimer += dt;
    if (magSpawnTimer >= PICKUP.spawnInterval) {
      magSpawnTimer = 0; spawnMagazineNearPlayer();
    }

    // ── Спавн дропов оружий ───────────────────────────────────────
    dropSpawnTimer += dt;
    if (dropSpawnTimer >= WEAPON_DROPS_CONFIG.spawnInterval) {
      dropSpawnTimer = 0; spawnWeaponDropNear();
    }

    // ── Движение игрока ───────────────────────────────────────────
    const left  = keys['ArrowLeft']  || keys['a'] || keys['A'] || (isMobile && joy.dx < -0.2);
    const right = keys['ArrowRight'] || keys['d'] || keys['D'] || (isMobile && joy.dx >  0.2);
    const up    = keys['ArrowUp']    || keys['w'] || keys['W'] || (isMobile && joy.dy < -0.2);
    const down  = keys['ArrowDown']  || keys['s'] || keys['S'] || (isMobile && joy.dy >  0.2);
    player.moving = left || right || up || down;

    if (isMobile && joy.active) {
      player.wx += joy.dx * player.speed; player.wy += joy.dy * player.speed;
    } else {
      if (left)  player.wx -= player.speed;
      if (right) player.wx += player.speed;
      if (up)    player.wy -= player.speed;
      if (down)  player.wy += player.speed;
    }

    player.facingLeft = mouse.x < HW;
    if (player.damageCooldown > 0) player.damageCooldown -= dt;
    if (player.hitFlash > 0)       player.hitFlash -= dt;

    if (player.moving) {
      player.frameTimer += dt;
      if (player.frameTimer >= player.frameDelay) {
        player.frameTimer = 0;
        player.frame = (player.frame + 1) % CHAR.frameCount;
      }
    } else { player.frame = 0; }

    // ── Подбор магазинов ──────────────────────────────────────────
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.bob += dt * 0.003;
      p.sprite.y = p.wy + Math.sin(p.bob) * 5;
      const sc = 0.9 + Math.sin(p.bob) * 0.1;
      p.sprite.width = 44 * sc; p.sprite.height = 44 * sc;
      const dx = player.wx - p.wx, dy = player.wy - p.wy;
      if (dx * dx + dy * dy < MAG_PICKUP_RADIUS2) {
        if (ammo < PICKUP.ammoMax) {
          ammo = Math.min(PICKUP.ammoMax, ammo + PICKUP.ammoPerPickup);
          updateAmmoHUD();
          if (noAmmoTimer > 0) { noAmmoTimer = 0; noAmmoText.visible = false; }
        }
        p.sprite.visible = false; pickupPool.push(p.sprite); pickups.splice(i, 1);
      }
    }

    // ── Подбор дропов оружий ──────────────────────────────────────
    for (let i = weaponDrops.length - 1; i >= 0; i--) {
      const d = weaponDrops[i];
      d.bob += dt * 0.0025;
      d.sprite.y = d.wy + Math.sin(d.bob) * 6;
      // Пульсация
      const sc = 0.88 + Math.sin(d.bob) * 0.12;
      const wc = WEAPONS_CONFIG[d.weaponKey];
      const tw = Math.min(wc.width * 0.8, 60) * sc;
      d.sprite.width  = tw;
      d.sprite.height = tw * (wc.height / wc.width);

      const dx = player.wx - d.wx, dy = player.wy - d.wy;
      if (dx * dx + dy * dy < WDROP_RADIUS2) {
        d.sprite.visible = false;
        weaponDropPool.push(d.sprite);
        weaponDrops.splice(i, 1);
        applyWeapon(d.weaponKey);
        Hub.track('weapon_picked_up', { weapon: d.weaponKey });
      }
    }

    // ── Нет патронов — мигание ────────────────────────────────────
    if (noAmmoTimer > 0) {
      noAmmoTimer -= dt;
      noAmmoText.visible = Math.floor(noAmmoTimer / 200) % 2 === 0;
      if (noAmmoTimer <= 0) noAmmoText.visible = false;
    }

    // ── Метка оружия — плавное исчезание ─────────────────────────
    if (weaponLabelTimer > 0) {
      weaponLabelTimer -= dt;
      weaponLabelText.alpha = Math.min(1, weaponLabelTimer / 400);
      if (weaponLabelTimer <= 0) { weaponLabelText.text = ''; weaponLabelText.alpha = 0; }
    }

    // ── Пули ──────────────────────────────────────────────────────
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.wx += b.vx; b.wy += b.vy;
      b.life -= dt / 2000;
      if (b.life <= 0) {
        b.sprite.visible = false; bulletPool.push(b.sprite); bullets.splice(i, 1); continue;
      }
      b.sprite.x = b.wx; b.sprite.y = b.wy;
      b.sprite.alpha = Math.min(1, b.life * 2);
      let hit = false;
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = b.wx - e.wx, dy = b.wy - e.wy;
        if (dx * dx + dy * dy < BULLET_HIT_RADIUS2) {
          e.hp--; e.hitFlash = 100;
          if (e.hp <= 0) {
            e.dead = true; e.dying = 400; killCount++;
            killText.text = `💀 ${killCount}`;
            shakeAmount = Math.max(shakeAmount, 12);
            Hub.track('enemy_killed', { killCount });
          }
          hit = true; break;
        }
      }
      if (hit) { b.sprite.visible = false; bulletPool.push(b.sprite); bullets.splice(i, 1); }
    }

    // ── Вспышки выстрела ──────────────────────────────────────────
    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
      const f = muzzleFlashes[i];
      f.life -= dt / 80;
      if (f.life <= 0) { f.sprite.visible = false; muzzlePool.push(f.sprite); muzzleFlashes.splice(i, 1); continue; }
      f.sprite.alpha = Math.min(1, f.life);
    }

    // ── AI врагов — ОКРУЖЕНИЕ ──────────────────────────────────────
    // Каждый враг занимает свой угловой сектор вокруг игрока.
    // Вместо того чтобы все идти в одну точку, они расходятся по кругу.
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];

      if (e.dead) {
        e.dying -= dt;
        if (e.dying <= 0) { e.ec.visible = false; enemyPool.push(e.ec); enemies.splice(i, 1); continue; }
        e.ec.alpha = Math.max(0, e.dying / 400);
        continue;
      }

      if (e.hitFlash > 0) e.hitFlash -= dt;

      const dx = player.wx - e.wx, dy = player.wy - e.wy;
      const dist2 = dx * dx + dy * dy;

      if (dist2 > ENEMY_HIT_RADIUS2) {
        // Целевая позиция — точка на окружности вокруг игрока со своим углом
        const targetX = player.wx + Math.cos(e.preferredAngle) * ENCIRCLE_R;
        const targetY = player.wy + Math.sin(e.preferredAngle) * ENCIRCLE_R;
        const tdx = targetX - e.wx, tdy = targetY - e.wy;
        const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
        if (tdist > 1) {
          e.wx += (tdx / tdist) * ENEMY.speed;
          e.wy += (tdy / tdist) * ENEMY.speed;
        }
        e.frameTimer += dt;
        if (e.frameTimer >= e.frameDelay) { e.frameTimer = 0; e.frame = (e.frame + 1) % ENEMY.frameCount; }
      } else {
        // Врага в зоне атаки — наносит урон
        if (player.damageCooldown <= 0) {
          player.hp = Math.max(0, player.hp - ENEMY.damage);
          player.damageCooldown = GAME.damageCooldown;
          player.hitFlash = 350;
          if (player.hp <= 0) {
            gameOver = true;
            gameoverEl.classList.add('show');
            Hub.reportGameOver({ kills: killCount, timePlayed: Date.now() - gameStartTime });
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // РЕНДЕР
    // ══════════════════════════════════════════════════════════════
    shakeAmount *= GAME.shakeDecay;
    const sx = shakeAmount > 0.3 ? (Math.random() - 0.5) * shakeAmount * 2 : 0;
    const sy = shakeAmount > 0.3 ? (Math.random() - 0.5) * shakeAmount * 2 : 0;
    worldContainer.x = HW - player.wx + sx;
    worldContainer.y = HH - player.wy + sy;

    groundTiles.forEach(t => {
      if (t) { t.tilePosition.x = -player.wx; t.tilePosition.y = -player.wy; }
    });

    if (player.hitFlash > 0) {
      vignetteGfx.visible = true;
      vignetteGfx.alpha   = (player.hitFlash / 350) * 0.38;
    } else {
      vignetteGfx.visible = false;
    }

    updateRocks();

    // Персонаж
    const pTex = walkTextures[player.frame];
    playerSprite.texture = pTex;
    playerSprite.height  = CHAR.spriteH;
    playerSprite.width   = pTex !== PIXI.Texture.EMPTY
      ? Math.round(CHAR.spriteH * (pTex.width / pTex.height)) : CHAR.spriteH;
    if (player.facingLeft) playerSprite.scale.x = -Math.abs(playerSprite.scale.x);
    else                   playerSprite.scale.x =  Math.abs(playerSprite.scale.x);
    playerSprite.x = player.wx; playerSprite.y = player.wy;
    playerSprite.zIndex = player.wy;

    // Оружие
    const h     = getHandPos();
    const angle = getAngleToMouse();
    const flipY = Math.abs(angle) > Math.PI / 2;
    weaponSprite.x        = player.wx + (h.x - HW);
    weaponSprite.y        = player.wy + (h.y - HH);
    weaponSprite.rotation = angle;
    if (flipY) weaponSprite.scale.y = -Math.abs(weaponSprite.scale.y);
    else       weaponSprite.scale.y =  Math.abs(weaponSprite.scale.y);
    weaponSprite.zIndex = player.wy + 1;

    // Враги
    for (const e of enemies) {
      const ec = e.ec, sp = ec._sprite;
      ec.x = e.wx; ec.y = e.wy; ec.zIndex = e.wy;
      if (!e.dead) ec.alpha = 1;
      const eTex = enemyTextures[e.frame];
      if (eTex && eTex !== PIXI.Texture.EMPTY && sp.texture !== eTex) {
        sp.texture = eTex; sp.height = ENEMY.spriteH;
        sp.width   = Math.round(ENEMY.spriteH * (eTex.width / eTex.height));
      }
      const facingLeft = (player.wx - e.wx) < 0;
      if (facingLeft) sp.scale.x = -Math.abs(sp.scale.x);
      else            sp.scale.x =  Math.abs(sp.scale.x);
      if (!e.dead && e.hitFlash > 0) sp.filters = [ec._flashFilter];
      else                           sp.filters = null;
    }

    worldContainer.sortChildren();
    drawHealthBar();

    if (crosshairSprite) { crosshairSprite.x = mouse.x; crosshairSprite.y = mouse.y; }
  });

})();