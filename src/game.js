import { CANVAS_W, CANVAS_H, TILE_SIZE, GAME_RULES, COLORS, getHpColor, prewarmHpColors, MOARTER_MIN_RANGE_FRAC } from './config.js';
import { now, dist2 } from './utils.js';
import { Grid } from './grid.js';
import { Enemy } from './enemy.js';
import { createTower, PEDESTAL_SPRITE, REACTOR_SPRITE } from './tower.js';
import { buildWave } from './waves.js';
import { UIManager } from './ui.js';
import { audio } from './audio.js';
import { MAPS } from './maps.js';
import { TOWER_TYPES, UPGRADE_COSTS } from './config.js';
import { defaultSandboxConfig, clampSandboxConfig } from '../sandbox-config.js';
import { rollShopOffers, applyPerk, buffs, ABILITIES, PASSIVE_MAX_LEVEL, passiveCostFor, ULTIMATE_MAX_LEVEL, ultimateCostFor, PERKS } from './rogue.js';
import { getMissionById, getMissionMap, buildMissionWave, getMissionTotalWaves } from './campaign.js';
import { loginUser as apiLoginUser, saveUserState as apiSaveUserState, createUser as apiCreateUser, fetchLeaderboard as apiFetchLeaderboard, submitLeaderboard as apiSubmitLeaderboard, logoutUser as apiLogoutUser } from './auth.js';

const SHOP_OFFER_COUNT = 6;

// Optional starfield / space backdrop drawn behind the gameboard while
// playing on the main reactor map. This is rendered inside the canvas
// so it always lines up with the board area between side panels.
const SPACE_BG = {
  img: null,
  loaded: false
};
if(typeof Image !== 'undefined'){
  (()=>{
    try{
      const img = new Image();
      img.onload = ()=>{
        SPACE_BG.img = img;
        SPACE_BG.loaded = true;
      };
      img.onerror = ()=>{
        SPACE_BG.img = null;
        SPACE_BG.loaded = false;
      };
      img.src = 'data/Space-Background.png';
    }catch(e){}
  })();
}

// Assembly Core (Nanocore chamber) backdrop, used inside the playable
// area while the chamber canvas scene is active. This is layered on
// top of the global space background but underneath chamber nodes.
const ASSEMBLYCORE_BG = {
  img: null,
  loaded: false
};
if(typeof Image !== 'undefined'){
  (()=>{
    try{
      const img = new Image();
      img.onload = ()=>{
        ASSEMBLYCORE_BG.img = img;
        ASSEMBLYCORE_BG.loaded = true;
      };
      img.onerror = ()=>{
        ASSEMBLYCORE_BG.img = null;
        ASSEMBLYCORE_BG.loaded = false;
      };
      img.src = 'data/Assemblycore-Background.png';
    }catch(e){}
  })();
}

export class Game {
  constructor(canvas){
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.selectedMap = MAPS[0];
    this.selectedCharacterKey = 'volt';
    this.grid = new Grid(this.selectedMap);
    this.ui = new UIManager();
    if(this.ui.setPerfectBest) this.ui.setPerfectBest(0);
    this.leaderboardMapKey = this.selectedMap.key;
    this.leaderboardCache = {};

    // State
    this.mode = 'endless'; // endless | assembly
    this.missionId = null;
    this.missionMaxWaves = null;
    this.missionCompleteTimer = 0;
    this.coreReturnTarget = null;
    // Latest profile snapshot returned from the backend. When logging
    // in from the pause menu we cache this instead of immediately
    // resetting the current run, and apply it the next time the player
    // visits Assembly War.
    this.pendingUserState = null;
    this.profileMode = null;      // 'load' | 'save' | null
    this.profileOrigin = null;    // 'mainmenu' | 'assembly' | null
    this.missionUnlockLevel = 1;  // highest Assembly mission unlocked (1-6)

    this.credits = GAME_RULES.startingCredits;
    this.fragments = 0;   // Data Fragments (run-shop currency)
    this.coreShards = 0;  // Permanent meta currency
    this.lives = GAME_RULES.startingLives;
    this.waveIdx = 0;
    this.bestWave = 0;
    this.perfectCombo = 0;
    this.bestPerfectCombo = 0;
    this.spawner = { active:false, time: 0, queue: [], pathMode:'roundrobin', pathCursor:0 };

    this.enemies = [];
    this.towers = [];
    this.hazardZones = [];
    this.thermalVentingCd = 0;
    this.singularityCounter = 0;
    this.nanoKillCounter = 0;
    this.nanoDrones = [];
    this.droneBeams = [];
    this.reactorShield = 0;
    this.chrono = { timer: 0, active: false, timeLeft: 0 };
    this.time = 0; // seconds, for animation
    this.state = 'menu'; // menu | playing | paused | gameover | exitConfirm
    this.floaters = []; // {x,y,text,age,ttl,vy,color}
    this.ambient = [];  // background motes
    this.banner = null; // {text, age, ttl}
    this.bonusActive = false; // true during a bonus wave
    this.lastBonusWave = null; // last wave number that was a bonus
    this.bonusHistory = []; // record of bonus waves for spacing rules
    this.waveLostHP = false; // did we lose HP during current wave?
    this.livesAtWaveStart = this.lives;
    this.bonusPayout = Math.min(GAME_RULES.bigWaveBonus, GAME_RULES.bonusMaxPayout || Infinity); // scales by bonusScale each bonus wave, capped
    this.speedFactor = 1; // 1x..4x
    this.lowHpActive = false;
    // Screen shake magnitude (px)
    this.shakeMag = 0;
    this.GAME_MAX_LIVES = GAME_RULES.startingLives;
    // Shop meta
    this.shop = { index: 0, offers: [], rerollPrice: GAME_RULES.rerollBasePrice || 50 };
    // Track passive perk levels across the run
    this.passives = { active: [], capacity: 4, slotBoost: false };
    this.recomputeSlotPassives();
    // Abilities (permanent once unlocked for the run)
    this.abilities = {
      bomb: { unlocked:false, level:0, cd:0, cdMax:12, radius:70, damage:120 },
      overclock: { unlocked:false, level:0, cd:0, cdMax:25, dur:8, boost:1.0, active:false, durLeft:0, _applied:false },
      cryo: { unlocked:false, level:0, cd:0, cdMax:20, slow:0.5, dur:2.5, active:false, timeLeft:0 },
      corehp: { level:0 }
    };
    this.recomputeAbilityParams();
    this.placingBomb = false;
    this._lastCritBannerTime = 0;
    this._exitConfirmCallback = null;
    this._exitConfirmPrevState = null;
    this._exitConfirmKind = 'exit';
    this.sandboxMode = false;
    this.sandboxConfig = defaultSandboxConfig();
    // Debug / sprite-tuning mode (drives nano-bot animation helpers)
    this.debugMode = false;
    this._debugKeysDown = new Set();
    // Intro cutscene state (pre-wave path reveal)
    this.introActive = false;
    this.introPhase = 0;
    this.introTimer = 0;
    this.introPathRevealCount = 0;
    this.introPathTotal = 0;
    this.introLines = null;
    this._introReadyShown = false;
    // Logged-in user (for backend saves)
    this.currentUser = null; // { username }

    // Character-specific runtime state (per run)
    this._resetCharacterRuntimeState();
    this.lastPilotLineWave = null;
    this.lastBossLineWave = null;
    this.lastReactorHitLineWave = null;
    this.lastBossLineWave = null;

    // Input
    this.mouse = { x:0, y:0, gx:0, gy:0 };
    this.placing = true; // default in placement mode
    this.selectedTower = 'basic';

    canvas.addEventListener('mousemove', (e)=>{
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top) * scaleY;
      this.mouse.gx = Math.floor(this.mouse.x / TILE_SIZE);
      this.mouse.gy = Math.floor(this.mouse.y / TILE_SIZE);
    });
    canvas.addEventListener('click', ()=> this.handleCanvasTap());

