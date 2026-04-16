// ═══════════════════════════════════════════════════════════════════
// world.js — Мир: карта, враги, пикапы, дропы оружий
// ═══════════════════════════════════════════════════════════════════

import { ENEMIES_CONFIG, WEAPONS_CONFIG, PICKUPS_CONFIG, WEAPON_DROPS_CONFIG, MAP_CONFIG, GAME } from './config.js';
import { Hub } from './hub.js';

export function createWorld({
  worldContainer,
  groundLayer,
  TEX,
  rockTextures,
  enemyTextures,
  weaponTexSets,
  magazinTex,
  getPlayer,          // () => player объект
  getViewport,        // () => { CW, CH, HW, HH }
  onKill,             // (killCount) => void
  onPlayerDamage,     // (damage) => void
  onWeaponPicked,     // (weaponKey) => void
  onAmmoPickup,       // () => void
}) {
  const ENEMY  = ENEMIES_CONFIG.zombie;
  const PICKUP = PICKUPS_CONFIG.magazine;

  const ENEMY_HIT_RADIUS2  = ENEMY.hitRadius ** 2;
  const MAG_PICKUP_RADIUS2 = PICKUP.pickupRadius ** 2;
  const WDROP_RADIUS2      = WEAPON_DROPS_CONFIG.pickupRadius ** 2;
  const CHUNK_SIZE         = MAP_CONFIG.chunkSize;
  const ENCIRCLE_R         = ENEMY.hitRadius - 8;

  // ── Фон (tiling) ─────────────────────────────────────────────────
  const groundTiles = MAP_CONFIG.grounds.map((g, i) => {
    const t = TEX[`ground${i}`];
    if (!t || t === PIXI.Texture.EMPTY) return null;
    const { CW, CH } = getViewport();
    const tile = new PIXI.TilingSprite(t, CW, CH);
    tile.alpha     = g.alpha;
    tile.blendMode = PIXI.BLEND_MODES[g.blend] ?? PIXI.BLEND_MODES.NORMAL;
    groundLayer.addChild(tile);
    return tile;
  });

  function onResize() {
    const { CW, CH } = getViewport();
    groundTiles.forEach(t => { if (t) { t.width = CW; t.height = CH; } });
  }

  function updateGroundTiles() {
    const { wx, wy } = getPlayer();
    groundTiles.forEach(t => {
      if (t) { t.tilePosition.x = -wx; t.tilePosition.y = -wy; }
    });
  }

  // ── Процедурные камни ─────────────────────────────────────────────
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
    const { HW, HH } = getViewport();
    const { wx, wy } = getPlayer();
    const margin = 200;
    const vpL = wx - HW - margin, vpR = wx + HW + margin;
    const vpT = wy - HH - margin, vpB = wy + HH + margin;
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

  // ── Пул врагов ────────────────────────────────────────────────────
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

  const enemies = [];
  let enemySpawnCount = 0;
  let killCount = 0;

  function spawnEnemy() {
    if (enemies.length >= GAME.maxEnemies) return;
    const { wx, wy } = getPlayer();
    const spawnAngle = Math.random() * Math.PI * 2;
    const dist       = GAME.spawnRadius + Math.random() * 200;
    const ex         = wx + Math.cos(spawnAngle) * dist;
    const ey         = wy + Math.sin(spawnAngle) * dist;
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
      preferredAngle,
    });
  }

  function updateEnemies(dt) {
    const player = getPlayer();
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
        if (player.damageCooldown <= 0) {
          onPlayerDamage(ENEMY.damage);
        }
      }
    }
  }

  function renderEnemies() {
    const { wx: pwx } = getPlayer();
    for (const e of enemies) {
      const ec = e.ec, sp = ec._sprite;
      ec.x = e.wx; ec.y = e.wy; ec.zIndex = e.wy;
      if (!e.dead) ec.alpha = 1;
      const eTex = enemyTextures[e.frame];
      if (eTex && eTex !== PIXI.Texture.EMPTY && sp.texture !== eTex) {
        sp.texture = eTex; sp.height = ENEMY.spriteH;
        sp.width   = Math.round(ENEMY.spriteH * (eTex.width / eTex.height));
      }
      const facingLeft = (pwx - e.wx) < 0;
      if (facingLeft) sp.scale.x = -Math.abs(sp.scale.x);
      else            sp.scale.x =  Math.abs(sp.scale.x);
      if (!e.dead && e.hitFlash > 0) sp.filters = [ec._flashFilter];
      else                           sp.filters = null;
    }
  }

  // ── Проверка попадания пули во врага ─────────────────────────────
  function checkBulletHit(bx, by, bulletRadius2) {
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = bx - e.wx, dy = by - e.wy;
      if (dx * dx + dy * dy < bulletRadius2) {
        e.hp--; e.hitFlash = 100;
        if (e.hp <= 0) {
          e.dead = true; e.dying = 400; killCount++;
          onKill(killCount);
          Hub.track('enemy_killed', { killCount });
        }
        return true;
      }
    }
    return false;
  }

  // ── Пул магазинов ────────────────────────────────────────────────
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
    const { wx, wy } = getPlayer();
    const angle = Math.random() * Math.PI * 2;
    const dist  = PICKUP.spawnMinDist + Math.random() * (PICKUP.spawnMaxDist - PICKUP.spawnMinDist);
    spawnMagazine(wx + Math.cos(angle) * dist, wy + Math.sin(angle) * dist);
  }

  function updatePickups(dt) {
    const { wx, wy } = getPlayer();
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.bob += dt * 0.003;
      p.sprite.y = p.wy + Math.sin(p.bob) * 5;
      const sc = 0.9 + Math.sin(p.bob) * 0.1;
      p.sprite.width = 44 * sc; p.sprite.height = 44 * sc;
      const dx = wx - p.wx, dy = wy - p.wy;
      if (dx * dx + dy * dy < MAG_PICKUP_RADIUS2) {
        onAmmoPickup();
        p.sprite.visible = false; pickupPool.push(p.sprite); pickups.splice(i, 1);
      }
    }
  }

  // ── Пул дропов оружий ────────────────────────────────────────────
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
    const targetW = Math.min(w.width * 0.8, 60);
    const ratio   = w.height / w.width;
    sp.width  = targetW;
    sp.height = targetW * ratio;
    sp.x = wx; sp.y = wy;
    sp.zIndex = wy - 89000;
    sp.alpha = 1;
    weaponDrops.push({ wx, wy, weaponKey, sprite: sp, bob: Math.random() * Math.PI * 2 });
  }

  function spawnWeaponDropNear(currentWeaponKey, forceKey) {
    const allKeys = Object.keys(WEAPONS_CONFIG);
    const others  = allKeys.filter(k => k !== currentWeaponKey);
    const key     = forceKey || others[Math.floor(Math.random() * others.length)];
    const { wx, wy } = getPlayer();
    const angle   = Math.random() * Math.PI * 2;
    const dist    = WEAPON_DROPS_CONFIG.spawnMinDist
                  + Math.random() * (WEAPON_DROPS_CONFIG.spawnMaxDist - WEAPON_DROPS_CONFIG.spawnMinDist);
    spawnWeaponDrop(wx + Math.cos(angle) * dist, wy + Math.sin(angle) * dist, key);
  }

  function updateWeaponDrops(dt, currentWeaponKey) {
    const { wx, wy } = getPlayer();
    for (let i = weaponDrops.length - 1; i >= 0; i--) {
      const d = weaponDrops[i];
      d.bob += dt * 0.0025;
      d.sprite.y = d.wy + Math.sin(d.bob) * 6;
      const sc = 0.88 + Math.sin(d.bob) * 0.12;
      const wc = WEAPONS_CONFIG[d.weaponKey];
      const tw = Math.min(wc.width * 0.8, 60) * sc;
      d.sprite.width  = tw;
      d.sprite.height = tw * (wc.height / wc.width);

      const dx = wx - d.wx, dy = wy - d.wy;
      if (dx * dx + dy * dy < WDROP_RADIUS2) {
        d.sprite.visible = false;
        weaponDropPool.push(d.sprite);
        weaponDrops.splice(i, 1);
        onWeaponPicked(d.weaponKey);
        Hub.track('weapon_picked_up', { weapon: d.weaponKey });
      }
    }
  }

  // ── Публичный API ─────────────────────────────────────────────────
  return {
    // обновление
    update(dt, currentWeaponKey) {
      updateEnemies(dt);
      updatePickups(dt);
      updateWeaponDrops(dt, currentWeaponKey);
    },
    render() {
      updateRocks();
      updateGroundTiles();
      renderEnemies();
    },
    onResize,
    // спавн
    spawnEnemy,
    spawnMagazineNearPlayer,
    spawnWeaponDropNear,
    // пули
    checkBulletHit,
    // геттеры
    getEnemies: () => enemies,
    getKillCount: () => killCount,
  };
}
