// Lightweight sandbox configuration model shared across the game.
// This module exports defaults and simple helpers so the UI can
// read/write settings without poking at Game internals directly.

export const defaultSandboxConfig = () => ({
  // Wave / enemy behavior
  enemyHpMul: 1.0,
  enemySpeedMul: 1.0,
  waveSizeMul: 1.0,
  spawnSpacingMul: 1.0,
  // Tower + status
  towerDmgMul: 1.0,
  towerFireRateMul: 1.0,
  towerRangeMul: 1.0,
  slowMul: 1.0,
  burnDpsMul: 1.0,
  burnDurationMul: 1.0,
   puddleDpsMul: 1.0,
   puddleSlowMul: 1.0,
   puddleDurMul: 1.0,
  // Economy
  creditMul: 1.0,
  fragmentMul: 1.0,
  flatCreditsPerKill: 0,
  // Convenience cheats (sandbox-only)
  infiniteCredits: true,
  infiniteHp: true,
  freeShop: true,
  freeRerolls: true,
  // Misc
  noLeaksEndGame: false,
  bossEveryWave: false,
});

export function clampSandboxConfig(cfg){
  const c = { ...defaultSandboxConfig(), ...(cfg || {}) };
  const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));
  c.enemyHpMul = clamp(c.enemyHpMul, 0.1, 10);
  c.enemySpeedMul = clamp(c.enemySpeedMul, 0.25, 10);
  c.waveSizeMul = clamp(c.waveSizeMul, 0.1, 10);
  c.spawnSpacingMul = clamp(c.spawnSpacingMul, 0.1, 10);
  c.towerDmgMul = clamp(c.towerDmgMul, 0.1, 10);
  c.towerFireRateMul = clamp(c.towerFireRateMul, 0.1, 10);
  c.towerRangeMul = clamp(c.towerRangeMul, 0.5, 10);
  c.slowMul = clamp(c.slowMul, 0, 10);
  c.burnDpsMul = clamp(c.burnDpsMul, 0, 10);
  c.burnDurationMul = clamp(c.burnDurationMul, 0, 10);
  c.puddleDpsMul = clamp(c.puddleDpsMul, 0, 10);
  c.puddleSlowMul = clamp(c.puddleSlowMul, 0, 10);
  c.puddleDurMul = clamp(c.puddleDurMul, 0, 10);
  c.creditMul = clamp(c.creditMul, 0, 10);
  c.fragmentMul = clamp(c.fragmentMul, 0, 10);
  c.flatCreditsPerKill = clamp(c.flatCreditsPerKill|0, 0, 50);
  c.infiniteCredits = !!c.infiniteCredits;
  c.infiniteHp = !!c.infiniteHp;
  c.freeShop = !!c.freeShop;
  c.freeRerolls = !!c.freeRerolls;
  c.noLeaksEndGame = !!c.noLeaksEndGame;
  c.bossEveryWave = !!c.bossEveryWave;
  return c;
}
