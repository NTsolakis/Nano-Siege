// Lightweight roguelike layer: global buffs and shop perks
// Towers and game import `buffs` for live multipliers.

export const buffs = {
  dmgMul: 1.0,           // damage and DPS multiplier
  fireRateMul: 1.0,      // fire rate multiplier
  rangeMul: 1.0,         // range multiplier
  slowPotencyMul: 1.0,   // slow pct multiplier
  burnDpsMul: 1.0,       // burn DPS multiplier
  splashRadiusMul: 1.0,  // splash radius multiplier
  puddleSpreadSpeedMul: 1.0, // splash puddle growth speed (1 = base)
  projectileSpeedMul: 1.0, // legacy (no longer used)
  baseDamageMul: 1.0,    // base damage multiplier before other bonuses
  retargetSpeedBonus: 0, // fractional bonus to retarget speed (0.10 = +10%)
  cannonStartRangeLevel: 0, // starting range level for new Cannons
  cannonStartRateLevel: 0,  // starting fire rate level for new Cannons
  splashStartRateLevel: 0,  // starting fire rate level for new Splash towers
  laserStartRangeLevel: 0,  // starting range level for new Laser towers
  laserStartRateLevel: 0,   // starting fire rate level for new Laser towers
  burnDurationBonus: 0,    // additional burn duration (s)
  creditMul: 1.0,          // NanoCredit reward multiplier
  creditFlatPerKill: 0,    // flat NanoCredits per kill
  pierceChance: 0,         // % chance for projectiles to pierce once
  idleShotBonus: 0,        // Adaptive Reloading damage bonus
  idleShotThreshold: 3,    // seconds idle before bonus triggers
  resonanceBonus: 0,       // bonus dmg on first hit of new target
  resonanceCooldown: 3,    // seconds between resonance charges
  fluxFireRateBonus: 0,    // flat fire rate bonus while flux is equipped
  fluxOverheatBonus: 0,    // bonus fire rate during overheat window
  fluxChargeTime: 10,      // seconds of continuous firing before overheat kicks in
  fluxBurstDuration: 4,    // overheat window duration
  ionicChance: 0,          // chance to arc on kill
  ionicDamagePct: 0,       // portion of last hit damage to arc
  ionicRangeFactor: 1,     // scales arc range with splash stat
  cryoFractureBonus: 0,    // bonus dmg vs slowed targets for splash hits
  thermalVenting: false,   // enable scorch patch on burning kills
  thermalSlow: 0,          // scorch slow pct
  thermalDuration: 0,      // scorch duration
  thermalCooldown: 0,      // global cooldown between scorch spawns
  targetPainterChance: 0,  // chance to crit above HP threshold
  targetPainterBonus: 0,   // crit multiplier increment
  targetPainterThreshold: 0.7, // HP ratio to qualify
  fragmentEliteBonus: 0,   // bonus fragments on elite/boss kills
  rerollDiscount: 0,       // % reroll cost discount
  singularityEvery: 0,     // every Nth splash explosion pulls/slow
  singularitySlow: 0,      // pull slow pct
  singularityDuration: 0,  // duration of singularity slow
  chronoInterval: 0,       // seconds between chrono pulses
  chronoDuration: 0,       // chrono pulse duration
  chronoFireBonus: 0,      // fire rate bonus during chrono
  chronoRangeBonus: 0,     // range bonus during chrono
  chronoActive: false,
  harmonicCascadeBonus: 0, // bonus dmg on pierce/bounce
  harmonicExtraChains: 0,  // extra pierce/bounce targets
  nanoDroneKillInterval: 0,// kills per drone spawn
  nanoDroneMax: 0,
  nanoDroneDamage: 0,
  nanoDroneFireRate: 0,
  nanoDroneRange: 0,
  reactorAegis: 0,         // shield amount at wave start
  cannonStartBurn: false,
  cannonStartSlow: false,
  splashStartBurn: false,
  splashStartSlow: false,
  laserStartBurn: false,
  laserStartSlow: false,
};

