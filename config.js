// ═══════════════════════════════════════════════════════════════════
// config.js — Весь контент игры в одном месте
// ═══════════════════════════════════════════════════════════════════

export const CHARACTERS = {
  hero: {
    spriteFolder: 'walked',
    spritePrefix: 'walk_',
    frameCount:   8,
    speed:        7,
    maxHp:        100,
    spriteH:      85,
  },
};

export const ENEMIES_CONFIG = {
  zombie: {
    spriteFolder: 'enemy1',
    spritePrefix: 'walk_',
    frameCount:   8,
    speed:        1.8,
    hp:           3,
    damage:       18,
    spriteH:      75,
    frameDelay:   110,
    hitRadius:    30,
  },
};

// ── Оружие ─────────────────────────────────────────────────────────
// weaponR2 = пистолет  (стартовое): semi, 1 пуля за клик
// weaponR3 = дробовик:              semi, 2 параллельные пули за клик
// weaponR1 = автомат:               зажать — стреляет непрерывно
export const WEAPONS_CONFIG = {
  pistol: {
    label:          'ПИСТОЛЕТ',
    spriteFile:     'weapon/weaponR2.png',
    bulletFile:     'weapon/bullet.png',
    muzzleFile:     'weapon/muzzle.png',
    crosshairFile:  'weapon/crosshair.png',
    width:          55,
    height:         27,
    bulletSpeed:    14,
    bulletRadius:   28,
    maxBullets:     20,
    fireMode:       'semi',   // один выстрел за клик
    bulletsPerShot: 1,
    perpSpread:     0,        // перпендикулярный разброс (px) между пулями
    angleSpread:    0,        // угловой разброс (рад)
    fireRate:       0,        // мс между авто-выстрелами (не используется в semi)
    ammoPerShot:    1,
  },
  shotgun: {
    label:          'ДРОБОВИК',
    spriteFile:     'weapon/weaponR3.png',
    bulletFile:     'weapon/bullet.png',
    muzzleFile:     'weapon/muzzle.png',
    crosshairFile:  'weapon/crosshair.png',
    width:          72,
    height:         33,
    bulletSpeed:    12,
    bulletRadius:   32,
    maxBullets:     20,
    fireMode:       'semi',
    bulletsPerShot: 2,        // 2 параллельные пули (одна над другой)
    perpSpread:     12,       // 12px между пулями (перпендикулярно стволу)
    angleSpread:    0,
    fireRate:       0,
    ammoPerShot:    1,        // 1 патрон за выстрел (2 пули = 1 заряд)
  },
  auto: {
    label:          'АВТОМАТ',
    spriteFile:     'weapon/weaponR1.png',
    bulletFile:     'weapon/bullet.png',
    muzzleFile:     'weapon/muzzle.png',
    crosshairFile:  'weapon/crosshair.png',
    width:          88,
    height:         35,
    bulletSpeed:    16,
    bulletRadius:   28,
    maxBullets:     30,
    fireMode:       'auto',   // зажать — непрерывная стрельба
    bulletsPerShot: 1,
    perpSpread:     0,
    angleSpread:    0.07,     // небольшой разброс у автомата
    fireRate:       115,      // мс между выстрелами
    ammoPerShot:    1,
  },
};

// ── Подбираемые патроны ────────────────────────────────────────────
export const PICKUPS_CONFIG = {
  magazine: {
    spriteFile:    'weapon/magazin.png',
    ammoPerPickup: 10,
    ammoMax:       100,
    ammoStart:     20,
    ammoLow:       5,
    pickupRadius:  38,
    spawnInterval: 7000,
    spawnMinDist:  250,
    spawnMaxDist:  550,
  },
};

// ── Подбираемые оружия (дропы) ─────────────────────────────────────
export const WEAPON_DROPS_CONFIG = {
  pickupRadius:  48,
  spawnInterval: 20000,   // новый дроп каждые 20 сек
  spawnMinDist:  220,
  spawnMaxDist:  480,
};

// ── Фон и карта ────────────────────────────────────────────────────
export const MAP_CONFIG = {
  grounds: [
    { file: 'phon/ground_white.png',  alpha: 0.90, blend: 'MULTIPLY' },
    { file: 'phon/ground2_white.png', alpha: 0.35, blend: 'MULTIPLY' },
    { file: 'phon/ground3_white.png', alpha: 0.04, blend: 'MULTIPLY' },
  ],
  rocks: [
    'phon/rock1.png',
    'phon/rock2.png',
    'phon/rock3.png',
  ],
  chunkSize: 600,
};

// ── Баланс ─────────────────────────────────────────────────────────
export const GAME = {
  spawnInterval:  3000,
  spawnRadius:    650,
  maxEnemies:     15,
  damageCooldown: 800,
  shakeDecay:     0.85,
};

// ── Авто-сборка карты ассетов ───────────────────────────────────────
export function buildAssetMap() {
  const map = {};

  for (const [charKey, char] of Object.entries(CHARACTERS)) {
    for (let i = 0; i < char.frameCount; i++)
      map[`${charKey}_walk${i}`] = `${char.spriteFolder}/${char.spritePrefix}${i}.png`;
  }

  for (const [enemyKey, enemy] of Object.entries(ENEMIES_CONFIG)) {
    for (let i = 0; i < enemy.frameCount; i++)
      map[`${enemyKey}_walk${i}`] = `${enemy.spriteFolder}/${enemy.spritePrefix}${i}.png`;
  }

  for (const [weaponKey, weapon] of Object.entries(WEAPONS_CONFIG)) {
    map[`${weaponKey}_sprite`]    = weapon.spriteFile;
    map[`${weaponKey}_bullet`]    = weapon.bulletFile;
    map[`${weaponKey}_muzzle`]    = weapon.muzzleFile;
    map[`${weaponKey}_crosshair`] = weapon.crosshairFile;
  }

  for (const [pickupKey, pickup] of Object.entries(PICKUPS_CONFIG))
    map[`${pickupKey}_sprite`] = pickup.spriteFile;

  MAP_CONFIG.grounds.forEach((g, i) => { map[`ground${i}`] = g.file; });
  MAP_CONFIG.rocks.forEach((r, i)   => { map[`rock${i}`]   = r; });

  return map;
}