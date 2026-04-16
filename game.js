// ═══════════════════════════════════════════════════════════════════
// game.js — Оркестратор: PIXI app, HUD, игровой цикл
// ═══════════════════════════════════════════════════════════════════

import { CHARACTERS, PICKUPS_CONFIG, WEAPON_DROPS_CONFIG, MAP_CONFIG, GAME } from './config.js';
import { Hub } from './hub.js';
import { loadAllAssets } from './textures.js';
import { createWorld }   from './world.js';
import { createPlayer }  from './player.js';
import { Sound }         from './sound.js';

(async () => {

  const statusEl   = document.getElementById('status');
  const gameoverEl = document.getElementById('gameover');
  const menuEl     = document.getElementById('mainmenu');
  const startBtn   = document.getElementById('start-btn');
  const gameRoot   = document.getElementById('game-root');

  // ── Определяем ландшафтные размеры ───────────────────────────────
  // На мобильном в портрете: game-root физически повёрнут на 90°,
  // поэтому ширина игры = высота экрана, высота игры = ширина экрана.
  const isMobileDevice = 'ontouchstart' in window;

  function getLandscapeDims() {
    const w = window.innerWidth, h = window.innerHeight;
    // В портрете на мобильном меняем местами
    if (isMobileDevice && h > w) return { W: h, H: w };
    return { W: w, H: h };
  }

  // ═══════════════════════════════════════════════════════════════
  // PIXI APP
  // ═══════════════════════════════════════════════════════════════
  const { W: initW, H: initH } = getLandscapeDims();

  const app = new PIXI.Application({
    width:           initW,
    height:          initH,
    backgroundColor: 0x6b6b8a,
    resolution:      Math.min(window.devicePixelRatio || 1, 2),
    autoDensity:     true,
    antialias:       false,
    powerPreference: 'high-performance',
  });

  // Добавляем canvas в #game-root, а не в body
  gameRoot.appendChild(app.view);
  // Канвас занимает 100% контейнера
  Object.assign(app.view.style, {
    position: 'absolute', top: '0', left: '0',
    width: '100%', height: '100%',
  });

  let CW = initW, CH = initH;
  let HW = CW / 2, HH = CH / 2;
  const getViewport = () => ({ CW, CH, HW, HH });

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

  // ═══════════════════════════════════════════════════════════════
  // HUD
  // ═══════════════════════════════════════════════════════════════
  const vignetteGfx = new PIXI.Graphics();
  vignetteGfx.beginFill(0xff0000).drawRect(0, 0, 9999, 9999).endFill();
  vignetteGfx.alpha = 0; vignetteGfx.visible = false;
  hudContainer.addChild(vignetteGfx);

  const hpGfx = new PIXI.Graphics();
  hudContainer.addChild(hpGfx);

  const killText = new PIXI.Text('💀 0', { fontFamily: 'monospace', fontSize: 11, fill: 0xbbbbbb });
  hudContainer.addChild(killText);

  const PICKUP = PICKUPS_CONFIG.magazine;
  const CHAR   = CHARACTERS.hero;

  const ammoText = new PIXI.Text(`🔫 ${PICKUP.ammoStart}`, { fontFamily: 'monospace', fontSize: 13, fill: 0xffffff });
  hudContainer.addChild(ammoText);

  const noAmmoText = new PIXI.Text('НЕТ ПАТРОНОВ', { fontFamily: 'monospace', fontSize: 16, fill: 0xff3333 });
  noAmmoText.anchor.set(0.5, 0); noAmmoText.visible = false;
  hudContainer.addChild(noAmmoText);

  const weaponLabelText = new PIXI.Text('', {
    fontFamily: 'monospace', fontSize: 13, fill: 0xffcc44,
    dropShadow: true, dropShadowDistance: 0, dropShadowBlur: 8, dropShadowColor: 0xffaa00,
  });
  weaponLabelText.anchor.set(0, 0); weaponLabelText.alpha = 0;
  hudContainer.addChild(weaponLabelText);

  let weaponLabelTimer = 0;
  let noAmmoTimer      = 0;

  function updateAmmoHUD(ammo, isLow) {
    ammoText.text       = `🔫 ${ammo}`;
    ammoText.style.fill = isLow ? 0xff4444 : 0xffffff;
  }

  let _lastHp = -1;
  function drawHealthBar(hp) {
    if (hp === _lastHp) return;
    _lastHp = hp;
    const barW = 200, barH = 14;
    const barX = HW - barW / 2, barY = 16;
    const ratio = hp / CHAR.maxHp;
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
  // ЗАГРУЗКА РЕСУРСОВ
  // ═══════════════════════════════════════════════════════════════
  const { TEX, walkTextures, enemyTextures, weaponTexSets, rockTextures, magazinTex }
    = await loadAllAssets(statusEl);

  startBtn.disabled    = false;
  startBtn.textContent = '▶  НАЧАТЬ ИГРУ';

  // ═══════════════════════════════════════════════════════════════
  // СОСТОЯНИЕ ИГРЫ
  // ═══════════════════════════════════════════════════════════════
  let gameOver       = false;
  let shakeAmount    = 0;
  let spawnTimer     = 0;
  let magSpawnTimer  = 0;
  let dropSpawnTimer = 0;
  let gameStartTime  = 0;

  // ═══════════════════════════════════════════════════════════════
  // СИСТЕМЫ
  // ═══════════════════════════════════════════════════════════════
  const playerSys = createPlayer({
    worldContainer,
    hudContainer,
    walkTextures,
    weaponTexSets,
    getViewport,
    onNoAmmo() {
      noAmmoTimer = 1500; noAmmoText.visible = true;
    },
    onShake(amount) {
      shakeAmount = Math.max(shakeAmount, amount);
    },
    onWeaponChanged(key, label) {
      weaponLabelText.text  = label;
      weaponLabelText.alpha = 1;
      weaponLabelTimer      = 2200;
    },
  });

  const worldSys = createWorld({
    worldContainer,
    groundLayer,
    TEX,
    rockTextures,
    enemyTextures,
    weaponTexSets,
    magazinTex,
    getPlayer:    () => playerSys.getState(),
    getViewport,
    onKill(killCount) {
      killText.text = `💀 ${killCount}`;
      shakeAmount = Math.max(shakeAmount, 12);
    },
    onPlayerDamage(damage) {
      const p = playerSys.getState();
      p.hp = Math.max(0, p.hp - damage);
      p.damageCooldown = GAME.damageCooldown;
      p.hitFlash = 350;
      if (p.hp <= 0 && !gameOver) {
        gameOver = true;
        gameoverEl.classList.add('show');
        Hub.reportGameOver({ kills: worldSys.getKillCount(), timePlayed: Date.now() - gameStartTime });
      }
    },
    onAmmoPickup() {
      playerSys.addAmmo(PICKUP.ammoPerPickup);
      if (noAmmoTimer > 0) { noAmmoTimer = 0; noAmmoText.visible = false; }
      updateAmmoHUD(playerSys.getAmmo(), playerSys.isAmmoLow());
    },
    onWeaponPicked(key) {
      playerSys.applyWeapon(key);
    },
  });

  // ── Resize ────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    const { W, H } = getLandscapeDims();
    CW = W; CH = H; HW = CW / 2; HH = CH / 2;
    app.renderer.resize(CW, CH);
    worldSys.onResize();
    _lastHp = -1; // форсируем перерисовку HP-бара
  });

  // ═══════════════════════════════════════════════════════════════
  // ЖДЁМ КЛИКА НА ГЛАВНОМ ЭКРАНЕ
  // ═══════════════════════════════════════════════════════════════
  await new Promise(resolve => {
    startBtn.addEventListener('click', () => {
      menuEl.style.display = 'none';
      Sound.resume(); // разблокируем AudioContext после жеста
      resolve();
    }, { once: true });
  });

  // ═══════════════════════════════════════════════════════════════
  // СТАРТ ИГРЫ
  // ═══════════════════════════════════════════════════════════════
  gameStartTime = Date.now();
  await Hub.onGameStart();

  worldSys.spawnEnemy(); worldSys.spawnEnemy(); worldSys.spawnEnemy();
  worldSys.spawnMagazineNearPlayer(); worldSys.spawnMagazineNearPlayer(); worldSys.spawnMagazineNearPlayer();
  worldSys.spawnWeaponDropNear(playerSys.getCurrentWeaponKey());

  updateAmmoHUD(playerSys.getAmmo(), playerSys.isAmmoLow());
  drawHealthBar(playerSys.getState().hp);

  // ═══════════════════════════════════════════════════════════════
  // ИГРОВОЙ ЦИКЛ
  // ═══════════════════════════════════════════════════════════════
  app.ticker.maxFPS = 60;
  app.ticker.add(() => {
    if (gameOver) return;
    const dt = Math.min(app.ticker.deltaMS, 50);

    // Обновляем системы
    playerSys.update(dt, (bx, by, r2) => worldSys.checkBulletHit(bx, by, r2));
    worldSys.update(dt, playerSys.getCurrentWeaponKey());

    // Таймеры спавна
    spawnTimer += dt;
    if (spawnTimer >= GAME.spawnInterval) {
      spawnTimer = 0;
      const kc = worldSys.getKillCount();
      worldSys.spawnEnemy();
      if (kc > 5)  worldSys.spawnEnemy();
      if (kc > 15) worldSys.spawnEnemy();
    }

    magSpawnTimer += dt;
    if (magSpawnTimer >= PICKUP.spawnInterval) { magSpawnTimer = 0; worldSys.spawnMagazineNearPlayer(); }

    dropSpawnTimer += dt;
    if (dropSpawnTimer >= WEAPON_DROPS_CONFIG.spawnInterval) {
      dropSpawnTimer = 0;
      worldSys.spawnWeaponDropNear(playerSys.getCurrentWeaponKey());
    }

    // HUD — нет патронов
    if (noAmmoTimer > 0) {
      noAmmoTimer -= dt;
      noAmmoText.visible = Math.floor(noAmmoTimer / 200) % 2 === 0;
      if (noAmmoTimer <= 0) noAmmoText.visible = false;
    }

    // HUD — метка оружия
    if (weaponLabelTimer > 0) {
      weaponLabelTimer -= dt;
      weaponLabelText.alpha = Math.min(1, weaponLabelTimer / 400);
      if (weaponLabelTimer <= 0) { weaponLabelText.text = ''; weaponLabelText.alpha = 0; }
    }

    // Обновление ammo HUD каждый тик (дёшево — Text только если изменился)
    updateAmmoHUD(playerSys.getAmmo(), playerSys.isAmmoLow());

    // Тряска камеры
    shakeAmount *= GAME.shakeDecay;
    const sx = shakeAmount > 0.3 ? (Math.random() - 0.5) * shakeAmount * 2 : 0;
    const sy = shakeAmount > 0.3 ? (Math.random() - 0.5) * shakeAmount * 2 : 0;
    const p  = playerSys.getState();
    worldContainer.x = HW - p.wx + sx;
    worldContainer.y = HH - p.wy + sy;

    // Вспышка урона
    if (p.hitFlash > 0) {
      vignetteGfx.visible = true;
      vignetteGfx.alpha   = (p.hitFlash / 350) * 0.38;
    } else {
      vignetteGfx.visible = false;
    }

    // Рендер
    worldSys.render();
    playerSys.render();
    worldContainer.sortChildren();
    drawHealthBar(p.hp);
  });

})();