// Base perk catalog. Costs scale per shop visit; most perks can stack.
// Core random perks (exclude permanent ability unlocks)
// Passive abilities (rerollable). They can be purchased repeatedly up to a cap.
export const PERKS = [
  // ⭐ Tier 1 — Protocols (Common)
  { key:'proto_overdrive', name:'Overdrive Protocol', desc:'+5% tower fire rate.', baseCost: 90, slotPassive:true, tier:'common' },
  { key:'proto_precision', name:'Precision Targeting Protocol', desc:'Towers retarget 8% faster.', baseCost: 90, slotPassive:true, tier:'common' },
  { key:'proto_recycler', name:'Data Recycler', desc:'Enemies drop +5% more NanoCredits.', baseCost: 110, slotPassive:true, tier:'common' },
  { key:'proto_coupling', name:'Thermal Coupling', desc:'Burn damage lasts +1s.', baseCost: 110, slotPassive:true, tier:'common' },
  { key:'proto_cryo', name:'Cryo Efficiency', desc:'Slow effects are 5% stronger.', baseCost: 100, slotPassive:true, tier:'common' },
  { key:'proto_feedback', name:'Feedback Loops', desc:'Each kill refunds +1 NanoCredit.', baseCost: 130, slotPassive:true, tier:'common' },
  { key:'proto_pierce', name:'Micro-Pierce Protocol', desc:'5% chance for shots to pierce 1 extra enemy.', baseCost: 120, slotPassive:true, tier:'common' },
  { key:'proto_reload', name:'Adaptive Reloading', desc:'If a tower hasn’t fired for 3s, its next shot deals +20% damage.', baseCost: 120, slotPassive:true, tier:'common' },
  { key:'proto_retarget', name:'Sub-Target Prioritizer', desc:'Towers retarget 12% faster after enemy death.', baseCost: 120, slotPassive:true, tier:'common' },
  { key:'dmg', name:'High-Energy Ammunition', desc:'+15% tower damage', baseCost: 100, slotPassive:true, tier:'common' },
  { key:'firerate', name:'Servo Overdrive', desc:'+15% fire rate', baseCost: 100, slotPassive:true, tier:'common' },
  { key:'range', name:'Telemetry Uplink', desc:'+10% tower range', baseCost: 100, slotPassive:true, tier:'common' },
  { key:'slow', name:'Cryo Nanites', desc:'+10% slow potency', baseCost: 110, slotPassive:true, tier:'common' },
  { key:'burn', name:'Incendiary Mix', desc:'+20% burn DPS', baseCost: 110, slotPassive:true, tier:'common' },
  { key:'splash', name:'Shrapnel Matrix', desc:'+15% splash radius', baseCost: 120, slotPassive:true, tier:'common' },
  { key:'base_dmg_1', name:'Low-Gain Amplifier', desc:'+1% base damage to all towers.', baseCost: 80, slotPassive:true, tier:'common' },
  { key:'base_dmg_3', name:'Focused Charge Bus', desc:'+3% base damage to all towers.', baseCost: 100, slotPassive:true, tier:'common' },
  { key:'base_dmg_5', name:'Ferrofluid Coating', desc:'+5% base damage to all towers.', baseCost: 120, slotPassive:true, tier:'common' },
  { key:'starter_cannon_range1', name:'Barrel Calibration Protocol', desc:'New Cannons spawn with Range Level 1 for free (future placements).', baseCost: 120, slotPassive:true, tier:'common', stackLimit:1 },
  { key:'starter_cannon_rate1', name:'Servo Primer', desc:'New Cannons spawn with Fire Rate Level 1 for free (future placements).', baseCost: 120, slotPassive:true, tier:'common', stackLimit:1 },
  { key:'starter_splash_rate1', name:'Hydraulic Primer', desc:'New Splash towers spawn with Fire Rate Level 1 for free (future placements).', baseCost: 120, slotPassive:true, tier:'common', stackLimit:1 },
  { key:'starter_laser_range1', name:'Beam Focus Protocol', desc:'New Lasers spawn with Range Level 1 for free (future placements).', baseCost: 120, slotPassive:true, tier:'common', stackLimit:1 },
  { key:'starter_laser_rate1', name:'Pulse Sync Protocol', desc:'New Lasers spawn with Fire Rate Level 1 for free (future placements).', baseCost: 120, slotPassive:true, tier:'common', stackLimit:1 },
  // Common crit micro-boosters
  { key:'crit_micro_lattice', name:'Micro Lattice Tuning', desc:'+2% crit chance; crits deal +20% damage.', baseCost: 95, slotPassive:true, tier:'common' },
  { key:'crit_edge_trim', name:'Edge Trim Firmware', desc:'+3% crit chance; crits deal +20% damage.', baseCost: 105, slotPassive:true, tier:'common' },
  { key:'crit_optics', name:'Optical Accents', desc:'+4% crit chance; crits deal +20% damage.', baseCost: 115, slotPassive:true, tier:'common' },
  { key:'crit_microfusion', name:'Micro-Fusion Caps', desc:'+3% crit chance; crits deal +25% damage.', baseCost: 110, slotPassive:true, tier:'common' },
  { key:'crit_stability', name:'Stability Weave', desc:'+2% crit chance; crits deal +25% damage.', baseCost: 100, slotPassive:true, tier:'common' },

  // ⭐ Tier 2 — Subroutines (Rare)
  { key:'resonance_rounds', name:'Resonance Rounds', desc:'First hit on a fresh target deals +40% damage (3s cooldown per tower).', baseCost: 200, slotPassive:true, tier:'rare' },
  { key:'flux_coolant', name:'Flux Coolant', desc:'+10% fire rate. After 10s of continuous fire, gain +5% fire rate for 4s.', baseCost: 210, slotPassive:true, tier:'rare' },
  { key:'ionic_feedback', name:'Ionic Feedback', desc:'On kill, 15% chance to arc 30% damage to a nearby enemy.', baseCost: 190, slotPassive:true, tier:'rare' },
  { key:'cryo_fracture', name:'Cryo Fracture', desc:'Slowed enemies take +12% damage from splash hits (stacks twice).', baseCost: 200, slotPassive:true, tier:'rare', stackLimit:2 },
  { key:'thermal_venting', name:'Thermal Venting', desc:'Burned enemies leave a scorch patch that slows nearby foes.', baseCost: 200, slotPassive:true, tier:'rare' },
  { key:'target_painter', name:'Target Painter', desc:'+8% crit chance for +50% damage vs enemies above 70% HP.', baseCost: 190, slotPassive:true, tier:'rare' },
  { key:'fragment_siphon', name:'Fragment Siphon', desc:'+1 fragment on elite kills; rerolls cost 5% less.', baseCost: 180, slotPassive:true, tier:'rare' },
   { key:'sub_retarget', name:'Recursive Lock Subroutine', desc:'Towers retarget 22% faster after enemy death.', baseCost: 210, slotPassive:true, tier:'rare' },
  { key:'starter_cannon_range2', name:'Extended Ballistics Subroutine', desc:'New Cannons spawn with Range Level 2 for free (future placements).', baseCost: 210, slotPassive:true, tier:'rare', stackLimit:1 },
  { key:'starter_cannon_rate2', name:'Rapid Cycling Servos', desc:'New Cannons spawn with Fire Rate Level 2 for free (future placements).', baseCost: 210, slotPassive:true, tier:'rare', stackLimit:1 },
  { key:'starter_splash_rate2', name:'Pressurized Manifold', desc:'New Splash towers spawn with Fire Rate Level 2 for free (future placements).', baseCost: 210, slotPassive:true, tier:'rare', stackLimit:1 },
  { key:'starter_laser_range2', name:'Photon Relay Subroutine', desc:'New Lasers spawn with Range Level 2 for free (future placements).', baseCost: 210, slotPassive:true, tier:'rare', stackLimit:1 },
  { key:'starter_laser_rate2', name:'Pulse Repeater Subroutine', desc:'New Lasers spawn with Fire Rate Level 2 for free (future placements).', baseCost: 210, slotPassive:true, tier:'rare', stackLimit:1 },
  { key:'base_dmg_10', name:'Kinetic Overbalance', desc:'+10% base damage to all towers.', baseCost: 190, slotPassive:true, tier:'rare' },
  { key:'base_dmg_15', name:'Thermionic Driver', desc:'+15% base damage to all towers.', baseCost: 220, slotPassive:true, tier:'rare' },
  { key:'base_dmg_20', name:'Firing Solution Optimizer', desc:'+20% base damage to all towers.', baseCost: 240, slotPassive:true, tier:'rare' },
  { key:'starter_cannon_burn', name:'Thermal Shelling Suite', desc:'New Cannons spawn with Burn Module installed.', baseCost: 200, slotPassive:true, tier:'rare', stackLimit:1 },
  { key:'starter_cannon_slow', name:'Cryo Shock Bracing', desc:'New Cannons spawn with Slow Module installed.', baseCost: 200, slotPassive:true, tier:'rare', stackLimit:1 },
  { key:'starter_splash_burn', name:'Ignition Gel Manifold', desc:'New Splash towers spawn with Burn Module installed.', baseCost: 200, slotPassive:true, tier:'rare', stackLimit:1 },
  { key:'starter_splash_slow', name:'Cryo Flux Valves', desc:'New Splash towers spawn with Slow Module installed.', baseCost: 200, slotPassive:true, tier:'rare', stackLimit:1 },
  { key:'starter_laser_burn', name:'Thermal Lance Emulator', desc:'New Lasers spawn with Burn Module installed.', baseCost: 200, slotPassive:true, tier:'rare', stackLimit:1 },
  { key:'starter_laser_slow', name:'Phase Chill Matrix', desc:'New Lasers spawn with Slow Module installed.', baseCost: 200, slotPassive:true, tier:'rare', stackLimit:1 },

  // ⭐ Tier 3 — Anomalies (Super Rare)
  { key:'singularity_core', name:'Singularity Core', desc:'Every 8th splash explosion pulls enemies inward and slows them briefly.', baseCost: 260, slotPassive:true, tier:'super', unique:true },
  { key:'chrono_overclock', name:'Chrono Overclock', desc:'Every 20s, towers gain +40% fire rate and +20% range for 4s.', baseCost: 260, slotPassive:true, tier:'super', unique:true },
  { key:'harmonic_cascade', name:'Harmonic Cascade', desc:'Pierced shots deal +25% damage and can chain one extra target.', baseCost: 260, slotPassive:true, tier:'super', unique:true },
  { key:'nanite_armada', name:'Nanite Armada', desc:'Every 12 kills spawns a drone (max 3) that fires at enemies.', baseCost: 260, slotPassive:true, tier:'super', unique:true },
  { key:'reactor_aegis', name:'Reactor Aegis', desc:'Core gains a 10 HP overshield each wave; regenerates between waves.', baseCost: 260, slotPassive:true, tier:'super', unique:true },
  { key:'starter_cannon_range3', name:'Orbital Range Uplink', desc:'New Cannons spawn with Range Level 3 for free (future placements).', baseCost: 260, slotPassive:true, tier:'super' },
  { key:'starter_cannon_rate3', name:'Ballistic Turbo Lattice', desc:'New Cannons spawn with Fire Rate Level 3 for free (future placements).', baseCost: 260, slotPassive:true, tier:'super' },
  { key:'starter_splash_rate3', name:'Cascade Firing Lattice', desc:'New Splash towers spawn with Fire Rate Level 3 for free (future placements).', baseCost: 260, slotPassive:true, tier:'super' },
  { key:'starter_laser_range3', name:'Diffraction Halo', desc:'New Lasers spawn with Range Level 3 for free (future placements).', baseCost: 260, slotPassive:true, tier:'super' },
  { key:'starter_laser_rate3', name:'Quantum Pulse Accelerator', desc:'New Lasers spawn with Fire Rate Level 3 for free (future placements).', baseCost: 260, slotPassive:true, tier:'super' },
  { key:'base_dmg_50', name:'Primed Warheads', desc:'+50% base damage to all towers.', baseCost: 300, slotPassive:true, tier:'super', unique:true },
  { key:'base_dmg_100', name:'Quantum Payload', desc:'+100% base damage to all towers.', baseCost: 340, slotPassive:true, tier:'super', unique:true },
  { key:'base_dmg_200', name:'Singularity Munitions', desc:'+200% base damage to all towers.', baseCost: 420, slotPassive:true, tier:'super', unique:true },
  { key:'starter_cannon_burnslow', name:'Cryo-Thermal Siege Array', desc:'New Cannons spawn with both Slow and Burn Modules installed.', baseCost: 260, slotPassive:true, tier:'super', stackLimit:1 },
  { key:'starter_splash_burnslow', name:'Cascade Cryo-Thermal Core', desc:'New Splash towers spawn with both Slow and Burn Modules installed.', baseCost: 260, slotPassive:true, tier:'super', stackLimit:1 },
  { key:'starter_laser_burnslow', name:'Prismatic Lockdown Beam', desc:'New Lasers spawn with both Slow and Burn Modules installed.', baseCost: 260, slotPassive:true, tier:'super', stackLimit:1 },
  { key:'anom_retarget', name:'Temporal Targeting Matrix', desc:'Towers retarget 40% faster after enemy death.', baseCost: 260, slotPassive:true, tier:'super', unique:true },

  // Non-slot, utility perks
  { key:'credits100', name:'Venture Funding', desc:'+100⚛ immediately', baseCost: 0, tier:'common',
    apply: (game)=>{ game.credits += 100; game.ui.setCredits(game.credits); } },
  { key:'heal5', name:'Reactor Patch', desc:'+5 HP (heal)', baseCost: 0, tier:'common',
    apply: (game)=>{ const before=game.lives; game.lives = Math.min(game.lives + 5, game.GAME_MAX_LIVES||game.lives||30); game.ui.setLives(game.lives); if(game.lives>before) game.updateLowHpAlarm?.(); } },
  { key:'slot_plus', name:'Memory Partition', desc:'+2 nano-tech slots (max 6)', baseCost: 200, unique:true, tier:'rare' },
];

