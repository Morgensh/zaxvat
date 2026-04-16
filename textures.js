// ═══════════════════════════════════════════════════════════════════
// textures.js — Загрузка и утилиты текстур
// ═══════════════════════════════════════════════════════════════════

import { CHARACTERS, ENEMIES_CONFIG, WEAPONS_CONFIG, PICKUPS_CONFIG, MAP_CONFIG, buildAssetMap } from './config.js';

// ── Определить непрозрачные границы текстуры (обрезка) ────────────
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

export function croppedTex(rawTex) {
  if (!rawTex || rawTex === PIXI.Texture.EMPTY) return PIXI.Texture.EMPTY;
  const frame = detectPixiBounds(rawTex);
  if (!frame) return rawTex;
  return new PIXI.Texture(rawTex.baseTexture, frame);
}

// ── Загрузить все ассеты, вернуть { TEX, walkTextures, enemyTextures, weaponTexSets, rockTextures, magazinTex } ──
export async function loadAllAssets(statusEl) {
  PIXI.Assets.setPreferences({ preferWorkers: false, preferCreateImageBitmap: false });

  const assetMap = buildAssetMap();
  const TEX      = {};
  const total    = Object.keys(assetMap).length;
  let   loaded   = 0;

  await Promise.all(Object.entries(assetMap).map(async ([key, url]) => {
    try   { TEX[key] = await PIXI.Assets.load(url); }
    catch { TEX[key] = PIXI.Texture.EMPTY; }
    if (statusEl) statusEl.textContent = `Загружаю ${++loaded}/${total}...`;
  }));
  if (statusEl) statusEl.textContent = '';

  const CHAR  = CHARACTERS.hero;
  const ENEMY = ENEMIES_CONFIG.zombie;

  const walkTextures  = Array.from({ length: CHAR.frameCount },  (_, i) => croppedTex(TEX[`hero_walk${i}`]));
  const enemyTextures = Array.from({ length: ENEMY.frameCount }, (_, i) => croppedTex(TEX[`zombie_walk${i}`]));
  const rockTextures  = MAP_CONFIG.rocks.map((_, i) => croppedTex(TEX[`rock${i}`]));

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

  return { TEX, walkTextures, enemyTextures, weaponTexSets, rockTextures, magazinTex };
}