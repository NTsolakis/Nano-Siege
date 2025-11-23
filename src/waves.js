// Build a single wave definition for the given 1-based wave number `w`.
// Returns an array of spawn definitions: { delay, hp, speed, variant }
// New design: introduce a new persistent enemy type every `bigWaveEvery` waves.
// Only the most recent `maxActiveEnemyTypes` are active; oldest types rotate out.
import { GAME_RULES } from './config.js';

export function buildWave(w){
  const enemies = [];
  // Base scaling per wave
  let count = Math.round(6 + w * 2); // grows steadily
  let baseHp = Math.round(18 + w * 5.0); // ramp HP
  let baseSpeed = 60 + Math.min(60, Math.floor(w * 2.6)); // ramp speed capped

  // Make difficulty scale harder past wave 20
  if(w > 20){
    const extra = w - 20;
    // Add more units gradually
    count = Math.round(count + extra * 0.5);
    // Increase HP multiplicatively per wave after 20 (modest but noticeable)
    baseHp = Math.round(baseHp * (1 + 0.04 * extra));
    // Increase speed a bit more, with a reasonable cap
    baseSpeed = Math.round(baseSpeed + Math.min(30, extra * 1.0));
  }

  // Grouped spawning parameters
  const bonusesCompleted = Math.floor((w-1) / GAME_RULES.bigWaveEvery); // increases after each bonus wave
  const lengthScale = 1 + bonusesCompleted * 0.3; // overall wave time increases after each bonus
  const insideDelay = () => 0.10 + Math.random()*0.12; // tight inside a group
  const groupGap = () => (0.8 + Math.random()*0.9) * lengthScale; // pause between groups grows over time

  // Determine which enemy types are active this wave
  const introduced = Math.floor((w-1) / GAME_RULES.bigWaveEvery) + 1; // number of types introduced so far (>=1)
  const maxActive = GAME_RULES.maxActiveEnemyTypes || 3;
  const start = Math.max(0, introduced - maxActive);
  const active = [];
  for(let t=start; t<introduced; t++) active.push(t); // type tiers (0-based)

  // Allocate counts to each active type with a weight favoring tougher types
  const weights = active.map((_,i)=> i+1); // 1..N
  const sumW = weights.reduce((a,b)=> a+b, 0) || 1;
  let counts = weights.map(wi => Math.floor(count * wi / sumW));
  let assigned = counts.reduce((a,b)=> a+b, 0);
  // Distribute remainder to tougher types first
  for(let i=counts.length-1; assigned<count; i--){
    if(i<0) i = counts.length-1; // wrap if needed
    counts[i]++; assigned++;
  }

  // Helper to make an enemy record with stats based on its global tier
  const makeEnemy = (tier)=>{
    const hpMult = 1 + tier*0.28;     // tougher types get extra HP
    const spMult = 1 + tier*0.06;     // and a small speed bump
    const hp = Math.round(baseHp * hpMult);
    const speed = Math.round(baseSpeed * spMult);
    return { hp, speed, reward: 0, variant: `t${tier}` };
  };

  // Build a pool of enemies by type, then emit them in random-sized groups
  const pool = [];
  for(let i=0;i<counts.length;i++){
    for(let j=0;j<counts[i];j++) pool.push(makeEnemy(active[i]));
  }
  // Slightly bias selection toward tougher enemies later in the wave
  pool.sort((a,b)=>{
    const ga = Math.random() + (parseInt(a.variant.slice(1),10)||0)*0.02;
    const gb = Math.random() + (parseInt(b.variant.slice(1),10)||0)*0.02;
    return ga - gb;
  });

  const schedulePool = (arr, startDelay=0)=>{
    let nextDelay = startDelay;
    if(arr.length===0) return nextDelay;
    const minGroups = 3 + Math.floor(Math.random()*2); // 3..4
    const groups = Math.min(arr.length, minGroups + bonusesCompleted); // grow groups count over time
    const avgPerGroup = Math.max(1, Math.floor(arr.length / groups));
    let remaining = arr.length;
    while(remaining>0){
      const variance = Math.floor(avgPerGroup * 0.6);
      const size = Math.max(1, Math.min(remaining, avgPerGroup + Math.floor((Math.random()*2-1)*variance)));
      for(let i=0;i<size;i++){
        const enemy = arr.shift(); remaining--;
        enemies.push({ delay: enemies.length===0 ? 0 : nextDelay, ...enemy });
        nextDelay = insideDelay();
      }
      if(remaining>0){ nextDelay = groupGap(); }
    }
    return nextDelay;
  };

  // Boss logic every 10th wave
  const isBossWave = (w % 10) === 0;
  const bossIndex = Math.floor(w/10) - 1; // 0-based
  if(isBossWave){
    // Boss appears toward the latter portion of the wave
    let nextDelay = 0;
    // Lighter prelude on the very first boss; heavier on later bosses
    let preCount = Math.max(1, Math.floor(pool.length * 0.65));
    if(bossIndex === 0){
      preCount = Math.min(pool.length, Math.max(2, Math.floor(pool.length * 0.2)));
    }
    const pre = pool.splice(0, preCount);
    nextDelay = schedulePool(pre, 0);
    nextDelay = groupGap() * (1.0 + Math.random()*0.4);
    // Boss stats scale with wave and boss index
    const bossHpMult = 12 + bossIndex*3; // big HP jump per boss
    const bossHp = Math.round(baseHp * bossHpMult);
    const bossSpeed = Math.max(30, Math.round(baseSpeed * 0.45)); // much slower
    const bossRadius = Math.min(28, 22 + bossIndex*2);
    // Buffed boss payout
    const bossReward = 60 + bossIndex*30;
    // Boss type selection
    let bossVariant = `boss${bossIndex}`; // default original for first
    if(bossIndex >= 1){
      const which = bossIndex % 3;
      if(which === 1) bossVariant = 'boss_nano';
      else if(which === 2) bossVariant = 'boss_ghost';
      else bossVariant = 'boss_split';
    }
    enemies.push({
      delay: enemies.length===0 ? 0 : nextDelay,
      hp: bossHp,
      speed: bossSpeed,
      reward: bossReward,
      variant: bossVariant,
      radius: bossRadius,
      bossTier: bossIndex
    });
    // Small tail after boss (even smaller on first boss)
    nextDelay = groupGap() * (0.9 + Math.random()*0.4);
    let postCount = Math.max(0, Math.floor(pool.length * 0.5));
    if(bossIndex === 0){ postCount = Math.max(0, Math.floor(pool.length * 0.25)); }
    const post = pool.splice(0, postCount);
    schedulePool(post, nextDelay);
  } else {
    // Regular non-boss wave: emit pool as usual
    schedulePool(pool, 0);
  }

  // Inject rare HP blobs (healers) occasionally; keep prior cadence
  const r = w % GAME_RULES.bigWaveEvery;
  if(!isBossWave){
    if(r === 2){ enemies.push({ delay: groupGap(), hp: Math.round(baseHp*1.8), speed: baseSpeed*0.95, reward: 0, variant:'b1' }); }
    if(introduced >= 2 && r === 3){ enemies.push({ delay: groupGap(), hp: Math.round(baseHp*2.1), speed: baseSpeed*0.95, reward: 0, variant:'b2' }); }
    if(introduced >= 3 && r === 4){ enemies.push({ delay: groupGap(), hp: Math.round(baseHp*2.5), speed: baseSpeed*0.95, reward: 0, variant:'b3' }); }
  }

  return enemies;
}

// Backwards-compat (unused now) — build first N waves
export function buildWaves(N=10){
  const waves = [];
  for(let i=1; i<=N; i++) waves.push(buildWave(i));
  return waves;
}