// Permanent ability unlocks (always shown at bottom of the shop)
export const ABILITIES = [
  { key:'bomb', name:'Nano Bombs', desc:'Click to place a bomb (CD 12s)', cost:1,
    apply: (game)=>{ if(game.abilities && game.abilities.bomb){ game.abilities.bomb.unlocked = true; game.ui.setAbilityVisible?.('bomb', true); game.ui.setAbilityCooldown?.('bomb', true, 0); } } },
  { key:'overclock', name:'Overclock Protocol', desc:'+30% fire rate for 8s (CD 25s)', cost:1,
    apply: (game)=>{ if(game.abilities && game.abilities.overclock){ game.abilities.overclock.unlocked = true; game.ui.setAbilityVisible?.('overclock', true); game.ui.setAbilityCooldown?.('overclock', true, 0); } } },
  { key:'cryo', name:'Cryo Burst', desc:'Slow all enemies 50% for 3s (CD 20s)', cost:1,
    apply: (game)=>{ if(game.abilities && game.abilities.cryo){ game.abilities.cryo.unlocked = true; game.ui.setAbilityVisible?.('cryo', true); game.ui.setAbilityCooldown?.('cryo', true, 0); } } },
  { key:'corehp', name:'Reactor Reinforce', desc:'Increase reactor max HP (+5 per level)', cost:1,
    apply: (game)=>{ /* handled via level-up in game */ } },
];

