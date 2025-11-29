export const TILE_SIZE = 60; // px
// Slightly larger grid for roomier maps
export const GRID_W = 20;
export const GRID_H = 12;
export const CANVAS_W = GRID_W * TILE_SIZE; // 960
export const CANVAS_H = GRID_H * TILE_SIZE; // 540

export const COLORS = {
  bg: '#0a0f14',
  panel: '#0e1620',
  grid: '#14202a',
  path: '#093b4f',
  pathEdge: '#00baff',
  accent: '#17e7a4',
  accent2: '#00baff',
  danger: '#ff5370',
  enemy: '#ff5370',      // base (legacy/fallback)
  enemy2: '#ff9e00',     // legacy colors
  enemy3: '#ffd54f',     // legacy colors
  blob1: '#68ffbc',      // HP blob v1 (mint)
  blob2: '#62f0ff',      // HP blob v2 (cyan)
  blob3: '#b7f3ff',      // HP blob v3 (pale blue)
  bullet: '#e0f7ff',
  tower: '#17e7a4',
  // Distinct tower base colors
  towerBasic: '#17e7a4',   // green-teal
  towerLaser: '#62f0ff',   // cyan
  towerSplash: '#ff9e00',  // orange
  // Flying drone enemy accent
  drone: '#7ce0ff',
  range: 'rgba(23,231,164,0.12)',
  // Palette for dynamically introduced enemy types (cycled as needed)
  typePalette: [
    '#ff5370', // red
    '#ff9e00', // orange
    '#ffd54f', // gold
    '#80e27e', // green
    '#17e7a4', // teal
    '#62f0ff', // cyan
    '#82b1ff', // blue
    '#b388ff', // purple
    '#f06292', // pink
    '#ff8a65'  // coral
  ],
  boss: '#c77dff' // boss highlight color
};

function hexToRgb(h){
  if(!h || typeof h !== 'string' || h[0] !== '#') return { r: 255, g: 255, b: 255 };
  if(h.length === 4){
    const r = h[1] + h[1];
    const g = h[2] + h[2];
    const b = h[3] + h[3];
    const n = parseInt(r+g+b, 16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }
  const n = parseInt(h.slice(1),16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}

function rgbToHex({r,g,b}){
  const n = ((r&255)<<16) | ((g&255)<<8) | (b&255);
  return '#'+n.toString(16).padStart(6,'0');
}

function mixRgb(a,b,t){
  const u = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u)
  };
}

// Precompute HP gradient anchor colors once at module load so we don't
// pay the hex → rgb conversion cost on every frame.
const HP_COLOR_STOPS = (()=>({
  full:   hexToRgb(COLORS.accent || '#17e7a4'), // healthy (teal/green)
  yellow: hexToRgb('#ffd54f'),
  orange: hexToRgb('#ff9e00'),
  red:    hexToRgb(COLORS.danger || '#ff5370')
}))();

// Shared helper: derive the current HP color with a smooth gradient
// that runs green → yellow → orange → red instead of a direct
// green→red mix (which can look muddy in the mid‑range).
export function getHpColor(pct){
  const p = Math.max(0, Math.min(1, pct));
  const { full:cFull, yellow:cYellow, orange:cOrange, red:cRed } = HP_COLOR_STOPS;
  // Key stops from healthy to critical:
  // 1.0 → accent (teal/green)
  // 0.7 → bright yellow
  // 0.4 → orange
  // 0.0 → danger red
  let from = cFull;
  let to = cYellow;
  let t = 0;
  if(p >= 0.7){
    // green → yellow
    t = (1.0 - p) / 0.3;       // p:1.0→0.7
    from = cFull; to = cYellow;
  } else if(p >= 0.4){
    // yellow → orange
    t = (0.7 - p) / 0.3;       // p:0.7→0.4
    from = cYellow; to = cOrange;
  } else {
    // orange → red
    t = (0.4 - p) / 0.4;       // p:0.4→0.0
    from = cOrange; to = cRed;
  }
  return rgbToHex(mixRgb(from, to, t));
}

// Optional helper: touch the HP gradient logic with a few sample values
// so any JIT compilation or one‑time work happens during a loading
// phase instead of on the first in‑game HP change.
export function prewarmHpColors(){
  const samples = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0];
  for(const p of samples){
    getHpColor(p);
  }
}

export const GAME_RULES = {
  startingCredits: 100,
  startingLives: 30,
  // Wave‑based tower economy
  // Each completed wave grants a fixed amount of tower credits so income
  // is predictable and not tied to last‑hit RNG.
  // Slightly bumped again so NanoCredits feel a bit less tight.
  waveCreditBase: 10.0,   // base income on wave 1
  waveCreditStep: 2.0,    // extra credits per completed wave (linear)
  // Tiny per‑kill credit value for flavor only; main income comes from
  // wave rewards, not drops.
  killCreditPerKill: 1,
  // Legacy kill reward knobs (still referenced in a few places for
  // spawn tuning but no longer drive the core economy).
  killReward: 1,
  killRewardV2: 2,
  killRewardV3: 3,
  baseKillReward: 1,
  tierRewardStep: 1,
  bigWaveEvery: 5, // still used for enemy type rotation, not bonus scheduling
  bigWaveBonus: 50,
  bonusScale: 1.5,
  bonusChance: 0.16,     // Slightly rarer random bonus chance
  bonusMaxPayout: 150,   // hard cap on bonus rewards
  // Dynamic enemy type system
  maxActiveEnemyTypes: 3,
  // Fragment economy tuning (tech chips). Fragments are now awarded in
  // discrete chunks at wave checkpoints and bosses rather than as
  // constant trickles from kills. Each "chip" in the game logic maps
  // to roughly 10 spendable fragments so early shops feel affordable.
  fragmentGainScale: 10.0,
  rerollBasePrice: 50,       // starting reroll price (fragments)
  rerollPriceScale: 2.0,     // price multiplier per reroll
};

export const TOWER_TYPES = {
  basic: { key:'basic', name:'Cannon', cost:25, range:150, damage:15, fireRate:2.0, bulletSpeed:360 },
  laser: { key:'laser', name:'Laser', cost:50, range:170, dps:25, slowPct:0.35 },
  splash:{ key:'splash', name:'Splash', cost:75, range:135, damage:15, fireRate:1.2, splashRadius:60, bulletSpeed:300 }
};

export const UPGRADE_COSTS = {
  slowModule: 75,
  rateModule: 60,
  rangeModule: 80,
  burnModule: 90
};
