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

export const GAME_RULES = {
  startingCredits: 90,
  startingLives: 30,
  // Base reward model; dynamic types add per-tier reward
  killReward: 1,         // legacy base
  killRewardV2: 2,       // legacy
  killRewardV3: 3,       // legacy
  baseKillReward: 1,
  tierRewardStep: 1,
  bigWaveEvery: 5, // still used for enemy type rotation, not bonus scheduling
  bigWaveBonus: 50,
  bonusScale: 1.5,
  bonusChance: 0.16,     // Slightly rarer random bonus chance
  bonusMaxPayout: 150,   // hard cap on bonus rewards
  // Dynamic enemy type system
  maxActiveEnemyTypes: 3,
  // Economy tuning
  fragmentGainScale: 0.35,   // global multiplier on fragment drops
  rerollBasePrice: 50,       // starting reroll price (fragments)
  rerollPriceScale: 2.0,     // price multiplier per reroll
};

export const TOWER_TYPES = {
  basic: { key:'basic', name:'Cannon', cost:30, range:150, damage:15, fireRate:2.0, bulletSpeed:360 },
  laser: { key:'laser', name:'Laser', cost:60, range:170, dps:25, slowPct:0.35 },
  splash:{ key:'splash', name:'Splash', cost:90, range:135, damage:15, fireRate:1.2, splashRadius:60, bulletSpeed:300 }
};

export const UPGRADE_COSTS = {
  slowModule: 75,
  rateModule: 60,
  rangeModule: 80,
  burnModule: 90
};