// Ultimate ability scaling (levels and dynamic price)
export const ULTIMATE_MAX_LEVEL = 5;
export function ultimateCostFor(ability, level=0){
  // Spec system: every shard spend costs exactly 1 regardless of level.
  return 1;
}

function clonePerk(p){ return { ...p, kind: p.kind || 'passive' }; }

const TIER_WEIGHTS = [
  // Commons dominate the pool (~75%); rares are roughly
  // one-third as frequent, and supers are very rare.
  ['common', 0.75],
  ['rare', 0.25],
  ['super', 0.03],
];
const tierWeightTotal = TIER_WEIGHTS.reduce((sum, [,w])=> sum + w, 0);

function rollTier(){
  let r = Math.random() * tierWeightTotal;
  for(const [tier, weight] of TIER_WEIGHTS){
    if(weight <= 0) continue;
    r -= weight;
    if(r <= 0) return tier;
  }
  return 'common';
}

// Roll N random offers. Costs scale with shopIndex (0-based). To keep each
// reroll feeling varied, we avoid showing duplicate perk keys in a single
// batch where the catalog has enough unique entries available.
export function rollShopOffers(count=6, shopIndex=0, excludeKeys=[]) {
  const exclude = new Set(excludeKeys||[]);
  const byTier = { common: [], rare: [], super: [] };
  for(const perk of PERKS){
    if(perk.disabled) continue;
    const tier = perk.tier || 'common';
    byTier[tier] = byTier[tier] || [];
    byTier[tier].push(perk);
  }
  const offers = [];
  const seen = new Set();
  // Determine how many unique perks we can actually draw from the enabled catalog.
  const availableKeys = new Set();
  for(const tier of Object.keys(byTier)){
    for(const perk of byTier[tier]){
      if(!perk || exclude.has(perk.key)) continue;
      availableKeys.add(perk.key);
    }
  }
  const maxUnique = availableKeys.size || 0;
  const maxAttempts = Math.max(30, count * 10);
  let attempts = 0;
  while(offers.length < count && attempts < maxAttempts){
    attempts++;
    let tier = rollTier();
    let pool = byTier[tier] || [];
    if(!pool.length){
      // degrade gracefully if this tier is empty
      if(tier === 'super' && byTier.rare.length){ tier = 'rare'; pool = byTier.rare; }
      else if((tier === 'super' || tier === 'rare') && byTier.common.length){ tier = 'common'; pool = byTier.common; }
      else continue;
    }
    const perk = pool[Math.floor(Math.random()*pool.length)];
    if(!perk) continue;
    if(exclude.has(perk.key)) continue;
    // When we have enough distinct perks in the catalog, avoid showing
    // the same key more than once in a single roll for better variety.
    if(maxUnique >= count && seen.has(perk.key)) continue;
    const copy = clonePerk(perk);
    copy.cost = copy.baseCost>0 ? (copy.baseCost + shopIndex*50) : copy.baseCost;
    offers.push(copy);
    seen.add(perk.key);
  }
  while(offers.length < count){
    const fallbackList = byTier.common.length ? byTier.common : PERKS.filter(p=>!p.disabled);
    if(!fallbackList.length) break;
    const perk = fallbackList[Math.floor(Math.random()*fallbackList.length)];
    if(!perk) break;
    if(exclude.has(perk.key)) continue;
    // Fallback also prefers unique keys when possible; if the catalog
    // is extremely small (maxUnique < count), duplicates are allowed.
    if(maxUnique >= count && seen.has(perk.key)) continue;
    const copy = clonePerk(perk);
    copy.cost = copy.baseCost>0 ? (copy.baseCost + shopIndex*50) : copy.baseCost;
    offers.push(copy);
    seen.add(perk.key);
  }
  return offers;
}