    // Touch support (tap to place/select)
    this._touch = { t0:0, x0:0, y0:0, moved:false };
    const getTouchPos = (e)=>{
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const t = e.touches[0] || e.changedTouches[0];
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY
      };
    };
    canvas.addEventListener('touchstart', (e)=>{
      if(this.state!=='playing') return;
      e.preventDefault();
      const p = getTouchPos(e);
      this.mouse.x = p.x; this.mouse.y = p.y;
      this.mouse.gx = Math.floor(this.mouse.x / TILE_SIZE);
      this.mouse.gy = Math.floor(this.mouse.y / TILE_SIZE);
      this._touch = { t0: performance.now(), x0: p.x, y0: p.y, moved:false };
    }, { passive:false });
    canvas.addEventListener('touchmove', (e)=>{
      if(this.state!=='playing') return;
      e.preventDefault();
      const p = getTouchPos(e);
      this.mouse.x = p.x; this.mouse.y = p.y;
      this.mouse.gx = Math.floor(this.mouse.x / TILE_SIZE);
      this.mouse.gy = Math.floor(this.mouse.y / TILE_SIZE);
      const dx = p.x - this._touch.x0, dy = p.y - this._touch.y0;
      if(Math.hypot(dx,dy) > 12) this._touch.moved = true;
    }, { passive:false });
    canvas.addEventListener('touchend', (e)=>{
      if(this.state!=='playing') return;
      e.preventDefault();
      const dt = performance.now() - this._touch.t0;
      if(!this._touch.moved && dt < 250){
        this.handleCanvasTap();
      }
    }, { passive:false });

    this.ui.on('startWave', ()=> this.startWave());
    this.ui.on('startGame', ()=>{
      // Endless Cycle entry point
      this.mode = 'endless';
      this.missionId = null;
      this.missionMaxWaves = null;
      this.startGame();
    });
    this.ui.on('pause', ()=> this.pause());
    this.ui.on('resume', ()=> this.resume());
    this.ui.on('retry', ()=> this.retry());
    this.ui.on('toMenu', ()=> {
      // From a live run (playing/paused), confirm before exiting to
      // main menu; from the game-over screen, jump straight back
      // without an extra confirmation dialog.
      if(this.state === 'gameover'){
        // Ensure any stale exit-confirm overlays are closed.
        if(this.ui.showExitConfirm) this.ui.showExitConfirm(false);
        this._exitConfirmCallback = null;
        this._exitConfirmPrevState = null;
        this._exitConfirmKind = 'exit';
        this.toMenu();
        return;
      }
      // Active run: use the standard confirmation flow.
      this.requestExitConfirm('exit', (ok)=>{
        if(ok) this.toMenu();
      });
    });
    this.ui.on('toMissionSelect', ()=> this.toMissionSelect());
    this.ui.on('selectTowerType', (v)=>{ this.selectedTower = v; });
    this.ui.on('selectMap', (key)=>{ const m = MAPS.find(x=>x.key===key); if(m){ this.selectedMap = m; } });
    this.ui.on('selectCharacter', (key)=>{
      if(!key) return;
      this.selectedCharacterKey = key;
      if(this.ui.setCharacterPortrait) this.ui.setCharacterPortrait(key);
      // Update any UI that depends on character (e.g., upgrade cost styling)
      this._updateCharacterPassivesForWave(this.waveIdx || 0);
    });
    this.ui.on('toggleFast', ()=> this.toggleFast());
    this.ui.on('closeUpg', ()=> { this.selected = null; this.ui.setUpgradePanel(null, this.credits); });
    this.ui.on('sellTower', ()=> this.openSellConfirm());
    this.ui.on('sellConfirm', ()=> this.sellSelectedConfirmed());
    this.ui.on('sellCancel', ()=> this.ui.showSell(false));
    this.ui.on('setVolume', (pct)=> { audio.setVolumePercent(pct); this.ui.setVolumeLabel(audio.getVolumeLabel()); });
    this.ui.on('upgradeSlow', ()=> this.upgradeSelected('slow'));
    this.ui.on('upgradeRate', ()=> this.upgradeSelected('rate'));
    this.ui.on('upgradeRange', ()=> this.upgradeSelected('range'));
    this.ui.on('upgradeBurn', ()=> this.upgradeSelected('burn'));
    // Shop handlers
    this.ui.on('shopBuy', (idx)=> this.shopBuy(idx));
    this.ui.on('shopReroll', ()=> this.shopReroll());
    this.ui.on('shopContinue', ()=> this.shopContinue());
    this.ui.on('shopBuyAbility', (key)=> this.shopBuyAbility(key));
    // Dev quick-open: trigger cinematic chamber sequence for testing
    this.ui.on('openShop', ()=> { if(this.startTeleportToShop) this.startTeleportToShop(); else this.openShop(); });
    this.ui.on('closeShop', ()=> this.closeShop());
    this.ui.on('devUnlockUlts', ()=> this.devUnlockAllUltimates());
    // Ability handlers
    this.ui.on('useBomb', ()=> this.tryUseBomb());
    this.ui.on('useOverclock', ()=> this.tryUseOverclock());
    this.ui.on('useCryo', ()=> this.tryUseCryo());
    // Dev mode
    this.devMode = this._readDevModePref();
    this.ui.on('toggleDev', (v)=> this.setDevMode(!!v));
    // Debug mode (sprite tuning helpers)
    this.ui.on('toggleDebug', (v)=> this.setDebugMode(!!v));
    // Automatic speed control (auto slow on boss/bonus/difficulty)
    this.autoSpeedControl = this._readAutoSpeedPref();
    this.ui.on('toggleAutoSpeed', (v)=> this.setAutoSpeedControl(!!v));
    this.ui.on('devUpgradeMax', ()=> this.upgradeSelectedMax());

    // Main menu flow
    this.ui.on('mainNew', ()=> this.handleMainNew());
    this.ui.on('mainLoad', ()=> this.handleMainLoad());
    this.ui.on('loadSlot', (slot)=> this.handleLoadSlot(slot));
    this.ui.on('loadBack', ()=> this.handleLoadBack());
    this.ui.on('menuBack', ()=> this.handleMenuBack());
    this.ui.on('mainAssembly', ()=> this.handleMainAssembly());
    this.ui.on('mainSandbox', ()=> this.handleMainSandbox());
    this.ui.on('mainSettings', ()=> this.handleMainSettings());
    this.ui.on('mainSettingsBack', ()=> this.handleMainSettingsBack());
    // Assembly War missions
    this.ui.on('closeAssembly', ()=> this.handleCloseAssembly());
    this.ui.on('assemblyMainMenu', ()=> this.toMenu());
    this.ui.on('startMission', (id)=> this.handleStartMission(id));
    this.ui.on('assemblySave', ()=> this.handleAssemblySave());
    this.ui.on('assemblyLoad', ()=> this.handleAssemblyLoad());
    this.ui.on('loginUser', (creds)=> this.handleLoginUser(creds));
    this.ui.on('openCreateUser', ()=> this.openCreateUser());
    this.ui.on('closeCreateUser', ()=> this.closeCreateUser());
    this.ui.on('createUser', (creds)=> this.handleCreateUser(creds));
    this.ui.on('openLeaderboard', ()=> this.openLeaderboard());
    this.ui.on('closeLeaderboard', ()=> this.closeLeaderboard());
    this.ui.on('leaderboardSignIn', ()=> this.handleLeaderboardSignIn());
    this.ui.on('logout', (payload)=> this.handleLogout(payload));
    this.ui.on('pauseLoginOpen', ()=> { this.profileOrigin = 'pause'; });
    this.ui.on('mainHowTo', ()=> this.handleOpenHowTo());
    this.ui.on('closeHowTo', ()=> this.handleCloseHowTo());
    this.ui.on('mainBug', ()=> this.handleOpenBug());
    this.ui.on('closeBug', ()=> this.handleCloseBug());
    this.ui.on('openAssemblyCore', ()=> this.openAssemblyCore());
    this.ui.on('removePassive', (key)=> this.refundPassive(key));
    this.ui.on('leaderboardSelectMap', (key)=>{ if(key){ this.leaderboardMapKey = key; this.refreshLeaderboard(key); } });
    this.ui.on('exitConfirm', ()=> this._handleExitConfirm(true));
    this.ui.on('exitCancel', ()=> this._handleExitConfirm(false));
    this.ui.on('exitToMenuImmediate', ()=> {
      if(this.ui.showPause) this.ui.showPause(false);
      this.toMenu();
    });
    this.ui.on('exitToDesktop', ()=> {
      try{
        if(typeof window !== 'undefined' && window.NANO_DESKTOP && typeof window.NANO_DESKTOP.quit === 'function'){
          window.NANO_DESKTOP.quit();
        }else if(typeof window !== 'undefined' && window.close){
          window.close();
        }
      }catch(e){}
    });
    this.ui.on('restart', ()=> {
      this.requestExitConfirm('restart', (ok)=>{
        if(ok) this.retry();
      });
    });
    this.ui.on('sandboxOpen', ()=> this.openSandboxFromRun());
    this.ui.on('sandboxStart', ()=> this.handleSandboxStart());
    this.ui.on('sandboxReset', ()=> this.resetSandboxConfig());

    this.ui.setWave(1);
    this.ui.setCredits(this.credits);
    if(this.ui.setFragments) this.ui.setFragments(this.fragments);
    if(this.ui.setCoreShards) this.ui.setCoreShards(this.coreShards);
    this.ui.setLives(this.lives);
    this.ui.setFastLabel(this.speedFactor);
    this.ui.highlightTowerBtn(this.selectedTower);
    this.ui.setVolumeLabel(audio.getVolumeLabel());
    if(this.ui.setVolumeSlider) this.ui.setVolumeSlider(audio.getVolumePercent());
    this.ui.setWaveStatus(false);
    if(this.ui.setWaveProgress) this.ui.setWaveProgress(0);
    this.refreshPassivePanel();
    if(this.ui.setBestWave) this.ui.setBestWave(this.bestWave);
    if(this.ui.setPerfectCombo) this.ui.setPerfectCombo(this.perfectCombo);
    if(this.ui.setPerfectBest) this.ui.setPerfectBest(this.bestPerfectCombo || 0);
    if(this.ui.resetBannerFeed) this.ui.resetBannerFeed();
    // Ensure ability buttons reflect unlock state
    if(this.ui.setAbilityVisible){
      this.ui.setAbilityVisible('bomb', this.abilities.bomb.unlocked);
      this.ui.setAbilityVisible('overclock', this.abilities.overclock.unlocked);
      this.ui.setAbilityVisible('cryo', this.abilities.cryo.unlocked);
    }
    if(this.updateAbilityUI) this.updateAbilityUI();

    // Apply Assembly War mission unlock progression from storage
    this.missionUnlockLevel = this._readMissionUnlock();
    if(this.ui.setMissionUnlock) this.ui.setMissionUnlock(this.missionUnlockLevel);

    // Initialize character HP portrait to current selection once the
    // game board is visible; we now do this at the start of each run
    // instead of during Game construction so it always reflects the
    // latest character pick.

    // Unlock audio on first user interaction
    window.addEventListener('pointerdown', ()=> audio.resume(), { once: true });

    this.last = now();

    // Start at fullscreen main menu (HTML has it visible by default)
    this.ui.showMenu(false);
    this.applyScaleMode('menu');

    // Sync dev mode toggle + state with persisted preference
    this.setDevMode(this.devMode);
    // Sync debug mode toggle with initial state (non-persisted)
    this.setDebugMode(this.debugMode);
    // Sync automatic speed control toggle with persisted preference
    this.setAutoSpeedControl(this.autoSpeedControl);

    if(typeof this._prewarmMainMenu === 'function'){
      this._prewarmMainMenu();
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e)=>{
      // Debug sprite-tuning hotkeys (only when Debug Mode is enabled)
      if(this.debugMode && typeof window !== 'undefined'){
        const debugKeys = new Set(['Insert','PageUp','Delete','PageDown','Home','End']);
        const key = e.key;
        const code = e.code || key;
        if(debugKeys.has(key)){
          if(!this._debugKeysDown) this._debugKeysDown = new Set();
          if(this._debugKeysDown.has(code)){
            // Ignore repeats while key is held; one step per physical press.
            e.preventDefault();
          } else {
            this._debugKeysDown.add(code);
            const g = window.NANO_SPRITE_DEBUG || {};
            const baseStart = 100;
            const baseSpan = 124 - 100 + 1; // 25 frames
            let start = Number.isFinite(g.start) ? (g.start|0) : baseStart;
            let span = Number.isFinite(g.span) ? (g.span|0) : baseSpan;
            let fpsMul = (typeof g.fpsMul === 'number' && isFinite(g.fpsMul) && g.fpsMul>0) ? g.fpsMul : 1;
            let handled = false;
            let speedChanged = false;
            // Frame window controls
            if(key === 'Insert'){ start -= 1; handled = true; }
            else if(key === 'PageUp'){ start += 1; handled = true; }
            else if(key === 'Delete'){ span -= 1; handled = true; }
            else if(key === 'PageDown'){ span += 1; handled = true; }
            // Speed controls (0.5x increments)
            else if(key === 'Home'){ fpsMul += 0.5; handled = true; speedChanged = true; }
            else if(key === 'End'){ fpsMul -= 0.5; handled = true; speedChanged = true; }

            if(handled){
              // Clamp frame window (assume current nano sheet size; kept
              // local here so we don't depend on enemy.js internals).
              const frameCount = 125;
              if(!Number.isFinite(start)) start = baseStart;
              start = Math.max(0, Math.min(frameCount-1, start));
              if(!Number.isFinite(span)) span = baseSpan;
              span = Math.max(1, Math.min(frameCount - start, span));
              g.start = start;
              g.span = span;
              // Clamp speed multiplier
              if(speedChanged){
                const MIN_SPEED = 0.5;
                const MAX_SPEED = 4.0;
                fpsMul = Math.max(MIN_SPEED, Math.min(MAX_SPEED, fpsMul));
                this.setDebugAnimSpeed(fpsMul);
              }
              if(g.enabled == null) g.enabled = true;
              window.NANO_SPRITE_DEBUG = g;
              e.preventDefault();
            }
          }
        }
      }
      if(this.state==='chamber'){
        if(e.key==='Enter' || e.key==='Escape'){ this.closeChamber(); }
        if(e.key==='r' || e.key==='R'){ this.shopReroll(); this.buildChamberNodes(); }
        return;
      }
      if(e.key === 'p' || e.key === 'P' || e.key === 'Escape'){
      if(this.state === 'playing') this.pause();
      else if(this.state === 'paused') this.resume();
      }
    });
    window.addEventListener('keyup', (e)=>{
      if(this._debugKeysDown){
        const code = e.code || e.key;
        this._debugKeysDown.delete(code);
      }
    });
  }

  _resetCharacterRuntimeState(){
    // Per-run character-driven multipliers and counters.
    this.characterDamageMul = {
      cannon: 1.0,
      laser: 1.0,
      splash: 1.0
    };
    this.characterFireRateMul = {
      cannon: 1.0,
      laser: 1.0,
      splash: 1.0
    };
    this.characterTowerCostMul = {
      cannon: 1.0,
      laser: 1.0,
      splash: 1.0
    };
    this.characterRotationSpeedMul = {
      cannon: 1.0,
      laser: 1.0,
      splash: 1.0
    };
    this.characterSplashRadiusMul = 1.0;
    this.characterStatusEffectMul = 1.0; // slow + burn strength
    this.characterPuddleSpreadSpeedMul = 1.0; // Acid puddle growth speed
    this.characterLaserStabilityMul = 1.0; // laser beam stability ramp speed
    this.characterUpgradeCostMul = 1.0;
    this.characterPlacementCostMul = 1.0;
    this.characterKillCounters = {
      cannon: 0
    };
  }

  _updateCharacterPassivesForWave(waveNumber){
    // Recompute all character-derived multipliers from scratch based on
    // the currently selected character and the given wave number.
    if(waveNumber == null || !Number.isFinite(waveNumber)){
      waveNumber = 0;
    }
    const steps5 = Math.max(0, Math.floor(waveNumber / 5));
    this.characterDamageMul = { cannon: 1.0, laser: 1.0, splash: 1.0 };
    this.characterFireRateMul = { cannon: 1.0, laser: 1.0, splash: 1.0 };
    this.characterTowerCostMul = { cannon: 1.0, laser: 1.0, splash: 1.0 };
    this.characterRotationSpeedMul = { cannon: 1.0, laser: 1.0, splash: 1.0 };
    this.characterSplashRadiusMul = 1.0;
    this.characterStatusEffectMul = 1.0;
    this.characterPuddleSpreadSpeedMul = 1.0;
    this.characterLaserStabilityMul = 1.0;
    this.characterUpgradeCostMul = 1.0;
    this.characterPlacementCostMul = 1.0;
    const key = this.selectedCharacterKey || 'volt';
    if(key === 'volt'){
      // Volt — Cannon Specialist
      // Passive 1: +12% Cannon damage (stronger burst identity)
      this.characterDamageMul.cannon *= 1.12;
      // Passive 2: +3% Cannon fire-rate every 5 waves
      if(steps5 > 0){
        this.characterFireRateMul.cannon *= (1 + 0.03 * steps5);
      }
      // Passive: +15% Cannon rotation speed
      this.characterRotationSpeedMul.cannon *= 1.15;
      // Preferred tower: Cannon placement cost -20%
      this.characterTowerCostMul.cannon *= 0.8;
      // Weak synergy with Acid puddle spread (slower bloom)
      this.characterPuddleSpreadSpeedMul *= 0.90; // -10%
      // Volt leans into rotation/burst; lasers stabilize more slowly.
      this.characterLaserStabilityMul *= 0.90; // -10%
    } else if(key === 'lumen'){
      // Lumen — Laser Specialist
      // Passive 1: +10% Laser DPS
      let laserMul = 1.10;
      // Passive 2: +3% Laser DPS every 5 waves
      if(steps5 > 0){
        laserMul *= (1 + 0.03 * steps5);
      }
      this.characterDamageMul.laser *= laserMul;
      // Passive 3: All tower upgrades cost 20% less
      this.characterUpgradeCostMul = 0.8;
      // Preferred tower: Laser placement cost -20%
      this.characterTowerCostMul.laser *= 0.8;
      // Passive: -10% Cannon rotation speed (cannons feel sluggish early)
      this.characterRotationSpeedMul.cannon *= 0.90;
      // Acid puddles bloom a bit slower for Lumen.
      this.characterPuddleSpreadSpeedMul *= 0.90; // -10%
      // Lumen specializes in sustained beams; faster stability ramp.
      this.characterLaserStabilityMul *= 1.25; // +25%
    } else if(key === 'torque'){
      // Torque — Moarter Specialist
      // Passive 1: +20% Acid puddle radius (larger max puddle size)
      this.characterSplashRadiusMul *= 1.20;
      // Passive 2: +5% Moarter damage every 5 waves
      if(steps5 > 0){
        this.characterDamageMul.splash *= (1 + 0.05 * steps5);
      }
      // Passive 3: Burn + Slow effects are 20% stronger (global)
      this.characterStatusEffectMul = 1.20;
      // Strong synergy with Acid puddle spread (faster bloom)
      this.characterPuddleSpreadSpeedMul *= 1.20; // +20%
      // Preferred tower: Moarter placement cost -20%
      this.characterTowerCostMul.splash *= 0.8;
      // Passive: -10% Cannon rotation speed
      this.characterRotationSpeedMul.cannon *= 0.90;
      // Torque is splash-focused; lasers stabilize slightly slower than neutral.
      this.characterLaserStabilityMul *= 0.95; // -5%
    }
    // Sync any UI that depends on upgrade cost discount.
    if(this.ui){
      if(typeof this.ui.setUpgradeCostMultiplier === 'function'){
        this.ui.setUpgradeCostMultiplier(this.characterUpgradeCostMul || 1);
        // Refresh upgrade panel labels if one is open.
        if(this.selected && this.ui.setUpgradePanel){
          this.ui.setUpgradePanel(this.selected, this.credits);
        }
      }
      // Update tower palette prices to reflect current character discounts.
      if(typeof this.ui.setTowerCosts === 'function'){
        const types = ['basic','laser','splash'];
        const costs = {};
        for(const key of types){
          costs[key] = this.getTowerPlacementCost(key);
        }
        this.ui.setTowerCosts(costs);
      }
    }
  }

  getTowerDamageMul(kind){
    if(!kind) return 1;
    const map = this.characterDamageMul || {};
    if(kind === 'basic' || kind === 'cannon') return map.cannon || 1;
    if(kind === 'laser') return map.laser || 1;
    if(kind === 'splash') return map.splash || 1;
    return 1;
  }

  getTowerFireRateMul(kind){
    if(!kind) return 1;
    const map = this.characterFireRateMul || {};
    if(kind === 'basic' || kind === 'cannon') return map.cannon || 1;
    if(kind === 'laser') return map.laser || 1;
    if(kind === 'splash') return map.splash || 1;
    return 1;
  }

  getSplashRadiusMul(){
    const base = Math.max(1, buffs.splashRadiusMul || 1);
    const charMul = this.characterSplashRadiusMul || 1;
    return base * charMul;
  }

  getPuddleSpreadSpeedMul(){
    const charMul = this.characterPuddleSpreadSpeedMul || 1;
    const buffMul = buffs.puddleSpreadSpeedMul || 1;
    return charMul * buffMul;
  }

  getLaserStabilityMul(){
    return this.characterLaserStabilityMul || 1;
  }

  getTowerRotationSpeedMul(kind){
    if(!kind) return 1;
    const map = this.characterRotationSpeedMul || {};
    if(kind === 'basic' || kind === 'cannon') return map.cannon || 1;
    if(kind === 'laser') return map.laser || 1;
    if(kind === 'splash') return map.splash || 1;
    return 1;
  }

  getTowerCostMul(kind){
    if(!kind) return 1;
    const map = this.characterTowerCostMul || {};
    if(kind === 'basic' || kind === 'cannon') return map.cannon || 1;
    if(kind === 'laser') return map.laser || 1;
    if(kind === 'splash') return map.splash || 1;
    return 1;
  }

  getTowerPlacementCost(type){
    if(!type) return Infinity;
    const def = TOWER_TYPES[type];
    if(!def) return Infinity;
    const base = def.cost || 0;
    const placeMul = this.characterPlacementCostMul || 1;
    const typeMul = (typeof this.getTowerCostMul === 'function')
      ? this.getTowerCostMul(def.key || type)
      : 1;
    return Math.max(0, Math.round(base * placeMul * typeMul));
  }

  getTowerPreviewRange(type){
    if(!type) return 0;
    const def = TOWER_TYPES[type];
    if(!def || !def.range) return 0;
    const baseRange = def.range || 0;
    const chronoBoost = buffs.chronoActive ? (1 + (buffs.chronoRangeBonus||0)) : 1;
    const globalMul = buffs.rangeMul || 1;
    return baseRange * globalMul * chronoBoost;
  }

  getStatusEffectMul(){
    return this.characterStatusEffectMul || 1;
  }

  getUpgradeCostMultiplier(){
    return this.characterUpgradeCostMul || 1;
  }

  _maybeShowPilotLine(waveNumber, isAssembly){
    if(!this.ui || !this.ui.showPilotLine) return;
    if(isAssembly) return; // keep Assembly tone quieter for now
    const key = this.selectedCharacterKey || 'volt';
    const LINES = {
      volt: [
        'Targets in sight. Keep the cannons talking.',
        'Clean lanes, fast shots—that\'s how we stay ahead.',
        'More contacts. Good. I wasn’t done firing.',
        'Steady hands, loud barrels. Keep it moving.'
      ],
      lumen: [
        'Signatures locked. I\'ll carve them down efficiently.',
        'Calm focus. We\'ll vaporize them on schedule.',
        'Density mapped. Lasers will do the rest.',
        'Stay where you are and let the beams work.'
      ],
      torque: [
        'Big crowd loading in. Perfect.',
        'Lots of bodies, small hallway… my favorite combo.',
        'Slow and steady won’t cut it—let\'s drown them in shrapnel.',
        'Let \'em bunch up. I\'ll do the cleanup.'
      ]
    };
    const lines = LINES[key] || LINES.volt;
    if(!lines || !lines.length) return;
    const isFirst = waveNumber === 1;
    const minGap = 3;
    if(!isFirst && this.lastPilotLineWave != null && (waveNumber - this.lastPilotLineWave) < minGap){
      return;
    }
    const chance = isFirst ? 1 : 0.35;
    if(!isFirst && Math.random() >= chance){
      return;
    }
    const idx = Math.floor(Math.random() * lines.length);
    const text = lines[idx];
    this.lastPilotLineWave = waveNumber;
    this.ui.showPilotLine(text, key);
  }

  _maybeShowBossKillLine(){
    if(!this.ui || !this.ui.showPilotLine) return;
    const key = this.selectedCharacterKey || 'volt';
    const LINES = {
      volt: [
        'Boss down. Cycle the cannons and move on.',
        'Didn\'t even have to ease off the trigger.',
        'Clean burst, clean finish.',
        'Thought it could stand in front of a firing line. It was wrong.',
        'Reloading—mostly so the guns don\'t feel left out.'
      ],
      lumen: [
        'Boss neutralized. Output was within expected margins.',
        'Structural integrity failed faster than projected.',
        'That was a boss? I\'ve debugged tougher vending machines.',
        'Beam convergence optimal. Threat deleted.',
        'Precision and patience. Everything else is noise.'
      ],
      torque: [
        'Big target, bigger pop. Satisfying.',
        'Cleanup\'s still going to take longer than the fight.',
        'Nothing like a good detonation to clear the head.',
        'Hope that boss liked company—it just joined the scrap pile.',
        'Told you. Let them group up and I\'ll handle the rest.'
      ]
    };
    const lines = LINES[key] || LINES.volt;
    if(!lines || !lines.length) return;
    const waveNumber = (this.waveIdx || 0) + 1;
    // Only one quip per wave to avoid spam.
    if(this.lastBossLineWave != null && this.lastBossLineWave === waveNumber){
      return;
    }
    const idx = Math.floor(Math.random() * lines.length);
    const text = lines[idx];
    this.lastBossLineWave = waveNumber;
    this.ui.showPilotLine(text, key);
  }

  _maybeShowReactorHitLine(waveNumber){
    if(!this.ui || !this.ui.showPilotLine) return;
    const key = this.selectedCharacterKey || 'volt';
    const LINES = {
      volt: [
        'Reactor hit. Tighten the fire lanes, now.',
        'They slipped through—no more freebies.',
        'Core\'s taking scratches. I\'m not letting it crack.',
        'Bad hit on the grid. We shut this down fast.',
        'Eyes up. That line does not break again.'
      ],
      lumen: [
        'Reactor integrity dropping. I\'ll adjust firing solutions.',
        'Breach registered. Defense layout needs correction.',
        'Energy spike on the core—one slipped past.',
        'Reactor touched. That statistic does not repeat.',
        'Damage logged. Recalculating optimal kill zones.'
      ],
      torque: [
        'Reactor just took a hit. I don\'t like that.',
        'Who let that one through? Patch the gap and double the shells.',
        'Core got dinged—time for real crowd control.',
        'That hurt. Let\'s make them regret getting this close.',
        'Reactor\'s feeling it. More boom on the front line.'
      ]
    };
    const lines = LINES[key] || LINES.volt;
    if(!lines || !lines.length) return;
    const wave = waveNumber || ((this.waveIdx || 0) + 1);
    // Only one quip per wave to avoid spam if multiple leaks happen.
    if(this.lastReactorHitLineWave != null && this.lastReactorHitLineWave === wave){
      return;
    }
    const idx = Math.floor(Math.random() * lines.length);
    const text = lines[idx];
    this.lastReactorHitLineWave = wave;
    this.ui.showPilotLine(text, key);
  }

  // Clear all temporary ability unlocks/levels and sync UI (used when returning to main menu).
  resetAbilityUnlocks(){
    this.abilities = {
      bomb: { unlocked:false, level:0, cd:0, cdMax:12, radius:70, damage:120 },
      overclock: { unlocked:false, level:0, cd:0, cdMax:25, dur:8, boost:1.0, active:false, durLeft:0, _applied:false },
      cryo: { unlocked:false, level:0, cd:0, cdMax:20, slow:0.5, dur:2.5, active:false, timeLeft:0 },
      corehp: { level:0 }
    };
    this.recomputeAbilityParams();
    if(this.ui.setAbilityVisible){
      this.ui.setAbilityVisible('bomb', false);
      this.ui.setAbilityVisible('overclock', false);
      this.ui.setAbilityVisible('cryo', false);
    }
    if(this.updateAbilityUI) this.updateAbilityUI();
  }

  // Stop all looping/continuous audio safely
  stopAllAudio(){
    try{ audio.stopLowHp(); }catch(e){}
    for(const t of (this.towers||[])){
      if(t && typeof t.stopAudio === 'function'){
        try{ t.stopAudio(); }catch(e){}
      }
    }
  }

  start(){ requestAnimationFrame(()=>this.loop()); }

  applyScaleMode(mode){
    if(typeof window !== 'undefined' && typeof window.setMode === 'function'){
      window.setMode(mode);
    }
  }

  startGame(){
    // Show a mode-specific loading overlay so any one-time hitches
    // (grid reset, tower/enemy setup, etc.) are hidden behind a small
    // "Starting ..." screen, similar to the initial boot loader.
    const hasUI = !!(this.ui && this.ui.showModeLoading && this.ui.hideModeLoading);
    let t0 = null;
    const minDuration = 650; // ms
    if(hasUI){
      let title = 'Starting...';
      if(this.mode === 'assembly'){
        title = 'Starting Assembly War…';
      } else if(this.sandboxMode){
        title = 'Starting Sandbox…';
      } else {
        title = 'Starting Endless Cycle…';
      }
      this.ui.showModeLoading(title, 'Preparing reactor chamber…');
      t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }
    const runCore = ()=>{
      this._startGameCore();
      if(hasUI){
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsed = t0 != null ? (now - t0) : 0;
        const remaining = Math.max(0, minDuration - elapsed);
        if(remaining > 0){
          setTimeout(()=> this.ui.hideModeLoading(), remaining);
        } else {
          this.ui.hideModeLoading();
        }
      }
    };
    if(typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'){
      window.requestAnimationFrame(()=> runCore());
    } else {
      setTimeout(runCore, 0);
    }
  }

  _startGameCore(){
    // Ensure any lingering loops are silenced before start
    this.stopAllAudio();
    // Endless Cycle should always start from a fresh
    // progression state (no carried-over abilities).
    if(this.mode === 'endless'){
      this.resetAbilityUnlocks();
    }
    // Fresh character passives for this run (wave 0 baseline).
    this._resetCharacterRuntimeState();
    this._updateCharacterPassivesForWave(0);

    this.reset();
    // Ensure the HP portrait (blink/talk animation) is always synced
    // to the character actually chosen on the map-select screen when
    // a run begins, not just the initial default.
    if(this.ui.setCharacterPortrait){
      this.ui.setCharacterPortrait(this.selectedCharacterKey || 'volt');
    }
    audio.resume();
    this.applyScaleMode('game');
    if(this.ui.setSandboxSettingsVisible) this.ui.setSandboxSettingsVisible(this.sandboxMode);
    // Ensure no menu overlay blur/pointer lock persists into gameplay
    if(typeof document !== 'undefined'){
      document.body.classList.remove('mainmenu-visible');
    }
    // Hide all fullscreen menus when entering gameplay
    if(this.ui.showMainMenu) this.ui.showMainMenu(false);
    if(this.ui.showMenu) this.ui.showMenu(false);
    if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
    if(this.ui.showCreateMenu) this.ui.showCreateMenu(false);
    if(this.ui.showLeaderboard) this.ui.showLeaderboard(false);
    if(this.ui.showMainSettings) this.ui.showMainSettings(false);
    if(this.ui.showMapSelect) this.ui.showMapSelect(false);
    if(this.ui.showAssembly) this.ui.showAssembly(false);
    if(this.ui.updateModalMask) this.ui.updateModalMask();
    if(this.ui.$root) this.ui.$root.classList.remove('modal-overlay');
    this.ui.showPause(false);
    this.ui.showGameOver(false);
    this.ui.setPauseLabel('Pause');
    this.ui.setUpgradePanel(null, this.credits);
    if(this.updateAbilityUI) this.updateAbilityUI();
    // Begin intro cutscene before gameplay starts.
    this.startIntroCutscene();
  }

  reset(){
    this.grid = new Grid(this.selectedMap);
    this.credits = GAME_RULES.startingCredits;
    this.fragments = 0;
    this.coreShards = 0;
    this.passives = { active: [], capacity: 4, slotBoost: false };
    this.recomputeSlotPassives();
    this.lives = GAME_RULES.startingLives;
    this.waveIdx = 0;
    this.bestWave = 0;
    this.spawner = { active:false, time:0, queue:[] };
    this.enemies = [];
    this.towers = [];
    this.time = 0;
    this.selected = null;
    this.bonusActive = false;
    this.waveLostHP = false;
    this.perfectCombo = 0;
    this.bestPerfectCombo = 0;
    this.livesAtWaveStart = this.lives;
    this.bonusPayout = Math.min(GAME_RULES.bigWaveBonus, GAME_RULES.bonusMaxPayout || Infinity);
    this.lastBonusWave = null;
    this.bonusHistory = [];
    this.shop = { index: 0, offers: [], rerollPrice: GAME_RULES.rerollBasePrice || 50 };
    this.hazardZones = [];
    this.thermalVentingCd = 0;
    this.singularityCounter = 0;
    this.nanoKillCounter = 0;
    this.nanoDrones = [];
    this.reactorShield = 0;
    this.bombBursts = [];
    this.chrono = { timer: 0, active: false, timeLeft: 0 };
    buffs.chronoActive = false;
    // Reset character runtime state but keep the selected hero.
    this._resetCharacterRuntimeState();
    this._updateCharacterPassivesForWave(0);
    this.lastPilotLineWave = null;
    this.lastBossLineWave = null;
    this.lastReactorHitLineWave = null;
    // Reset abilities runtime state (unlocks persist only if re-unlocked during the run)
    this.placingBomb = false;
    this.abilities.bomb.cd = 0;
    this.abilities.overclock.cd = 0; this.abilities.overclock.active = false; this.abilities.overclock._applied = false;
    this.abilities.cryo.cd = 0;
    if(this.ui.setAbilityVisible){
      this.ui.setAbilityVisible('bomb', this.abilities.bomb.unlocked);
      this.ui.setAbilityVisible('overclock', this.abilities.overclock.unlocked);
      this.ui.setAbilityVisible('cryo', this.abilities.cryo.unlocked);
    }
    if(this.updateAbilityUI) this.updateAbilityUI();
    // If cheat mode is active, keep credits effectively infinite and reflect UI
    if(this.isCheatMode()){ this.credits = Math.max(this.credits, 999999); }
    this.ui.setWave(1);
    this.ui.setCredits(this.credits);
    if(this.ui.setBestWave) this.ui.setBestWave(this.bestWave);
    if(this.ui.setPerfectCombo) this.ui.setPerfectCombo(0);
    if(this.ui.setPerfectBest) this.ui.setPerfectBest(0);
    if(this.ui.resetBannerFeed) this.ui.resetBannerFeed();
    if(this.ui.setFragments) this.ui.setFragments(this.fragments);
    if(this.ui.setCoreShards) this.ui.setCoreShards(this.coreShards);
    this.ui.setLives(this.lives);
    this.GAME_MAX_LIVES = GAME_RULES.startingLives;
    if(this.ui.setMaxLives){ this.ui.setMaxLives(this.GAME_MAX_LIVES); }
    this.refreshPassivePanel();
    this.stopAllAudio();
    this.lowHpActive = false;
    this.shakeMag = 0;
    // Ambient motes reset
    this.ambient = [];
    const N = 70;
    for(let i=0;i<N;i++){
      const x = Math.random()*CANVAS_W;
      const y = Math.random()*CANVAS_H;
      const s = 1 + Math.random()*2.2; // size
      const hueShift = Math.random();
      const vx = (-12 + Math.random()*24) * 0.2;
      const vy = (-10 + Math.random()*20) * 0.2;
      this.ambient.push({ x,y, vx,vy, r:s, a: 0.35 + Math.random()*0.45, phase: Math.random()*Math.PI*2, hue:hueShift });
    }
  }

  // --- Intro cutscene (pre-run reactor alert + path reveal) -------------
  startIntroCutscene(){
    this.introActive = true;
    this.introPhase = 0;
    this.introTimer = 0;
    this.introPathRevealCount = 0;
    this._introReadyShown = false;
    // Build a simple reveal list of path cells in traversal order.
    const cells = [];
    if(this.grid && Array.isArray(this.grid.pathsCells) && this.grid.pathsCells.length){
      for(const p of this.grid.pathsCells){
        if(!Array.isArray(p)) continue;
        for(const cell of p){ cells.push(cell); }
      }
    } else if(this.grid && Array.isArray(this.grid.pathCells)){
      for(const cell of this.grid.pathCells){ cells.push(cell); }
    }
    this.introPathTotal = cells.length;
    this.introLines = this._getIntroLines();
    this.state = 'intro';
    // Trigger an immediate pilot line so the portrait starts in
    // "talking" mode as soon as the cutscene begins.
    const key = this.selectedCharacterKey || 'volt';
    if(this.ui.showPilotLine && this.introLines && this.introLines.alert){
      this.ui.showPilotLine(this.introLines.alert, key);
    }
    // Disable wave start controls during the intro.
    if(this.ui.setStartEnabled) this.ui.setStartEnabled(false);
    if(this.ui.setWaveStatus) this.ui.setWaveStatus(false);
    if(this.ui.setWaveProgress) this.ui.setWaveProgress(0);
    if(this.ui.setWaveRemaining) this.ui.setWaveRemaining(0, 0);
    // Hide the combat stats card during the cinematic so it does not overlap.
    if(typeof document !== 'undefined'){
      const cs = document.getElementById('combat-stats');
      if(cs) cs.style.display = 'none';
    }
  }

  _getIntroLines(){
    const key = this.selectedCharacterKey || 'volt';
    const TABLE = {
      volt: {
        alert: [
          'Sensors are lighting up—swarm building fast.',
          'Radar just spiked. We\'ve got a crowd warming up.',
          'Calm board, loud alarms. Something big is rolling in.'
        ],
        ready: [
          'Alright, let’s light up this corridor.',
          'I\'ve got the angles—keep the shots flowing.',
          'Line ’em up and keep the pace high.'
        ]
      },
      lumen: {
        alert: [
          'Background noise rising. Enemy signatures compiling near the grid.',
          'Chamber\'s still, but the numbers say otherwise.',
          'No tracks yet… but their paths are already predictable.'
        ],
        ready: [
          'Trajectories resolved. We\'ll trim this down efficiently.',
          'Paths locked. Minimal motion, maximum output.',
          'I\'ll keep the beams tidy. Just don\'t get in the way.'
        ]
      },
      torque: {
        alert: [
          'Quiet floor, twitchy alarms. Classic.',
          'Core\'s calm, but the siren\'s not faking it.',
          'No tracks yet… give \'em a moment and they\'ll pour in.'
        ],
        ready: [
          'Good. Plenty of room for explosions.',
          'Let\'s turn this hallway into a pressure washer.',
          'Paths or no paths, I\'m ready to make a mess.'
        ]
      }
    };
    const pack = TABLE[key] || TABLE.volt;
    const pick = (arr)=> arr && arr.length ? arr[Math.floor(Math.random()*arr.length)] : '';
    return {
      alert: pick(pack.alert),
      ready: pick(pack.ready)
    };
  }

  updateIntro(dt){
    if(!this.introActive) return;
    // Keep background animation time advancing during the intro.
    this.time += dt;
    this.introTimer += dt;
    const key = this.selectedCharacterKey || 'volt';
    const EMPTY_TIME = 2.0;
    const ALERT_TIME = 1.5;
    const PATH_INTERVAL = 0.055;

    if(this.introPhase === 0){
      if(this.introTimer >= EMPTY_TIME){
        this.introPhase = 1;
        this.introTimer = 0;
        try{
          if(audio.bossIntro) audio.bossIntro();
        }catch(e){}
      }
    } else if(this.introPhase === 1){
      if(this.introTimer >= ALERT_TIME){
        this.introPhase = 2;
        this.introTimer = 0;
        this.introPathRevealCount = 0;
        this.addShake(8);
      }
    } else if(this.introPhase === 2){
      if(this.introPathTotal <= 0){
        this.introPhase = 3;
        this.introTimer = 0;
      } else {
        const target = Math.min(this.introPathTotal, Math.floor(this.introTimer / PATH_INTERVAL));
        if(target > this.introPathRevealCount){
          this.introPathRevealCount = target;
        }
        if(this.introPathRevealCount >= this.introPathTotal){
          this.introPhase = 3;
          this.introTimer = 0;
          this.addShake(6);
        }
      }
    } else if(this.introPhase === 3){
      if(!this._introReadyShown && this.ui.showPilotLine && this.introLines && this.introLines.ready){
        this.ui.showPilotLine(this.introLines.ready, key);
        this._introReadyShown = true;
      }
      if(this.introTimer >= 0.6){
        this.finishIntroCutscene();
      }
    }
  }

  finishIntroCutscene(){
    this.introActive = false;
    this.introPhase = 0;
    this.introTimer = 0;
    this.introPathRevealCount = 0;
    this.introPathTotal = 0;
    this._introReadyShown = false;
    this.state = 'playing';
    // Restore combat stats visibility now that gameplay is live.
    if(typeof document !== 'undefined'){
      const cs = document.getElementById('combat-stats');
      if(cs) cs.style.display = '';
    }
    if(this.ui.setStartEnabled) this.ui.setStartEnabled(true);
  }

  pause(){
    if(this.state==='playing'){
      this.state='paused';
      // Update the extra pause button label depending on mode:
      // - Assembly War: "Back to Mission Select"
      // - Endless Cycle: "Select Game Mode"
      if(this.ui.setPauseMissionLabel){
        if(this.mode === 'assembly') this.ui.setPauseMissionLabel('Back to Mission Select');
        else this.ui.setPauseMissionLabel('Select Game Mode');
      }
      this.ui.showPause(true);
      if(this.ui.setHpPortraitPaused) this.ui.setHpPortraitPaused(true);
      this.ui.setPauseLabel('Resume');
      this.stopAllAudio();
    }
  }
  resume(){
    if(this.state==='paused'){
      this.state='playing';
      this.ui.showPause(false);
      if(this.ui.setHpPortraitPaused) this.ui.setHpPortraitPaused(false);
      this.ui.setPauseLabel('Pause');
    }
  }
  retry(){ this.startGame(); }
  toMenu(){
    this.state='menu';
    this.applyScaleMode('menu');
    this.ui.showPause(false);
    this.ui.showGameOver(false);
    this.resetAbilityUnlocks();
    this.sandboxMode = false;
    if(this.ui.setSandboxSettingsVisible) this.ui.setSandboxSettingsVisible(false);
    // Return to top-level main menu
    if(this.ui.showMenu) this.ui.showMenu(false);
    if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
    if(this.ui.showMainMenu) this.ui.showMainMenu(true);
    if(this.ui.showMapSelect) this.ui.showMapSelect(false);
    this.ui.setPauseLabel('Pause');
    this.ui.setUpgradePanel(null, this.credits);
    this.stopAllAudio();
  }
  toMissionSelect(){
    // Return from in-game (usually paused) to the Assembly War
    // mission select screen. If not in Assembly mode, fall back
    // to the main menu.
    this.state = 'menu';
    this.applyScaleMode('menu');
    this.ui.showPause(false);
    this.ui.showGameOver(false);
    if(this.mode === 'assembly' && this.ui.showAssembly){
      // Back to Assembly War mission select
      if(this.ui.showMenu) this.ui.showMenu(false);
      if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
      if(this.ui.showMainMenu) this.ui.showMainMenu(false);
      this.ui.showAssembly(true);
    } else {
      // Endless Cycle: go back to main menu game mode selection
      if(this.ui.showAssembly) this.ui.showAssembly(false);
      if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
      if(this.ui.showMenu) this.ui.showMenu(false);
      if(this.ui.showMainMenu) this.ui.showMainMenu(true);
    }
    this.ui.setPauseLabel('Pause');
    this.ui.setUpgradePanel(null, this.credits);
    this.stopAllAudio();
  }

  // From Assembly War mission select, open the Assembly Core (Nanocore chamber)
  openAssemblyCore(){
    // Hide mission select and any other fullscreen menus
    if(this.ui.showAssembly) this.ui.showAssembly(false);
    if(this.ui.showMenu) this.ui.showMenu(false);
    if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
    if(this.ui.showMainMenu) this.ui.showMainMenu(false);
    // Ensure we are in Assembly mode and remember that we came
    // from the mission select screen so we can return there after
    // leaving the Nanocore chamber.
    this.mode = 'assembly';
    this.coreReturnTarget = 'assembly';
    // Use gameplay scaling so the chamber matches the in-run view.
    this.applyScaleMode('game');
    // Reuse the cinematic teleport → chamber flow used in Endless
    // Cycle, so the Assembly Core feels consistent.
    if(this.startTeleportToShop) this.startTeleportToShop();
    else this.openShop();
  }

  // Backend user profile helpers ---------------------------------------

  buildUserState(){
    return {
      version: 1,
      mode: this.mode,
      missionId: this.missionId || null,
      nanoCredits: this.credits|0,
      dataFragments: this.fragments|0,
      coreShards: this.coreShards|0,
      bestWave: this.bestWave|0,
      bestPerfectCombo: this.bestPerfectCombo|0,
      passives: this.passives || { active: [], capacity: 4, slotBoost: false },
      abilities: this.abilities || null,
      shopIndex: (this.shop && typeof this.shop.index==='number') ? this.shop.index : 0,
      missionUnlockLevel: this.missionUnlockLevel || 1,
      timestamp: Date.now()
    };
  }

  applyUserState(data){
    if(!data || typeof data !== 'object') return;
    // Currently we care about Assembly meta progression.
    if(data.mode === 'assembly'){
      this.mode = 'assembly';
      this.missionId = data.missionId || null;
      this.missionMaxWaves = this.missionId ? getMissionTotalWaves(this.missionId) : null;
      this.credits = (typeof data.nanoCredits === 'number') ? data.nanoCredits : GAME_RULES.startingCredits;
      this.fragments = (typeof data.dataFragments === 'number') ? data.dataFragments : 0;
      this.coreShards = (typeof data.coreShards === 'number') ? data.coreShards : 0;
      const rawPassives = data.passives || {};
      const cap = Math.max(4, Math.min(6, rawPassives.capacity || 4));
      let activeSlots = [];
      if(Array.isArray(rawPassives.active) && rawPassives.active.length){
        activeSlots = this.normalizePassiveEntries(rawPassives.active, cap);
      } else if(rawPassives.levels){
        activeSlots = this.convertLegacyPassives(rawPassives.levels, cap);
      }
      this.passives = {
        active: activeSlots,
        capacity: cap,
        slotBoost: !!rawPassives.slotBoost || cap>4
      };
      this.recomputeSlotPassives();
      if(data.abilities){
        const src = data.abilities;
        const dst = this.abilities;
        for(const key of ['bomb','overclock','cryo','corehp']){
          if(src[key] && dst[key]){
            if('unlocked' in src[key]) dst[key].unlocked = !!src[key].unlocked;
            if('level' in src[key]) dst[key].level = src[key].level|0;
          }
        }
        this.recomputeAbilityParams();
      }
      if(data.shopIndex!=null) this.shop.index = data.shopIndex|0;
      if(typeof data.missionUnlockLevel === 'number'){
        this.missionUnlockLevel = Math.max(1, Math.min(6, data.missionUnlockLevel|0));
        if(this.ui.setMissionUnlock) this.ui.setMissionUnlock(this.missionUnlockLevel);
        this._writeMissionUnlock(this.missionUnlockLevel);
      }
      if(typeof data.bestWave === 'number'){
        this.bestWave = Math.max(this.bestWave, data.bestWave|0);
      }
      if(typeof data.bestPerfectCombo === 'number'){
        this.bestPerfectCombo = Math.max(this.bestPerfectCombo||0, data.bestPerfectCombo|0);
      }
      this.perfectCombo = 0;
      if(this.ui.setBestWave) this.ui.setBestWave(this.bestWave);
      if(this.ui.setPerfectCombo) this.ui.setPerfectCombo(0);
      if(this.ui.setPerfectBest) this.ui.setPerfectBest(this.bestPerfectCombo || 0);
      if(this.ui.resetBannerFeed) this.ui.resetBannerFeed();
      if(this.ui.setCredits) this.ui.setCredits(this.credits);
      if(this.ui.setFragments) this.ui.setFragments(this.fragments);
      if(this.ui.setCoreShards) this.ui.setCoreShards(this.coreShards);
      if(this.ui.setAbilityVisible){
        this.ui.setAbilityVisible('bomb', this.abilities.bomb.unlocked);
        this.ui.setAbilityVisible('overclock', this.abilities.overclock.unlocked);
        this.ui.setAbilityVisible('cryo', this.abilities.cryo.unlocked);
      }
      if(this.updateAbilityUI) this.updateAbilityUI();
      this.refreshPassivePanel();
    }
  }

  refreshProfileSlots(){
    // Legacy localStorage slot UI is no longer used.
  }

  _saveKey(slot){
    const s = Number(slot)||0;
    return `nano_siege_save_v1_slot${s}`;
  }
  _readProfile(slot){
    if(typeof window === 'undefined' || !window.localStorage) return null;
    try{
      const raw = window.localStorage.getItem(this._saveKey(slot));
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== 'object') return null;
      return parsed;
    }catch(e){
      return null;
    }
  }
  _writeProfile(slot, data){
    if(typeof window === 'undefined' || !window.localStorage) return;
    try{
      window.localStorage.setItem(this._saveKey(slot), JSON.stringify(data));
    }catch(e){
      // ignore
    }
  }

  async handleLoginUser(creds){
    if(!creds) return;
    const username = (creds.username||'').trim();
    const password = creds.password||'';
    if(!username || !password){
      if(this.ui.setLoginStatus) this.ui.setLoginStatus('Username and password required', false);
      return;
    }
    if(this.ui.setLoginStatus) this.ui.setLoginStatus('Contacting server…', true);
    try{
      const res = await apiLoginUser(username, password);
      this.currentUser = { username: res.username || username };
      this.ui.setSignedInUser?.(this.currentUser.username);
      // Remember latest profile state from the backend.
      this.pendingUserState = res.state || null;
      // If we logged in from the main menu / Assembly, immediately
      // reset into Assembly mode and apply the saved profile. If the
      // login originated from the in‑run pause menu, avoid resetting
      // the current Endless Cycle run; the profile will be applied the
      // next time the player opens Assembly War.
      const origin = this.profileOrigin || 'mainmenu';
      if(origin !== 'pause'){
        this.resetAssemblyProfile();
        this.applyUserState(this.pendingUserState);
        this.pendingUserState = null;
      } else {
        // For pause‑menu logins, at least sync global mission unlock
        // so Assembly shows correct availability when opened later.
        const st = this.pendingUserState || {};
        if(typeof st.missionUnlockLevel === 'number'){
          this.missionUnlockLevel = Math.max(1, Math.min(6, st.missionUnlockLevel|0));
          if(this.ui.setMissionUnlock) this.ui.setMissionUnlock(this.missionUnlockLevel);
          this._writeMissionUnlock(this.missionUnlockLevel);
        }
      }
      if(this.ui.setLoginStatus){
        const msg = res.created ? 'User created and loaded.' : 'Login successful.';
        this.ui.setLoginStatus(msg, true);
      }
      // Close login overlay back to original context
      if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
      if(this.ui.showCreateMenu) this.ui.showCreateMenu(false);
      if(this.profileOrigin === 'assembly'){
        if(this.ui.showAssembly) this.ui.showAssembly(true);
      } else if(this.profileOrigin === 'mainmenu'){
        if(this.ui.showMainMenu) this.ui.showMainMenu(true);
      } else if(this.profileOrigin === 'pause'){
        if(this.ui.showPauseLogin) this.ui.showPauseLogin(false);
      }
      this.profileOrigin = null;
    }catch(err){
      if(this.ui.setLoginStatus) this.ui.setLoginStatus(err.message || 'Login failed', false);
    }
  }

  async handleCreateUser(creds){
    if(!creds) return;
    const username = (creds.username||'').trim();
    const password = creds.password||'';
    const confirm = creds.confirm||'';
    if(!username || !password){
      if(this.ui.setCreateStatus) this.ui.setCreateStatus('Username and password required', false);
      return;
    }
    if(password !== confirm){
      if(this.ui.setCreateStatus) this.ui.setCreateStatus('Passwords do not match', false);
      return;
    }
    if(this.ui.setCreateStatus) this.ui.setCreateStatus('Creating user…', true);
    try{
      const res = await apiCreateUser(username, password);
      this.currentUser = { username: res.username || username };
      this.ui.setSignedInUser?.(this.currentUser.username);
      this.pendingUserState = res.state || null;
      const origin = this.profileOrigin || 'mainmenu';
      if(origin !== 'pause'){
        this.resetAssemblyProfile();
        this.applyUserState(this.pendingUserState);
        this.pendingUserState = null;
      } else {
        const st = this.pendingUserState || {};
        if(typeof st.missionUnlockLevel === 'number'){
          this.missionUnlockLevel = Math.max(1, Math.min(6, st.missionUnlockLevel|0));
          if(this.ui.setMissionUnlock) this.ui.setMissionUnlock(this.missionUnlockLevel);
          this._writeMissionUnlock(this.missionUnlockLevel);
        }
      }
      if(this.ui.setCreateStatus) this.ui.setCreateStatus('User created and loaded.', true);
      if(this.ui.showCreateMenu) this.ui.showCreateMenu(false);
      if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
      if(this.profileOrigin === 'assembly'){
        if(this.ui.showAssembly) this.ui.showAssembly(true);
      } else if(this.profileOrigin === 'mainmenu'){
        if(this.ui.showMainMenu) this.ui.showMainMenu(true);
      } else if(this.profileOrigin === 'pause'){
        if(this.ui.showPauseLogin) this.ui.showPauseLogin(false);
      }
      this.profileOrigin = null;
    }catch(err){
      if(this.ui.setCreateStatus) this.ui.setCreateStatus(err.message || 'Failed to create user', false);
    }
  }

  async handleLogout(context={}){
    try{
      await apiLogoutUser();
    }catch(e){
      // Even if the request fails, clear local state to force a fresh login.
    }
    this.currentUser = null;
    this.fragments = 0;
    this.coreShards = 0;
    this.bestWave = 0;
    this.bestPerfectCombo = 0;
    this.perfectCombo = 0;
    if(this.ui.setFragments) this.ui.setFragments(this.fragments);
    if(this.ui.setCoreShards) this.ui.setCoreShards(this.coreShards);
    if(this.ui.setBestWave) this.ui.setBestWave(0);
    if(this.ui.setPerfectCombo) this.ui.setPerfectCombo(0);
    if(this.ui.setPerfectBest) this.ui.setPerfectBest(0);
    if(this.ui.resetBannerFeed) this.ui.resetBannerFeed();
    this.passives = { active: [], capacity: 4, slotBoost: false };
    this.recomputeSlotPassives();
    this.refreshPassivePanel();
    if(this.ui.setSignedInUser) this.ui.setSignedInUser(null);
    if(this.ui.clearLoginForm) this.ui.clearLoginForm();
    if(context?.source === 'login' && this.ui.setLoginStatus){
      this.ui.setLoginStatus('Signed out.', true);
    }
    if(context?.source === 'leaderboard' && this.ui.setLeaderboardStatus){
      this.ui.setLeaderboardStatus('Signed out.', true);
    }
    this.profileOrigin = null;
    this.profileMode = null;
  }

  async _prewarmMainMenu(){
    try{
      // Touch HP gradient and related composite ops once up front so
      // any one‑time JIT/renderer work happens before gameplay.
      prewarmHpColors();
      if(typeof document !== 'undefined'){
        try{
          const cvs = document.createElement('canvas');
          cvs.width = 32; cvs.height = 32;
          const ctx = cvs.getContext('2d');
          if(ctx){
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, cvs.width, cvs.height);
            ctx.globalCompositeOperation = 'color';
            ctx.fillStyle = getHpColor(0.5);
            ctx.beginPath();
            ctx.arc(16, 16, 10, 0, Math.PI*2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
        }catch(e){}
      }

      const key = this.leaderboardMapKey || this.selectedMap?.key || (MAPS[0]?.key);
      if(!key) return;
      await this.refreshLeaderboard(key);
    }catch(e){
    }
  }

  async refreshLeaderboard(mapKey){
    const key = mapKey || this.leaderboardMapKey || this.selectedMap?.key || (MAPS[0]?.key);
    this.leaderboardMapKey = key;
    if(this.ui.setLeaderboardMap) this.ui.setLeaderboardMap(key, true);
    if(this.ui.setLeaderboardStatus) this.ui.setLeaderboardStatus('Loading...', true);
    if(this.ui.setLeaderboardLoading) this.ui.setLeaderboardLoading(true);
    // Use cached leaderboard data when available to avoid repeated
    // network requests and reduce perceived loading time.
    const cached = this.leaderboardCache && this.leaderboardCache[key];
    const nowMs = Date.now();
    if(cached && Array.isArray(cached.entries) && (nowMs - cached.time) < 60000){
      if(this.ui.setLeaderboard) this.ui.setLeaderboard(cached.entries);
      if(this.ui.setLeaderboardStatus){
        const has = cached.entries && cached.entries.length;
        this.ui.setLeaderboardStatus(has ? '' : 'No entries yet.', true);
      }
      if(this.ui.setLeaderboardLoading) this.ui.setLeaderboardLoading(false);
      return;
    }
    try{
      const res = await apiFetchLeaderboard(key);
      const entries = res.entries || [];
      if(this.ui.setLeaderboard) this.ui.setLeaderboard(entries);
      if(this.leaderboardCache){
        this.leaderboardCache[key] = { entries, time: nowMs };
      }
      if(this.ui.setLeaderboardStatus){
        const has = entries && entries.length;
        this.ui.setLeaderboardStatus(has ? '' : 'No entries yet.', true);
      }
    }catch(err){
      if(this.ui.setLeaderboardStatus) this.ui.setLeaderboardStatus(err.message || 'Failed to load leaderboard', false);
    }finally{
      if(this.ui.setLeaderboardLoading) this.ui.setLeaderboardLoading(false);
    }
  }
  openLeaderboard(){
    this.leaderboardOrigin = 'mainmenu';
    if(this.ui.showMainMenu) this.ui.showMainMenu(false);
    if(this.ui.setLeaderboardLoading) this.ui.setLeaderboardLoading(true);
    if(this.ui.showLeaderboard) this.ui.showLeaderboard(true);
    // Default leaderboard map follows current selected map
    const mapKey = this.selectedMap?.key || this.leaderboardMapKey || (MAPS[0]?.key);
    this.leaderboardMapKey = mapKey;
    if(this.ui.setLeaderboardMap) this.ui.setLeaderboardMap(mapKey, true);
    this.refreshLeaderboard(mapKey);
  }
  closeLeaderboard(){
    if(this.ui.showLeaderboard) this.ui.showLeaderboard(false);
    if(this.leaderboardOrigin === 'mainmenu' && this.ui.showMainMenu){
      this.ui.showMainMenu(true);
    }
    this.leaderboardOrigin = null;
  }
  async recordLeaderboardEntry(waves){
    if(!this.currentUser || this.isCheatMode()) return;
    const value = Math.max(0, Number.isFinite(waves) ? waves : this.bestWave || this.waveIdx);
    if(value <= 0) return;
    try{
      const perfect = Math.max(0, this.bestPerfectCombo || 0);
      const mapKey = this.selectedMap?.key || (MAPS[0]?.key);
      const pilot = this.selectedCharacterKey || 'volt';
      await apiSubmitLeaderboard(this.currentUser.username, Math.floor(value), Math.floor(perfect), mapKey, pilot);
    }catch(e){
      // Ignore submission failures silently
    }
  }

  async saveUserProfile(){
    if(!this.currentUser || !this.currentUser.username){
      if(this.ui.setLoginStatus) this.ui.setLoginStatus('Sign in first before saving.', false);
      if(this.ui.showLoadMenu) this.ui.showLoadMenu(true);
      return;
    }
    const state = this.buildUserState();
    try{
      await apiSaveUserState(state);
      this.showBanner('PROFILE SAVED', this.currentUser.username, null);
    }catch(err){
      this.showBanner('SAVE FAILED', err.message || 'Could not save profile', 'danger');
    }
  }

  _readMissionUnlock(){
    if(typeof window === 'undefined' || !window.localStorage) return 1;
    try{
      const raw = window.localStorage.getItem('nano_siege_mission_unlock_v1');
      if(!raw) return 1;
      const v = parseInt(raw, 10);
      if(!Number.isFinite(v) || v<1) return 1;
      return Math.min(6, v);
    }catch(e){
      return 1;
    }
  }
  _writeMissionUnlock(level){
    if(typeof window === 'undefined' || !window.localStorage) return;
    try{
      const v = Math.max(1, Math.min(6, level|0));
      window.localStorage.setItem('nano_siege_mission_unlock_v1', String(v));
    }catch(e){
      // ignore
    }
  }
  _readDevModePref(){
    if(typeof window === 'undefined' || !window.localStorage) return false;
    try{
      return window.localStorage.getItem('nano_siege_dev_mode') === '1';
    }catch(e){
      return false;
    }
  }
  _writeDevModePref(on){
    if(typeof window === 'undefined' || !window.localStorage) return;
    try{
      if(on) window.localStorage.setItem('nano_siege_dev_mode', '1');
      else window.localStorage.removeItem('nano_siege_dev_mode');
    }catch(e){
      // ignore
    }
  }

  _readAutoSpeedPref(){
    if(typeof window === 'undefined' || !window.localStorage) return true;
    try{
      const raw = window.localStorage.getItem('nano_siege_auto_speed');
      if(raw === null) return true;
      return raw !== '0';
    }catch(e){
      return true;
    }
  }
  _writeAutoSpeedPref(on){
    if(typeof window === 'undefined' || !window.localStorage) return;
    try{
      window.localStorage.setItem('nano_siege_auto_speed', on ? '1' : '0');
    }catch(e){
      // ignore
    }
  }

  isCheatMode(){
    return !!(this.devMode || this.sandboxMode);
  }

  resetSandboxConfig(){
    this.sandboxConfig = defaultSandboxConfig();
    this.applySandboxBuffs();
  }
  applySandboxBuffs(){
    const cfg = clampSandboxConfig(this.sandboxConfig);
    this.sandboxConfig = cfg;
    // Apply to global buffs used by towers/status.
    buffs.dmgMul = cfg.towerDmgMul;
    buffs.fireRateMul = cfg.towerFireRateMul;
    buffs.rangeMul = cfg.towerRangeMul;
    buffs.slowPotencyMul = cfg.slowMul;
    buffs.burnDpsMul = cfg.burnDpsMul;
    buffs.burnDurationBonus = (cfg.burnDurationMul - 1) * 1.0;
    buffs.creditMul = cfg.creditMul;
    buffs.creditFlatPerKill = cfg.flatCreditsPerKill|0;
  }

  syncSandboxConfigFromUI(){
    if(typeof document === 'undefined') return;
    const readRange = (id, fallback)=>{
      const el = document.getElementById(id);
      if(!el) return fallback;
      const v = parseFloat(el.value);
      return Number.isFinite(v) ? v : fallback;
    };
    const readCheck = (id, fallback)=>{
      const el = document.getElementById(id);
      if(!el) return fallback;
      return !!el.checked;
    };
    const cfg = { ...(this.sandboxConfig || defaultSandboxConfig()) };
    cfg.enemyHpMul = readRange('sb-enemyhp', cfg.enemyHpMul);
    cfg.enemySpeedMul = readRange('sb-enemyspeed', cfg.enemySpeedMul);
    cfg.waveSizeMul = readRange('sb-wavesize', cfg.waveSizeMul);
    cfg.spawnSpacingMul = readRange('sb-spacing', cfg.spawnSpacingMul);
    cfg.bossEveryWave = readCheck('sb-boss-every', cfg.bossEveryWave);
    cfg.towerDmgMul = readRange('sb-dmg', cfg.towerDmgMul);
    cfg.towerFireRateMul = readRange('sb-firerate', cfg.towerFireRateMul);
    cfg.towerRangeMul = readRange('sb-range', cfg.towerRangeMul);
    cfg.slowMul = readRange('sb-slow', cfg.slowMul);
    cfg.burnDpsMul = readRange('sb-burndps', cfg.burnDpsMul);
    cfg.burnDurationMul = readRange('sb-burndur', cfg.burnDurationMul);
    cfg.puddleDpsMul = readRange('sb-puddledps', cfg.puddleDpsMul);
    cfg.puddleDurMul = readRange('sb-puddledur', cfg.puddleDurMul);
    cfg.creditMul = readRange('sb-credits', cfg.creditMul);
    cfg.fragmentMul = readRange('sb-frags', cfg.fragmentMul);
    cfg.flatCreditsPerKill = readRange('sb-flatcredits', cfg.flatCreditsPerKill);
    cfg.infiniteCredits = readCheck('sb-inf-credits', cfg.infiniteCredits);
    cfg.infiniteHp = readCheck('sb-inf-hp', cfg.infiniteHp);
    cfg.freeShop = readCheck('sb-free-shop', cfg.freeShop);
    cfg.freeRerolls = readCheck('sb-free-shop', cfg.freeRerolls); // share switch for now
    cfg.noLeaksEndGame = readCheck('sb-no-leaks', cfg.noLeaksEndGame);
    this.sandboxConfig = clampSandboxConfig(cfg);
  }

  tuneSandboxWave(wave){
    const cfg = this.sandboxConfig || defaultSandboxConfig();
    const hpMul = cfg.enemyHpMul ?? 1;
    const spMul = cfg.enemySpeedMul ?? 1;
    const sizeMul = cfg.waveSizeMul ?? 1;
    const spaceMul = cfg.spawnSpacingMul ?? 1;
    let out = wave.map(def=>({
      ...def,
      hp: Math.max(1, Math.round((def.hp||1) * hpMul)),
      speed: Math.max(10, Math.round((def.speed||60) * spMul)),
      delay: (def.delay||0) * spaceMul
    }));
    // Wave size scaling
    if(sizeMul > 1.001){
      const copies = Math.max(1, Math.round(sizeMul));
      const expanded = [];
      for(const d of out){
        for(let i=0;i<copies;i++){
          expanded.push({ ...d });
        }
      }
      out = expanded;
    } else if(sizeMul < 0.999){
      const keepProb = Math.max(0, sizeMul);
      out = out.filter(()=> Math.random() < keepProb);
      if(out.length === 0 && wave.length){
        out.push({ ...wave[wave.length-1] });
      }
    }
    // Optional boss injection every wave
    if(cfg.bossEveryWave){
      const hasBoss = out.some(d=> d.variant && /^boss/.test(d.variant));
      if(!hasBoss && out.length){
        const base = out[out.length-1];
        const boss = {
          ...base,
          hp: Math.max(50, Math.round((base.hp||50) * 10)),
          speed: Math.max(20, Math.round((base.speed||60) * 0.6)),
          reward: (base.reward||0) + 80,
          variant: 'boss_sandbox',
          radius: base.radius || 24
        };
        out.push(boss);
      }
    }
    return out;
  }

  requestExitConfirm(kindOrCb, maybeCb){
    let kind = 'exit';
    let cb = maybeCb;
    if(typeof kindOrCb === 'function'){
      cb = kindOrCb;
    } else if(typeof kindOrCb === 'string'){
      kind = kindOrCb;
    }
    if(this._exitConfirmCallback){
      // Already waiting on a previous confirmation.
      return;
    }
    this._exitConfirmKind = (kind === 'restart')
      ? 'restart'
      : (kind === 'quit' ? 'quit' : 'exit');
    this._exitConfirmCallback = (typeof cb === 'function') ? cb : null;
    this._exitConfirmPrevState = this.state;
    if(this.state === 'playing' || this.state === 'paused'){
      // Freeze gameplay but keep the board rendered underneath the modal.
      this.state = 'exitConfirm';
    }
    // When opening the exit-confirm dialog from a paused state, hide
    // the pause overlay so we don't stack two panels on screen.
    if(this._exitConfirmPrevState === 'paused' && this.ui.showPause){
      this.ui.showPause(false);
    }
    if(this.ui.showExitConfirm) this.ui.showExitConfirm(true, this._exitConfirmKind);
  }
  _handleExitConfirm(ok){
    if(this.ui.showExitConfirm) this.ui.showExitConfirm(false);
    // Restore previous state if we temporarily switched into confirm mode.
    const prev = this._exitConfirmPrevState;
    if(prev){
      this.state = prev;
    }
    const cb = this._exitConfirmCallback;
    this._exitConfirmPrevState = null;
    this._exitConfirmCallback = null;
    const kind = this._exitConfirmKind;
    this._exitConfirmKind = 'exit';
    if(typeof cb === 'function') cb(!!ok);
    // If the user cancelled from a pause-originated confirm, return to
    // the pause overlay; if they cancelled from the main menu "quit"
    // confirmation, restore the main menu.
    if(!ok){
      if(prev === 'paused' && this.ui.showPause){
        this.ui.showPause(true);
      }else if(prev === 'menu' && kind === 'quit' && this.ui.showMainMenu){
        this.ui.showMainMenu(true);
      }
    }
  }

  // --- Main menu handlers ---
  handleMainNew(){
    // From fullscreen main menu or load menu, go to the in-game
    // Select Game Type overlay instead of starting immediately.
    if(this.ui.showMainMenu) this.ui.showMainMenu(false);
    if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
    if(this.ui.showAssembly) this.ui.showAssembly(true);
    if(this.ui.showMainSettings) this.ui.showMainSettings(false);
    if(this.ui.setMapStartLabel) this.ui.setMapStartLabel('Start Endless Cycle');
    this.state = 'menu';
  }
  handleMenuBack(){
    // Return to fullscreen main menu
    if(this.ui.showAssembly) this.ui.showAssembly(false);
    if(this.ui.showMainSettings) this.ui.showMainSettings(false);
    if(this.ui.showMainMenu) this.ui.showMainMenu(true);
    this.resetAbilityUnlocks();
    this.state = 'menu';
  }
  handleMainAssembly(){
    // From fullscreen main menu straight into Assembly mission select.
    // If we have a pending profile from a pause‑menu login, apply it
    // now so mission unlocks and meta‑progress are reflected here.
    if(this.pendingUserState){
      this.resetAssemblyProfile();
      this.applyUserState(this.pendingUserState);
      this.pendingUserState = null;
    }
    if(this.ui.showMainMenu) this.ui.showMainMenu(false);
    if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
    if(this.ui.showAssembly) this.ui.showAssembly(true);
    this.state = 'menu';
  }
  handleMainSandbox(){
    // Sandbox Mode: open the Sandbox Lab panel.
    this.sandboxMode = true;
    if(this.ui.showMainMenu) this.ui.showMainMenu(false);
    if(this.ui.showAssembly) this.ui.showAssembly(false);
    if(this.ui.showMainSettings) this.ui.showMainSettings(false);
    if(this.ui.showSandbox) this.ui.showSandbox(true);
    this.state = 'menu';
  }
  handleSandboxStart(){
    // From Sandbox Lab → map select, keeping sandbox flags active for this run.
    this.syncSandboxConfigFromUI();
    this.applySandboxBuffs();
    if(this.ui.showSandbox) this.ui.showSandbox(false);
    if(this.ui.showMapSelect) this.ui.showMapSelect(true);
    if(this.ui.setMapStartLabel) this.ui.setMapStartLabel('Start Sandbox');
  }

  openSandboxFromRun(){
    if(!this.sandboxMode) return;
    this.requestExitConfirm('exit', (ok)=>{
      if(!ok) return;
      // Drop back to Sandbox Lab instead of main menu.
      this.state = 'menu';
      this.applyScaleMode('menu');
      if(this.ui.showPause) this.ui.showPause(false);
      if(this.ui.showGameOver) this.ui.showGameOver(false);
      if(this.ui.showSandbox) this.ui.showSandbox(true);
      if(this.ui.setSandboxSettingsVisible) this.ui.setSandboxSettingsVisible(false);
    });
  }
  handleLeaderboardSignIn(){
    this.closeLeaderboard();
    this.handleMainLoad();
  }

  handleMainLoad(){
    if(this.currentUser){
      this.handleLogout({ source: 'mainmenu' });
      return;
    }
    // Main-menu "Load User": open login overlay and hide the canvas.
    this.profileOrigin = 'mainmenu';
    if(this.ui.showMainMenu) this.ui.showMainMenu(false);
    if(this.ui.showAssembly) this.ui.showAssembly(false);
    if(this.ui.showCreateMenu) this.ui.showCreateMenu(false);
    if(this.ui.clearLoginForm) this.ui.clearLoginForm();
    if(this.ui.setLoadHeading) this.ui.setLoadHeading('Sign In', 'Log in with your Nano-Siege profile to continue.');
    if(this.ui.showLoadMenu) this.ui.showLoadMenu(true);
  }
  handleMainExit(){
    // Attempt to close or navigate away; as a fallback, hide menus and show a soft exit screen
    try{ window.close(); }catch(e){}
    try{ window.location.href = 'about:blank'; }catch(e){}
  }
  handleLoadSlot(slot){
    // Legacy slot-based save/load no longer used.
    return;
  }

  handleMainSettings(){
    if(this.ui.showMainMenu) this.ui.showMainMenu(false);
    if(this.ui.showMenu) this.ui.showMenu(false);
    if(this.ui.showAssembly) this.ui.showAssembly(false);
    if(this.ui.showMainSettings) this.ui.showMainSettings(true);
    this.state = 'menu';
  }
  handleMainSettingsBack(){
    if(this.ui.showMainSettings) this.ui.showMainSettings(false);
    if(this.ui.showMainMenu) this.ui.showMainMenu(true);
    this.resetAbilityUnlocks();
    this.sandboxMode = false;
    this.state = 'menu';
  }
  handleLoadBack(){
    if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
    if(this.profileOrigin === 'assembly'){
      if(this.ui.showAssembly) this.ui.showAssembly(true);
    } else {
      if(this.ui.showMainMenu) this.ui.showMainMenu(true);
    }
    this.profileMode = null;
    this.profileOrigin = null;
  }

  // --- Assembly War mission flow ---
  // Reset meta‑progress for a brand‑new Assembly War Reactor Profile,
  // without touching global mission unlock progression.
  resetAssemblyProfile(){
    // Reset global roguelike buffs
    if(buffs){
      buffs.dmgMul = 1.0;
      buffs.fireRateMul = 1.0;
      buffs.rangeMul = 1.0;
      buffs.slowPotencyMul = 1.0;
      buffs.burnDpsMul = 1.0;
      buffs.splashRadiusMul = 1.0;
    }
    this.mode = 'assembly';
    // New profile always starts at Mission 1 only.
    this.missionUnlockLevel = 1;
    this._writeMissionUnlock(1);
    this.missionId = null;
    this.missionMaxWaves = null;
    // Fresh shop/meta state
    this.shop = { index: 0, offers: [], rerollPrice: GAME_RULES.rerollBasePrice || 50 };
    this.passives = { active: [], capacity: 4, slotBoost: false };
    // Reset abilities to base (locked, level 0)
    this.abilities = {
      bomb: { unlocked:false, level:0, cd:0, cdMax:12, radius:70, damage:120 },
      overclock: { unlocked:false, level:0, cd:0, cdMax:25, dur:8, boost:1.0, active:false, durLeft:0, _applied:false },
      cryo: { unlocked:false, level:0, cd:0, cdMax:20, slow:0.5, dur:2.5, active:false, timeLeft:0 },
      corehp: { level:0 }
    };
    this.recomputeAbilityParams();
    // Reset run‑level stats
    this.credits = GAME_RULES.startingCredits;
    this.fragments = 0;
    this.coreShards = 0;
    this.lives = GAME_RULES.startingLives;
    this.waveIdx = 0;
    this.bestWave = 0;
    this.spawner = { active:false, time:0, queue: [], pathMode:'roundrobin', pathCursor:0 };
    this.enemies = [];
    this.towers = [];
    this.time = 0;
    this.selected = null;
    this.bonusActive = false;
    this.waveLostHP = false;
    this.livesAtWaveStart = this.lives;
    this.bonusPayout = Math.min(GAME_RULES.bigWaveBonus, GAME_RULES.bonusMaxPayout || Infinity);
    this.lastBonusWave = null;
    this.bonusHistory = [];
    this.nanoKillCounter = 0;
    this.nanoDrones = [];
    this.droneBeams = [];
    this.lowHpActive = false;
    this.shakeMag = 0;
    this.floaters = [];
    this.banner = null;
    this.placingBomb = false;
    this.state = 'menu';
    // Sync UI with fresh state
    if(this.ui.setWave) this.ui.setWave(1);
    if(this.ui.setCredits) this.ui.setCredits(this.credits);
    if(this.ui.setFragments) this.ui.setFragments(this.fragments);
    if(this.ui.setCoreShards) this.ui.setCoreShards(this.coreShards);
    if(this.ui.setLives) this.ui.setLives(this.lives);
    if(this.ui.setBestWave) this.ui.setBestWave(this.bestWave);
    if(this.ui.setPerfectCombo) this.ui.setPerfectCombo(this.perfectCombo);
    if(this.ui.resetBannerFeed) this.ui.resetBannerFeed();
    if(this.ui.setAbilityVisible){
      this.ui.setAbilityVisible('bomb', false);
      this.ui.setAbilityVisible('overclock', false);
      this.ui.setAbilityVisible('cryo', false);
    }
    if(this.ui.setMissionUnlock) this.ui.setMissionUnlock(this.missionUnlockLevel);
    this.refreshPassivePanel();
    if(this.updateAbilityUI) this.updateAbilityUI();
  }
  handleCloseAssembly(){
    if(this.ui.showAssembly) this.ui.showAssembly(false);
    if(this.ui.showMainMenu) this.ui.showMainMenu(true);
    this.resetAbilityUnlocks();
    this.state = 'menu';
  }

  handleOpenHowTo(){
    // For now this is purely a UI overlay handled in ui.js; we just
    // ensure other fullscreen overlays remain hidden if needed.
    if(this.ui && this.ui.updateModalMask){
      this.ui.updateModalMask();
    }
  }
  handleCloseHowTo(){
    if(this.ui && this.ui.updateModalMask){
      this.ui.updateModalMask();
    }
  }
  handleOpenBug(){
    if(this.ui && this.ui.updateModalMask){
      this.ui.updateModalMask();
    }
  }
  handleCloseBug(){
    if(this.ui && this.ui.updateModalMask){
      this.ui.updateModalMask();
    }
  }
  handleAssemblySave(){
    // Save current user profile to backend (Assembly War screen).
    this.saveUserProfile();
  }
  handleAssemblyLoad(){
    // "Load User" from Assembly War menu: open login overlay.
    this.profileOrigin = 'assembly';
    if(this.ui.showAssembly) this.ui.showAssembly(false);
    if(this.ui.showMainMenu) this.ui.showMainMenu(false);
    if(this.ui.clearLoginForm) this.ui.clearLoginForm();
    if(this.ui.setLoadHeading) this.ui.setLoadHeading('Sign In', 'Log in with your Nano-Siege profile to continue.');
    if(this.ui.showLoadMenu) this.ui.showLoadMenu(true);
  }
  openCreateUser(){
    if(this.ui.clearCreateForm) this.ui.clearCreateForm();
    if(this.ui.setCreateStatus) this.ui.setCreateStatus('');
    if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
    if(this.ui.showCreateMenu) this.ui.showCreateMenu(true);
  }
  closeCreateUser(){
    if(this.ui.showCreateMenu) this.ui.showCreateMenu(false);
    if(this.ui.showLoadMenu) this.ui.showLoadMenu(true);
  }
  handleStartMission(id){
    this.mode = 'assembly';
    this.missionId = id || null;
    this.missionMaxWaves = getMissionTotalWaves(this.missionId);
    // Lock map selection to the mission's map
    const missionMap = getMissionMap(this.missionId);
    if(missionMap){
      this.selectedMap = missionMap;
    }
    if(this.ui.showAssembly) this.ui.showAssembly(false);
    // For now, all missions use the standard wave builder via a separate
    // Assembly pathway, but each has its own intro banner.
    if(id === 1) this.showBanner('System Boot', 'Mission 1', null);
    else if(id === 2) this.showBanner('Subroutine Siege', 'Mission 2', null);
    else if(id === 3) this.showBanner('Corruption Bloom', 'Mission 3', 'boss');
    else if(id === 4) this.showBanner('Dual Core Defense', 'Mission 4', null);
    else if(id === 5) this.showBanner('Overmind Ascendant', 'Mission 5', 'boss');
    else if(id === 6) this.showBanner('Cascade Protocol', 'Final Mission', 'boss');
    this.startGame();
  }

  startWave(){
    if(this.state!=='playing' || this.spawner.active) return;
    audio.resume();
    const waveNumber = this.waveIdx + 1;
    const isAssembly = (this.mode === 'assembly' && this.missionId!=null);
    if(isAssembly){
      const max = this.missionMaxWaves || getMissionTotalWaves(this.missionId);
      this.missionMaxWaves = max || null;
      if(max && waveNumber > max){
        // Mission already complete; ignore extra start requests.
        return;
      }
    }
    // Character dialogue: first wave always, later waves random with spacing.
    this._maybeShowPilotLine(waveNumber, isAssembly);
    // Update character passives for this wave (scaling passives).
    this._updateCharacterPassivesForWave(waveNumber);
    // Use a separate builder for Assembly War so its pacing can diverge
    // from Endless Cycle.
    let wave = isAssembly
      ? buildMissionWave(this.missionId, waveNumber)
      : buildWave(waveNumber);
    if(this.sandboxMode && !isAssembly){
      wave = this.tuneSandboxWave(wave);
    }
    this.bestWave = Math.max(this.bestWave, waveNumber);
    if(this.ui.setBestWave) this.ui.setBestWave(this.bestWave);
    this.spawner.queue = [...wave];
    this.spawner.time = 0;
    this.spawner.active = true;
    this.spawner.pathCursor = 0; // reset RR cursor
    this.spawner.hadBoss = false;
    this.spawner.totalCount = this.spawner.queue.length;
    this.spawner.spawned = 0;
    this.spawner.hadBoss = false;
    // Track total scheduled spawn delay for shrinking bar (time until last spawn)
    this.spawner.totalTime = wave.reduce((s,d)=> s + (d.delay||0), 0);
    this.spawner.elapsed = 0;
    if(buffs.reactorAegis){
      this.reactorShield = buffs.reactorAegis;
      const base = this.grid.base || this.grid.waypoints[this.grid.waypoints.length-1];
      this.addFloater(base.x, base.y - 20, `+${buffs.reactorAegis} SHIELD`, '#7ce0ff');
    }
    this.ui.setStartEnabled(false);
    this.ui.setWaveStatus(true);
    if(this.ui.setWaveProgress) this.ui.setWaveProgress(1);
    if(this.ui.setWaveRemaining) this.ui.setWaveRemaining(this.spawner.totalCount||0, this.spawner.totalCount||0);
    // Bonus wave pre-banner and tracking
    const upcomingWaveNumber = this.waveIdx + 1; // human-friendly
    // Bonus wave gating rules:
    // - Not before wave 4
    // - At least 4 waves apart from the previous bonus
    // - At most 2 bonuses within the last 8 waves window
    const chance = isAssembly ? 0 : (GAME_RULES.bonusChance ?? 0.16);
    const eligibleByWave = upcomingWaveNumber >= 4;
    const farFromLast = (this.lastBonusWave==null) || (upcomingWaveNumber - this.lastBonusWave >= 4);
    const recentCount = this.bonusHistory.filter(w=> upcomingWaveNumber - w <= 8).length;
    const windowOk = recentCount < 2;
    this.bonusActive = !isAssembly && eligibleByWave && farFromLast && windowOk && (Math.random() < chance);
    if(this.bonusActive){ this.lastBonusWave = upcomingWaveNumber; this.bonusHistory.push(upcomingWaveNumber); }
    this.waveLostHP = false;
    this.livesAtWaveStart = this.lives;
    if(this.bonusActive){
      // Bonus waves: treat as blue "bonus" notifications.
      this.showBanner('BONUS WAVE', null, 'bonus');
      if(this.autoSpeedControl){
        this.speedFactor = 1;
        this.ui.setFastLabel(this.speedFactor);
      }
    }
    // Boss wave banner
    if(upcomingWaveNumber % 10 === 0){
      this.showBanner('BOSS INCOMING', 'Brace for impact', 'boss');
      if(audio.bossIntro) audio.bossIntro();
      if(this.autoSpeedControl){
        this.speedFactor = 1;
        this.ui.setFastLabel(this.speedFactor);
      }
    }
    // Difficulty increase banner on variant introductions and phase-outs
    const triggers = new Set([
      GAME_RULES.bigWaveEvery + 1,
      GAME_RULES.bigWaveEvery*2 + 1,
      16,
      21,
    ]);
    if(triggers.has(upcomingWaveNumber)){
      this.showBanner('DIFFICULTY INCREASE', null, 'danger');
      if(this.autoSpeedControl){
        this.speedFactor = 1;
        this.ui.setFastLabel(this.speedFactor);
      }
    }
  }

  placeTower(){
    if(this.state !== 'playing') return;
    const { gx, gy } = this.mouse;
    if(this.grid.canPlace(gx,gy)){
      const def = TOWER_TYPES[this.selectedTower];
      const cost = (typeof this.getTowerPlacementCost === 'function')
        ? this.getTowerPlacementCost(this.selectedTower)
        : (def?.cost || 0);
      if(this.isCheatMode() || this.credits >= cost){
        if(!this.isCheatMode()){ this.credits -= cost; }
        this.grid.occupy(gx,gy);
        const t = createTower(this.selectedTower,gx,gy,TILE_SIZE);
        t.game = this;
        this.applyTowerStartingLevels(t);
        t.invested = cost;
        this.towers.push(t);
        this.ui.setCredits(this.credits);
        // Show spend toast near cursor
        if(!this.isCheatMode()) this.addFloater(this.mouse.x + 14, this.mouse.y - 10, `-${cost}⚛`, COLORS.danger || '#ff5370');
        audio.place();
      } else {
        // Not enough nano credits — show red toast near cursor and above upgrade panel if open
        this.addFloater(this.mouse.x + 14, this.mouse.y - 10, 'Not enough nano credits', COLORS.danger || '#ff5370');
        if(this.selected) this.ui.showPanelToast('Not enough nano credits');
      }
    }
  }

  applyTowerStartingLevels(tower){
    if(!tower) return;
    const clampLevel = (v)=> Math.max(0, Math.min(3, v|0));
    const applyRate = (lvl)=>{
      const target = clampLevel(lvl);
      if(target > (tower.rateLevel||0)){
        tower.rateLevel = target;
      }
    };
    const applyRange = (lvl)=>{
      const target = clampLevel(lvl);
      if(target > (tower.rangeLevel||0)){
        tower.rangeLevel = target;
        if(typeof tower.baseRange === 'number'){
          tower.range = tower.baseRange * (1 + 0.15*tower.rangeLevel);
        }
      }
    };
    const applyModules = (burn, slow)=>{
      if(burn && typeof tower.installBurn === 'function') tower.installBurn();
      if(slow && typeof tower.installSlow === 'function') tower.installSlow();
    };
    switch(tower.kind){
      case 'basic':
        applyRange(buffs.cannonStartRangeLevel||0);
        applyRate(buffs.cannonStartRateLevel||0);
        applyModules(buffs.cannonStartBurn, buffs.cannonStartSlow);
        break;
      case 'splash':
        applyRate(buffs.splashStartRateLevel||0);
        applyModules(buffs.splashStartBurn, buffs.splashStartSlow);
        break;
      case 'laser':
        applyRange(buffs.laserStartRangeLevel||0);
        applyRate(buffs.laserStartRateLevel||0);
        applyModules(buffs.laserStartBurn, buffs.laserStartSlow);
        break;
      default: break;
    }
  }

  handleCanvasTap(){
    if(this.state==='chamber') { this.handleChamberTap?.(); return; }
    if(this.state!=='playing') return;
    // Bomb placement takes precedence
    if(this.placingBomb && this.abilities.bomb && this.abilities.bomb.unlocked && this.abilities.bomb.cd<=0){
      this.triggerBomb(this.mouse.x, this.mouse.y);
      return;
    }
    const tower = this.getTowerAt(this.mouse.gx, this.mouse.gy);
    if(tower){
      this.selected = tower;
      this.ui.setUpgradePanel(this.selected, this.credits);
    } else if(this.placing){
      this.placeTower();
      this.selected = null;
      this.ui.setUpgradePanel(null, this.credits);
    }
  }

  handleChamberTap(){
    const x = this.mouse.x, y = this.mouse.y;
    const hit = (arr,r)=>{ for(const n of arr){ const d=Math.hypot(x-n.x,y-n.y); if(d<=r) return n; } return null; };
    if(!this.chamber) return;
    const rPassive = 34, rAbil = 30;
    const n1 = hit(this.chamber.passive||[], rPassive);
    if(n1){
      const idx = n1.idx|0; this.shopBuy(idx); this.buildChamberNodes(); return;
    }
    const n2 = hit(this.chamber.abil||[], rAbil);
    if(n2){ this.shopBuyAbility(n2.key); this.buildChamberNodes(); return; }
    // Buttons
    const btn = this.chamber.buttons || {
      reroll:{x:20,y:CANVAS_H-44,w:140,h:28},
      convert:{x:CANVAS_W-230,y:CANVAS_H-44,w:210,h:32},
      cont:{x:CANVAS_W/2-80,y:CANVAS_H-44,w:160,h:28}
    };
    const inRect = (b)=> x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h;
    if(inRect(btn.reroll)){ this.shopReroll(); this.buildChamberNodes(); return; }
    if(inRect(btn.convert)){ this.convertFragmentsToShard(); this.buildChamberNodes(); return; }
    if(inRect(btn.cont)){ this.closeChamber(); return; }
  }

  spawnEnemy(def){
    // Choose a path: supports multi-path maps (array of waypoint arrays).
    // Flying drones use a custom arc from the left side toward the core;
    // all other enemies follow the map waypoints.
    const W = this.grid.waypoints;
    const base = this.grid.base || (Array.isArray(W) ? W[W.length-1] : W[W.length-1]);
    const multi = Array.isArray(W) && W.length && Array.isArray(W[0]);
    let path;
    if(def.variant === 'drone' && base){
      // Start slightly off-screen on either the top-left or bottom-left,
      // then arc in with a couple of midpoints before reaching the core.
      const fromTop = Math.random() < 0.5;
      const startY = fromTop ? (CANVAS_H * 0.12) : (CANVAS_H * 0.88);
      const start = { x: -40, y: startY };
      const mid1 = {
        x: CANVAS_W * 0.25 + Math.random()*80,
        y: fromTop ? startY + 80 + Math.random()*40 : startY - 80 - Math.random()*40
      };
      const mid2 = {
        x: CANVAS_W * 0.55 + Math.random()*70,
        y: base.y + (fromTop ? 60 : -60)
      };
      path = [start, mid1, mid2, { x: base.x, y: base.y }];
    } else if(multi){
      let idx;
      if(typeof def._pathIndex === 'number'){ idx = def._pathIndex|0; }
      else { idx = this.choosePathIndex(); }
      idx = Math.max(0, Math.min(W.length-1, idx));
      path = W[idx];
    } else {
      path = W;
    }
    const e = new Enemy(path, {
      hp: def.hp,
      speed: def.speed,
      reward: def.reward,
      variant: def.variant,
      radius: def.radius,
      bossIndex: typeof def.bossTier === 'number' ? def.bossTier : undefined,
      archetype: def.archetype
    });
    const wps = path;
    // If a specific spawn position along the path is provided, place there
    if(def && def.spawnAt && typeof def.spawnAt.x === 'number' && typeof def.spawnAt.y === 'number'){
      const sx = def.spawnAt.x, sy = def.spawnAt.y;
      e.center.x = sx; e.center.y = sy;
      e.pos.x = sx; e.pos.y = sy;
      if(typeof def.pathIdx === 'number'){
        // Clamp to valid next-waypoint index (>=1)
        e.idx = Math.max(1, Math.min((wps?.length||1)-1, def.pathIdx));
      }
    } else if(wps && wps.length >= 2){
      // Otherwise spawn slightly off‑screen along the entry direction so enemies flow in
      const p0 = wps[0], p1 = wps[1];
      let dx = p1.x - p0.x, dy = p1.y - p0.y;
      const d = Math.hypot(dx,dy) || 1;
      const ux = dx/d, uy = dy/d; // initial forward direction
      // move backwards from p0 toward offscreen
      const vx = -ux, vy = -uy;
      const margin = 24; // pixels beyond the edge
      const INF = 1e9;
      // time to reach canvas edge along v
      let tx = INF, ty = INF;
      if(vx < 0){ tx = (p0.x - 0) / (-vx); }
      else if(vx > 0){ tx = (CANVAS_W - p0.x) / vx; }
      if(vy < 0){ ty = (p0.y - 0) / (-vy); }
      else if(vy > 0){ ty = (CANVAS_H - p0.y) / vy; }
      let t = Math.min(tx, ty);
      if(!isFinite(t) || t<=0) t = 40; // fallback
      const sx = p0.x + vx * (t + margin);
      const sy = p0.y + vy * (t + margin);
      e.center.x = sx; e.center.y = sy;
      e.pos.x = sx; e.pos.y = sy;
    }
    this.enemies.push(e);
  }

  // Select a path index for multi-path maps using round-robin or weights
  choosePathIndex(){
    const W = this.grid.waypoints;
    const multi = Array.isArray(W) && W.length && Array.isArray(W[0]);
    if(!multi) return 0;
    const n = W.length;
    const mode = this.spawner.pathMode || 'roundrobin';
    if(mode === 'weighted' && this.grid.pathWeights){
      const w = this.grid.pathWeights.slice(0,n);
      const sum = w.reduce((a,b)=> a + Math.max(0, b||0), 0) || 1;
      let r = Math.random()*sum;
      for(let i=0;i<n;i++){ r -= Math.max(0, w[i]||0); if(r<=0) return i; }
      return n-1;
    }
    // default: round-robin cursor
    const idx = this.spawner.pathCursor % n; this.spawner.pathCursor = (this.spawner.pathCursor + 1) % n; return idx;
  }

  updateSpawner(dt){
    if(!this.spawner.active) return;
    this.spawner.time -= dt;
    if(this.spawner.time <= 0 && this.spawner.queue.length){
      const def = this.spawner.queue.shift();
      this.spawnEnemy(def);
      this.spawner.time = def.delay;
      this.spawner.spawned = (this.spawner.spawned||0) + 1;
      if(def.variant && /^boss/.test(def.variant)){
        // Boss has arrived — punctuate with banner/SFX
        this.showBanner('BOSS ARRIVED', null, 'boss');
        if(audio.bossSpawn) audio.bossSpawn();
        this.spawner.hadBoss = true;
      }
    }
    if(this.spawner.queue.length===0 && this.enemies.every(e=>!e.alive)){
      // Wave over
      this.waveIdx++;
      this.spawner.active = false;
      const displayWave = (this.mode === 'assembly' && this.missionMaxWaves && this.waveIdx >= this.missionMaxWaves)
        ? this.missionMaxWaves
        : (this.waveIdx+1);
      this.ui.setWave(displayWave);
      this.ui.setStartEnabled(true);
      this.ui.setWaveStatus(false);
      if(this.ui.setWaveProgress) this.ui.setWaveProgress(0);
      const completedWave = this.waveIdx; // 1-based count of waves cleared
      // Stable tower credits: fixed income per completed wave so the
      // economy no longer depends on last-hit randomness.
      const waveBase = (GAME_RULES.waveCreditBase != null) ? GAME_RULES.waveCreditBase : 12;
      const waveStep = (GAME_RULES.waveCreditStep != null) ? GAME_RULES.waveCreditStep : 2;
      const waveReward = Math.max(0, Math.round(waveBase + completedWave * waveStep));
      if(waveReward > 0){
        this.credits += waveReward;
        this.ui.setCredits(this.credits);
        // General wave rewards: keep neutral styling (black/standard).
        this.showBanner('WAVE REWARD', `+${waveReward}⚛`, null);
      }
      // If this was a bonus wave, only award if no HP was lost
      if(this.bonusActive){
        if(!this.waveLostHP){
          const cap = GAME_RULES.bonusMaxPayout ?? Infinity;
          const payout = Math.min(Math.round(this.bonusPayout), cap);
          this.credits += payout;
          this.ui.setCredits(this.credits);
          // Bonus payout: blue bonus styling.
          this.showBanner('BONUS REWARD', `+${payout}⚛`, 'bonus');
        }
        // Scale next bonus payout regardless of success, and clamp to max
        const cap = GAME_RULES.bonusMaxPayout ?? Infinity;
        this.bonusPayout = Math.min(Math.round(this.bonusPayout * GAME_RULES.bonusScale), cap);
        this.bonusActive = false;
      }
      // Data Fragments are now awarded in controlled
      // chunks on checkpoint waves rather than constant trickles:
      //  - Wave 3 → +1 chip
      //  - Wave 6 → +1 chip
      //  - Wave 9 → +2 chips
      //  - Wave 12 → +2 chips
      //  - Every 3rd wave after 12 → +2 chips
      let chipReward = 0;
      if(completedWave % 3 === 0){
        if(completedWave === 3 || completedWave === 6) chipReward += 1;
        else if(completedWave === 9 || completedWave === 12) chipReward += 2;
        else if(completedWave > 12) chipReward += 2;
      }
      // Perks that boost tech income now apply as a flat bonus on top
      // of the checkpoint reward instead of random kill drops.
      if(buffs.fragmentEliteBonus){
        chipReward += Math.max(0, Math.round(buffs.fragmentEliteBonus));
      }
      if(chipReward > 0){
        this.addFragments(chipReward, { banner: true, reason: 'Data Fragments' });
      }
      // Perfect combo now tracks true no‑leak waves.
      if(this.waveLostHP){
        this.perfectCombo = 0;
      } else {
        this.perfectCombo = (this.perfectCombo || 0) + 1;
        if(this.perfectCombo > (this.bestPerfectCombo || 0)){
          this.bestPerfectCombo = this.perfectCombo;
          if(this.ui.setPerfectBest) this.ui.setPerfectBest(this.bestPerfectCombo);
        }
      }
      if(this.ui.setPerfectCombo) this.ui.setPerfectCombo(this.perfectCombo);
    if(this.spawner.hadBoss){
      // Major boss waves grant rare Ultimate Cores. One core is
      // guaranteed; a clean, no‑leak kill grants a bonus core.
        const baseCores = 1;
        const noLeaks = !this.waveLostHP && (this.lives === this.livesAtWaveStart);
        const bonusCores = noLeaks ? 1 : 0;
        const totalCores = baseCores + bonusCores;
        this.addCoreShards(totalCores, {
          banner: true,
          reason: noLeaks ? 'Flawless Boss Kill' : 'Boss Core Recovered',
          color: 'boss'
        });
      }
      // After boss waves: teleport to chamber shop for Endless mode only.
      // Assembly War missions no longer auto-travel to the core.
      if(this.spawner.hadBoss && this.state!=='gameover' && this.mode === 'endless'){
        this.startTeleportToShop?.();
      }
      // Assembly War: cap waves per mission and mark completion.
      if(this.mode === 'assembly' && this.missionId!=null){
        const max = this.missionMaxWaves || getMissionTotalWaves(this.missionId);
        this.missionMaxWaves = max || null;
        if(max && this.waveIdx >= max){
          // No further waves; disable Start and show a completion banner,
          // then auto-return to mission select after a short delay.
          this.ui.setStartEnabled(false);
          this.ui.setWaveStatus(false);
          // Reset game speed back to 1x for the banner + transition,
          // unless automatic speed control is disabled.
          if(this.autoSpeedControl){
            this.speedFactor = 1;
            this.ui.setFastLabel(this.speedFactor);
          }
          const mission = getMissionById(this.missionId);
          const label = mission ? mission.name : `Mission ${this.missionId}`;
      this.showBanner('MISSION COMPLETE', label, null);
      const missionShard = 3 + Math.floor((this.missionId||1)/2);
          this.addCoreShards(missionShard, { banner: true, reason: 'Mission Reward' });
          this.bestWave = Math.max(this.bestWave, max);
          this.recordLeaderboardEntry(this.bestWave);
          // Unlock the next mission in sequence (persisted across sessions).
          const nextId = Math.min(6, (this.missionId|0) + 1);
          const newLevel = Math.max(this.missionUnlockLevel||1, nextId);
          if(newLevel !== this.missionUnlockLevel){
            this.missionUnlockLevel = newLevel;
            this._writeMissionUnlock(newLevel);
            if(this.ui.setMissionUnlock) this.ui.setMissionUnlock(newLevel);
          }
          this.missionCompleteTimer = 2.0;
        }
      }
  }
  }

  addHazardZone({ x, y, r, dur, slowPct, dps=0, burnDps=0, kind='generic', color=null }){
    const radius = Math.max(10, r||0);
    let ttl = Math.max(0.1, dur||0);
    let slow = Math.max(0, Math.min(0.95, slowPct||0));
    let dpsVal = Math.max(0, dps||0);
    let burnVal = Math.max(0, burnDps||0);
    if(this.sandboxMode && this.sandboxConfig){
      const cfg = this.sandboxConfig;
      const mulD = cfg.puddleDpsMul ?? 1;
      const mulS = cfg.puddleSlowMul ?? 1;
      const mulT = cfg.puddleDurMul ?? 1;
      dpsVal *= mulD;
      burnVal *= mulD;
      slow = Math.max(0, Math.min(0.95, slow * mulS));
      ttl = Math.max(0.1, ttl * mulT);
    }
    const isBubble = (kind === 'bubble');
    // Base growth window for Acid puddles (before character / perk modifiers).
    const BASE_SPREAD_DURATION = 0.5; // seconds
    const MIN_SPREAD_DURATION = 0.25;
    const MAX_SPREAD_DURATION = 0.8;
    let spreadDuration = 0;
    let startRadius = radius;
    let maxRadius = radius;
    if(isBubble){
      const speedMul = (typeof this.getPuddleSpreadSpeedMul === 'function')
        ? this.getPuddleSpreadSpeedMul()
        : 1;
      const safeMul = Math.max(0.25, Math.min(4.0, speedMul || 1));
      const baseDur = BASE_SPREAD_DURATION;
      spreadDuration = Math.max(
        MIN_SPREAD_DURATION,
        Math.min(MAX_SPREAD_DURATION, baseDur / safeMul)
      );
      maxRadius = radius;
      const baseStartFrac = 0.45;
      startRadius = Math.max(4, maxRadius * baseStartFrac);
    }
    this.hazardZones.push({
      x,
      y,
      r: isBubble ? startRadius : radius,
      maxRadius,
      startRadius,
      spreadDuration,
      elapsed: 0,
      t: ttl,
      ttl,
      slow,
      dps: dpsVal,
      burnDps: burnVal,
      kind,
      color,
      tickInterval: 0.25,
      _tickAcc: 0,
      justSpawned: true
    });
  }
  updateHazards(dt){
    if(!this.hazardZones.length) return;
    this.hazardZones = this.hazardZones.filter(z=> (z.t -= dt) > 0);
    if(!this.hazardZones.length || !this.enemies.length) return;
    for(const z of this.hazardZones){
      // Acid puddles grow from a small core to their full size over a short window.
      if(z.kind === 'bubble' && z.spreadDuration && z.spreadDuration > 0){
        z.elapsed = (z.elapsed || 0) + dt;
        const frac = Math.max(0, Math.min(1, z.elapsed / z.spreadDuration));
        const maxR = z.maxRadius || z.r || 0;
        const startR = (z.startRadius != null ? z.startRadius : maxR) || 0;
        z.r = startR + (maxR - startR) * frac;
      }
      const interval = z.tickInterval || 0.25;
      z._tickAcc = (z._tickAcc || 0) + dt;
      const doTick = z.dps > 0 && z._tickAcc >= interval;
      if(doTick) z._tickAcc -= interval;
      const r2 = z.r * z.r;
      const statusMul = this.getStatusEffectMul ? this.getStatusEffectMul() : 1;
      for(const e of this.enemies){
        if(!e.alive) continue;
        // Flying drones are immune to ground Acid puddles (bubble zones),
        // but can still be affected by other hazard types.
        if(e.isFlying && z.kind === 'bubble') continue;
        if(dist2(e.x, e.y, z.x, z.y) <= r2){
          if(z.slow > 0){
            e.applySlow(z.slow * statusMul, 0.5);
          }
          if(z.burnDps > 0){
            e.applyBurn(z.burnDps * statusMul, 0.6);
          }
          if(doTick && z.dps > 0){
            let dmg = z.dps * interval;
            const meta = { color: z.color || COLORS.accent2 };
            if(z.kind === 'bubble'){
              // Scale bubble DoT with current puddle size so early ticks ramp up
              // as the pool blooms, but keep a reasonable floor so it never
              // feels completely empty.
              const maxR = z.maxRadius || z.r || 1;
              const curR = Math.max(0, Math.min(maxR, z.r || 0));
              let areaFactor = 1;
              if(maxR > 0){
                const t = curR / maxR;
                const minFactor = 0.6;
                areaFactor = Math.max(minFactor, t);
              }
              dmg *= areaFactor;
              // Ensure Acid puddles have a satisfying base DoT: even the
              // earliest ticks should land for a few points of damage.
              const MIN_TICK_DMG = 4;
              if(dmg < MIN_TICK_DMG){
                dmg = MIN_TICK_DMG;
              }
              meta.small = true;
              meta.towerKind = 'splash';
            }
            e.damage(dmg, 'bullet', meta);
          }
        }
      }
      // After the first processed tick, clear spawn flag so only the very first contact can be "direct"
      z.justSpawned = false;
    }
  }
  updateChrono(dt){
    if(!buffs.chronoInterval || !buffs.chronoDuration) return;
    if(this.chrono.active){
      this.chrono.timeLeft -= dt;
      if(this.chrono.timeLeft <= 0){
        this.chrono.active = false;
        buffs.chronoActive = false;
        this.chrono.timer = buffs.chronoInterval;
      }
    } else {
      this.chrono.timer -= dt;
      if(this.chrono.timer <= 0){
        this.chrono.active = true;
        buffs.chronoActive = true;
        this.chrono.timeLeft = buffs.chronoDuration;
        this.chrono.timer = buffs.chronoInterval;
        // Chrono overclock is a temporary buff → treat as bonus.
        this.showBanner('CHRONO OVERCLOCK', '+40% FIRERATE / +20% RANGE', 'bonus');
      }
    }
  }
  handleSplashExplosion({ x, y, r }){
    if(buffs.singularityEvery && buffs.singularitySlow && buffs.singularityDuration){
      this.singularityCounter = (this.singularityCounter || 0) + 1;
      if(this.singularityCounter % buffs.singularityEvery === 0){
        const radiusMul = this.getSplashRadiusMul ? this.getSplashRadiusMul() : Math.max(1, buffs.splashRadiusMul||1);
        const radius = Math.max(r || 0, 90) * radiusMul;
        const slow = buffs.singularitySlow;
        const dur = buffs.singularityDuration;
        for(const e of this.enemies){
          if(!e.alive) continue;
          if(dist2(e.x, e.y, x, y) <= radius*radius){
            e.applySlow(slow, dur);
          }
        }
        this.spawnParticles(x, y, '#6ce9ff');
      }
    }
  }
  handleDroneKill(){
    if(!buffs.nanoDroneKillInterval || !buffs.nanoDroneMax) return;
    this.nanoKillCounter = (this.nanoKillCounter||0) + 1;
    if(this.nanoKillCounter % buffs.nanoDroneKillInterval === 0 && this.nanoDrones.length < buffs.nanoDroneMax){
      const base = this.grid.base || this.grid.waypoints[this.grid.waypoints.length-1];
      this.nanoDrones.push({ angle: Math.random()*Math.PI*2, dist: 80 + this.nanoDrones.length*14, cd: 0, x: base.x, y: base.y });
      this.addFloater(base.x, base.y - 20 - this.nanoDrones.length*6, 'DRONE +1', '#a8f0ff');
    }
  }
  updateDrones(dt){
    if(!this.nanoDrones.length) return;
    // Fade out existing drone beam traces
    if(this.droneBeams && this.droneBeams.length){
      this.droneBeams = this.droneBeams.filter(b=> (b.t = (b.t||0) + dt) < (b.ttl||0.12));
    }
    if(!buffs.nanoDroneDamage) return;
    const base = this.grid.base || this.grid.waypoints[this.grid.waypoints.length-1];
    const range = buffs.nanoDroneRange || 220;
    const fireDelay = 1 / Math.max(0.1, buffs.nanoDroneFireRate || 1);
    for(const d of this.nanoDrones){
      d.angle += dt * 0.8;
      const dist = d.dist || 90;
      d.x = base.x + Math.cos(d.angle) * dist;
      d.y = base.y + Math.sin(d.angle) * dist;
      d.cd = Math.max(0, (d.cd||0) - dt);
      if(d.cd>0) continue;
      let best = null, bestD2 = range*range;
      for(const e of this.enemies){
        if(!e.alive) continue;
        const d2v = dist2(d.x, d.y, e.x, e.y);
        if(d2v < bestD2){ bestD2 = d2v; best = e; }
      }
      if(best){
        // Hitscan-style pulse similar to a mini cannon shot.
        const dmg = Math.max(0, buffs.nanoDroneDamage || 0);
        if(dmg > 0){
          best.damage(dmg, 'drone', { color:'#a8f0ff' });
          // Beam visual from drone to target
          if(!this.droneBeams) this.droneBeams = [];
          this.droneBeams.push({
            x1: d.x,
            y1: d.y,
            x2: best.x,
            y2: best.y,
            t: 0,
            ttl: 0.14
          });
          if(Math.random()<0.5) this.spawnParticles(best.x, best.y, '#9fffe0');
        }
        d.cd = fireDelay;
      }
    }
  }

  loop(){
    const t = now();
    const dt = Math.min(0.05, (t - this.last)/1000) * this.speedFactor;
    this.last = t;

    if(this.state==='playing') this.update(dt);
    else if(this.state==='intro') this.updateIntro(dt);
    else if(this.state==='teleport' && this.updateTeleport) this.updateTeleport(dt);
    else if(this.state==='chamber' && this.updateChamber) this.updateChamber(dt);
    this.render();
    requestAnimationFrame(()=>this.loop());
  }

  toggleFast(){
    const seq = [1,2,3,4];
    const idx = seq.indexOf(this.speedFactor);
    this.speedFactor = seq[(idx+1) % seq.length];
    this.ui.setFastLabel(this.speedFactor);
  }

  addFragments(amount, opts={}){
    const base = Math.max(0, Math.round(amount));
    const fragMul = (this.sandboxMode && this.sandboxConfig) ? (this.sandboxConfig.fragmentMul ?? 1) : 1;
    const globalScale = (GAME_RULES.fragmentGainScale != null) ? GAME_RULES.fragmentGainScale : 1;
    const gain = Math.max(0, Math.round(base * globalScale * fragMul));
    if(!gain) return;
    this.fragments = Math.max(0, this.fragments + gain);
    if(this.ui.setFragments) this.ui.setFragments(this.fragments);
    if(opts.x!=null && opts.y!=null){
      this.addFloater(opts.x, opts.y, `+${gain}⟐`, '#a8f0ff');
    }
    if(opts.banner){
      const label = opts.reason || 'Data Cache';
      // Treat fragment pickups as blue bonus notifications.
      this.showBanner(label.toUpperCase(), `+${gain}⟐`, 'bonus');
    }
  }

  addCoreShards(amount, opts={}){
    const gain = Math.max(0, Math.round(amount));
    if(!gain) return;
    this.coreShards = Math.max(0, this.coreShards + gain);
    if(this.ui.setCoreShards) this.ui.setCoreShards(this.coreShards);
    if(opts.x!=null && opts.y!=null){
      this.addFloater(opts.x, opts.y, `+${gain}✦`, '#ffd47c');
    }
    if(opts.banner){
      const label = opts.reason || 'Core Recovered';
      // Meta cores act like big bonuses unless explicitly tagged
      // (e.g., boss rewards pass color:'boss').
      const color = opts.color || 'bonus';
      this.showBanner(label.toUpperCase(), `+${gain}✦`, color);
    }
  }

  // Convert fragments into a single shard (spec system)
  convertFragmentsToShard(){
    const cost = 500;
    if(!this.isCheatMode() && this.fragments < cost){
      this.showBanner('NOT ENOUGH FRAGMENTS', `Need ${cost}⟐`, 'danger');
      return;
    }
    if(!this.isCheatMode()){
      this.fragments = Math.max(0, this.fragments - cost);
      if(this.ui.setFragments) this.ui.setFragments(this.fragments);
      const fxX = (this.mouse && typeof this.mouse.x==='number') ? this.mouse.x : CANVAS_W/2;
      const fxY = (this.mouse && typeof this.mouse.y==='number') ? this.mouse.y - 12 : CANVAS_H/2;
      this.addFloater(fxX, fxY, `-${cost}⟐`, '#a8f0ff');
    }
    const cx = CANVAS_W/2, cy = CANVAS_H/2 - 20;
    this.addCoreShards(1, { x: cx, y: cy, banner: true, reason: 'Fragments Refined' });
  }

  getPassiveCapacity(){
    return Math.max(4, Math.min(6, this.passives?.capacity || 4));
  }
  getPassiveDefinition(key){
    return PERKS.find(p=> p.key === key);
  }
  getPassiveTier(key){
    const perk = this.getPassiveDefinition(key);
    return perk?.tier || 'common';
  }
  getPassiveStackLimit(key){
    const perk = this.getPassiveDefinition(key);
    if(!perk) return 1;
    if(perk.unique || (perk.tier||'') === 'super') return 1;
    if(typeof perk.stackLimit === 'number'){
      if(perk.stackLimit <= 0) return Infinity;
      return perk.stackLimit;
    }
    return Infinity;
  }
  getPassiveOwnedCount(key){
    if(!this.passives || !Array.isArray(this.passives.active)) return 0;
    let count = 0;
    for(const slot of this.passives.active){
      if(slot && slot.key === key) count++;
    }
    return count;
  }
  isPassiveActive(key){
    return this.getPassiveOwnedCount(key) > 0;
  }
  isPassiveAtLimit(key){
    const limit = this.getPassiveStackLimit(key);
    if(!isFinite(limit)) return false;
    return this.getPassiveOwnedCount(key) >= limit;
  }
  getNanoLockoutKeys(){
    const locks = new Set();
    if(this.passives && Array.isArray(this.passives.active)){
      const counts = {};
      for(const slot of this.passives.active){
        if(!slot || !slot.key) continue;
        counts[slot.key] = (counts[slot.key]||0) + 1;
      }
      for(const [key,count] of Object.entries(counts)){
        const limit = this.getPassiveStackLimit(key);
        if(isFinite(limit) && count >= limit) locks.add(key);
      }
    }
    if(this.passives?.slotBoost){
      locks.add('slot_plus');
    }
    return Array.from(locks);
  }
  recordPassiveSlot(perk, cost){
    if(!this.passives) this.passives = { active: [], capacity:4 };
    if(!Array.isArray(this.passives.active)) this.passives.active = [];
    this.passives.active.push({
      key: perk.key,
      name: perk.name,
      desc: perk.desc,
      cost: cost|0,
      tier: perk.tier || 'common'
    });
  }
  refreshPassivePanel(){
    if(!this.ui.renderPassivePanel) return;
    const capacity = this.getPassiveCapacity();
    const slots = [];
    if(this.passives && Array.isArray(this.passives.active)){
      for(const slot of this.passives.active){
        slots.push({
          key: slot.key,
          name: slot.name,
          desc: slot.desc,
          refund: Math.max(0, Math.round((slot.cost||0) * 0.6)),
          tier: slot.tier || this.getPassiveTier(slot.key)
        });
      }
    }
    // pad to capacity with nulls
    while(slots.length < capacity) slots.push(null);
    this.ui.renderPassivePanel({ capacity, slots });
  }
  resetSlotBuffs(){
    buffs.dmgMul = 1.0;
    buffs.fireRateMul = 1.0;
    buffs.rangeMul = 1.0;
    buffs.slowPotencyMul = 1.0;
    buffs.burnDpsMul = 1.0;
    buffs.splashRadiusMul = 1.0;
    buffs.projectileSpeedMul = 1.0;
    buffs.baseDamageMul = 1.0;
    buffs.retargetSpeedBonus = 0;
    buffs.cannonStartRangeLevel = 0;
    buffs.cannonStartRateLevel = 0;
    buffs.splashStartRateLevel = 0;
    buffs.laserStartRangeLevel = 0;
    buffs.laserStartRateLevel = 0;
    buffs.burnDurationBonus = 0;
    buffs.creditMul = 1.0;
    buffs.creditFlatPerKill = 0;
    buffs.pierceChance = 0;
    buffs.idleShotBonus = 0;
    buffs.idleShotThreshold = 3;
    buffs.resonanceBonus = 0;
    buffs.resonanceCooldown = 3;
    buffs.fluxFireRateBonus = 0;
    buffs.fluxOverheatBonus = 0;
    buffs.fluxChargeTime = 10;
    buffs.fluxBurstDuration = 4;
    buffs.ionicChance = 0;
    buffs.ionicDamagePct = 0;
    buffs.ionicRangeFactor = 1;
    buffs.cryoFractureBonus = 0;
    buffs.thermalVenting = false;
    buffs.thermalSlow = 0;
    buffs.thermalDuration = 0;
    buffs.thermalCooldown = 0;
    buffs.targetPainterChance = 0;
    buffs.targetPainterBonus = 0;
    buffs.targetPainterThreshold = 0.7;
    buffs.fragmentEliteBonus = 0;
    buffs.rerollDiscount = 0;
    buffs.singularityEvery = 0;
    buffs.singularitySlow = 0;
    buffs.singularityDuration = 0;
    buffs.chronoInterval = 0;
    buffs.chronoDuration = 0;
    buffs.chronoFireBonus = 0;
    buffs.chronoRangeBonus = 0;
    buffs.chronoActive = false;
    buffs.harmonicCascadeBonus = 0;
    buffs.harmonicExtraChains = 0;
    buffs.nanoDroneKillInterval = 0;
    buffs.nanoDroneMax = 0;
    buffs.nanoDroneDamage = 0;
    buffs.nanoDroneFireRate = 0;
    buffs.nanoDroneRange = 0;
    buffs.reactorAegis = 0;
    buffs.cannonStartBurn = false;
    buffs.cannonStartSlow = false;
    buffs.splashStartBurn = false;
    buffs.splashStartSlow = false;
    buffs.laserStartBurn = false;
    buffs.laserStartSlow = false;
  }
  applySlotPassiveEffect(key){
    const setStarterLevel = (prop, lvl)=>{
      const capped = Math.max(0, Math.min(3, lvl|0));
      const current = buffs[prop] || 0;
      buffs[prop] = Math.max(current, capped);
    };
    const multBaseDamage = (pct)=>{
      const mul = 1 + pct;
      buffs.baseDamageMul = (buffs.baseDamageMul||1) * mul;
    };
    const addRetargetBonus = (pct)=>{
      const cur = buffs.retargetSpeedBonus || 0;
      const next = Math.min(1.0, cur + pct);
      buffs.retargetSpeedBonus = next;
    };
    switch(key){
      case 'dmg': buffs.dmgMul *= 1.15; break;
      case 'firerate': buffs.fireRateMul *= 1.15; break;
      case 'range': buffs.rangeMul *= 1.10; break;
      case 'slow': buffs.slowPotencyMul *= 1.10; break;
      case 'burn': buffs.burnDpsMul *= 1.20; break;
      case 'splash': buffs.splashRadiusMul *= 1.15; break;
      case 'base_dmg_1': multBaseDamage(0.01); break;
      case 'base_dmg_3': multBaseDamage(0.03); break;
      case 'base_dmg_5': multBaseDamage(0.05); break;
      case 'starter_cannon_range1': setStarterLevel('cannonStartRangeLevel', 1); break;
      case 'starter_cannon_rate1': setStarterLevel('cannonStartRateLevel', 1); break;
      case 'starter_splash_rate1': setStarterLevel('splashStartRateLevel', 1); break;
      case 'starter_laser_range1': setStarterLevel('laserStartRangeLevel', 1); break;
      case 'starter_laser_rate1': setStarterLevel('laserStartRateLevel', 1); break;
      case 'starter_cannon_burn': buffs.cannonStartBurn = true; break;
      case 'starter_cannon_slow': buffs.cannonStartSlow = true; break;
      case 'starter_splash_burn': buffs.splashStartBurn = true; break;
      case 'starter_splash_slow': buffs.splashStartSlow = true; break;
      case 'starter_laser_burn': buffs.laserStartBurn = true; break;
      case 'starter_laser_slow': buffs.laserStartSlow = true; break;
      case 'proto_overdrive': buffs.fireRateMul *= 1.05; break;
      case 'proto_precision': addRetargetBonus(0.08); break;
      case 'proto_recycler': buffs.creditMul *= 1.05; break;
      case 'proto_coupling': buffs.burnDurationBonus += 1; break;
      case 'proto_cryo': buffs.slowPotencyMul *= 1.05; break;
      case 'proto_feedback': buffs.creditFlatPerKill += 1; break;
      case 'proto_pierce': buffs.pierceChance = Math.min(1, (buffs.pierceChance||0) + 0.05); break;
      case 'proto_reload': buffs.idleShotBonus += 0.20; break;
      case 'crit_micro_lattice': buffs.targetPainterChance = Math.min(1, (buffs.targetPainterChance||0) + 0.02); buffs.targetPainterBonus = Math.max(buffs.targetPainterBonus||0, 0.20); break;
      case 'crit_edge_trim': buffs.targetPainterChance = Math.min(1, (buffs.targetPainterChance||0) + 0.03); buffs.targetPainterBonus = Math.max(buffs.targetPainterBonus||0, 0.20); break;
      case 'crit_optics': buffs.targetPainterChance = Math.min(1, (buffs.targetPainterChance||0) + 0.04); buffs.targetPainterBonus = Math.max(buffs.targetPainterBonus||0, 0.20); break;
      case 'crit_microfusion': buffs.targetPainterChance = Math.min(1, (buffs.targetPainterChance||0) + 0.03); buffs.targetPainterBonus = Math.max(buffs.targetPainterBonus||0, 0.25); break;
      case 'crit_stability': buffs.targetPainterChance = Math.min(1, (buffs.targetPainterChance||0) + 0.02); buffs.targetPainterBonus = Math.max(buffs.targetPainterBonus||0, 0.25); break;
      case 'resonance_rounds': buffs.resonanceBonus = (buffs.resonanceBonus||0) + 0.40; buffs.resonanceCooldown = 3; break;
      case 'flux_coolant': buffs.fluxFireRateBonus = (buffs.fluxFireRateBonus||0) + 0.10; buffs.fluxOverheatBonus = (buffs.fluxOverheatBonus||0) + 0.05; buffs.fluxChargeTime = Math.max(6, buffs.fluxChargeTime||10); buffs.fluxBurstDuration = 4; break;
      case 'ionic_feedback': buffs.ionicChance = Math.min(1, (buffs.ionicChance||0) + 0.15); buffs.ionicDamagePct = Math.min(1, (buffs.ionicDamagePct||0) + 0.30); buffs.ionicRangeFactor = Math.max(1, (buffs.ionicRangeFactor||1) + 0.15); break;
      case 'cryo_fracture': buffs.cryoFractureBonus = Math.min(0.24, (buffs.cryoFractureBonus||0) + 0.12); break;
      case 'thermal_venting': buffs.thermalVenting = true; buffs.thermalSlow = Math.max(buffs.thermalSlow||0, 0.2); buffs.thermalDuration = Math.max(buffs.thermalDuration||0, 1.5); buffs.thermalCooldown = Math.max(buffs.thermalCooldown||0, 4); break;
      case 'target_painter': buffs.targetPainterChance = Math.min(1, (buffs.targetPainterChance||0) + 0.08); buffs.targetPainterBonus = Math.max(buffs.targetPainterBonus||0, 0.5); buffs.targetPainterThreshold = 0.7; break;
      case 'fragment_siphon': buffs.fragmentEliteBonus = (buffs.fragmentEliteBonus||0) + 1; buffs.rerollDiscount = Math.min(0.5, (buffs.rerollDiscount||0) + 0.05); break;
      case 'starter_cannon_range2': setStarterLevel('cannonStartRangeLevel', 2); break;
      case 'starter_cannon_rate2': setStarterLevel('cannonStartRateLevel', 2); break;
      case 'starter_splash_rate2': setStarterLevel('splashStartRateLevel', 2); break;
      case 'starter_laser_range2': setStarterLevel('laserStartRangeLevel', 2); break;
      case 'starter_laser_rate2': setStarterLevel('laserStartRateLevel', 2); break;
      case 'base_dmg_10': multBaseDamage(0.10); break;
      case 'base_dmg_15': multBaseDamage(0.15); break;
      case 'base_dmg_20': multBaseDamage(0.20); break;
      case 'starter_cannon_burnslow': buffs.cannonStartBurn = true; buffs.cannonStartSlow = true; break;
      case 'starter_splash_burnslow': buffs.splashStartBurn = true; buffs.splashStartSlow = true; break;
      case 'starter_laser_burnslow': buffs.laserStartBurn = true; buffs.laserStartSlow = true; break;
      case 'singularity_core': buffs.singularityEvery = buffs.singularityEvery || 8; buffs.singularitySlow = Math.max(buffs.singularitySlow||0, 0.25); buffs.singularityDuration = Math.max(buffs.singularityDuration||0, 1); break;
      case 'chrono_overclock': buffs.chronoInterval = buffs.chronoInterval || 20; buffs.chronoDuration = Math.max(buffs.chronoDuration||0, 4); buffs.chronoFireBonus = Math.max(buffs.chronoFireBonus||0, 0.4); buffs.chronoRangeBonus = Math.max(buffs.chronoRangeBonus||0, 0.2); break;
      case 'harmonic_cascade': buffs.harmonicCascadeBonus = Math.max(buffs.harmonicCascadeBonus||0, 0.25); buffs.harmonicExtraChains = Math.max(buffs.harmonicExtraChains||0, 1); break;
      case 'nanite_armada': buffs.nanoDroneKillInterval = Math.max(buffs.nanoDroneKillInterval||0, 12); buffs.nanoDroneMax = Math.max(buffs.nanoDroneMax||0, 3); buffs.nanoDroneDamage = Math.max(buffs.nanoDroneDamage||0, 28); buffs.nanoDroneFireRate = Math.max(buffs.nanoDroneFireRate||0, 1.2); buffs.nanoDroneRange = Math.max(buffs.nanoDroneRange||0, 260); break;
      case 'reactor_aegis': buffs.reactorAegis = Math.max(buffs.reactorAegis||0, 10); break;
      case 'starter_cannon_range3': setStarterLevel('cannonStartRangeLevel', 3); break;
      case 'starter_cannon_rate3': setStarterLevel('cannonStartRateLevel', 3); break;
      case 'starter_splash_rate3': setStarterLevel('splashStartRateLevel', 3); break;
      case 'starter_laser_range3': setStarterLevel('laserStartRangeLevel', 3); break;
      case 'starter_laser_rate3': setStarterLevel('laserStartRateLevel', 3); break;
      case 'base_dmg_50': multBaseDamage(0.50); break;
      case 'base_dmg_100': multBaseDamage(1.00); break;
      case 'base_dmg_200': multBaseDamage(2.00); break;
      case 'proto_retarget': addRetargetBonus(0.12); break;
      case 'sub_retarget': addRetargetBonus(0.22); break;
      case 'anom_retarget': addRetargetBonus(0.40); break;
      default: break;
    }
  }
  recomputeSlotPassives(){
    this.resetSlotBuffs();
    if(this.passives && Array.isArray(this.passives.active)){
      for(const slot of this.passives.active){
        this.applySlotPassiveEffect(slot.key);
      }
    }
    this.updateCombatStats();
  }
  updateCombatStats(){
    if(!this.ui || !this.ui.setCombatStats) return;
    const baseCrit = 0.05;      // +5% base crit chance
    const baseCritDmg = 0.03;   // +3% base crit damage
    const critRaw = Math.max(0, Math.min(1, baseCrit + (buffs.targetPainterChance || 0)));
    const critDmgRaw = Math.max(0, baseCritDmg + (buffs.targetPainterBonus || 0));
    const crit = critRaw - baseCrit;
    const critDmg = critDmgRaw - baseCritDmg;
    const statusMul = this.getStatusEffectMul ? this.getStatusEffectMul() : 1;
    const slowRaw = (buffs.slowPotencyMul || 1) * statusMul;
    const burnRaw = (buffs.burnDpsMul || 1) * statusMul;
    const slowBonus = slowRaw - 1;
    const burnBonus = burnRaw - 1;
    const dmgMul = (buffs.dmgMul || 1);
    const baseMul = (buffs.baseDamageMul || 1);
    const baseDamageRaw = baseMul * dmgMul;
    const baseDamage = baseDamageRaw - 1;
    const targetingRaw = 1 + (buffs.retargetSpeedBonus || 0);
    const targeting = targetingRaw - 1;
    const spreadSpeed = (typeof this.getPuddleSpreadSpeedMul === 'function')
      ? this.getPuddleSpreadSpeedMul()
      : 1;
    const puddleSpread = (spreadSpeed || 1) - 1;
    const stabMul = (typeof this.getLaserStabilityMul === 'function')
      ? this.getLaserStabilityMul()
      : 1;
    const laserStab = (stabMul || 1) - 1;
    this.ui.setCombatStats({
      baseDamage,
      crit,
      critDmg,
      slow: slowBonus,
      burn: burnBonus,
      targeting,
      puddle: puddleSpread,
      laserStab,
      baseDamageRaw,
      critRaw,
      critDmgRaw,
      slowRaw,
      burnRaw,
      targetingRaw,
      puddleRaw: spreadSpeed || 1,
      laserStabRaw: stabMul || 1
    });
  }
  refundPassive(key){
    if(!this.passives || !Array.isArray(this.passives.active)) return;
    const idx = this.passives.active.findIndex(slot=> slot.key===key);
    if(idx===-1) return;
    const [slot] = this.passives.active.splice(idx,1);
    const refund = Math.max(0, Math.round((slot.cost||0) * 0.6));
    if(refund>0){
      this.fragments += refund;
      if(this.ui.setFragments) this.ui.setFragments(this.fragments);
      this.showBanner('NANO-TECH RECYCLED', `+${refund}⟐`, null);
    }
    this.recomputeSlotPassives();
    this.refreshPassivePanel();
    if(this.shop && Array.isArray(this.shop.offers)){
      for(const o of this.shop.offers){
        if(o && o.key === slot.key) o._purchased = false;
      }
    }
    this.updateShopOfferMeta();
    if(this.ui.renderShop) this.ui.renderShop(this.shop.offers||[], this.fragments);
  }

  normalizePassiveEntries(list, capacity){
    const slots = [];
    if(Array.isArray(list)){
      for(const entry of list){
        if(!entry || !entry.key) continue;
        const perk = PERKS.find(p=>p.key===entry.key);
        slots.push({
          key: entry.key,
          name: entry.name || perk?.name || entry.key,
          desc: entry.desc || perk?.desc || '',
          cost: entry.cost ?? perk?.baseCost ?? 0,
          tier: entry.tier || perk?.tier || 'common'
        });
        if(slots.length >= capacity) break;
      }
    }
    return slots;
  }
  convertLegacyPassives(levels, capacity){
    if(!levels || typeof levels !== 'object') return [];
    const slots = [];
    for(const key of Object.keys(levels)){
      if(slots.length >= capacity) break;
      if(!levels[key]) continue;
      const perk = PERKS.find(p=>p.key===key);
      slots.push({
        key,
        name: perk?.name || key,
        desc: perk?.desc || '',
        cost: perk?.baseCost || 0,
        tier: perk?.tier || 'common'
      });
    }
    return slots;
  }

  decoratePassiveOffer(offer){
    const perk = PERKS.find(p=>p.key===offer.key) || {};
    const slotPassive = !!(offer.slotPassive ?? perk.slotPassive);
    const capacity = this.getPassiveCapacity();
    const ownedCount = slotPassive ? this.getPassiveOwnedCount(offer.key) : 0;
    const active = slotPassive && ownedCount > 0;
    const atLimit = slotPassive && this.isPassiveAtLimit(offer.key);
    const slotsFull = slotPassive && !atLimit && (this.passives?.active?.length || 0) >= capacity;
    const lvl = slotPassive ? ownedCount : (offer.level||0);
    const maxLevel = slotPassive ? 1 : (offer.maxLevel || PASSIVE_MAX_LEVEL);
    const tier = perk.tier || offer.tier || 'common';
    const uniqueOwned = !!perk.unique && (
      offer.key==='slot_plus' ? this.passives?.slotBoost : this.isPassiveAtLimit(offer.key)
    );
    return {
      ...offer,
      slotPassive,
      active,
      slotsFull,
      unique: !!perk.unique,
      uniqueOwned,
      tier,
      tierLabel: tier==='super' ? 'Super Rare' : (tier==='rare' ? 'Rare' : 'Common'),
      ownedCount,
      atLimit,
      level: lvl,
      maxLevel
    };
  }
  updateShopOfferMeta(){
    if(!this.shop || !Array.isArray(this.shop.offers)) return;
    this.shop.offers = this.shop.offers.map(o=> this.decoratePassiveOffer(o));
  }

  buildAbilityCards(){
    const maxLGlobal = ULTIMATE_MAX_LEVEL || 5;
    return ABILITIES.map(a=>{
      const lvl = this.getAbilityLevel(a.key);
      const maxL = maxLGlobal;
      const cost = ultimateCostFor ? ultimateCostFor(a, lvl) : (a.cost|0);
      const preview = [];
      if(a.key==='bomb'){
        const curD = 120 + 30*lvl;
        const nextD = 120 + 30*Math.min(maxL, lvl+1);
        const curR = 70 + 10*lvl;
        const nextR = 70 + 10*Math.min(maxL, lvl+1);
        const curCd = Math.max(3, 12 - 0.8*lvl);
        const nextCd = Math.max(3, 12 - 0.8*Math.min(maxL, lvl+1));
        preview.push(lvl<maxL ? `Damage: ${curD} → ${nextD}` : `Damage: ${curD} (Max)`);
        preview.push(lvl<maxL ? `Radius: ${curR} → ${nextR}` : `Radius: ${curR} (Max)`);
        preview.push(lvl<maxL ? `Cooldown: ${curCd.toFixed(1)}s → ${nextCd.toFixed(1)}s` : `Cooldown: ${curCd.toFixed(1)}s (Max)`);
      } else if(a.key==='overclock'){
        const curP = Math.round(6*lvl);
        const nextP = Math.round(6*Math.min(maxL, lvl+1));
        const curCd = Math.max(6, 25 - 1.5*lvl);
        const nextCd = Math.max(6, 25 - 1.5*Math.min(maxL, lvl+1));
        preview.push(lvl<maxL ? `Fire rate: +${curP}% → +${nextP}%` : `Fire rate: +${curP}% (Max)`);
        preview.push(lvl<maxL ? `Cooldown: ${curCd.toFixed(1)}s → ${nextCd.toFixed(1)}s` : `Cooldown: ${curCd.toFixed(1)}s (Max)`);
      } else if(a.key==='cryo'){
        const curS = (2.5 + 0.3*lvl);
        const nextS = (2.5 + 0.3*Math.min(maxL, lvl+1));
        const curCd = Math.max(5, 20 - 1.0*lvl);
        const nextCd = Math.max(5, 20 - 1.0*Math.min(maxL, lvl+1));
        preview.push(lvl<maxL ? `Duration: ${curS.toFixed(1)}s → ${nextS.toFixed(1)}s` : `Duration: ${curS.toFixed(1)}s (Max)`);
        preview.push(lvl<maxL ? `Cooldown: ${curCd.toFixed(1)}s → ${nextCd.toFixed(1)}s` : `Cooldown: ${curCd.toFixed(1)}s (Max)`);
      } else if(a.key==='corehp'){
        const curBonus = 5*lvl;
        const nextBonus = 5*Math.min(maxL, lvl+1);
        preview.push(lvl<maxL ? `Max HP: +${curBonus} → +${nextBonus}` : `Max HP: +${curBonus} (Max)`);
      }
      return { key:a.key, name:a.name, desc:a.desc, preview, cost, level:lvl, maxLevel:maxL };
    });
  }

  // ---- Shop / Roguelike layer ----
  openShop(){
    this.stopAllAudio();
    this.state = 'shop';
    // Roll offers for this shop index and attach dynamic costs/levels
    this.shop.rerolled = false;
    if(!this.shop.rerollPrice || !Number.isFinite(this.shop.rerollPrice) || this.shop.rerollPrice <= 0){
      this.shop.rerollPrice = GAME_RULES.rerollBasePrice || 50;
    }
    const raw = rollShopOffers(SHOP_OFFER_COUNT, this.shop.index, this.getNanoLockoutKeys());
    this.shop.offers = raw.map(o=>{
      const perk = PERKS.find(p=>p.key===o.key) || {};
      const slotPassive = !!perk.slotPassive;
      const lvl = slotPassive ? this.getPassiveOwnedCount(o.key) : 0;
      const priced = passiveCostFor(o, lvl, this.shop.index);
      return this.decoratePassiveOffer({ ...o, cost: priced, slotPassive, maxLevel: slotPassive ? 1 : PASSIVE_MAX_LEVEL });
    });
    this.ui.renderShop(this.shop.offers, this.fragments);
    // Render ability section (always available, separate from rerolls)
    const abilList = this.buildAbilityCards();
    if(this.ui.renderShopAbilities) this.ui.renderShopAbilities(abilList, this.coreShards);
    this.ui.showShop(true);
    if(this.ui.setRerollPrice) this.ui.setRerollPrice(this.shop.rerollPrice || (GAME_RULES.rerollBasePrice || 50));
    if(this.ui.setShopRerollEnabled) this.ui.setShopRerollEnabled(true);
    // Enable Start button after leaving shop; here we just keep it as-is for Endless;
    // Assembly Core uses Back to return to mission select.
  }

  // Common exit path for the HTML shop / Assembly Core overlay
  _exitShopOverlay(){
    this.ui.showShop(false);
    // Advance shop index for cost scaling across visits
    this.shop.index = (this.shop.index|0) + 1;
    if(this.coreReturnTarget === 'assembly' && this.mode === 'assembly'){
      // Return to Assembly War mission select
      this.state = 'menu';
      if(this.ui.showAssembly) this.ui.showAssembly(true);
    } else {
      // Fallback: resume gameplay (used if overlay is ever opened mid-run)
      this.state = 'playing';
    }
    this.coreReturnTarget = null;
  }

  closeShop(){
    this._exitShopOverlay();
  }

  // --- Cinematic Teleport + Canvas Chamber Shop ---
  startTeleportToShop(){
    this.stopAllAudio();
    if(audio.shopTheme) audio.shopTheme();
    this.state = 'teleport';
    this.teleport = { t:0, fade:0.12, phase:'out', durOut:0.7, durIn:0.6, target:'chamber', msg:'Entering Nanocore…' };
    // Build teleport dots each time
    this.teleDots = [];
    for(let i=0;i<50;i++) this.teleDots.push({ x: Math.random()*CANVAS_W, y: Math.random()*CANVAS_H, r:1+Math.random()*2, p: Math.random()*Math.PI*2 });
  }
  updateTeleport(dt){
    if(!this.teleport) return;
    this.teleport.t += dt;
    if(this.teleport.phase==='out'){
      this.teleport.fade = Math.min(1, this.teleport.t/this.teleport.durOut);
      if(this.teleport.fade>=1){
        if(this.teleport.target==='chamber'){
          this.enterChamber();
        } else {
          // begin fade-in to map
          this.teleport.phase='in';
          this.teleport.t=0;
        }
      }
    } else if(this.teleport.phase==='in'){
      this.teleport.fade = Math.max(0, 1 - (this.teleport.t/this.teleport.durIn));
      if(this.teleport.fade<=0){
        if(this.teleport.target==='chamber'){
          this.teleport = null;
          this.state = 'chamber';
        } else {
          // Finished returning from the chamber. If we originated
          // from the Assembly War mission select screen, go back
          // there instead of resuming live gameplay.
          this.teleport = null;
          if(this.coreReturnTarget === 'assembly' && this.mode === 'assembly'){
            this.state = 'menu';
            if(this.ui.showPause) this.ui.showPause(false);
            if(this.ui.showGameOver) this.ui.showGameOver(false);
            if(this.ui.showMenu) this.ui.showMenu(false);
            if(this.ui.showLoadMenu) this.ui.showLoadMenu(false);
            if(this.ui.showMainMenu) this.ui.showMainMenu(false);
            if(this.ui.showAssembly) this.ui.showAssembly(true);
          } else {
            this.state = 'playing';
          }
          this.coreReturnTarget = null;
        }
      }
    }
  }
  enterChamber(){
    // Prepare shop data (similar to openShop but without HTML overlay)
    this.teleport.phase='in'; this.teleport.t=0;
    // Hide the combat stats panel while the Assembly Core
    // (Nanocore chamber) is active so it does not overlap
    // the chamber UI.
    if(typeof document !== 'undefined'){
      const cs = document.getElementById('combat-stats');
      if(cs) cs.style.display = 'none';
    }
    this.shop.rerolled = false;
    if(!this.shop.rerollPrice || !Number.isFinite(this.shop.rerollPrice) || this.shop.rerollPrice <= 0){
      this.shop.rerollPrice = GAME_RULES.rerollBasePrice || 50;
    }
    const raw = rollShopOffers(SHOP_OFFER_COUNT, this.shop.index, this.getNanoLockoutKeys());
    this.shop.offers = raw.map(o=>{
      const perk = PERKS.find(p=>p.key===o.key) || {};
      const slotPassive = !!perk.slotPassive;
      const lvl = slotPassive ? this.getPassiveOwnedCount(o.key) : 0;
      const priced = passiveCostFor(o, lvl, this.shop.index);
      return this.decoratePassiveOffer({ ...o, cost: priced, slotPassive, maxLevel: slotPassive ? 1 : PASSIVE_MAX_LEVEL });
    });
    // abilities list snapshot
    const abilityCards = this.buildAbilityCards();
    const abilList = abilityCards.map(card=>({
      key: card.key,
      name: card.name,
      cost: card.cost,
      level: card.level,
      maxLevel: card.maxLevel
    }));
    this.chamber = { t:0, nodes:[], abil:[] };
    this.chamberData = { abilities: abilList, abilityCards };
    this.buildChamberNodes();
  }
  updateChamber(dt){ if(this.chamber){ this.chamber.t += dt; } }
  buildChamberNodes(){
    const cx = CANVAS_W/2, cy = CANVAS_H/2;
    // Nano-tech upgrades: show up to SHOP_OFFER_COUNT not-yet-purchased offers in a left column
    const offersAll = this.shop.offers||[];
    const offers = offersAll.filter(o=> !o._purchased).slice(0, 4); // limit to 4 nano-tech upgrades in chamber
    // Shift passives further left and space them out a bit more
    const leftX = cx - 360; const spacing = 110; const nP = Math.max(1, offers.length);
    this.chamber.passive = offers.map((o,i)=>{
      const y = cy + (i - (nP-1)/2)*spacing;
      return {
        kind:'passive',
        idx: offersAll.indexOf(o),
        x: leftX,
        y,
        label: o.name,
        cost: o.cost,
        level: o.level||0,
        desc: o.desc||'',
        tier: o.tier || 'common',
        rarity: o.tierLabel || (o.tier==='super' ? 'Super Rare' : (o.tier==='rare' ? 'Rare' : 'Common'))
      };
    });
    // Abilities: compute live list from current ability levels and prices (fresh each time)
    const abilityCards = this.buildAbilityCards();
    if(this.chamberData) this.chamberData.abilityCards = abilityCards;
    const cardLookup = abilityCards.reduce((acc, card)=>{ acc[card.key] = card; return acc; }, {});
    const liveAb = ['bomb','overclock','cryo'].map(k=>{
      const info = cardLookup[k];
      if(!info) return { key:k, name:k, cost:1, level:0, max: (ULTIMATE_MAX_LEVEL||5), lines: [], rarity:'Ultimate' };
      return {
        key:k,
        name:info.name,
        cost:info.cost,
        level:info.level,
        max: info.maxLevel|| (ULTIMATE_MAX_LEVEL||5),
        lines: info.preview || [],
        rarity:'Ultimate'
      };
    });
    const R = Math.min(CANVAS_W, CANVAS_H)*0.26; const m = Math.max(1, liveAb.length);
    this.chamber.abil = liveAb.map((a,i)=>{
      const ang = -Math.PI/2 + i*(Math.PI*2/m);
      return {
        kind:'ability',
        key:a.key,
        x: cx + Math.cos(ang)*R,
        y: cy + Math.sin(ang)*R,
        label:a.name,
        cost:a.cost,
        level:a.level||0,
        max:a.max||5,
        lines:a.lines||[],
        rarity:a.rarity || 'Ultimate'
      };
    });
    // Center hex upgrade: Reactor Reinforce (core HP)
    const lvlCore = this.getAbilityLevel('corehp');
    const aCore = ABILITIES.find(x=> x.key==='corehp');
    const costCore = (ultimateCostFor? ultimateCostFor(aCore,lvlCore): (aCore?.cost||160));
    const coreLines = (cardLookup['corehp']?.preview) || [];
    this.chamber.abil.push({
      kind:'ability',
      key:'corehp',
      x: cx,
      y: cy,
      label: aCore?.name||'Reactor Reinforce',
      cost: costCore,
      level: lvlCore,
      max: (ULTIMATE_MAX_LEVEL||5),
      lines: coreLines,
      rarity:'Ultimate'
    });
    this.chamber.sectionLabels = {
      passive: { text: 'Nano-Tech Upgrades', x: leftX, y: cy - (nP*spacing*0.5) - 60 },
      ability: { text: 'Over Drive Control', x: cx, y: cy - R - 70 }
    };
  }
  closeChamber(){ this.startReturnFromChamber(); this.shop.index = (this.shop.index|0) + 1; }
  startReturnFromChamber(){
    this.state = 'teleport';
    const target = (this.coreReturnTarget === 'assembly' && this.mode === 'assembly') ? 'assembly' : 'map';
    const msg = (target === 'assembly') ? 'Returning to Assembly War…' : 'Returning to Reactor Chamber';
    this.teleport = { t:0, fade:0.12, phase:'out', durOut:0.7, durIn:0.6, target, msg };
    this.teleDots = [];
    for(let i=0;i<50;i++) this.teleDots.push({ x: Math.random()*CANVAS_W, y: Math.random()*CANVAS_H, r:1+Math.random()*2, p: Math.random()*Math.PI*2 });
    // Restore combat stats panel now that we are leaving the
    // Assembly Core view.
    if(typeof document !== 'undefined'){
      const cs = document.getElementById('combat-stats');
      if(cs) cs.style.display = '';
    }
  }
  shopBuy(idx){
    if(!this.shop || !this.shop.offers || idx==null) return;
    const offer = this.shop.offers[idx]; if(!offer || offer._purchased) return;
    const cost = offer.cost|0;
    const slotPassive = !!offer.slotPassive;
    const isSlotUpgrade = offer.key === 'slot_plus';
    const capacity = this.getPassiveCapacity();
    if(slotPassive){
      if(this.isPassiveAtLimit(offer.key)){
        this.showBanner('STACK LIMIT REACHED', 'This nano-tech upgrade cannot stack further', 'danger');
        return;
      }
      if((this.passives?.active?.length || 0) >= capacity){
        this.showBanner('NO NANO-TECH SLOTS', 'Recycle an upgrade to free space', 'danger');
        return;
      }
    }
    if(isSlotUpgrade && this.passives.slotBoost){
      this.showBanner('NANOCORE MAXED', 'Slot expansion already installed', 'danger');
      return;
    }
    if(!this.isCheatMode() && cost > this.fragments){
      this.showBanner('NOT ENOUGH FRAGMENTS', `Need ${cost}⟐`, 'danger');
      return;
    }
    if(!this.isCheatMode()){
      this.fragments = Math.max(0, this.fragments - cost);
      if(this.ui.setFragments) this.ui.setFragments(this.fragments);
      // Feedback for spends in both HUD and chamber
      const fxX = (this.mouse && typeof this.mouse.x==='number') ? this.mouse.x : CANVAS_W/2;
      const fxY = (this.mouse && typeof this.mouse.y==='number') ? this.mouse.y - 10 : CANVAS_H/2;
      this.addFloater(fxX, fxY, `-${cost}⟐`, '#a8f0ff');
    }
    if(isSlotUpgrade){
      this.passives.slotBoost = true;
      this.passives.capacity = Math.min(6, capacity + 2);
      offer._purchased = true;
      this.refreshPassivePanel();
    } else if(slotPassive){
      this.recordPassiveSlot(offer, cost);
      this.recomputeSlotPassives();
      this.refreshPassivePanel();
      offer._purchased = true;
    } else {
      applyPerk(this, offer);
      offer._purchased = true;
    }
    const abilList = this.buildAbilityCards();
    if(this.ui.renderShopAbilities) this.ui.renderShopAbilities(abilList, this.coreShards);
    this.updateShopOfferMeta();
    this.ui.renderShop(this.shop.offers, this.fragments);
  }
  shopReroll(){
    const basePrice = GAME_RULES.rerollBasePrice || 50;
    const scale = GAME_RULES.rerollPriceScale || 2.0;
    if(!this.shop) this.shop = { index: 0, offers: [], rerollPrice: basePrice };
    if(!this.shop.rerollPrice || !Number.isFinite(this.shop.rerollPrice) || this.shop.rerollPrice <= 0){
      this.shop.rerollPrice = basePrice;
    }
    const currentPrice = this.shop.rerollPrice;
    const discountMul = 1 - (buffs.rerollDiscount || 0);
    const price = this.isCheatMode() ? 0 : Math.max(0, Math.round(currentPrice * discountMul));
    if(!this.isCheatMode()){
      if(this.fragments < price){
        this.showBanner('NOT ENOUGH FRAGMENTS', `Need ${price}⟐ to reroll`, 'danger');
        return;
      }
      this.fragments = Math.max(0, this.fragments - price);
      if(this.ui.setFragments) this.ui.setFragments(this.fragments);
      const fxX = (this.mouse && typeof this.mouse.x==='number') ? this.mouse.x : CANVAS_W/2;
      const fxY = (this.mouse && typeof this.mouse.y==='number') ? this.mouse.y - 10 : CANVAS_H/2;
      this.addFloater(fxX, fxY, `-${price}⟐`, '#a8f0ff');
    }
    const offers = this.shop.offers || [];
    let purchased = offers.filter(o=> o._purchased);
    if(purchased.length > SHOP_OFFER_COUNT){
      purchased = purchased.slice(purchased.length - SHOP_OFFER_COUNT);
    }
    const need = Math.max(0, SHOP_OFFER_COUNT - purchased.length);
    const raw = rollShopOffers(need, this.shop.index, this.getNanoLockoutKeys());
    const newOnes = raw.map(o=>{
      const perk = PERKS.find(p=>p.key===o.key) || {};
      const slotPassive = !!perk.slotPassive;
      const lvl = slotPassive ? this.getPassiveOwnedCount(o.key) : 0;
      const priced = passiveCostFor(o, lvl, this.shop.index);
      return this.decoratePassiveOffer({ ...o, cost: priced, slotPassive, maxLevel: slotPassive ? 1 : PASSIVE_MAX_LEVEL });
    });
    this.shop.offers = purchased.concat(newOnes);
    this.updateShopOfferMeta();
    this.ui.renderShop(this.shop.offers, this.fragments);
    // Refresh ability section's disabled state after currency change
    const abilList = this.buildAbilityCards();
    if(this.ui.renderShopAbilities) this.ui.renderShopAbilities(abilList, this.coreShards);
    // Increase reroll price for the next use (persists across shop visits
    // until the run is reset by a new game or loss).
    if(!this.isCheatMode()){
      this.shop.rerollPrice = Math.max(basePrice, Math.round(currentPrice * scale));
    }
    if(this.ui.setRerollPrice) this.ui.setRerollPrice(this.shop.rerollPrice || basePrice);
    if(this.ui.setShopRerollEnabled) this.ui.setShopRerollEnabled(true);
  }
  shopContinue(){
    // In this build, the HTML shop overlay is treated as
    // an Assembly Core/meta shop, so the primary action is
    // simply to go back to the previous menu.
    this._exitShopOverlay();
  }

  isAbilityUnlocked(key){
    const ab = this.abilities;
    if(!ab) return false;
    if(key==='bomb') return !!ab.bomb.unlocked;
    if(key==='overclock') return !!ab.overclock.unlocked;
    if(key==='cryo') return !!ab.cryo.unlocked;
    if(key==='corehp') return true;
    return false;
  }
  getAbilityLevel(key){
    const ab = this.abilities;
    if(!ab) return 0;
    if(key==='bomb') return ab.bomb.level||0;
    if(key==='overclock') return ab.overclock.level||0;
    if(key==='cryo') return ab.cryo.level||0;
    if(key==='corehp') return ab.corehp.level||0;
    return 0;
  }

  shopBuyAbility(key){
    // Purchase or upgrade ultimate ability up to max level
    const a = ABILITIES.find(x=> x.key===key);
    if(!a) return;
    const currentLvl = this.getAbilityLevel(key) || 0;
    if(currentLvl >= (ULTIMATE_MAX_LEVEL||5)) return;
    const cost = (ultimateCostFor ? ultimateCostFor(a, currentLvl) : (a.cost|0));
    if(!this.isCheatMode() && cost > this.coreShards){
      this.showBanner('NOT ENOUGH CORES', `Need ${cost}✦`, 'danger');
      return;
    }
    if(!this.isCheatMode()){
      this.coreShards = Math.max(0, this.coreShards - cost);
      if(this.ui.setCoreShards) this.ui.setCoreShards(this.coreShards);
      const fxX = (this.mouse && typeof this.mouse.x==='number') ? this.mouse.x : CANVAS_W/2;
      const fxY = (this.mouse && typeof this.mouse.y==='number') ? this.mouse.y - 10 : CANVAS_H/2;
      this.addFloater(fxX, fxY, `-${cost}✦`, '#ffd666');
    }
    // Increase level and unlock if needed
    const lvl = Math.min((ULTIMATE_MAX_LEVEL||5), currentLvl + 1);
    if(key==='bomb'){ this.abilities.bomb.level = lvl; this.abilities.bomb.unlocked = true; }
    if(key==='overclock'){ this.abilities.overclock.level = lvl; this.abilities.overclock.unlocked = true; }
    if(key==='cryo'){ this.abilities.cryo.level = lvl; this.abilities.cryo.unlocked = true; }
    if(key==='corehp'){ this.abilities.corehp.level = lvl; }
    this.recomputeAbilityParams();
    this.showBanner('ABILITY UPGRADED', `${a.name} Lv ${lvl}/${ULTIMATE_MAX_LEVEL||5}`, null);
    // If corehp increased, top off HP by the delta in max
    if(key==='corehp'){
      const newMax = this.GAME_MAX_LIVES; // recomputed
      const base = (GAME_RULES.startingLives||30) + 5*(lvl-1);
      const delta = newMax - base;
      if(delta>0){ this.lives = Math.min(newMax, this.lives + delta); if(this.ui.setLives) this.ui.setLives(this.lives); }
    }
    // Always keep the shop open after purchasing/upgrading an ultimate.
    // Refresh ability section in place with dynamic prices and previews,
    // and also refresh passive cards to reflect new credit gating.
    const abilList = this.buildAbilityCards();
    if(this.ui.renderShopAbilities) this.ui.renderShopAbilities(abilList, this.coreShards);
    // Also re-render passive cards to update Buy disabled state based on new fragments
    if(this.ui.renderShop) this.ui.renderShop(this.shop.offers||[], this.fragments);
  }

  recomputeAbilityParams(){
    const ab = this.abilities; if(!ab) return;
    // Bomb: grows with level
    const bl = Math.max(0, Math.min(5, ab.bomb.level||0));
    ab.bomb.damage = 120 + 30*bl; // 120..270
    ab.bomb.radius = 70 + 10*bl;  // 70..120
    ab.bomb.cdMax = Math.max(8, 12 - 0.8*bl);
    // Overclock: boost scales 0%..30% across 0..5
    const ol = Math.max(0, Math.min(5, ab.overclock.level||0));
    const targetBoost = 1 + 0.06*ol; // 1.0..1.3
    // If currently applied, adjust buffs by ratio change
    if(ab.overclock._applied){
      const ratio = targetBoost / (ab.overclock.boost || 1);
      buffs.fireRateMul *= ratio;
    }
    ab.overclock.boost = targetBoost;
    ab.overclock.cdMax = Math.max(17.5, 25 - 1.5*ol);
    // Cryo: duration scales slightly; slow fixed 50%
    const cl = Math.max(0, Math.min(5, ab.cryo.level||0));
    ab.cryo.dur = 2.5 + 0.3*cl; // 2.5..4.0s
    ab.cryo.cdMax = Math.max(15, 20 - 1.0*cl);
    // Core HP: +5 max HP per level
    const hl = Math.max(0, Math.min(5, (ab.corehp?.level||0)));
    const prevMax = this.GAME_MAX_LIVES || (GAME_RULES.startingLives||30);
    this.GAME_MAX_LIVES = (GAME_RULES.startingLives||30) + 5*hl;
    if(this.ui.setMaxLives){ this.ui.setMaxLives(this.GAME_MAX_LIVES); this.ui.setLives(this.lives); }
    // Update ability tooltips with live values
    if(this.ui && this.ui.setAbilityTips){
      this.ui.setAbilityTips({
        bomb: { damage:ab.bomb.damage, radius:ab.bomb.radius, cd:ab.bomb.cdMax },
        overclock: { boostPct: (ab.overclock.boost-1)*100, dur: ab.overclock.dur||8, cd: ab.overclock.cdMax },
        cryo: { dur: ab.cryo.dur, cd: ab.cryo.cdMax }
      });
    }
  }

  updateLowHpAlarm(){
    const ratio = this.lives / GAME_RULES.startingLives;
    const active = (this.state==='playing' && this.lives>0 && ratio <= 0.3);
    if(active && !this.lowHpActive){ audio.startLowHp(); }
    if(!active && this.lowHpActive){ audio.stopLowHp(); }
    this.lowHpActive = active;
  }

  update(dt){
    this.time += dt;
    // Auto-transition back to mission select shortly after a mission completes.
    if(this.mode === 'assembly' && this.missionId!=null && this.missionCompleteTimer > 0){
      this.missionCompleteTimer -= dt;
      if(this.missionCompleteTimer <= 0){
        this.missionCompleteTimer = 0;
        // This will switch to menu state and show the Assembly
        // missions screen (or main menu if something changed mode).
        this.toMissionSelect();
        return;
      }
    }
    this.updateSpawner(dt);
    this.updateChrono(dt);
    this.updateHazards(dt);
    if(this.thermalVentingCd>0) this.thermalVentingCd = Math.max(0, this.thermalVentingCd - dt);
    this.updateDrones(dt);

    // Track which enemies were alive before processing this frame
    const aliveBefore = new Set(this.enemies.filter(e=> e.alive));

    // Move enemies and resolve end-of-path life loss here
    for(const e of this.enemies){
      const wasAlive = e.alive;
      e.update(dt);
      if(wasAlive && !e.alive && e.reachedEnd){
        let damage = 1;
        // Boss leaks are significantly more punishing than regular
        // enemies so they feel like true wave anchors. Scale their
        // reactor damage by boss index so later bosses hit harder.
        if(e.isBoss){
          const tier = (typeof e.bossIndex === 'number') ? e.bossIndex : 0;
          // First boss: 3 HP, then 4, 5, ...
          damage = Math.max(3, 3 + tier);
        }
        if(this.reactorShield>0){
          const absorb = Math.min(this.reactorShield, damage);
          this.reactorShield = Math.max(0, this.reactorShield - absorb);
          damage -= absorb;
          const basePos = this.grid.base || this.grid.waypoints[this.grid.waypoints.length-1];
          this.addFloater(basePos.x, basePos.y - 16, `- ${absorb} SHIELD`, '#7ce0ff');
        }
        const base = this.grid.base || this.grid.waypoints[this.grid.waypoints.length-1];
        // Always show reactor hit feedback and screen shake, even in dev mode.
        if(damage>0 || this.isCheatMode()){
          // If cheat mode is enabled, keep HP frozen but still show a hit marker.
          if(!this.isCheatMode() && damage>0){
            this.lives = Math.max(0, this.lives - damage);
            this.ui.setLives(this.lives);
            // Character quip on the first real reactor hit this wave.
            const waveNumber = (this.waveIdx || 0) + 1;
            this._maybeShowReactorHitLine(waveNumber);
          }
          const label = (!this.isCheatMode() && damage>0) ? `-${damage} HP` : 'CORE HIT';
          this.addFloater(base.x, base.y - 12, label, COLORS.danger || '#ff5370');
          audio.damage();
          // Screen shake scales with missing HP (more intense when low)
          const hpPct = Math.max(0, Math.min(1, this.lives / GAME_RULES.startingLives));
          const amp = 8 * (1 + (1 - hpPct) * 2.8);
          this.addShake(amp);
        }
        if(this.isCheatMode() || damage<=0) continue;
        // Any leak this wave counts as HP loss for performance tracking.
        this.waveLostHP = true;
        // Reset current perfect combo immediately on damage
        if(this.perfectCombo){
          this.perfectCombo = 0;
          if(this.ui.setPerfectCombo) this.ui.setPerfectCombo(0);
        }
        if(this.bonusActive) this.waveLostHP = true;
        // update low-HP warning
        this.updateLowHpAlarm();
        if(this.lives <= 0 && this.state==='playing'){
          this.state = 'gameover';
          this.spawner.active = false;
          this.ui.showGameOver(true);
          this.recordLeaderboardEntry(Math.max(this.bestWave, this.waveIdx));
          // Silence loops then play breach explosion
          this.stopAllAudio();
          if(audio.reactorBreach) audio.reactorBreach();
        }
      }
    }
    this.enemies = this.enemies.filter(e=> e.alive || (!e.reachedEnd && ((e.hitFx && e.hitFx.length>0) || (e.laserLinger>0))));

    // Maintain even spacing: throttle followers if too close to the enemy ahead
    this.applySeparation();

    // Towers
    for(const t of this.towers) t.update(dt, this.enemies);
    for(const t of this.towers) t.tryHit(this.enemies);

    // Award on‑death effects for enemies that died this frame (not by reaching end).
    // Tower credits are now granted via fixed per‑wave income, so kills
    // no longer directly grant credits.
    for(const e of aliveBefore){
      if(!e.alive && !e.reachedEnd){
        const variant = e.variant || '';
        const lastHit = e.lastHit || {};
        // Ionic arc on kill
        const arcChance = buffs.ionicChance || 0;
        const arcPct = buffs.ionicDamagePct || 0;
        if(arcChance>0 && arcPct>0){
          const lastDmg = Math.max(0, lastHit.amount || lastHit.meta?.hitDamage || 0);
          if(lastDmg>0 && Math.random() < arcChance){
            const baseRange = 140 * Math.max(1, buffs.splashRadiusMul||1) * Math.max(1, buffs.ionicRangeFactor||1);
            let best=null, bestD2 = baseRange*baseRange;
            for(const other of this.enemies){
              if(!other.alive || other===e) continue;
              const d2v = dist2(e.x, e.y, other.x, other.y);
              if(d2v < bestD2){ bestD2 = d2v; best = other; }
            }
            if(best){
              const arcDmg = lastDmg * arcPct;
              best.damage(arcDmg, 'arc', { color:'#7ef0ff' });
              this.spawnParticles(best.x, best.y, '#7ef0ff');
            }
          }
        }
        // Thermal venting: leave a brief slow field on burning kills (global cooldown)
        if(buffs.thermalVenting && buffs.thermalSlow>0 && (e.burns && e.burns.length) && this.thermalVentingCd<=0){
          const radius = 90 * Math.max(1, buffs.splashRadiusMul||1);
          this.addHazardZone({
            x:e.x,
            y:e.y,
            r: radius,
            dur: buffs.thermalDuration || 1.5,
            slowPct: buffs.thermalSlow,
            burnDps: (buffs.burnDpsMul||1) * 4,
            kind: 'thermal',
            color: '#ffb347'
          });
          this.thermalVentingCd = buffs.thermalCooldown || 4;
        }
        // Boss kill quips (only when the boss dies, not on leaks).
        if(e.isBoss){
          this._maybeShowBossKillLine();
        }
        this.handleDroneKill();
        // Death particles for visual punch
        this.spawnParticles(e.x, e.y, e.color || COLORS.accent2);
        // HP blob healing (only blobs should spawn particles)
        const isBlob = (e.variant === 'b1' || e.variant === 'b2' || e.variant === 'b3');
        if(isBlob){
          const heal = e.variant==='b3' ? 3 : (e.variant==='b2' ? 2 : 1);
          const before = this.lives;
          this.lives = Math.min(GAME_RULES.startingLives, this.lives + heal);
          if(this.lives !== before){
            this.ui.setLives(this.lives);
            // HP related floaters: green/teal accent
            this.addFloater(e.x, e.y-16, `+${heal} HP`, COLORS.accent || '#17e7a4');
            this.spawnParticles(e.x, e.y, '#9fffe0');
            // HP recovery banner: hp-themed styling
            this.showBanner('CORE HP RECOVERED', `+${heal} HP from nano-blob`, 'hp');
          }
        }

        // On-death spawn behaviors for boss variants
        const isNanoBoss = (e.variant === 'boss_nano');
        const isSplitBoss = (e.variant === 'boss_split');
        if(isNanoBoss || isSplitBoss){
          // Helper: estimate base stats for current wave for balanced spawns
          const w = (this.waveIdx||0) + 1;
          let baseHp = Math.round(18 + w * 5.0);
          let baseSpeed = 60 + Math.min(60, Math.floor(w * 2.6));
          if(w > 20){
            const extra = w - 20;
            baseHp = Math.round(baseHp * (1 + 0.04 * extra));
            baseSpeed = Math.round(baseSpeed + Math.min(30, extra * 1.0));
          }
          if(isNanoBoss){
            // Spawn many small nano-bots at boss position
            const count = Math.min(40, Math.max(10, Math.round(10 + w * 0.5)));
            const hp = Math.max(10, Math.round(baseHp * 0.45));
            const speed = Math.round(baseSpeed * 1.25);
            const radius = 10;
            const reward = GAME_RULES.baseKillReward || 1;
            const add = [];
            for(let i=0;i<count;i++){
              add.push({ delay:0, hp, speed, reward, variant:'nano_minion', radius, spawnAt:{x:e.x,y:e.y}, pathIdx: e.idx });
            }
            // Increase total expected count so progress UI reflects extra spawns
            this.spawner.totalCount = (this.spawner.totalCount||0) + add.length;
            for(const def of add) this.spawnEnemy(def);
            // Visual pop
            this.spawnParticles(e.x, e.y, COLORS.accent);
            this.addShake(10);
            if(audio.bubble) audio.bubble();
          } else if(isSplitBoss){
            // Split into 2–3 medium shards with modest HP
            const shards = 2 + Math.floor(Math.random()*2); // 2..3
            const hp = Math.max(20, Math.round((e.maxHp||baseHp*8) * 0.3));
            const speed = Math.round(baseSpeed * 1.1);
            const radius = Math.max(12, Math.round((e.radius||20) * 0.7));
            const reward = Math.max(2, (GAME_RULES.baseKillReward||1) * 3);
            const add = [];
            for(let i=0;i<shards;i++){
              // small random offset so they don't overlap perfectly
              const a = Math.random()*Math.PI*2; const r = 6 + Math.random()*10;
              add.push({ delay:0, hp, speed, reward, variant:'boss_shard', radius,
                spawnAt:{x:e.x + Math.cos(a)*r, y:e.y + Math.sin(a)*r}, pathIdx: e.idx });
            }
            this.spawner.totalCount = (this.spawner.totalCount||0) + add.length;
            for(const def of add) this.spawnEnemy(def);
            // Visual/audio punch similar to nano burst
            this.spawnParticles(e.x, e.y, COLORS.accent2);
            this.addShake(8);
            if(audio.bubble) audio.bubble();
          }
        }
      }
    }

    // Update floaters, particles, and banner
    this.floaters = this.floaters.filter(f=> (f.age += dt) < f.ttl);
    for(const p of (this.particles||[])){ p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 24*dt; p.age += dt; }
    this.particles = (this.particles||[]).filter(p=> p.age < p.ttl);
    if(this.bombBursts && this.bombBursts.length){
      this.bombBursts = this.bombBursts.filter(b=> (b.t -= dt) > 0);
    }
    // Decay screen shake
    if(this.shakeMag > 0){ this.shakeMag *= Math.exp(-dt*8); if(this.shakeMag < 0.05) this.shakeMag = 0; }
    // Ambient motes drift and flicker
    for(const m of this.ambient){
      m.x += m.vx*dt; m.y += m.vy*dt; m.phase += dt*(0.8 + m.r*0.3);
      if(m.x < -10) m.x = CANVAS_W+10; if(m.x > CANVAS_W+10) m.x = -10;
      if(m.y < -10) m.y = CANVAS_H+10; if(m.y > CANVAS_H+10) m.y = -10;
    }
    if(this.banner){ this.banner.age += dt; if(this.banner.age >= this.banner.ttl) this.banner = null; }
    // Abilities cooldowns and timers
    if(this.abilities){
      const ab = this.abilities;
      if(ab.bomb.unlocked && ab.bomb.cd>0) ab.bomb.cd = Math.max(0, ab.bomb.cd - dt);
      if(ab.overclock.unlocked){
        if(ab.overclock.active){
          ab.overclock.durLeft = (ab.overclock.durLeft||0) - dt;
          if(ab.overclock.durLeft <= 0){ this.clearOverclock(); }
        }
        if(ab.overclock.cd>0) ab.overclock.cd = Math.max(0, ab.overclock.cd - dt);
      }
      if(ab.cryo.unlocked){
        if(ab.cryo.active){
          ab.cryo.timeLeft = (ab.cryo.timeLeft||0) - dt;
          if(ab.cryo.timeLeft <= 0){ ab.cryo.active = false; }
        }
        if(ab.cryo.cd>0) ab.cryo.cd = Math.max(0, ab.cryo.cd - dt);
      }
      if(this.updateAbilityUI) this.updateAbilityUI();
    }

    // Wave status + progress by remaining enemies (not time-based):
    // progress = (remaining to spawn + alive) / totalCount; reaches 0 when last enemy dies.
    if(this.state==='playing'){
      const totalCount = this.spawner.totalCount || 0;
      const aliveCount = this.enemies.reduce((n,e)=> n + (e.alive?1:0), 0);
      const queueLen = (this.spawner.queue && this.spawner.queue.length) ? this.spawner.queue.length : 0;
      if(this.spawner.active){
        const remainingUnits = queueLen + aliveCount;
        const frac = totalCount>0 ? Math.max(0, Math.min(1, remainingUnits/totalCount)) : 0;
        this.ui.setWaveStatus(true);
        if(this.ui.setWaveProgress) this.ui.setWaveProgress(frac);
        if(this.ui.setWaveRemaining) this.ui.setWaveRemaining(remainingUnits, totalCount);
      } else if(aliveCount>0){
        const remainingUnits = aliveCount;
        const frac = totalCount>0 ? Math.max(0, Math.min(1, aliveCount/totalCount)) : 0;
        this.ui.setWaveStatus(true);
        if(this.ui.setWaveProgress) this.ui.setWaveProgress(frac);
        if(this.ui.setWaveRemaining) this.ui.setWaveRemaining(remainingUnits, totalCount);
      } else {
        this.ui.setWaveStatus(false);
        if(this.ui.setWaveProgress) this.ui.setWaveProgress(0);
        if(this.ui.setWaveRemaining) this.ui.setWaveRemaining(0, 0);
      }
    } else {
      this.ui.setWaveStatus(false);
      if(this.ui.setWaveProgress) this.ui.setWaveProgress(0);
      if(this.ui.setWaveRemaining) this.ui.setWaveRemaining(0, 0);
    }
  }

  applySeparation(){
    const alive = this.enemies.filter(e=> e.alive);
    // Initialize/refresh speed multiplier targets; we smooth toward these
    // so spacing adjustments don't cause jittery movement.
    for(const e of alive){
      if(typeof e.speedMult !== 'number') e.speedMult = 1;
      e._speedMultTarget = 1;
    }
    // Sort by progress: further along first (higher idx, then closer to next waypoint)
    const distToNext = (e)=>{
      const wps = e.waypoints || this.grid.waypoints;
      const wp = wps[Math.min(e.idx, wps.length-1)];
      return Math.hypot(wp.x - e.center.x, wp.y - e.center.y);
    };
    alive.sort((a,b)=> (b.idx - a.idx) || (distToNext(a) - distToNext(b)) );
    for(let i=1;i<alive.length;i++){
      const front = alive[i-1];
      const back = alive[i];
      // Allow units to pass through bosses: do not throttle spacing if either is a boss
      if(front.isBoss || back.isBoss) continue;
      // If units are turning different directions (e.g. one has started
      // around a corner while the follower is still on the previous
      // segment), skip separation. This avoids jitter where the back
      // unit repeatedly throttles as the leader wraps a 90° turn.
      const fx = front.lastUx ?? 0;
      const fy = front.lastUy ?? 0;
      const bx = back.lastUx ?? 0;
      const by = back.lastUy ?? 0;
      const dot = fx*bx + fy*by;
      if(!Number.isFinite(dot) || dot < 0.5) continue; // > ~60° difference → no spacing throttle
      const d = Math.hypot(front.center.x-back.center.x, front.center.y-back.center.y);
      const baseSep = 34; // legacy minimum separation in pixels
      const frontBody = (typeof front.getBodyRadius === 'function') ? front.getBodyRadius() : (front.radius || baseSep*0.5);
      const backBody = (typeof back.getBodyRadius === 'function') ? back.getBodyRadius() : (back.radius || baseSep*0.5);
      const minSep = Math.max(baseSep, frontBody + backBody);
      if(d < minSep){
        const ratio = Math.max(0, Math.min(1, d/minSep));
        // Throttle back enemy proportionally; leave front at current speed.
        const targetMul = 0.2 + 0.8*ratio;
        back._speedMultTarget = Math.min(back._speedMultTarget, targetMul);
      }
    }
    // Smoothly blend each enemy's speed multiplier toward its target so
    // separation doesn't introduce abrupt speed changes that can make
    // animation and rotation look twitchy when units bunch up.
    const lerp = (a,b,t)=> a + (b-a)*t;
    const relax = 0.22;
    for(const e of alive){
      const cur = (typeof e.speedMult === 'number') ? e.speedMult : 1;
      const tgt = (typeof e._speedMultTarget === 'number') ? e._speedMultTarget : 1;
      e.speedMult = lerp(cur, tgt, relax);
    }
  }

  render(){
    const ctx = this.ctx;
    if(!ctx) return;
    ctx.clearRect(0,0,CANVAS_W,CANVAS_H);

    // During teleport phases, draw dedicated transition scene first and skip world
    if(this.state==='teleport' && this.teleport){
      this.drawTeleportScene(ctx);
      return;
    }

    if(this.state === 'menu'){
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      ctx.restore();
      return;
    }

    // Apply camera shake offset
    ctx.save();
    if(this.shakeMag > 0){
      const ox = (Math.random()*2-1) * this.shakeMag;
      const oy = (Math.random()*2-1) * this.shakeMag;
      ctx.translate(ox, oy);
    }

    if(this.state === 'intro' && this.introActive){
      const pathCount = (this.introPhase >= 2 && this.introPathRevealCount>0) ? this.introPathRevealCount : 0;
      this.grid.draw(ctx, this.time, {
        showGrid: false,
        showPath: pathCount > 0,
        showRails: false,
        pathRevealCount: pathCount
      });
    } else {
      this.grid.draw(ctx, this.time);
    }

    // Ground effects (hazards, puddles) sit above the path but below towers/enemies
    if(this.hazardZones && this.hazardZones.length){
      for(const z of this.hazardZones){
        let lifeFrac = z.ttl ? Math.max(0, Math.min(1, z.t / z.ttl)) : 0; // 1 → 0 as it fades
        // Keep puddles visibly present until near the end of their life.
        const fadeFloor = 0.25;
        const easedFrac = Math.max(fadeFloor, lifeFrac);
        const ageFrac = 1 - lifeFrac;
        const r = z.r;
        const kind = z.kind || 'generic';
        const t = this.time || 0;
        let col = z.color || COLORS.accent2;
        let baseAlpha = 0.55;
        let innerAlpha = 0.4;
        if(kind === 'thermal'){
          col = z.color || '#ffb347';
          baseAlpha = 0.8;
          innerAlpha = 0.6;
        } else if(kind === 'bubble'){
          col = z.color || '#6ce9ff';
          baseAlpha = 0.9;
          innerAlpha = 0.75;
        }
        ctx.save();
        // Core pool
        ctx.globalAlpha = baseAlpha * easedFrac;
        const grad = ctx.createRadialGradient(z.x, z.y, r*0.05, z.x, z.y, r);
        grad.addColorStop(0, `rgba(255,255,255,${innerAlpha})`);
        grad.addColorStop(0.35, `${col}aa`);
        grad.addColorStop(0.9, `${col}22`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(z.x, z.y, r, 0, Math.PI*2);
        ctx.fill();
        // Outer rim
        ctx.globalAlpha = 0.5 * easedFrac;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(z.x, z.y, r*0.92, 0, Math.PI*2);
        ctx.stroke();
        // Extra flair for bubble-type puddles: rotating arcs + tiny bubbles
        if(kind === 'bubble'){
          const arcSpan = Math.PI * 0.4;
          const phase = t*1.8;
          ctx.globalAlpha = 0.65 * easedFrac;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(z.x, z.y, r*0.65, phase, phase + arcSpan);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(z.x, z.y, r*0.65, phase + Math.PI, phase + Math.PI + arcSpan);
          ctx.stroke();
          // Small bubbles rising from the pool
          const bubbles = 4;
          for(let i=0;i<bubbles;i++){
            const a = phase + i*(Math.PI*2/bubbles);
            const rad = r*0.4 + Math.sin(phase + i)*r*0.1;
            const bx = z.x + Math.cos(a)*rad;
            const by = z.y + Math.sin(a)*rad - 4*ageFrac;
            const br = 3 + 1.5*Math.sin(t*3 + i);
            ctx.globalAlpha = 0.4 + 0.4*easedFrac;
            ctx.fillStyle = 'rgba(224,248,255,0.9)';
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI*2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    // Base at end of path
    this.drawBase(ctx);
    // Low HP warning text above reactor
    if(this.lowHpActive && this.lives>0){
      const base = this.grid.base || (Array.isArray(this.grid.waypoints[0])? this.grid.waypoints[0][this.grid.waypoints[0].length-1] : this.grid.waypoints[this.grid.waypoints.length-1]);
      const r = TILE_SIZE*0.35;
      const pulse = 0.7 + 0.3 * (Math.sin(this.time*4.5)*0.5 + 0.5);
      ctx.save();
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillStyle = `rgba(255,83,112,${pulse.toFixed(3)})`;
      ctx.textAlign = 'center';
      ctx.fillText('Reactor HP Low', base.x, base.y - r - 24);
      ctx.restore();
    }

    // Player nano-drones (Nanite Armada): orbiting mini-turrets around the core
    if(this.nanoDrones && this.nanoDrones.length){
      for(const d of this.nanoDrones){
        const r = 8;
        const col = COLORS.drone || COLORS.accent2;
        const t = this.time || 0;
        const pulse = 0.7 + 0.3 * Math.sin(t*4 + d.angle*1.3);
        ctx.save();
        // Outer glow
        ctx.globalAlpha = 0.6 + 0.4*pulse;
        ctx.shadowColor = col;
        ctx.shadowBlur = 14;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, Math.PI*2);
        ctx.fill();
        // Inner core
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0b1f29';
        ctx.beginPath();
        ctx.arc(d.x + 1.5, d.y - 1.5, r*0.5, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }
    }
    // Drone beams (brief hitscan tracers)
    if(this.droneBeams && this.droneBeams.length){
      for(const b of this.droneBeams){
        const p = Math.max(0, Math.min(1, (b.t||0)/(b.ttl||0.14)));
        const alpha = 0.8 * (1 - p);
        if(alpha <= 0) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        const col = COLORS.drone || COLORS.accent2;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2 - p*1.2;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Towers draw below enemies bullets for clarity
    // Show range only for the selected or hovered tower to reduce clutter
    const hoveredTower = (this.state!=='menu') ? this.getTowerAt(this.mouse.gx, this.mouse.gy) : null;
    for(const t of this.towers){
      if(t === this.selected){
        t.drawRange(ctx, { alpha:0.18, stroke:true });
      } else if(t === hoveredTower){
        t.drawRange(ctx, { alpha:0.08, stroke:false });
      }
      // Moarter tower ground telegraph (drawn under enemies)
      if(t.kind === 'splash' && t.telegraph){
        const z = t.telegraph;
        const lifeP = Math.max(0, Math.min(1, z.t / z.ttl));
        const rev = 1 - lifeP;
        const r = z.r * (0.9 + 0.1*rev);
        const alpha = 0.15 + 0.5*rev;
        const col = '#ff4e7a';
        ctx.save();
        ctx.globalAlpha = alpha;
        const grad = ctx.createRadialGradient(z.x, z.y, r*0.1, z.x, z.y, r);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.6, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(z.x, z.y, r, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(z.x, z.y, r, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
      }
    }
    for(const t of this.towers) t.draw(ctx);
    for(const e of this.enemies) e.draw(ctx);

    // Overhead room lighting + floating dust motes so the chamber feels
    // softly lit from above rather than purely flat.
    this.drawOverheadLighting(ctx);
    this.drawAmbient(ctx);

    // Bomb placement preview
    if(this.placingBomb && this.abilities?.bomb?.unlocked && this.abilities.bomb.cd<=0){
      const R = this.abilities.bomb.radius;
      ctx.save();
      ctx.globalAlpha = 0.6;
      const grad = ctx.createRadialGradient(this.mouse.x, this.mouse.y, R*0.2, this.mouse.x, this.mouse.y, R);
      grad.addColorStop(0, 'rgba(0,186,255,0.25)');
      grad.addColorStop(1, 'rgba(0,186,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(this.mouse.x, this.mouse.y, R, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,186,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.mouse.x, this.mouse.y, R, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    // Bomb bursts
    if(this.bombBursts && this.bombBursts.length){
      for(const b of this.bombBursts){
        const p = 1 - Math.max(0, Math.min(1, b.t / (b.ttl||0.45)));
        const r = b.r * (1 + p*0.6);
        ctx.save();
        ctx.globalAlpha = Math.max(0, 0.8 - p);
        ctx.strokeStyle = `rgba(0,186,255,${0.8 - p*0.7})`;
        ctx.lineWidth = 2 + p*3;
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI*2); ctx.stroke();
        ctx.globalAlpha = 0.25 * (1-p);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(b.x, b.y, r*0.45, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }

    // Floating +X⚛ credit texts
    for(const f of this.floaters){
      const p = f.age / f.ttl;
      const y = f.y - p*30; // float up
      const a = 1 - p; // fade out
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = f.color || COLORS.accent2;
      ctx.shadowColor = f.color || COLORS.accent2;
      ctx.shadowBlur = 10;
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, y);
      ctx.restore();
    }

    // Selected tower highlight
    if(this.selected){
      const t = this.selected;
      const col = (t && t.baseColor) ? t.baseColor : COLORS.accent2;
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(t.x, t.y, TILE_SIZE*0.45, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    // Placement ghost + range preview
    if(this.placing && this.state==='playing'){
      const { gx, gy } = this.mouse;
      if(gx>=0 && gy>=0 && gx<this.grid.w && gy<this.grid.h){
        const x = gx*TILE_SIZE, y = gy*TILE_SIZE;
        const def = TOWER_TYPES[this.selectedTower];
        const costPreview = (typeof this.getTowerPlacementCost === 'function')
          ? this.getTowerPlacementCost(this.selectedTower)
          : (def?.cost || 0);
        const ok = this.grid.canPlace(gx,gy) && this.credits>=costPreview;
        const cx = x + TILE_SIZE/2;
        const cy = y + TILE_SIZE/2;
        const previewRange = (typeof this.getTowerPreviewRange === 'function')
          ? this.getTowerPreviewRange(this.selectedTower)
          : (def?.range || 0);
        if(previewRange && previewRange>0){
          ctx.save();
          let hex = COLORS.accent;
          if(this.selectedTower==='basic') hex = COLORS.towerBasic;
          else if(this.selectedTower==='laser') hex = COLORS.towerLaser;
          else if(this.selectedTower==='splash') hex = COLORS.towerSplash;
          const n = parseInt((hex||'#17e7a4').slice(1),16);
          const rr=(n>>16)&255, gg=(n>>8)&255, bb=n&255;
          const alpha = ok ? 0.14 : 0.10;
          ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`;
          if(this.selectedTower === 'splash'){
            const frac = MOARTER_MIN_RANGE_FRAC || 0;
            const innerR = Math.max(0, previewRange * frac);
            // Donut: fill between inner dead zone and outer firing radius
            ctx.beginPath();
            ctx.arc(cx,cy,previewRange,0,Math.PI*2);
            if(innerR > 0){
              ctx.arc(cx,cy,innerR,Math.PI*2,0,true);
            }
            ctx.closePath();
            ctx.fill();
            if(innerR > 0){
              ctx.setLineDash([5,4]);
              ctx.lineWidth = 1;
              ctx.strokeStyle = ok ? `rgba(${rr},${gg},${bb},${Math.min(1, alpha*2)})` : 'rgba(255,83,112,0.7)';
              ctx.beginPath(); ctx.arc(cx,cy,innerR,0,Math.PI*2); ctx.stroke();
              ctx.setLineDash([]);
            }
          } else {
            ctx.beginPath(); ctx.arc(cx,cy,previewRange,0,Math.PI*2); ctx.fill();
          }
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = ok ? `rgba(${rr},${gg},${bb},0.7)` : 'rgba(255,83,112,0.7)';
          ctx.beginPath(); ctx.arc(cx,cy,previewRange,0,Math.PI*2); ctx.stroke();
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = 1;
        if(ok){
          // Tint ghost to selected tower base color
          let hex = COLORS.accent;
          if(this.selectedTower==='basic') hex = COLORS.towerBasic;
          else if(this.selectedTower==='laser') hex = COLORS.towerLaser;
          else if(this.selectedTower==='splash') hex = COLORS.towerSplash;
          const n = parseInt((hex||'#17e7a4').slice(1),16);
          const r=(n>>16)&255, g=(n>>8)&255, b=n&255;
          ctx.fillStyle = `rgba(${r},${g},${b},0.35)`;
        } else {
          ctx.fillStyle = 'rgba(255,83,112,0.8)';
        }
        ctx.fillRect(x+4,y+4,TILE_SIZE-8,TILE_SIZE-8);
        ctx.restore();
      }
    }

    // Particles (heal/visuals)
    for(const p of (this.particles||[])){
      const a = Math.max(0, 1 - p.age/p.ttl);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r||3, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // Cursor crosshair (only during playing)
    if(this.state==='playing'){
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(this.mouse.x-6,this.mouse.y); ctx.lineTo(this.mouse.x+6,this.mouse.y);
      ctx.moveTo(this.mouse.x,this.mouse.y-6); ctx.lineTo(this.mouse.x,this.mouse.y+6);
      ctx.stroke();
      ctx.restore();
    }

    // Banners are now logged to the wave panel feed instead of overlaying the canvas.
    if(this.state==='chamber'){
      // Undo world transform before drawing scene UI
      ctx.restore();
      this.drawChamber(ctx);
      return;
    }
    // End of camera shake transform
    ctx.restore();

  }

  // Draw only the teleport fade/transition. Avoid rendering the current map to prevent flashes.
  drawTeleportScene(ctx){
    const a = Math.max(0, Math.min(1, (this.teleport?.fade)||0));
    // Base black background
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    // Out phase: just darken with dots and message
    if(this.teleport?.phase === 'out'){
      // subtle teleport dots
      if(this.teleDots){
        for(const d of this.teleDots){
          ctx.save(); ctx.globalAlpha = 0.15 + 0.35*Math.sin(this.time*2 + d.p);
          ctx.fillStyle = '#9fffe0'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2); ctx.fill(); ctx.restore();
        }
      }
      // fade overlay strength
      ctx.globalAlpha = a*0.9; ctx.fillStyle = '#000'; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
      const msg = this.teleport?.msg || (this.teleport?.target==='chamber' ? 'Entering Nanocore…' : 'Returning to Reactor Chamber');
      ctx.globalAlpha = a*0.8; ctx.fillStyle = '#9fffe0'; ctx.font='700 28px system-ui, sans-serif'; ctx.textAlign='center'; ctx.fillText(msg, CANVAS_W/2, CANVAS_H*0.5);
    } else { // in phase: crossfade in backdrop
      const inv = Math.max(0, Math.min(1, 1-a));
      ctx.globalAlpha = inv;
      if(this.teleport?.target==='chamber'){
        this.drawChamberBackdrop(ctx);
      } else if(this.teleport?.target==='map'){
        this.drawMapBackdrop(ctx);
      } // target==='assembly' uses the solid black background only
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---- Abilities ----
  updateAbilityUI(){
    if(!this.ui || !this.ui.setAbilityCooldown) return;
    const ab = this.abilities;
    if(ab.bomb.unlocked){
      const ready = ab.bomb.cd<=0;
      const label = (this.placingBomb && ready) ? 'Loaded' : null;
      this.ui.setAbilityCooldown('bomb', ready, ab.bomb.cd>0? ab.bomb.cd : 0, label);
    }
    if(ab.overclock.unlocked){
      const ready = (!ab.overclock.active && ab.overclock.cd<=0);
      const cd = ab.overclock.cd>0? ab.overclock.cd : 0;
      const activeLeft = ab.overclock.active ? Math.max(0, ab.overclock.durLeft||0) : null;
      this.ui.setAbilityCooldown('overclock', ready, cd, null, activeLeft);
    }
    if(ab.cryo.unlocked){
      const ready = (!ab.cryo.active && ab.cryo.cd<=0);
      const cd = ab.cryo.cd>0? ab.cryo.cd : 0;
      const activeLeft = ab.cryo.active ? Math.max(0, ab.cryo.timeLeft||0) : null;
      this.ui.setAbilityCooldown('cryo', ready, cd, null, activeLeft);
    }
  }

  tryUseBomb(){
    const b = this.abilities.bomb;
    if(!b.unlocked || b.cd>0 || this.state!=='playing') return;
    // Enter placement mode; next canvas click detonates
    this.placingBomb = true;
    this.updateAbilityUI();
  }
  triggerBomb(x,y){
    const b = this.abilities.bomb;
    if(!b.unlocked || b.cd>0) return;
    const R = b.radius, dmg = b.damage;
    // Damage all enemies in radius
    for(const e of this.enemies){
      if(!e.alive) continue;
      const dx = e.x - x, dy = e.y - y; if(dx*dx + dy*dy <= R*R){
        e.damage(dmg);
      }
    }
    // FX
    this.spawnParticles(x,y, COLORS.accent2);
    this.spawnParticles(x,y, '#fff');
    if(!this.bombBursts) this.bombBursts = [];
    this.bombBursts.push({ x, y, r: R, t: 0.45, ttl: 0.45 });
    this.addShake(10);
    if(audio.bubble) audio.bubble();
    // Start cooldown and exit placement
    b.cd = b.cdMax;
    this.placingBomb = false;
    this.updateAbilityUI();
  }

  tryUseOverclock(){
    const oc = this.abilities.overclock;
    if(!oc.unlocked || oc.active || oc.cd>0 || this.state!=='playing') return;
    oc.active = true;
    oc.durLeft = oc.dur;
    oc.cd = oc.cdMax;
    // Apply temporary fire rate boost by adjusting buffs.fireRateMul
    if(!oc._applied){ buffs.fireRateMul *= oc.boost; oc._applied = true; }
    this.updateAbilityUI();
  }
  clearOverclock(){
    const oc = this.abilities.overclock;
    if(oc._applied){ buffs.fireRateMul /= oc.boost; oc._applied=false; }
    oc.active = false;
    this.updateAbilityUI();
  }

  tryUseCryo(){
    const c = this.abilities.cryo;
    if(!c.unlocked || c.cd>0 || this.state!=='playing') return;
    // Apply slow to all enemies
    for(const e of this.enemies){ if(e.alive) e.applySlow(c.slow, c.dur); }
    c.active = true;
    c.timeLeft = c.dur;
    c.cd = c.cdMax;
    if(audio.zap) audio.zap();
    this.updateAbilityUI();
  }

  drawBackground(ctx){
    const C = this.grid.colors;
    const t = this.time || 0;

    // 1) Space backdrop: cover the entire canvas with the starfield
    // art, preserving its aspect ratio but ensuring no letterboxing
    // inside the play area.
    const img = SPACE_BG.img;
    if(img && SPACE_BG.loaded && img.naturalWidth && img.naturalHeight){
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const canvasRatio = CANVAS_W / CANVAS_H;
      const imgRatio = iw / ih;
      let dw, dh;
      if(imgRatio > canvasRatio){
        // Image is wider than canvas → fit height, crop sides
        dh = CANVAS_H;
        dw = dh * imgRatio;
      } else {
        // Image is taller than canvas → fit width, crop top/bottom
        dw = CANVAS_W;
        dh = dw / imgRatio;
      }
      const dx = (CANVAS_W - dw) / 2;
      const dy = (CANVAS_H - dh) / 2;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    } else {
      // Fallback: keep the original gradient if the image fails to load.
      ctx.save();
      const bgGrad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
      bgGrad.addColorStop(0, '#020713');
      bgGrad.addColorStop(0.5, '#041726');
      bgGrad.addColorStop(1, '#021721');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    // 2) Overlay subtle neon glow/motifs on top of the space art so the
    // chamber still feels connected to the reactor theme.
    // helper: hex -> rgba string with alpha
    const hexToRgb = (h)=>{ const n=parseInt((h||'#00baff').slice(1),16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; };
    const c = hexToRgb(C.accent2||'#00baff');
    const glowA = 0.12;
    const gx = CANVAS_W*0.15 + Math.sin(t*0.12)*30;
    const gy = CANVAS_H*0.2  + Math.cos(t*0.09)*24;
    const grad = ctx.createRadialGradient(gx,gy,0,gx,gy, Math.max(CANVAS_W,CANVAS_H)*0.6);
    grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${glowA})`);
    grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

    const c2 = hexToRgb(C.accent || '#17e7a4');
    const gx2 = CANVAS_W*0.8 + Math.cos(t*0.15)*40;
    const gy2 = CANVAS_H*0.75 + Math.sin(t*0.11)*36;
    const grad2 = ctx.createRadialGradient(gx2,gy2,0,gx2,gy2, Math.max(CANVAS_W,CANVAS_H)*0.7);
    grad2.addColorStop(0, `rgba(${c2.r},${c2.g},${c2.b},${glowA*0.8})`);
    grad2.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = grad2; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);

    const motif = this.selectedMap?.motif || 'circuit';
    ctx.save();
    if(motif==='diagonal'){
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 2;
      const step = 40;
      const off = (t*30) % step; // animate shift
      for(let x=-CANVAS_H-off; x<CANVAS_W+step; x+=step){
        ctx.beginPath();
        ctx.moveTo(x,0); ctx.lineTo(x+CANVAS_H, CANVAS_H);
        ctx.stroke();
      }
    } else if(motif==='rings'){
      const base = this.grid.base || (Array.isArray(this.grid.waypoints[0])? this.grid.waypoints[0][this.grid.waypoints[0].length-1] : this.grid.waypoints[this.grid.waypoints.length-1]);
      // faint base rings
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      for(let i=1;i<=4;i++){
        ctx.beginPath(); ctx.arc(base.x, base.y, i*80, 0, Math.PI*2); ctx.stroke();
      }
      // rotating arc sweeps for motion
      ctx.shadowColor = C.accent2; ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(0,186,255,0.35)';
      ctx.lineWidth = 3;
      for(let i=1;i<=3;i++){
        const r = i*90;
        const a0 = t*0.6 + i*0.8;
        ctx.beginPath(); ctx.arc(base.x, base.y, r, a0, a0 + Math.PI*1.1); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    } else { // circuit
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1.5;
      const y1=CANVAS_H*0.18, y2=CANVAS_H*0.82;
      for(let i=0;i<6;i++){
        const x = (i+1)*CANVAS_W/7;
        ctx.beginPath(); ctx.moveTo(x,y1); ctx.lineTo(x,y2); ctx.stroke();
        // animated node sliding along the trace
        const phase = i*0.8;
        const p = (Math.sin(t*0.7 + phase)*0.5 + 0.5); // 0..1
        const y = y1 + p*(y2-y1);
        ctx.fillStyle='rgba(0,186,255,0.12)'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Soft overhead "fluorescent" beams that suggest ceiling lights
  // shining down into the chamber. We keep this subtle so it adds depth
  // without washing out other effects.
  drawOverheadLighting(ctx){
    const t = this.time || 0;
    const beams = 4;
    const spacing = CANVAS_W / (beams + 1);
    const beamWidth = CANVAS_W * 0.12;
    ctx.save();
    for(let i=0;i<beams;i++){
      const cx = spacing * (i+1);
      const flicker = 0.55 + 0.25 * Math.sin(t*2.1 + i*1.7);
      const a0 = 0.08 * flicker;
      const a1 = 0.06 * flicker;
      const a2 = 0.0;
      const grad = ctx.createLinearGradient(cx, 0, cx, CANVAS_H);
      grad.addColorStop(0.0, `rgba(255,255,255,${a0.toFixed(3)})`);
      grad.addColorStop(0.25, `rgba(235,242,255,${a1.toFixed(3)})`);
      grad.addColorStop(0.7, `rgba(200,210,240,${(a1*0.6).toFixed(3)})`);
      grad.addColorStop(1.0, `rgba(0,0,0,${a2.toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.rect(cx - beamWidth/2, 0, beamWidth, CANVAS_H);
      ctx.fill();
    }
    ctx.restore();
  }

  drawAmbient(ctx){
    if(!this.ambient || !this.ambient.length) return;
    const t = this.time||0;
    for(const m of this.ambient){
      const wobble = Math.sin(m.phase + t*0.3);
      const pulse = m.a * (0.55 + 0.45*((Math.sin(m.phase) *0.5 + 0.5)));
      ctx.save();
      // Dust flecks drifting through the overhead light beams: very
      // soft, warm, and semi‑transparent so they feel volumetric.
      ctx.globalAlpha = Math.max(0.04, Math.min(0.22, pulse));
      ctx.shadowColor = 'rgba(255,255,255,0.2)';
      ctx.shadowBlur = 6 + m.r*3;
      ctx.fillStyle = 'rgba(255,244,230,0.9)';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  drawBase(ctx){
    const base = this.grid.base || (Array.isArray(this.grid.waypoints[0])? this.grid.waypoints[0][this.grid.waypoints[0].length-1] : this.grid.waypoints[this.grid.waypoints.length-1]);
    const t = this.time;
    const x = base.x, y = base.y;
    const r = TILE_SIZE*0.35;

    // Current reactor HP ratio/color (shared with HP bar and tower pedestals)
    const maxLives = this.GAME_MAX_LIVES || (GAME_RULES.startingLives || this.lives || 1);
    const lifePct = Math.max(0, Math.min(1, this.lives / maxLives));
    const hpColor = getHpColor(lifePct);

    // Outer glow
    ctx.save();
    const glow = ctx.createRadialGradient(x,y, r*0.2, x,y, r*1.6);
    glow.addColorStop(0, 'rgba(0,186,255,0.18)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x,y,r*1.6,0,Math.PI*2); ctx.fill();

    // Solid slab under the core: use the shared pedestal texture scaled
    // up to almost a 3x3 tile footprint so it feels like the anchor of
    // the arena. Falls back to a simple vector slab if the image is not
    // available yet.
    ctx.translate(x,y);
    ctx.save();
    const pedSize = TILE_SIZE * 2.8; // just under 3x3 tiles
    if(PEDESTAL_SPRITE && PEDESTAL_SPRITE.loaded && PEDESTAL_SPRITE.img){
      const img = PEDESTAL_SPRITE.img;
      const baseSize = Math.max(img.width, img.height) || 1;
      const scale = pedSize / baseSize;
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, -dw/2, -dh/2, dw, dh);
    } else {
      const pedW = pedSize;
      const pedH = pedSize;
      const corner = 18;
      const edgeColor = 'rgba(255,255,255,0.14)';
      const topColor = '#181f26';
      ctx.fillStyle = topColor;
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-pedW/2 + corner, -pedH/2);
      ctx.lineTo(pedW/2 - corner, -pedH/2);
      ctx.quadraticCurveTo(pedW/2, -pedH/2, pedW/2, -pedH/2 + corner);
      ctx.lineTo(pedW/2, pedH/2 - corner);
      ctx.quadraticCurveTo(pedW/2, pedH/2, pedW/2 - corner, pedH/2);
      ctx.lineTo(-pedW/2 + corner, pedH/2);
      ctx.quadraticCurveTo(-pedW/2, pedH/2, -pedW/2, pedH/2 - corner);
      ctx.lineTo(-pedW/2, -pedH/2 + corner);
      ctx.quadraticCurveTo(-pedW/2, -pedH/2, -pedW/2 + corner, -pedH/2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Reactor pedestal rail ring: a red track that hugs the outer edge
    // of the larger pedestal, mirroring the tower pedestal rings but
    // scaled up for the reactor. On most maps we leave a single opening
    // aligned with the incoming path; on the Core Nexus map we leave
    // four openings (up/down/left/right) so the ring matches the
    // cross-shaped bridge layout.
    {
      const railR = TILE_SIZE * 1.05;
      ctx.save();
      ctx.lineCap = 'round';
      const ringCol = hpColor;
      ctx.shadowColor = ringCol;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = ringCol;
      ctx.lineWidth = 4;
      const isNexus = this.selectedMap && this.selectedMap.key === 'nexus';
      if(isNexus){
        // Four short rail segments centered on the diagonals so the
        // ring is open along all four cardinal bridge directions.
        const centers = [Math.PI/4, 3*Math.PI/4, 5*Math.PI/4, 7*Math.PI/4];
        const halfSpan = Math.PI/6; // ~60° total per segment
        for(const ang of centers){
          const a0 = ang - halfSpan;
          const a1 = ang + halfSpan;
          ctx.beginPath();
          ctx.arc(0, 0, railR, a0, a1);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.strokeStyle = ringCol;
        ctx.lineWidth = 2;
        for(const ang of centers){
          const a0 = ang - halfSpan;
          const a1 = ang + halfSpan;
          ctx.beginPath();
          ctx.arc(0, 0, railR-1.5, a0, a1);
          ctx.stroke();
        }
      } else {
        // Single gap aligned with the last approach direction.
        // Estimate the direction from the core toward the last path tile
        // (where enemies approach from) so we can cut a gap in the ring
        // on that side.
        let gapDir = 0;
        const W = this.grid && this.grid.waypoints;
        if(Array.isArray(W) && W.length){
          if(Array.isArray(W[0])){
            const path = W[0];
            if(path.length >= 2){
              const last = path[path.length-1];
              const prev = path[path.length-2];
              gapDir = Math.atan2(prev.y - last.y, prev.x - last.x);
            }
          } else if(W.length >= 2){
            const path = W;
            const last = path[path.length-1];
            const prev = path[path.length-2];
            gapDir = Math.atan2(prev.y - last.y, prev.x - last.x);
          }
        }
        const gapSize = Math.PI / 4; // 45° opening toward the bridge
        const halfGap = gapSize / 2;
        const startA = gapDir + halfGap;
        const endA = gapDir + Math.PI*2 - halfGap;
        ctx.beginPath();
        ctx.arc(0, 0, railR, startA, endA);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = ringCol;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, railR-1.5, startA, endA);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Pulsing core / reactor art (pulse stronger as lives drop). If a
    // dedicated sprite is available we draw that on top of a subtle
    // glow; otherwise we fall back to the original vector core.
    const extraPulse = (1 - lifePct) * 3.5; // more amplitude when low lives
    const corePulse = Math.sin(t*(2.5 + (1-lifePct)*2))* (2 + extraPulse);

    ctx.save();
    const wobble = Math.sin(t*0.8)*0.2;
    ctx.rotate(wobble);
    let drewSprite = false;
    let coreR = r*0.45 + corePulse;
    // Offset used to align the HP-colored ring/jewel with the visual
    // center of the core inside the sprite (which is slightly off the
    // exact image center). Tuned by eye; adjust if art changes.
    let coreOffsetX = 0;
    let coreOffsetY = 0;
    if(REACTOR_SPRITE && REACTOR_SPRITE.loaded && REACTOR_SPRITE.img){
      const img = REACTOR_SPRITE.img;
      const baseSize = Math.max(img.width, img.height) || 1;
      const coreSize = TILE_SIZE * 1.3 + corePulse; // breathe slightly with HP
      const scale = coreSize / baseSize;
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.shadowColor = COLORS.accent2;
      ctx.shadowBlur = 24;
      ctx.drawImage(img, -dw/2, -dh/2, dw, dh);
      drewSprite = true;
      coreR = coreSize * 0.32;
      // The art for the animated core is very slightly offset
      // inside the sprite. Nudge the HP overlay toward the
      // visual center so the colored ring/jewel sit directly
      // over the core.
      coreOffsetX = -TILE_SIZE * 0.015; // subtle left offset
      coreOffsetY = -TILE_SIZE * 0.030; // subtle upward offset
    }
    if(!drewSprite){
      ctx.shadowColor = COLORS.accent2;
      ctx.shadowBlur = 18;
      const sides = 6;
      ctx.fillStyle = '#0b1d28';
      ctx.strokeStyle = COLORS.accent2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for(let i=0;i<sides;i++){
        const a = i*(Math.PI*2/sides);
        const px = Math.cos(a)*r, py = Math.sin(a)*r;
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Pulsing inner core uses the shared HP color so it always
      // matches the HP bar and pedestal rings.
      coreR = r*0.45 + corePulse;
      ctx.fillStyle = hpColor;
      ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.arc(coreOffsetX,coreOffsetY,coreR,0,Math.PI*2); ctx.fill();
    }
    // Inner HP ring + jewel overlay so the core itself mirrors the
    // current HP color, even when using sprite art.
    const ringOuter = coreR + 7; // slightly thicker inner ring
    const jewelR = Math.max(4, coreR * 0.51); // ~additional 5% coverage
    ctx.shadowColor = hpColor;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = hpColor;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(coreOffsetX,coreOffsetY,ringOuter,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;
    // Jewel glow: keep this as a simple radial gradient overlay so it
    // stays lightweight. This still tints the central core toward the
    // current HP color without using an expensive composite operation.
    const jGrad = ctx.createRadialGradient(
      coreOffsetX, coreOffsetY, jewelR*0.15,
      coreOffsetX, coreOffsetY, jewelR
    );
    jGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    jGrad.addColorStop(0.35, hpColor);
    jGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = jGrad;
    ctx.beginPath(); ctx.arc(coreOffsetX,coreOffsetY,jewelR,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Rotating rings
    ctx.shadowBlur = 10;
    for(let i=0;i<2;i++){
      ctx.save();
      ctx.rotate(t*(i?1.2:-1.5));
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0,0,r+8+i*6, t*0.8, t*0.8 + Math.PI*1.2);
      ctx.stroke();
      ctx.restore();
    }

    // Lives ring gauge (outer ring) – tint to current HP color as well
    const pct = Math.max(0, Math.min(1, this.lives / (this.GAME_MAX_LIVES || GAME_RULES.startingLives)));
    ctx.rotate(0);
    ctx.lineWidth = 6;
    // background ring
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(0,0,r+14,0,Math.PI*2); ctx.stroke();
    // foreground ring
    ctx.strokeStyle = hpColor;
    ctx.beginPath(); ctx.arc(0,0,r+14,-Math.PI/2, -Math.PI/2 + pct*2*Math.PI); ctx.stroke();

    // Reactor Aegis shield cue
    if(this.reactorShield && this.reactorShield > 0){
      const pulse = 0.6 + 0.15*Math.sin(t*4);
      const shieldR = r + 24;
      ctx.save();
      ctx.globalAlpha = 0.75;
      const g = ctx.createRadialGradient(0,0,shieldR*0.65, 0,0, shieldR*1.05);
      g.addColorStop(0, 'rgba(170,123,255,0.5)');
      g.addColorStop(1, 'rgba(170,123,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0,0,shieldR,0,Math.PI*2); ctx.fill();
      ctx.shadowColor = 'rgba(170,123,255,0.7)';
      ctx.shadowBlur = 22;
      ctx.lineWidth = 4 + pulse*1.5;
      ctx.strokeStyle = 'rgba(170,123,255,0.9)';
      ctx.beginPath(); ctx.arc(0,0,shieldR,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // Canvas-based chamber scene (shop)
  drawChamber(ctx){
    // Background: Assembly Core art inside the playable area, layered
    // above the global space backdrop but beneath chamber nodes.
    ctx.save();
    const img = ASSEMBLYCORE_BG.img;
    if(img && ASSEMBLYCORE_BG.loaded && img.naturalWidth && img.naturalHeight){
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const canvasRatio = CANVAS_W / CANVAS_H;
      const imgRatio = iw / ih;
      let dw, dh;
      if(imgRatio > canvasRatio){
        // Wider than canvas: fit height, crop sides.
        dh = CANVAS_H;
        dw = dh * imgRatio;
      } else {
        // Taller than canvas: fit width, crop top/bottom.
        dw = CANVAS_W;
        dh = dw / imgRatio;
      }
      const dx = (CANVAS_W - dw) / 2;
      const dy = (CANVAS_H - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      // Fallback flat background if art is missing.
      ctx.fillStyle = '#0b1118';
      ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    }
    // subtle teleport dots
    if(this.teleDots && this.teleDots.length){
      for(const d of this.teleDots){ ctx.save(); ctx.globalAlpha = 0.35 + 0.35*Math.sin(this.time*2 + d.p); ctx.fillStyle = '#9fffe0'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
    }
    // grid lines overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    const step = 40;
    for(let x=0;x<=CANVAS_W;x+=step){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke();
    }
    for(let y=0;y<=CANVAS_H;y+=step){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CANVAS_W,y); ctx.stroke();
    }
    // core position (no longer draws background hex; nodes render their own icons)
    const cx = CANVAS_W/2, cy = CANVAS_H/2;
    ctx.shadowBlur = 0;
    // floating nodes
    const t = (this.chamber?.t)||0;
    // Hover detection in screen space, including bobbing offset
    const mx = this.mouse.x, my = this.mouse.y;
    const isHover = (n, r, bob)=> Math.hypot(mx - n.x, my - (n.y + bob)) <= r;
    let hoveredTooltip = false;
    const drawNode = (n, color, baseR)=>{
      const bob = Math.sin(t*2 + (n.x+n.y)*0.01)*4;
      const x = n.x, y = n.y + bob;
      const hover = isHover(n, baseR+10, bob);
      const isCore = n.key === 'corehp';
      const label = n.label || '';

      ctx.save();

      // Circular node icon (core uses a slightly larger radius)
      const outerR = hover ? baseR + (isCore ? 8 : 4) : baseR + (isCore ? 4 : 0);
      ctx.shadowColor = color;
      ctx.shadowBlur = hover ? 24 : 14;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, outerR, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b1118';
      ctx.beginPath();
      ctx.arc(x, y, isCore ? 16 : 12, 0, Math.PI*2);
      ctx.fill();

      // Label above node
      ctx.fillStyle = 'white'; ctx.font='600 12px system-ui, sans-serif'; ctx.textAlign='center';
      ctx.fillText(label, x, y-28);

      // Sub text varies by node type
      if(n.key){
        // Ability: dots for level + cost (push lower for core hex)
        const total = n.max||5, filled = Math.max(0, Math.min(total, n.level||0));
        const dR = 4, gap = 10, startX = x - ((total-1)*gap)/2;
        const yDots = isCore ? (y+46) : (y+28);
        const yCost = isCore ? (y+64) : (y+46);
        for(let i=0;i<total;i++){
          ctx.beginPath(); ctx.arc(startX + i*gap, yDots, dR, 0, Math.PI*2);
          ctx.fillStyle = i<filled ? color : 'rgba(255,255,255,0.25)'; ctx.fill();
        }
        if(n.cost!=null){
          const costText = this.isCheatMode() ? '∞' : n.cost;
          ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.font='11px system-ui, sans-serif';
          ctx.fillText(`${costText}✦`, x, yCost);
        }
        if(hover && this.ui && this.ui.showChamberTooltip){
          const rect = this.canvas.getBoundingClientRect();
          const lines = Array.isArray(n.lines) ? n.lines.slice(0,3) : [];
          this.ui.showChamberTooltip({
            label,
            lines: lines.length ? lines : [`Level ${filled}/${total}`],
            rarity: n.rarity || 'Ultimate',
            x: rect.left + x,
            y: rect.top + (y - (isCore ? 54 : 44))
          });
          hoveredTooltip = true;
        }
      } else {
        // Passive: only cost + optional tooltip line
        if(n.cost!=null){
          const costText = this.isCheatMode() ? '∞' : n.cost;
          ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.font='11px system-ui, sans-serif';
          ctx.fillText(`${costText}⟐`, x, y+36);
        }
        if(hover && n.desc){
          hoveredTooltip = true;
          if(this.ui && this.ui.showChamberTooltip){
            const rect = this.canvas.getBoundingClientRect();
            this.ui.showChamberTooltip({
              label,
              desc: n.desc,
              rarity: n.rarity || (n.tier==='super' ? 'Super Rare' : (n.tier==='rare' ? 'Rare' : 'Common')),
              x: rect.left + x,
              y: rect.top + y - 24
            });
          }
        }
      }

      ctx.restore();
    };
    const passiveColors = { common:'#2ccc7e', rare:'#ff5370', super:'#aa7bff' };
    const abilColor = '#00baff';
    for(const n of (this.chamber?.passive||[])){
      const c = passiveColors[n.tier] || passiveColors.common;
      drawNode(n, c, 18);
    }
    for(const n of (this.chamber?.abil||[])) drawNode(n, abilColor, 16);
    if(this.ui && this.ui.hideChamberTooltip && !hoveredTooltip){
      this.ui.hideChamberTooltip();
    }
    // Section labels
    const labels = this.chamber?.sectionLabels || {};
    const drawLabel = (lbl)=>{
      if(!lbl || !lbl.text) return;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,186,255,0.35)';
      ctx.shadowBlur = 10;
      ctx.fillText(lbl.text, lbl.x, lbl.y);
      ctx.restore();
    };
    drawLabel(labels.passive);
    drawLabel(labels.ability);

    // Buttons: Reroll / Convert / Continue (clickable)
    const btn = this.chamber?.buttons || {
      reroll:{x:20,y:CANVAS_H-44,w:160,h:28},
      convert:{x:CANVAS_W-230,y:CANVAS_H-50,w:210,h:36},
      cont:{x:CANVAS_W/2-80,y:CANVAS_H-44,w:160,h:28}
    };
    const drawBtn = (b, text)=>{
      const hover = mx>=b.x && mx<=b.x+b.w && my>=b.y && my<=b.y+b.h;
      ctx.save(); ctx.fillStyle = hover? 'rgba(0,186,255,0.22)' : 'rgba(255,255,255,0.08)'; ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.roundRect? ctx.roundRect(b.x,b.y,b.w,b.h,6) : (ctx.rect(b.x,b.y,b.w,b.h)); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font='600 14px system-ui, sans-serif'; ctx.textAlign='center'; ctx.fillText(text, b.x+b.w/2, b.y+b.h/2+5);
      ctx.restore();
    };
    const drawConvert = (b)=>{
      const hover = mx>=b.x && mx<=b.x+b.w && my>=b.y && my<=b.y+b.h;
      const pulse = 0.6 + 0.12*Math.sin(t*3.2);
      ctx.save();
      const grd = ctx.createLinearGradient(b.x, b.y, b.x, b.y+b.h);
      grd.addColorStop(0, hover? 'rgba(255,188,87,0.28)' : 'rgba(255,188,87,0.18)');
      grd.addColorStop(1, hover? 'rgba(0,186,255,0.18)' : 'rgba(0,186,255,0.12)');
      ctx.fillStyle = grd;
      ctx.strokeStyle = hover? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect? ctx.roundRect(b.x, b.y, b.w, b.h, 10) : ctx.rect(b.x,b.y,b.w,b.h); ctx.fill(); ctx.stroke();
      // Glow line
      ctx.strokeStyle = 'rgba(255,214,124,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(b.x+8, b.y+ b.h*0.65); ctx.lineTo(b.x+b.w-8, b.y + b.h*0.65); ctx.stroke();
      // Text + icons
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Convert 500⟐ → 1✦', b.x + b.w/2, b.y + b.h/2 + 5);
      // Sparkle pulse
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffd47c';
      ctx.beginPath(); ctx.arc(b.x + b.w - 22, b.y + b.h/2 - 2, 3, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    };
    const rerollPrice = Math.max(0, Math.round(30 * (1 - (buffs.rerollDiscount||0))));
    const rerollLabel = this.isCheatMode() ? 'Reroll (∞)' : `Reroll (${rerollPrice}⟐)`;
    const contLabel = (this.mode === 'assembly' && this.coreReturnTarget === 'assembly') ? 'Back' : 'Continue';
    drawBtn(btn.reroll, rerollLabel);
    drawConvert(btn.convert);
    drawBtn(btn.cont, contLabel);

    ctx.restore();
  }

  // Backdrop only: grid + core (no nodes/buttons); used for crossfade
  drawChamberBackdrop(ctx){
    ctx.save();
    ctx.fillStyle = '#0b1118'; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    const step = 40; for(let x=0;x<=CANVAS_W;x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke(); }
    for(let y=0;y<=CANVAS_H;y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CANVAS_W,y); ctx.stroke(); }
    // soft central glow instead of hex core
    const cx = CANVAS_W/2, cy = CANVAS_H/2;
    const r = 40;
    const g = ctx.createRadialGradient(cx,cy,0,cx,cy,r*1.6);
    g.addColorStop(0,'rgba(0,186,255,0.5)');
    g.addColorStop(1,'rgba(0,186,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx,cy,r*1.4,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // Backdrop for map return: minimal background + grid + core base
  drawMapBackdrop(ctx){
    // Grid and base without towers/enemies for a clean crossfade
    this.grid.draw(ctx, this.time);
    this.drawBase(ctx);
  }

  

  addFloater(x,y,text,color){
    this.floaters.push({ x, y, text, age:0, ttl:1.0, vy:-30, color });
  }

  spawnParticles(x,y,color){
    if(!this.particles) this.particles = [];
    for(let i=0;i<14;i++){
      const a = Math.random()*Math.PI*2;
      const sp = 60 + Math.random()*80;
      this.particles.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, age:0, ttl:0.6+Math.random()*0.3, color, r: 2+Math.random()*2 });
    }
  }

  showBanner(text, subtext=null, color=null){
    this.banner = { text, subtext, color: color, age:0, ttl:2.0 };
    if(this.ui && this.ui.pushBannerMessage){
      this.ui.pushBannerMessage({ text, subtext, color });
    }
  }

  registerCrit(damage){
    const nowTs = now();
    // Avoid spamming: only show sizeable crits and throttle frequency.
    if(damage < 15) return;
    if(nowTs - this._lastCritBannerTime < 900) return;
    this._lastCritBannerTime = nowTs;
    const val = Math.max(1, Math.round(damage));
    // Crit notifications: highlight in gold/yellow.
    this.showBanner('CRITICAL HIT', `-${val} HP`, 'crit');
  }

  // Trigger a brief screen shake
  addShake(power=6){
    // Accumulate with clamp
    this.shakeMag = Math.min(20, this.shakeMag + Math.max(0, power));
  }

  getTowerAt(gx,gy){
    return this.towers.find(t=> t.gx===gx && t.gy===gy);
  }

  upgradeSelected(type){
    if(!this.selected) return;
    const costMul = this.getUpgradeCostMultiplier ? this.getUpgradeCostMultiplier() : 1;
    const applyCostMul = (base)=>{
      const v = Math.max(0, Number(base)||0);
      const scaled = Math.round(v * costMul);
      return scaled > 0 ? scaled : v;
    };
    if(type==='slow' && !this.selected.hasSlow){
      const baseCost = UPGRADE_COSTS.slowModule;
      const cost = applyCostMul(baseCost);
      if(this.isCheatMode() || this.credits >= cost){
        if(!this.isCheatMode()){ this.credits -= cost; }
        this.selected.installSlow(); this.selected.invested = (this.selected.invested||0) + cost; this.ui.setCredits(this.credits);
        this.ui.setUpgradePanel(this.selected, this.credits);
      } else {
        this.addFloater(this.mouse.x + 14, this.mouse.y - 10, 'Not enough nano credits', COLORS.danger || '#ff5370');
        if(this.selected) this.ui.showPanelToast('Not enough nano credits');
      }
    }
    if(type==='rate' && (this.selected.rateLevel??0) < 3){
      const lvl = this.selected.rateLevel||0;
      const costs = [UPGRADE_COSTS.rateModule, Math.round(UPGRADE_COSTS.rateModule*1.5), Math.round(UPGRADE_COSTS.rateModule*2.0)];
      const cost = applyCostMul(costs[lvl]);
      if(this.isCheatMode() || this.credits >= cost){
        if(!this.isCheatMode()){ this.credits -= cost; }
        this.selected.upgradeRate(); this.selected.invested = (this.selected.invested||0) + cost; this.ui.setCredits(this.credits);
        this.ui.setUpgradePanel(this.selected, this.credits);
      } else {
        this.addFloater(this.mouse.x + 14, this.mouse.y - 10, 'Not enough nano credits', COLORS.danger || '#ff5370');
        if(this.selected) this.ui.showPanelToast('Not enough nano credits');
      }
    }
    if(type==='range' && (this.selected.rangeLevel??0) < 3){
      const lvl = this.selected.rangeLevel||0;
      const costs = [UPGRADE_COSTS.rangeModule, Math.round(UPGRADE_COSTS.rangeModule*1.5), Math.round(UPGRADE_COSTS.rangeModule*2.0)];
      const cost = applyCostMul(costs[lvl]);
      if(this.isCheatMode() || this.credits >= cost){
        if(!this.isCheatMode()){ this.credits -= cost; }
        this.selected.upgradeRange(); this.selected.invested = (this.selected.invested||0) + cost; this.ui.setCredits(this.credits);
        this.ui.setUpgradePanel(this.selected, this.credits);
      } else {
        this.addFloater(this.mouse.x + 14, this.mouse.y - 10, 'Not enough nano credits', COLORS.danger || '#ff5370');
        if(this.selected) this.ui.showPanelToast('Not enough nano credits');
      }
    }
    if(type==='burn' && !this.selected.hasBurn){
      const baseCost = UPGRADE_COSTS.burnModule;
      const cost = applyCostMul(baseCost);
      if(this.isCheatMode() || this.credits >= cost){
        if(!this.isCheatMode()){ this.credits -= cost; }
        this.selected.installBurn(); this.selected.invested = (this.selected.invested||0) + cost; this.ui.setCredits(this.credits);
        this.ui.setUpgradePanel(this.selected, this.credits);
      } else {
        this.addFloater(this.mouse.x + 14, this.mouse.y - 10, 'Not enough nano credits', COLORS.danger || '#ff5370');
      }
    }
  }

  // Dev: instantly max out the selected tower
  upgradeSelectedMax(){
    if(!this.isCheatMode() || !this.selected) return;
    const t = this.selected;
    t.rateLevel = 3;
    t.rangeLevel = 3;
    t.hasSlow = true;
    t.hasBurn = true;
    // recalc cached range
    if(typeof t.baseRange === 'number'){
      t.range = t.baseRange * (1 + 0.15*t.rangeLevel);
    }
    this.ui.setUpgradePanel(t, this.credits);
  }

  setDevMode(v){
    const next = !!v;
    const changed = this.devMode !== next;
    this.devMode = next;
    if(this.devMode){
      this.credits = Math.max(this.credits, 999999);
      this.lives = Math.max(this.lives, GAME_RULES.startingLives);
      this.ui.setCredits(this.credits);
      this.ui.setLives(this.lives);
    }
    // toggle dev UI
    if(this.ui.setDevModeUI) this.ui.setDevModeUI(this.devMode);
    // Always refresh credits label to reflect ∞ vs numeric appropriately
    if(this.ui.setCredits) this.ui.setCredits(this.credits);
    if(changed) this._writeDevModePref(this.devMode);
  }

  setDebugMode(v){
    const next = !!v;
    this.debugMode = next;
    if(this.ui.setDebugModeUI) this.ui.setDebugModeUI(this.debugMode);
    // Expose a lightweight global knob for sprite debug helpers.
    if(typeof window !== 'undefined'){
      const g = window.NANO_SPRITE_DEBUG || {};
      g.enabled = this.debugMode;
      if(g.fpsMul == null) g.fpsMul = 1;
      window.NANO_SPRITE_DEBUG = g;
    }
  }

  setDebugAnimSpeed(speed){
    const v = (typeof speed === 'number' && isFinite(speed) && speed>0) ? speed : 1;
    if(typeof window !== 'undefined'){
      const g = window.NANO_SPRITE_DEBUG || {};
      g.fpsMul = v;
      // Keep enabled flag stable; do not auto-enable.
      if(g.enabled == null) g.enabled = !!this.debugMode;
      window.NANO_SPRITE_DEBUG = g;
    }
  }

  setAutoSpeedControl(v){
    const next = !!v;
    const changed = this.autoSpeedControl !== next;
    this.autoSpeedControl = next;
    if(this.ui.setAutoSpeedUI) this.ui.setAutoSpeedUI(this.autoSpeedControl);
    if(changed) this._writeAutoSpeedPref(this.autoSpeedControl);
  }

  devUnlockAllUltimates(){
    // Set all ultimates to level 5 and unlock
    this.abilities.bomb.level = 5; this.abilities.bomb.unlocked = true;
    this.abilities.overclock.level = 5; this.abilities.overclock.unlocked = true;
    this.abilities.cryo.level = 5; this.abilities.cryo.unlocked = true;
    this.recomputeAbilityParams();
    if(this.ui.setAbilityVisible){
      this.ui.setAbilityVisible('bomb', true);
      this.ui.setAbilityVisible('overclock', true);
      this.ui.setAbilityVisible('cryo', true);
    }
    if(this.updateAbilityUI) this.updateAbilityUI();
    // refresh shop section if open
    if(this.state==='shop' && this.ui.renderShopAbilities){
      const abilList = this.buildAbilityCards();
      this.ui.renderShopAbilities(abilList, this.coreShards);
    }
  }

  openSellConfirm(){
    if(!this.selected) return;
    const t = this.selected;
    const refund = Math.max(0, Math.floor((t.invested||0) * 0.25));
    this.ui.showSell(true, `Sell ${t.name} for +${refund}⚛?`);
  }

  sellSelectedConfirmed(){
    if(!this.selected) { this.ui.showSell(false); return; }
    const t = this.selected;
    const refund = Math.max(0, Math.floor((t.invested||0) * 0.25));
    // remove from towers and free tile
    this.towers = this.towers.filter(x=> x!==t);
    this.grid.release(t.gx, t.gy);
    this.selected = null;
    // apply refund
    this.credits += refund;
    this.ui.setCredits(this.credits);
    this.ui.setUpgradePanel(null, this.credits);
    this.ui.showSell(false);
    // Toasts: green +⚛ on canvas and panel
    this.addFloater(t.x, t.y - 12, `+${refund}⚛`, COLORS.accent || '#17e7a4');
    this.ui.showPanelToast(`+${refund}⚛`, 'success');
    audio.cash();
  }
}
