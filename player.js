// ═══════════════════════════════════════════════════════════════════
// player.js — Игрок: состояние, ввод, оружие, стрельба
// ═══════════════════════════════════════════════════════════════════

import { CHARACTERS, WEAPONS_CONFIG, PICKUPS_CONFIG } from './config.js';

export function createPlayer({
  worldContainer,
  hudContainer,
  walkTextures,
  weaponTexSets,
  getViewport,
  onNoAmmo,
  onShake,
  onWeaponChanged,
}) {
  const CHAR   = CHARACTERS.hero;
  const PICKUP = PICKUPS_CONFIG.magazine;

  const isMobile = 'ontouchstart' in window;

  // ── Состояние игрока ──────────────────────────────────────────────
  const player = {
    wx: 0, wy: 0,
    frame: 0, frameTimer: 0, frameDelay: 85,
    speed: CHAR.speed,
    facingLeft: false, moving: false,
    hp: CHAR.maxHp,
    damageCooldown: 0, hitFlash: 0,
  };

  let ammo             = PICKUP.ammoStart;
  let currentWeaponKey = 'pistol';
  let WEAPON_W = 0, WEAPON_H = 0, TIP_DX = 0, TIP_DY = 0, BULLET_HIT_RADIUS2 = 0;

  const HAND_OFFSET_X = 10;
  const HAND_OFFSET_Y = CHAR.spriteH * 0.22;

  // ── Спрайты ───────────────────────────────────────────────────────
  const playerSprite = new PIXI.Sprite(walkTextures[0]);
  playerSprite.anchor.set(0.5);
  playerSprite.height = CHAR.spriteH;
  playerSprite.width  = walkTextures[0] !== PIXI.Texture.EMPTY
    ? Math.round(CHAR.spriteH * (walkTextures[0].width / walkTextures[0].height)) : CHAR.spriteH;
  worldContainer.addChild(playerSprite);

  const weaponSprite = new PIXI.Sprite();
  weaponSprite.anchor.set(0.30, 0.5);
  worldContainer.addChild(weaponSprite);

  let crosshairSprite = null;

  // ── Ввод — клавиатура и мышь ──────────────────────────────────────
  const keys  = {};
  const mouse = { x: 0, y: 0 };
  let mouseHeld     = false;
  let autoFireTimer = 0;

  if (!isMobile) document.body.style.cursor = 'none';

  window.addEventListener('keydown', e => { keys[e.key] = true; });
  window.addEventListener('keyup',   e => { keys[e.key] = false; });

  window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  window.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    mouseHeld = true;
    _shoot();
    autoFireTimer = WEAPONS_CONFIG[currentWeaponKey].fireRate;
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) mouseHeld = false; });

  // ── Тач управление ────────────────────────────────────────────────
  const joy = {
    active: false, id: null,
    bx: 0, by: 0,
    dx: 0, dy: 0,
  };
  const JOY_RADIUS = 45, JOY_DEAD = 8;

  const joyBase  = document.getElementById('joystick-base');
  const joyThumb = document.getElementById('joystick-thumb');
  const shootBtn = document.getElementById('shoot-btn');

  if (isMobile) {
    // Кнопка стрельбы видна сразу, джойстик — только при касании
    shootBtn.style.display = 'flex';

    const cv = document.querySelector('canvas') || document.body;

    // ── Начало касания ────────────────────────────────────────────
    cv.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const onLeftSide = t.clientX < getViewport().CW * 0.5;

        if (onLeftSide && !joy.active) {
          // Показываем джойстик ТАМ где тронули
          joy.active = true;
          joy.id     = t.identifier;
          joy.bx     = t.clientX;
          joy.by     = t.clientY;
          joy.dx     = 0;
          joy.dy     = 0;

          joyBase.style.left    = joy.bx + 'px';
          joyBase.style.top     = joy.by + 'px';
          joyBase.style.display = 'block';
          joyThumb.style.transform = 'translate(-50%, -50%)';
        }
      }
    }, { passive: false });

    // ── Движение ──────────────────────────────────────────────────
    cv.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== joy.id) continue;

        const dgx = t.clientX - joy.bx;
        const dgy = t.clientY - joy.by;
        const d   = Math.sqrt(dgx * dgx + dgy * dgy);
        const c   = Math.min(d, JOY_RADIUS);

        joy.dx = d > JOY_DEAD ? (dgx / d) * (c / JOY_RADIUS) : 0;
        joy.dy = d > JOY_DEAD ? (dgy / d) * (c / JOY_RADIUS) : 0;

        const vx = d > JOY_DEAD ? (dgx / d) * c : 0;
        const vy = d > JOY_DEAD ? (dgy / d) * c : 0;
        joyThumb.style.transform = `translate(calc(-50% + ${vx}px), calc(-50% + ${vy}px))`;

        mouse.x = joy.bx + joy.dx * 200;
        mouse.y = joy.by + joy.dy * 200;
      }
    }, { passive: false });

    // ── Конец касания — скрываем джойстик ─────────────────────────
    const endJoy = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joy.id) continue;
        joy.active = false;
        joy.id     = null;
        joy.dx     = 0;
        joy.dy     = 0;
        joyBase.style.display    = 'none';
        joyThumb.style.transform = 'translate(-50%, -50%)';
      }
    };
    cv.addEventListener('touchend',    endJoy, { passive: false });
    cv.addEventListener('touchcancel', endJoy, { passive: false });

    // ── Стрельба касанием по правой стороне ───────────────────────
    cv.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX > getViewport().CW * 0.5) _shoot();
      }
    }, { passive: false });

    // ── Кнопка стрельбы ───────────────────────────────────────────
    shootBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      shootBtn.classList.add('active');
      _shoot();
    }, { passive: false });
    shootBtn.addEventListener('touchend', () => shootBtn.classList.remove('active'));
  }

  // ── Пул пуль ──────────────────────────────────────────────────────
  const bulletPool = [];
  const bullets    = [];

  function acquireBullet() {
    if (bulletPool.length) { const s = bulletPool.pop(); s.visible = true; return s; }
    const s = new PIXI.Sprite();
    s.anchor.set(0.5); s.width = s.height = 52;
    worldContainer.addChild(s);
    return s;
  }

  // ── Пул вспышек ───────────────────────────────────────────────────
  const muzzlePool    = [];
  const muzzleFlashes = [];

  function acquireMuzzle() {
    if (muzzlePool.length) { const s = muzzlePool.pop(); s.visible = true; return s; }
    const s = new PIXI.Sprite();
    s.anchor.set(0.5); s.width = s.height = 80;
    hudContainer.addChildAt(s, 0);
    return s;
  }

  // ── Хелперы позиции ───────────────────────────────────────────────
  function getAngleToMouse() {
    const { HW, HH } = getViewport();
    return Math.atan2(mouse.y - HH, mouse.x - HW);
  }

  const _handPos = { x: 0, y: 0 };
  function getHandPos() {
    const { HW, HH } = getViewport();
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
    const { HW, HH } = getViewport();
    return { sx, sy, wx: player.wx + (sx - HW), wy: player.wy + (sy - HH) };
  }

  // ── Применить оружие ──────────────────────────────────────────────
  function refreshWeaponConstants() {
    const w = WEAPONS_CONFIG[currentWeaponKey];
    WEAPON_W           = w.width;
    WEAPON_H           = w.height;
    TIP_DX             = WEAPON_W * 1.30;
    TIP_DY             = -WEAPON_H * 0.10;
    BULLET_HIT_RADIUS2 = w.bulletRadius ** 2;
  }

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
    onWeaponChanged(key, w.label);
  }

  const firstCrosshair = weaponTexSets['pistol'].crosshair;
  if (!isMobile && firstCrosshair && firstCrosshair !== PIXI.Texture.EMPTY) {
    crosshairSprite = new PIXI.Sprite(firstCrosshair);
    crosshairSprite.anchor.set(0.5);
    crosshairSprite.width = crosshairSprite.height = 40;
    crosshairSprite.alpha = 0.85;
    hudContainer.addChild(crosshairSprite);
  }

  applyWeapon('pistol');

  // ── Выстрел ───────────────────────────────────────────────────────
  function _shoot() {
    const w = WEAPONS_CONFIG[currentWeaponKey];
    if (w.fireMode === 'auto' && bullets.length >= w.maxBullets) return;
    if (ammo <= 0) { onNoAmmo(); return; }
    ammo = Math.max(0, ammo - w.ammoPerShot);

    onShake(w.fireMode === 'auto' ? 4 : 7);

    const tip       = getBarrelTip();
    const baseAngle = getAngleToMouse();
    const texSet    = weaponTexSets[currentWeaponKey];

    for (let b = 0; b < w.bulletsPerShot; b++) {
      const spread = w.angleSpread ? (Math.random() - 0.5) * w.angleSpread * 2 : 0;
      const angle  = baseAngle + spread;

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
      bullets.push({ wx: bwx, wy: bwy, vx: Math.cos(angle) * w.bulletSpeed, vy: Math.sin(angle) * w.bulletSpeed, life: 1, sprite: bs });
    }

    const ms = acquireMuzzle();
    ms.texture = texSet.muzzle;
    ms.x = tip.sx; ms.y = tip.sy; ms.rotation = baseAngle; ms.alpha = 1;
    muzzleFlashes.push({ life: 1, sprite: ms });
  }

  // ── Обновление ────────────────────────────────────────────────────
  function update(dt, checkBulletHit) {
    const w = WEAPONS_CONFIG[currentWeaponKey];

    if (mouseHeld && w.fireMode === 'auto') {
      autoFireTimer -= dt;
      if (autoFireTimer <= 0) { _shoot(); autoFireTimer = w.fireRate; }
    }

    const left  = keys['ArrowLeft']  || keys['a'] || keys['A'] || (isMobile && joy.dx < -0.2);
    const right = keys['ArrowRight'] || keys['d'] || keys['D'] || (isMobile && joy.dx >  0.2);
    const up    = keys['ArrowUp']    || keys['w'] || keys['W'] || (isMobile && joy.dy < -0.2);
    const down  = keys['ArrowDown']  || keys['s'] || keys['S'] || (isMobile && joy.dy >  0.2);
    player.moving = left || right || up || down;

    if (isMobile && joy.active) {
      player.wx += joy.dx * player.speed;
      player.wy += joy.dy * player.speed;
    } else {
      if (left)  player.wx -= player.speed;
      if (right) player.wx += player.speed;
      if (up)    player.wy -= player.speed;
      if (down)  player.wy += player.speed;
    }

    const { HW } = getViewport();
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

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.wx += b.vx; b.wy += b.vy;
      b.life -= dt / 2000;
      if (b.life <= 0) {
        b.sprite.visible = false; bulletPool.push(b.sprite); bullets.splice(i, 1); continue;
      }
      b.sprite.x = b.wx; b.sprite.y = b.wy;
      b.sprite.alpha = Math.min(1, b.life * 2);
      if (checkBulletHit(b.wx, b.wy, BULLET_HIT_RADIUS2)) {
        b.sprite.visible = false; bulletPool.push(b.sprite); bullets.splice(i, 1);
      }
    }

    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
      const f = muzzleFlashes[i];
      f.life -= dt / 80;
      if (f.life <= 0) { f.sprite.visible = false; muzzlePool.push(f.sprite); muzzleFlashes.splice(i, 1); continue; }
      f.sprite.alpha = Math.min(1, f.life);
    }
  }

  // ── Рендер ────────────────────────────────────────────────────────
  function render() {
    const pTex = walkTextures[player.frame];
    playerSprite.texture = pTex;
    playerSprite.height  = CHAR.spriteH;
    playerSprite.width   = pTex !== PIXI.Texture.EMPTY
      ? Math.round(CHAR.spriteH * (pTex.width / pTex.height)) : CHAR.spriteH;
    if (player.facingLeft) playerSprite.scale.x = -Math.abs(playerSprite.scale.x);
    else                   playerSprite.scale.x =  Math.abs(playerSprite.scale.x);
    playerSprite.x = player.wx; playerSprite.y = player.wy;
    playerSprite.zIndex = player.wy;

    const h     = getHandPos();
    const angle = getAngleToMouse();
    const flipY = Math.abs(angle) > Math.PI / 2;
    weaponSprite.x        = player.wx + (h.x - getViewport().HW);
    weaponSprite.y        = player.wy + (h.y - getViewport().HH);
    weaponSprite.rotation = angle;
    if (flipY) weaponSprite.scale.y = -Math.abs(weaponSprite.scale.y);
    else       weaponSprite.scale.y =  Math.abs(weaponSprite.scale.y);
    weaponSprite.zIndex = player.wy + 1;

    if (crosshairSprite) { crosshairSprite.x = mouse.x; crosshairSprite.y = mouse.y; }
  }

  // ── Публичный API ─────────────────────────────────────────────────
  return {
    update,
    render,
    applyWeapon,
    getState:  () => player,
    getAmmo:   () => ammo,
    addAmmo(n) { ammo = Math.min(PICKUP.ammoMax, ammo + n); },
    isAmmoLow: () => ammo <= PICKUP.ammoLow,
    getCurrentWeaponKey: () => currentWeaponKey,
  };
}