// Passive level cap and dynamic pricing
export const PASSIVE_MAX_LEVEL = 5;
export function passiveCostFor(perk, level=0, shopIndex=0){
  const rawBase = perk.baseCost || 0;
  // Free / special perks keep their explicit cost.
  if(rawBase <= 0) return 0;
  const tier = perk.tier || 'common';
  // Target bands by rarity:
  //  - common:  25–50 fragments
  //  - rare:    50–100 fragments
  //  - super:   100–150 fragments
  let min, max;
  if(tier === 'rare'){
    min = 50; max = 100;
  } else if(tier === 'super'){
    min = 100; max = 150;
  } else {
    min = 25; max = 50;
  }
  // Normalise the original base cost into 0–1 so more expensive legacy
  // perks still tend toward the upper end of the band.
  const rawMin = 80;
  const rawSpan = 220; // 80..300 covers current catalog reasonably well
  const norm = Math.max(0, Math.min(1, (rawBase - rawMin) / rawSpan));

  // Progress factor: as the shop index increases, costs move from the
  // lower end of their band toward the upper end.
  const maxShops = 6;
  const pShop = Math.max(0, Math.min(1, shopIndex / maxShops));
  // Early shops expose only ~35% of the band above the minimum; later
  // shops gradually reach the full band.
  const bandFrac = 0.35 + 0.65 * pShop; // 0.35 at first, 1.0 at maxShops+

  const base = min + (max - min) * norm * bandFrac;

  // Per‑level scaling: higher passive levels cost more but stay within a
  // reasonable multiplier of the base cost.
  let levelFactor;
  if(tier === 'rare'){
    levelFactor = 0.45;
  } else if(tier === 'super'){
    levelFactor = 0.5;
  } else {
    levelFactor = 0.4;
  }
  const levelMult = 1 + Math.max(0, level) * levelFactor;
  return Math.round(base * levelMult);
}

// Apply a perk to the current game and update UI if needed.
export function applyPerk(game, perk){
  if(perk && perk.slotPassive) return;
  if(perk && typeof perk.apply === 'function') perk.apply(game);
}
