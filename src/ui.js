import { GAME_RULES, COLORS, UPGRADE_COSTS } from './config.js';
import { MAPS, drawMapPreview } from './maps.js';

export class UIManager{
  constructor(){
    this.listeners = { startWave: [], startGame: [], pause: [], resume: [], retry: [], restart: [], sandboxStart: [], sandboxReset: [], sandboxOpen: [], toMenu: [], toMissionSelect: [], selectTowerType: [], upgradeSlow: [], upgradeRate: [], upgradeRange: [], upgradeBurn: [], sellTower: [], sellConfirm: [], sellCancel: [], selectMap: [], toggleFast: [], closeUpg: [], toggleVolume: [], setVolume: [], shopBuy: [], shopReroll: [], shopContinue: [], shopBuyAbility: [], useBomb: [], useOverclock: [], useCryo: [], toggleDev: [], toggleAutoSpeed: [], exitConfirm: [], exitCancel: [], openShop: [], closeShop: [], devUnlockUlts: [], devUpgradeMax: [], mainNew: [], mainLoad: [], mainAssembly: [], loadSlot: [], openAssembly: [], closeAssembly: [], startMission: [], assemblySave: [], assemblyLoad: [], openAssemblyCore: [], menuBack: [], mainSettings: [], mainSettingsBack: [], loadBack: [], loginUser: [], openCreateUser: [], closeCreateUser: [], createUser: [], openLeaderboard: [], closeLeaderboard: [], leaderboardSignIn: [], logout: [], removePassive: [], leaderboardSelectMap: [], pauseLoginOpen: [] };
    this.$root = document.getElementById('app');
    this.$wave = document.getElementById('stat-wave');
    this.$credits = document.getElementById('stat-credits');
    this.$fragments = document.getElementById('stat-fragments');
    this.$cores = document.getElementById('stat-core');
    this.$lives = document.getElementById('stat-lives');
    this.$start = document.getElementById('btn-start-wave');
    this.$pause = document.getElementById('btn-pause');
    this.$fast = document.getElementById('btn-fast');
    this.$fastLabel = document.getElementById('fast-label');
    this.$waveStatus = document.getElementById('wave-status');
    this.$waveStatusLabel = this.$waveStatus ? this.$waveStatus.querySelector('.ws-label') : null;
    this.$waveBarFill = this.$waveStatus ? this.$waveStatus.querySelector('.wave-bar .fill') : null;
    this.$waveCurrent = document.getElementById('wave-current');
    this.$waveBest = document.getElementById('wave-best');
    this.$perfectCombo = document.getElementById('perfect-combo');
    this.$perfectBest = document.getElementById('perfect-best');
    this.$bannerFeed = document.getElementById('banner-feed');
    this.$palette = document.querySelector('.tower-palette');
    this.$towerBtns = Array.from(document.querySelectorAll('.tower-palette .tower-btn'));
    // Upgrade panel
    this.$upg = document.getElementById('upgrade-panel');
    this.$upgTitle = this.$upg ? this.$upg.querySelector('.upg-title') : null;
    this.$upgName = document.getElementById('upg-name');
    this.$upgIcon = document.getElementById('upg-icon');
    this.$upgSlow = document.getElementById('btn-upg-slow');
    this.$upgRate = document.getElementById('btn-upg-rate');
    this.$upgRange = document.getElementById('btn-upg-range');
    this.$upgBurn = document.getElementById('btn-upg-burn');
    this.$sell = document.getElementById('btn-sell');
    this.$upgClose = document.getElementById('btn-upg-close');
    // Overlays
    this.$menu = null;
    this.$pauseOverlay = document.getElementById('pause-overlay');
    this.$pauseActions = this.$pauseOverlay ? this.$pauseOverlay.querySelector('.actions') : null;
    this.$btnSettings = document.getElementById('btn-settings');
    this.$settingsPanel = document.getElementById('settings-panel');
    this.$btnPauseLogin = document.getElementById('btn-pause-login');
    this.$pauseLoginPanel = document.getElementById('pause-login-panel');
    this.$pauseLoginUsername = document.getElementById('pause-login-username');
    this.$pauseLoginPassword = document.getElementById('pause-login-password');
    this.$pauseLoginStatus = document.getElementById('pause-login-status');
    this.$pauseLoginSubmit = document.getElementById('btn-pause-login-submit');
    this.$pauseLoginBack = document.getElementById('btn-pause-login-back');
    this.$pauseRestart = document.getElementById('btn-pause-restart');
    this.$btnSettingsBack = document.getElementById('btn-settings-back');
    this.$gameover = document.getElementById('gameover-overlay');
    this.$sellOverlay = document.getElementById('sell-overlay');
    this.$sellText = document.getElementById('sell-text');
    this.$sellConfirm = document.getElementById('btn-sell-confirm');
    this.$sellCancel = document.getElementById('btn-sell-cancel');
    // Exit confirmation overlay
    this.$exitConfirm = document.getElementById('exitconfirm-overlay');
    this.$exitTitle = document.getElementById('exitconfirm-title');
    this.$exitTag = document.getElementById('exitconfirm-tag');
    this.$exitCancel = document.getElementById('btn-exit-cancel');
    this.$exitConfirmBtn = document.getElementById('btn-exit-confirm');
    // Passive effects side panel (DOM, right of canvas)
    this.$passivePanel = document.getElementById('passive-panel');
    this.$passiveLines = document.getElementById('passive-lines');
    this.$statBaseDmg = document.getElementById('stat-basedmg');
    this.$statCritDmg = document.getElementById('stat-critdmg');
    this.$statCrit = document.getElementById('stat-crit');
    this.$statSlow = document.getElementById('stat-slow');
    this.$statBurn = document.getElementById('stat-burn');
    this.$statTarget = document.getElementById('stat-target');
    // Fullscreen main menus
    this.$mainMenu = document.getElementById('mainmenu-overlay');
    this.$loadMenu = document.getElementById('loadmenu-overlay');
    this.$createMenu = document.getElementById('create-overlay');
    this.$leaderboard = document.getElementById('leaderboard-overlay');
    this.$mainSettings = document.getElementById('mainsettings-overlay');
    this.$assembly = document.getElementById('assembly-overlay');
    this.$leaderboardList = document.getElementById('leaderboard-list');
    this.$leaderboardStatus = document.getElementById('leaderboard-status');
    this.$leaderboardWarning = document.getElementById('leaderboard-warning');
    this.$leaderboardDevWarning = document.getElementById('leaderboard-dev-warning');
    if(this.$mainMenu && this.$mainMenu.classList.contains('visible')){
      document.body.classList.add('mainmenu-visible');
    }
    // Leaderboard map carousel
    this.lbMaps = MAPS;
    this.lbMapIdx = 0;
    this.$lbMapCanvas = document.getElementById('lb-map-canvas');
    this.$lbMapTitle = document.getElementById('lb-map-title');
    this.$lbMapDesc = document.getElementById('lb-map-desc');
    this.$lbMapList = document.getElementById('lb-map-list');
    // Map select overlay
    this.$mapOverlay = document.getElementById('mapselect-overlay');
    this.$btnMapStart = document.getElementById('btn-map-start');
    this.$btnMapBack = document.getElementById('btn-map-back');
    this.$btnMainEndless = document.getElementById('btn-main-endless');
    this.$btnMainLeaderboard = document.getElementById('btn-main-leaderboard');
    this.$btnMainAssembly = document.getElementById('btn-main-assembly');
    this.$btnMainSandbox = document.getElementById('btn-main-sandbox');
    this.$btnMainSettings = document.getElementById('btn-main-settings');
    this.$btnLoadBack = document.getElementById('btn-load-back');
    this.$loadSlots = [];
    // Assembly War UI
    this.$btnAssembly = document.getElementById('btn-main-assembly');
    this.$btnAssemblyBack = document.getElementById('btn-assembly-back');
    this.$btnAssemblyMain = document.getElementById('btn-assembly-main');
    this.$btnAssemblyCore = document.getElementById('btn-assembly-core');
    this.$missionCards = Array.from(document.querySelectorAll('.mission-card'));
    // Shop overlay
    this.$shop = document.getElementById('shop-overlay');
    this.$shopItems = document.getElementById('shop-items');
    this.$shopReroll = document.getElementById('btn-shop-reroll');
    this.$shopContinue = document.getElementById('btn-shop-continue');
    this.$shopAbilities = document.getElementById('shop-abilities');
    this.$shopClose = document.getElementById('btn-shop-close');
    this.$shopDevActions = document.getElementById('shop-dev-actions');
    this.$shopDevUnlockUlts = document.getElementById('btn-dev-unlock-ults');
    // Overlay buttons
    this.$menuStart = null;
    this.$menuBack = null;
    this.$resume = document.getElementById('btn-resume');
    this.$pauseMenu = document.getElementById('btn-pause-menu');
    this.$pauseMission = document.getElementById('btn-pause-mission');
    this.$volSlider = document.getElementById('vol-slider');
    this.$volLabel = document.getElementById('vol-label');
    this.$retry = document.getElementById('btn-retry');
    this.$overMenu = document.getElementById('btn-over-menu');
    this.$sandboxSettings = document.getElementById('btn-sandbox-settings');
    // Sandbox overlay
    this.$sandbox = document.getElementById('sandbox-overlay');
    this.$sandboxBack = document.getElementById('btn-sandbox-back');
    this.$sandboxReset = document.getElementById('btn-sandbox-reset');
    this.$sandboxStart = document.getElementById('btn-sandbox-start');
    // Main menu settings controls
    this.$volSliderMain = document.getElementById('vol-slider-main');
    this.$volLabelMain = document.getElementById('vol-label-main');
    // Speed control toggles
    this.$autoSpeed = document.getElementById('autospeed-toggle');
    this.$autoSpeedMain = document.getElementById('autospeed-toggle-main');
    this.$btnMainLoadUser = document.getElementById('btn-main-loaduser');
    // Load / Login menu elements
    this.$loadTitle = this.$loadMenu ? this.$loadMenu.querySelector('h2') : null;
    this.$loadTag = this.$loadMenu ? this.$loadMenu.querySelector('.tag') : null;
    this.$loginUser = document.getElementById('btn-login-submit');
    this.$loginCreate = document.getElementById('btn-login-create');
    this.$loginUsername = document.getElementById('login-username');
    this.$loginPassword = document.getElementById('login-password');
    this.$loginStatus = document.getElementById('login-status');
    // Create user elements
    this.$createUsername = document.getElementById('create-username');
    this.$createPassword = document.getElementById('create-password');
    this.$createConfirm = document.getElementById('create-confirm');
    this.$createStatus = document.getElementById('create-status');
    this.$createSubmit = document.getElementById('btn-create-submit');
    this.$createBack = document.getElementById('btn-create-back');
    // Leaderboard elements
    this.$btnLeaderboardBack = document.getElementById('btn-leaderboard-back');
    this.$btnLeaderboardSignIn = document.getElementById('btn-leaderboard-signin');
    this.$signinBanner = document.getElementById('signin-banner');
    this.$signinName = document.getElementById('signin-username');
    this.isSignedIn = false;
    this.updateAuthButtons();
    this.updateLeaderboardWarning(null);
    this.setLeaderboardDevWarning(false);
    // Assembly menu legacy buttons removed
    // HP bar
    this.$hpFill = document.getElementById('hp-fill');
    this.maxLives = (GAME_RULES && GAME_RULES.startingLives) ? GAME_RULES.startingLives : 30;
    // Ability buttons (visible, locked by default)
    this.$abilBomb = document.getElementById('btn-abil-bomb');
    this.$abilOverclock = document.getElementById('btn-abil-overclock');
    this.$abilCryo = document.getElementById('btn-abil-cryo');
    // Custom tooltip system (small UI card instead of native title)
    this._tip = null;
    this.clearTip = ()=>{ if(this._tip){ try{ this._tip.remove(); }catch(e){} this._tip=null; } };
    this.tipText = {
      bomb: { title:'Bomb', lines:['Place an instant explosion.', 'Damage/radius up, cooldown down per level.'] },
      overclock: { title:'Overclock', lines:['Boosts tower fire rate for a short time.', 'Boost up, cooldown down per level.'] },
      cryo: { title:'Cryo Burst', lines:['Slows all enemies in the chamber.', 'Duration up, cooldown down per level.'] },
      slow: { title:'Slow Module', lines:['Bullets briefly slow enemies.', 'Single install; pairs well with splash.'] },
      burn: { title:'Burn Module', lines:['Bullets apply burning damage over time.', 'Single install; stacks with other towers.'] },
      rate: { title:'Upgrade DPS', lines:['Increase sustained damage per second.', 'Max 3 levels.'] },
      range: { title:'Upgrade Fire Range', lines:['Increase range by 15% per level.', 'Max 3 levels.'] },
      start: { title:'Start Wave', lines:['Begin spawning the next wave of enemies.'] },
      fast: { title:'Speed', lines:['Cycles 1x → 2x → 3x → 4x.', 'Resets to 1x on bosses/bonus/difficulty.'] },
      // Tower palette tooltips
      tower_basic: { title:'Cannon', lines:['Single‑target ballistic turret.', 'Solid all‑rounder; supports slow/burn.'] },
      tower_laser: { title:'Laser', lines:['Continuous beam damage over time.', 'Great vs tough enemies; precise aim.'] },
      tower_splash: { title:'Splash', lines:['Explosive shells with area damage.', 'Strong vs groups; pairs well with slow.'] }
    };
    this.hideChamberTooltip = ()=> this.clearTip();
    this.showChamberTooltip = (payload)=>{
      if(!payload){
        this.clearTip();
        return;
      }
      let lines = Array.isArray(payload.lines) ? payload.lines : [payload.desc || ''];
      if(payload.rarity){
        const rarityLine = `Rarity: ${payload.rarity}`;
        lines = [rarityLine, ...lines];
      }
      const data = { title: payload.label || '', lines };
      const coords = { x: payload.screenX || payload.x || 0, y: payload.screenY || payload.y || 0 };
      this._spawnTooltip(data, coords);
    };
    this._spawnTooltip = (data, opts={})=>{
      this.clearTip();
      if(!data) return;
      const card = document.createElement('div'); card.className='tooltip-card';
      if(data.title){ const h = document.createElement('div'); h.className='tt-title'; h.textContent = data.title; card.appendChild(h); }
      for(const ln of (data.lines||[])){ const p=document.createElement('div'); p.className='tt-line'; p.textContent=String(ln); card.appendChild(p); }
      document.body.appendChild(card);
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let x = 0, y = 0;
      if(opts.el){
        const r = opts.el.getBoundingClientRect();
        x = r.left + r.width/2 - cw/2;
        y = (opts.preferBelow? r.bottom + 10 : r.top - ch - 10);
      } else if(typeof opts.x === 'number' && typeof opts.y === 'number'){
        x = opts.x - cw/2;
        y = opts.y - ch - 12;
      }
      x = Math.max(8, Math.min(x, window.innerWidth - cw - 8));
      y = Math.max(8, Math.min(y, window.innerHeight - ch - 8));
      card.style.left = `${x}px`; card.style.top = `${y}px`;
      this._tip = card;
    };
    const attachTip = (el, keyOrData, opts={})=>{
      if(!el) return;
      const key = (typeof keyOrData==='string') ? keyOrData : null;
      const staticData = (key==null? keyOrData : null);
      el.removeAttribute('title');
      const show = ()=>{
        const data = key? this.tipText[key] : staticData;
        if(!data) return;
        this._spawnTooltip(data, { el, preferBelow: opts.preferBelow });
      };
      const hide = ()=>{ this.clearTip(); };
      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
      el.addEventListener('focus', show);
      el.addEventListener('blur', hide);
    };
    // Ability button tips
    attachTip(this.$abilBomb, 'bomb', { preferBelow:true });
    attachTip(this.$abilOverclock, 'overclock', { preferBelow:true });
    attachTip(this.$abilCryo, 'cryo', { preferBelow:true });
    // Currency hover tips use dynamic cards for readability
    const currencyTips = {
      credits: {
        title:'NanoCredits (⟡)',
        lines:['Earned by destroying enemies.', 'Spend on towers and Nano-Tech upgrades.']
      },
      fragments: {
        title:'Data Fragments (⟐)',
        lines:['Awarded on waves and bonuses.', 'Used for rerolls and shop purchases.']
      },
      cores: {
        title:'Core Shards (✦)',
        lines:['Recovered from bosses.', 'Unlock ultimate abilities and reactor perks.']
      }
    };
    const creditsTipTarget = (this.$credits && this.$credits.closest?.('.currency-chip')) ? this.$credits.closest('.currency-chip') : this.$credits;
    const fragmentsTipTarget = (this.$fragments && this.$fragments.closest?.('.currency-chip')) ? this.$fragments.closest('.currency-chip') : this.$fragments;
    const coresTipTarget = (this.$cores && this.$cores.closest?.('.currency-chip')) ? this.$cores.closest('.currency-chip') : this.$cores;
    attachTip(creditsTipTarget, currencyTips.credits, { preferBelow:true });
    attachTip(fragmentsTipTarget, currencyTips.fragments, { preferBelow:true });
    attachTip(coresTipTarget, currencyTips.cores, { preferBelow:true });
    // Tower palette tips
    if(this.$towerBtns && this.$towerBtns.length){
      const keyMap = { basic:'tower_basic', laser:'tower_laser', splash:'tower_splash' };
      for(const btn of this.$towerBtns){
        const k = (btn.dataset && btn.dataset.tower) || '';
        const tipKey = keyMap[k];
        if(tipKey) attachTip(btn, tipKey, { preferBelow: true });
      }
    }
    // Upgrade panel button tips
    attachTip(this.$upgSlow, 'slow');
    attachTip(this.$upgBurn, 'burn');
    attachTip(this.$upgRate, 'rate');
    attachTip(this.$upgRange, 'range');
    // HUD controls
    attachTip(this.$start, 'start', { preferBelow:true });
    attachTip(this.$fast, 'fast', { preferBelow:true });

    // Public helpers to update tooltip content dynamically
    this.setAbilityTips = (stats)=>{
      if(!stats) return;
      if(stats.bomb){
        const b = stats.bomb;
        this.tipText.bomb.lines = [
          `Damage: ${b.damage|0}`,
          `Radius: ${b.radius|0}`,
          `Cooldown: ${b.cd!=null? b.cd.toFixed(1):''}s`
        ];
      }
      if(stats.overclock){
        const o = stats.overclock; const pct = Math.round(o.boostPct||0);
        this.tipText.overclock.lines = [
          `Fire rate boost: +${pct}%` ,
          `Duration: ${o.dur!=null? o.dur.toFixed(1):''}s`,
          `Cooldown: ${o.cd!=null? o.cd.toFixed(1):''}s`
        ];
      }
      if(stats.cryo){
        const c = stats.cryo;
        this.tipText.cryo.lines = [
          `Duration: ${c.dur!=null? c.dur.toFixed(1):''}s`,
          `Cooldown: ${c.cd!=null? c.cd.toFixed(1):''}s`
        ];
      }
    };
    this.setUpgradeTips = (tower)=>{
      if(!tower) return;
      const rateLvl = tower.rateLevel||0;
      const nextRate = Math.min(3, rateLvl+1);
      const rateCosts = [UPGRADE_COSTS.rateModule, Math.round(UPGRADE_COSTS.rateModule*1.5), Math.round(UPGRADE_COSTS.rateModule*2.0)];
      const nextRateCost = rateLvl<3 ? rateCosts[rateLvl] : null;
      this.tipText.rate.lines = [
        `Level: ${rateLvl}/3`,
        rateLvl<3 ? `Next: ${nextRate}/3 (+20%)` : 'Maxed',
        rateLvl<3 ? `Cost: ${nextRateCost}⚛` : ''
      ].filter(Boolean);
      // Range levels (show X/3 like fire rate)
      const rangeLvl = tower.rangeLevel||0;
      const nextRangeLvl = Math.min(3, rangeLvl+1);
      const rangeCosts = [UPGRADE_COSTS.rangeModule, Math.round(UPGRADE_COSTS.rangeModule*1.5), Math.round(UPGRADE_COSTS.rangeModule*2.0)];
      const nextRangeCost = rangeLvl<3 ? rangeCosts[rangeLvl] : null;
      this.tipText.range.lines = [
        `Level: ${rangeLvl}/3`,
        rangeLvl<3 ? `Next: ${nextRangeLvl}/3 (+15%)` : 'Maxed',
        rangeLvl<3 ? `Cost: ${nextRangeCost}⚛` : ''
      ].filter(Boolean);
      this.tipText.slow.lines = [ tower.hasSlow? 'Installed' : 'Not installed', 'Bullets briefly slow enemies.' ];
      this.tipText.burn.lines = [ tower.hasBurn? 'Installed' : 'Not installed', 'Bullets apply burn over time.' ];
    };
    this.$devOpenShop = document.getElementById('btn-dev-open-shop');
    // Initialize as locked/disabled by default; game unlocks via setAbilityVisible
    if(this.$abilBomb){ this.$abilBomb.disabled = true; this.$abilBomb.classList.add('locked'); this.$abilBomb.textContent = 'Bomb (Locked)'; }
    if(this.$abilOverclock){ this.$abilOverclock.disabled = true; this.$abilOverclock.classList.add('locked'); this.$abilOverclock.textContent = 'Overclock (Locked)'; }
    if(this.$abilCryo){ this.$abilCryo.disabled = true; this.$abilCryo.classList.add('locked'); this.$abilCryo.textContent = 'Cryo (Locked)'; }

    this.listeners = { startWave: [], startGame: [], pause: [], resume: [], retry: [], restart: [], sandboxStart: [], sandboxReset: [], toMenu: [], toMissionSelect: [], selectTowerType: [], upgradeSlow: [], upgradeRate: [], upgradeRange: [], upgradeBurn: [], sellTower: [], sellConfirm: [], sellCancel: [], selectMap: [], toggleFast: [], closeUpg: [], toggleVolume: [], setVolume: [], shopBuy: [], shopReroll: [], shopContinue: [], shopBuyAbility: [], useBomb: [], useOverclock: [], useCryo: [], toggleDev: [], toggleAutoSpeed: [], exitConfirm: [], exitCancel: [], openShop: [], closeShop: [], devUnlockUlts: [], devUpgradeMax: [], mainNew: [], mainLoad: [], mainAssembly: [], loadSlot: [], openAssembly: [], closeAssembly: [], startMission: [], assemblySave: [], assemblyLoad: [], openAssemblyCore: [], menuBack: [], mainSettings: [], mainSettingsBack: [], loadBack: [], loginUser: [], openCreateUser: [], closeCreateUser: [], createUser: [], openLeaderboard: [], closeLeaderboard: [], leaderboardSignIn: [], logout: [], removePassive: [], leaderboardSelectMap: [], pauseLoginOpen: [] };
    // Track dev mode state for UI behavior (e.g., enabling shop buttons and credit label)
    this.devMode = false;
    this.setFragments(0);
    this.setCoreShards(0);
    this.initSandboxValueBindings();

    if(this.$start){
      this.$start.addEventListener('click', ()=> this.emit('startWave'));
    }
    // Main menu buttons
    if(this.$btnMainEndless){
      this.$btnMainEndless.addEventListener('click', ()=>{
        // Endless Cycle: go straight to map select.
        if(this.showMainMenu) this.showMainMenu(false);
        if(this.showMapSelect) this.showMapSelect(true);
        if(this.setMapStartLabel) this.setMapStartLabel('Start Endless Cycle');
      });
    }
    if(this.$btnMapBack){
      this.$btnMapBack.addEventListener('click', ()=>{
        if(this.showMapSelect) this.showMapSelect(false);
        if(this.showMainMenu) this.showMainMenu(true);
      });
    }
    if(this.$btnMapStart){
      this.$btnMapStart.addEventListener('click', ()=>{
        if(this.showMapSelect) this.showMapSelect(false);
        this.emit('startGame');
      });
    }
    if(this.$btnMainLeaderboard){ this.$btnMainLeaderboard.addEventListener('click', ()=> this.emit('openLeaderboard')); }
    if(this.$btnMainAssembly){ this.$btnMainAssembly.addEventListener('click', ()=> this.emit('mainAssembly')); }
    if(this.$btnMainSandbox){
      this.$btnMainSandbox.addEventListener('click', ()=>{
        this.emit('mainSandbox');
      });
    }
    if(this.$btnMainLoadUser){ this.$btnMainLoadUser.addEventListener('click', ()=> this.emit('mainLoad')); }
    if(this.$btnMainSettings){ this.$btnMainSettings.addEventListener('click', ()=> this.emit('mainSettings')); }
    if(this.$btnLoadBack){ this.$btnLoadBack.addEventListener('click', ()=> this.emit('loadBack')); }
    // Legacy slot buttons (load profiles by slot) are no longer used.
    if(this.$pause){
      this.$pause.addEventListener('click', ()=>{
        const label = (this.$pause.textContent||'').toLowerCase();
        if(label.includes('resume')) this.emit('resume');
        else this.emit('pause');
      });
    }
    if(this.$pauseMission){
      this.$pauseMission.addEventListener('click', ()=> this.emit('toMissionSelect'));
    }
    if(this.$fast){ this.$fast.addEventListener('click', ()=> this.emit('toggleFast')); }
    if(this.$btnPauseLogin){
      this.$btnPauseLogin.addEventListener('click', ()=>{
        if(this.showPauseLogin) this.showPauseLogin(true);
        this.emit('pauseLoginOpen');
      });
    }
    if(this.$towerBtns && this.$towerBtns.length){
      this.$towerBtns.forEach(btn=> btn.addEventListener('click', ()=>{
        const key = btn.dataset.tower;
        this.highlightTowerBtn(key);
        this.emit('selectTowerType', key);
      }));
    }
    // Assembly War: mission actions
    if(this.$btnAssembly){ this.$btnAssembly.addEventListener('click', ()=> this.emit('mainAssembly')); }
    if(this.$btnAssemblyBack){ this.$btnAssemblyBack.addEventListener('click', ()=> this.emit('closeAssembly')); }
    if(this.$btnAssemblyMain){ this.$btnAssemblyMain.addEventListener('click', ()=> this.emit('assemblyMainMenu')); }
    if(this.$btnAssemblyCore){ this.$btnAssemblyCore.addEventListener('click', ()=> this.emit('openAssemblyCore')); }
    if(this.$missionCards && this.$missionCards.length){
      this.$missionCards.forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const id = parseInt(btn.dataset.mission||'0', 10)||0;
          if(id>0) this.emit('startMission', id);
        });
      });
    }
    if(this.$menuStart){ this.$menuStart.addEventListener('click', ()=> this.emit('startGame')); }
    if(this.$resume){ this.$resume.addEventListener('click', ()=> this.emit('resume')); }
    if(this.$pauseMenu){ this.$pauseMenu.addEventListener('click', ()=> this.emit('toMenu')); }
    if(this.$pauseRestart){ this.$pauseRestart.addEventListener('click', ()=> this.emit('restart')); }
    if(this.$btnSettings){ this.$btnSettings.addEventListener('click', ()=> this.showSettings(true)); }
    if(this.$btnSettingsBack){ this.$btnSettingsBack.addEventListener('click', ()=> this.showSettings(false)); }
    if(this.$volSlider){ this.$volSlider.addEventListener('input', ()=> this.emit('setVolume', parseInt(this.$volSlider.value,10)||0)); }
    if(this.$retry){ this.$retry.addEventListener('click', ()=> this.emit('retry')); }
    if(this.$overMenu){ this.$overMenu.addEventListener('click', ()=> this.emit('toMenu')); }
    if(this.$sandboxSettings){ this.$sandboxSettings.addEventListener('click', ()=> this.emit('sandboxOpen')); }
    // Sandbox overlay buttons
    if(this.$sandboxBack){
      this.$sandboxBack.addEventListener('click', ()=>{
        if(this.$sandbox) this.$sandbox.classList.remove('visible');
        if(this.showMainMenu) this.showMainMenu(true);
      });
    }
    if(this.$sandboxReset){ this.$sandboxReset.addEventListener('click', ()=> this.emit('sandboxReset')); }
    if(this.$sandboxStart){ this.$sandboxStart.addEventListener('click', ()=> this.emit('sandboxStart')); }
    // Main menu settings controls
    if(this.$volSliderMain){ this.$volSliderMain.addEventListener('input', ()=> this.emit('setVolume', parseInt(this.$volSliderMain.value,10)||0)); }
    const $btnMainSettingsBack = document.getElementById('btn-main-settings-back');
    if($btnMainSettingsBack){ $btnMainSettingsBack.addEventListener('click', ()=> this.emit('mainSettingsBack')); }
    // Abilities
    if(this.$abilBomb){ this.$abilBomb.addEventListener('click', ()=> this.emit('useBomb')); }
    if(this.$abilOverclock){ this.$abilOverclock.addEventListener('click', ()=> this.emit('useOverclock')); }
    if(this.$abilCryo){ this.$abilCryo.addEventListener('click', ()=> this.emit('useCryo')); }

    // Upgrade actions
    if(this.$upgSlow){ this.$upgSlow.addEventListener('click', ()=> this.emit('upgradeSlow')); this.$upgSlow.removeAttribute('title'); }
    if(this.$upgRate){ this.$upgRate.addEventListener('click', ()=> this.emit('upgradeRate')); this.$upgRate.removeAttribute('title'); }
    if(this.$upgRange){ this.$upgRange.addEventListener('click', ()=> this.emit('upgradeRange')); this.$upgRange.removeAttribute('title'); }
    if(this.$upgBurn){ this.$upgBurn.addEventListener('click', ()=> this.emit('upgradeBurn')); this.$upgBurn.removeAttribute('title'); }
    if(this.$upgClose){ this.$upgClose.addEventListener('click', ()=> this.emit('closeUpg')); }
    const $upgMax = document.getElementById('btn-upg-max');
    if($upgMax){ $upgMax.addEventListener('click', ()=> this.emit('devUpgradeMax')); }
    if(this.$sell){ this.$sell.addEventListener('click', ()=> this.emit('sellTower')); }
    if(this.$sellConfirm){ this.$sellConfirm.addEventListener('click', ()=> this.emit('sellConfirm')); }
    if(this.$sellCancel){ this.$sellCancel.addEventListener('click', ()=> this.emit('sellCancel')); }
    // Shop events
    if(this.$shopReroll){ this.$shopReroll.addEventListener('click', ()=> this.emit('shopReroll')); }
    if(this.$shopContinue){ this.$shopContinue.addEventListener('click', ()=> this.emit('shopContinue')); }
    if(this.$shopClose){ this.$shopClose.addEventListener('click', ()=> this.emit('closeShop')); }
    if(this.$shopDevUnlockUlts){ this.$shopDevUnlockUlts.addEventListener('click', ()=> this.emit('devUnlockUlts')); }
    // Login submit
    if(this.$loginUser){
      this.$loginUser.addEventListener('click', ()=>{
        if(this.isSignedIn){
          this.emit('logout', { source:'login' });
          return;
        }
        const payload = {
          username: this.$loginUsername ? (this.$loginUsername.value||'').trim() : '',
          password: this.$loginPassword ? (this.$loginPassword.value||'') : ''
        };
        this.emit('loginUser', payload);
      });
    }
    // Allow Enter key to submit login (main overlay)
    const handleLoginEnter = (e)=>{
      if(e.key === 'Enter'){
        e.preventDefault();
        if(this.$loginUser) this.$loginUser.click();
      }
    };
    if(this.$loginUsername){ this.$loginUsername.addEventListener('keydown', handleLoginEnter); }
    if(this.$loginPassword){ this.$loginPassword.addEventListener('keydown', handleLoginEnter); }
    // Pause-menu login submit
    if(this.$pauseLoginSubmit){
      this.$pauseLoginSubmit.addEventListener('click', ()=>{
        if(this.isSignedIn){
          this.emit('logout', { source:'login' });
          return;
        }
        const payload = {
          username: this.$pauseLoginUsername ? (this.$pauseLoginUsername.value||'').trim() : '',
          password: this.$pauseLoginPassword ? (this.$pauseLoginPassword.value||'') : ''
        };
        this.emit('loginUser', payload);
      });
    }
    const handlePauseLoginEnter = (e)=>{
      if(e.key === 'Enter'){
        e.preventDefault();
        if(this.$pauseLoginSubmit) this.$pauseLoginSubmit.click();
      }
    };
    if(this.$pauseLoginUsername){ this.$pauseLoginUsername.addEventListener('keydown', handlePauseLoginEnter); }
    if(this.$pauseLoginPassword){ this.$pauseLoginPassword.addEventListener('keydown', handlePauseLoginEnter); }
    if(this.$pauseLoginBack){
      this.$pauseLoginBack.addEventListener('click', ()=>{
        if(this.showPauseLogin) this.showPauseLogin(false);
      });
    }
    if(this.$loginCreate){ this.$loginCreate.addEventListener('click', ()=> this.emit('openCreateUser')); }
    if(this.$createSubmit){
      this.$createSubmit.addEventListener('click', ()=>{
        const payload = {
          username: this.$createUsername ? (this.$createUsername.value||'').trim() : '',
          password: this.$createPassword ? (this.$createPassword.value||'') : '',
          confirm: this.$createConfirm ? (this.$createConfirm.value||'') : ''
        };
        this.emit('createUser', payload);
      });
    }
    if(this.$createBack){ this.$createBack.addEventListener('click', ()=> this.emit('closeCreateUser')); }
    if(this.$btnLeaderboardBack){ this.$btnLeaderboardBack.addEventListener('click', ()=> this.emit('closeLeaderboard')); }
    if(this.$btnLeaderboardSignIn){
      this.$btnLeaderboardSignIn.addEventListener('click', ()=>{
        if(this.isSignedIn){
          this.emit('logout', { source:'leaderboard' });
        } else {
          this.emit('leaderboardSignIn');
        }
      });
    }
    if(this.$devOpenShop){ this.$devOpenShop.addEventListener('click', ()=> this.emit('openShop')); }
    // Dev toggles (main settings only)
    this.$devToggleMain = document.getElementById('dev-toggle-main');
    const onDevChange = (src)=>{
      const v = !!src.checked;
      if(this.$devToggleMain && this.$devToggleMain!==src) this.$devToggleMain.checked = v;
      this.emit('toggleDev', v);
    };
    if(this.$devToggleMain){ this.$devToggleMain.addEventListener('change', ()=> onDevChange(this.$devToggleMain)); }

    // Automatic speed control toggle (main settings + in-game settings)
    const onAutoSpeedChange = (src)=>{
      const v = !!src.checked;
      if(this.$autoSpeedMain && this.$autoSpeedMain!==src) this.$autoSpeedMain.checked = v;
      if(this.$autoSpeed && this.$autoSpeed!==src) this.$autoSpeed.checked = v;
      this.emit('toggleAutoSpeed', v);
    };
    if(this.$autoSpeedMain){ this.$autoSpeedMain.addEventListener('change', ()=> onAutoSpeedChange(this.$autoSpeedMain)); }
    if(this.$autoSpeed){ this.$autoSpeed.addEventListener('change', ()=> onAutoSpeedChange(this.$autoSpeed)); }

    // Exit confirmation buttons
    if(this.$exitCancel){ this.$exitCancel.addEventListener('click', ()=> this.emit('exitCancel')); }
    if(this.$exitConfirmBtn){ this.$exitConfirmBtn.addEventListener('click', ()=> this.emit('exitConfirm')); }

    // Build map carousel in the menu (full-width selector)
    this.$mapList = document.getElementById('map-list');
    this.$mapDesc = document.getElementById('map-desc');
    this.$mapDots = document.getElementById('map-dots');
    this.$mapTitle = document.getElementById('map-title');
    this.$mapCanvas = null;
    this.selectedMapKey = MAPS[0].key;
    const renderMenuMap = ()=>{
      const m = MAPS.find(x=>x.key===this.selectedMapKey) || MAPS[0];
      if(this.$mapDesc) this.$mapDesc.textContent = m?.desc || '';
      if(this.$mapCanvas){ drawMapPreview(this.$mapCanvas, m); }
      if(this.$mapTitle) this.$mapTitle.textContent = m?.name || '';
      if(this.$mapDots){
        this.$mapDots.innerHTML = '';
        MAPS.forEach((map, idx)=>{
          const dot = document.createElement('span');
          dot.className = 'map-dot' + (map.key===this.selectedMapKey ? ' active' : '');
          dot.addEventListener('click', ()=>{
            this.selectedMapKey = map.key;
            renderMenuMap();
            this.emit('selectMap', this.selectedMapKey);
          });
          this.$mapDots.appendChild(dot);
        });
      }
    };
    if(this.$mapList){
      this.$mapList.innerHTML = '';
      this.$mapList.classList.add('map-carousel');
      const prev = document.createElement('button'); prev.className='map-nav prev'; prev.textContent = '◀';
      const next = document.createElement('button'); next.className='map-nav next'; next.textContent = '▶';
      const center = document.createElement('div'); center.className='map-center';
      const title = document.createElement('div'); title.className='map-title'; title.id = 'map-title';
      const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 236; canvas.id='map-canvas';
      const dots = document.createElement('div'); dots.className='map-dots'; dots.id='map-dots';
      center.appendChild(title);
      center.appendChild(canvas);
      center.appendChild(dots);
      this.$mapList.appendChild(prev);
      this.$mapList.appendChild(center);
      this.$mapList.appendChild(next);
      this.$mapCanvas = canvas; this.$mapTitle = title; this.$mapDots = dots;
      const step = (dir)=>{
        const idx = MAPS.findIndex(x=>x.key===this.selectedMapKey);
        const n = MAPS.length;
        const ni = (idx + dir + n) % n;
        this.selectedMapKey = MAPS[ni].key;
        renderMenuMap();
        this.emit('selectMap', this.selectedMapKey);
      };
      prev.addEventListener('click', ()=> step(-1));
      next.addEventListener('click', ()=> step(1));
      renderMenuMap();
    }

    // Leaderboard map carousel uses its own DOM nodes (placed above the leaderboard panel)
    this.lbMapIdx = 0;
    this.selectedLbMapKey = this.lbMaps[0]?.key;
    this.$lbMapList = document.getElementById('lb-map-list');
    this.$lbMapDesc = document.getElementById('lb-map-desc');
    this.$lbMapCanvas = document.getElementById('lb-map-canvas');
    this.$lbMapTitle = document.getElementById('lb-map-title');
    if(this.$lbMapList){
      this.$lbMapList.innerHTML = '';
      this.$lbMapList.classList.add('map-carousel');
      const prev = document.createElement('button'); prev.className='map-nav prev'; prev.textContent = '◀';
      const next = document.createElement('button'); next.className='map-nav next'; next.textContent = '▶';
      const center = document.createElement('div'); center.className='map-center';
      const title = this.$lbMapTitle || document.createElement('div'); title.className='map-title'; title.id = title.id || 'lb-map-title';
      const canvas = this.$lbMapCanvas || document.createElement('canvas'); canvas.width = 340; canvas.height = 190; canvas.id = canvas.id || 'lb-map-canvas';
      center.appendChild(title);
      center.appendChild(canvas);
      this.$lbMapList.appendChild(prev);
      this.$lbMapList.appendChild(center);
      this.$lbMapList.appendChild(next);
      this.$lbMapCanvas = canvas; this.$lbMapTitle = title;
      const renderLb = ()=>{
        const m = this.lbMaps[this.lbMapIdx] || this.lbMaps[0];
        if(!m) return;
        this.selectedLbMapKey = m.key;
        if(this.$lbMapTitle) this.$lbMapTitle.textContent = m.name || '';
        if(this.$lbMapCanvas) drawMapPreview(this.$lbMapCanvas, m);
        if(this.$lbMapDesc) this.$lbMapDesc.textContent = m.desc || '';
        this.emit('leaderboardSelectMap', m.key);
      };
      const stepLb = (dir)=>{
        const n = this.lbMaps.length || 1;
        this.lbMapIdx = ((this.lbMapIdx + dir) % n + n) % n;
        renderLb();
      };
      prev.addEventListener('click', ()=> stepLb(-1));
      next.addEventListener('click', ()=> stepLb(1));
      renderLb();
    }
  }

  on(event, fn){
    if(!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  emit(event, payload){
    const arr = this.listeners[event];
    if(!Array.isArray(arr)) return;
    for(const fn of arr){
      try{ fn(payload); }
      catch(e){
        if(typeof console !== 'undefined' && console && typeof console.error === 'function'){
          console.error(e);
        }
      }
    }
  }

  setWave(n){
    if(this.$wave) this.$wave.textContent = `Wave: ${n}`;
    if(this.$waveCurrent) this.$waveCurrent.textContent = n;
  }
  setBestWave(n){
    if(this.$waveBest) this.$waveBest.textContent = n;
  }
  setPerfectCombo(n){
    if(this.$perfectCombo) this.$perfectCombo.textContent = n;
  }
  setPerfectBest(n){
    if(this.$perfectBest) this.$perfectBest.textContent = n;
  }
  resetBannerFeed(){
    if(!this.$bannerFeed) return;
    this.$bannerFeed.innerHTML = '<div class="banner-empty">Status messages will appear here.</div>';
  }
  pushBannerMessage({ text='', subtext=null, color=null }={}){
    if(!this.$bannerFeed) return;
    if(this.$bannerFeed.querySelector('.banner-empty')){
      this.$bannerFeed.innerHTML = '';
    }
    const entry = document.createElement('div');
    entry.className = 'banner-entry' + (color ? ` banner-${color}` : '');
    const title = document.createElement('div');
    title.className = 'be-title';
    title.textContent = text;
    entry.appendChild(title);
    if(subtext){
      const sub = document.createElement('div');
      sub.className = 'be-sub';
      sub.textContent = subtext;
      entry.appendChild(sub);
    }
    this.$bannerFeed.prepend(entry);
    const maxItems = 6;
    while(this.$bannerFeed.childElementCount > maxItems){
      this.$bannerFeed.removeChild(this.$bannerFeed.lastElementChild);
    }
  }
  setCredits(n){
    if(!this.$credits) return;
    const label = this.devMode ? '∞' : String(Math.max(0, n|0));
    this.$credits.textContent = label;
  }
  setFragments(n){
    if(!this.$fragments) return;
    const label = this.devMode ? '∞' : String(Math.max(0, n|0));
    this.$fragments.textContent = label;
  }
  setCoreShards(n){
    if(!this.$cores) return;
    const label = this.devMode ? '∞' : String(Math.max(0, n|0));
    this.$cores.textContent = label;
  }
  setLives(n){
    this.$lives.textContent = `HP: ${n}`;
    if(this.$hpFill){
      const base = this.maxLives || (GAME_RULES.startingLives||30);
      const pct = Math.max(0, Math.min(1, n / base));
      this.$hpFill.style.width = `${pct*100}%`;
      // Smoothly blend bar color from accent (green) to danger (red)
      const accent = COLORS.accent || '#17e7a4';
      const danger = COLORS.danger || '#ff5370';
      const t = 1 - pct; // 0 => green, 1 => red
      const hexToRgb = (h)=>{ const n=parseInt(h.slice(1),16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255}; };
      const rgbToHex = ({r,g,b})=>{ const n=(r<<16)|(g<<8)|b; return '#'+n.toString(16).padStart(6,'0'); };
      const mix = (a,b,u)=>({ r:Math.round(a.r+(b.r-a.r)*u), g:Math.round(a.g+(b.g-a.g)*u), b:Math.round(a.b+(b.b-a.b)*u) });
      const col = rgbToHex(mix(hexToRgb(accent), hexToRgb(danger), t));
      this.$hpFill.style.background = `linear-gradient(90deg, ${col}, ${col})`;
      this.$hpFill.style.boxShadow = `inset 0 0 10px rgba(${parseInt(col.slice(1,3),16)}, ${parseInt(col.slice(3,5),16)}, ${parseInt(col.slice(5,7),16)}, 0.45)`;
      this.$hpFill.classList.remove('low');
    }
  }
  setMaxLives(max){ this.maxLives = Math.max(1, max|0); this.setLives(this.maxLives); }

  
  setStartEnabled(v){ this.$start.disabled = !v; }
  setPauseLabel(text){
    if(!this.$pause) return;
    const lower = String(text||'').toLowerCase();
    const isResume = lower.includes('resume') || lower.includes('play');
    // Use emoji icons for play/pause
    const label = isResume ? '▶️' : '⏸';
    this.$pause.textContent = label;
    this.$pause.dataset.state = isResume ? 'resume' : 'pause';
    this.$pause.setAttribute('aria-label', isResume ? 'Resume' : 'Pause');
  }
  setPauseMissionLabel(text){ if(this.$pauseMission) this.$pauseMission.textContent = text; }
  setFastLabel(mult){
    const label = `x${mult}`;
    if(this.$fastLabel){
      this.$fastLabel.textContent = label;
    } else if(this.$fast){
      this.$fast.textContent = `▸▸ ${label}`;
    }
  }
  setVolumeLabel(text){
    const v = text.replace('Volume: ','');
    if(this.$volLabel) this.$volLabel.textContent = v;
    if(this.$volLabelMain) this.$volLabelMain.textContent = v;
  }
  setVolumeSlider(pct){
    const val = String(Math.max(0, Math.min(100, pct|0)));
    if(this.$volSlider) this.$volSlider.value = val;
    if(this.$volSliderMain) this.$volSliderMain.value = val;
  }
  setAutoSpeedUI(on){
    const v = !!on;
    if(this.$autoSpeedMain) this.$autoSpeedMain.checked = v;
    if(this.$autoSpeed) this.$autoSpeed.checked = v;
  }
  setSandboxSettingsVisible(on){
    if(this.$sandboxSettings){
      this.$sandboxSettings.style.display = on ? 'inline-flex' : 'none';
    }
  }
  setMapStartLabel(text){
    if(this.$btnMapStart && typeof text === 'string'){
      this.$btnMapStart.textContent = text;
    }
  }
  initSandboxValueBindings(){
    if(typeof document === 'undefined') return;
    const defs = [
      ['sb-enemyhp','sb-enemyhp-val','mul'],
      ['sb-enemyspeed','sb-enemyspeed-val','mul'],
      ['sb-wavesize','sb-wavesize-val','mul'],
      ['sb-spacing','sb-spacing-val','mul'],
      ['sb-dmg','sb-dmg-val','mul'],
      ['sb-firerate','sb-firerate-val','mul'],
      ['sb-range','sb-range-val','mul'],
      ['sb-slow','sb-slow-val','mul'],
      ['sb-burndps','sb-burndps-val','mul'],
      ['sb-burndur','sb-burndur-val','mul'],
      ['sb-puddledps','sb-puddledps-val','mul'],
      ['sb-puddledur','sb-puddledur-val','mul'],
      ['sb-credits','sb-credits-val','mul'],
      ['sb-frags','sb-frags-val','mul'],
      ['sb-flatcredits','sb-flatcredits-val','int'],
    ];
    const fmt = (v, kind)=>{
      const num = parseFloat(v);
      if(!Number.isFinite(num)) return kind === 'int' ? '0' : '1.0×';
      if(kind === 'int') return String(Math.round(num));
      return `${num.toFixed(1)}×`;
    };
    for(const [id, valId, kind] of defs){
      const input = document.getElementById(id);
      const label = document.getElementById(valId);
      if(!input || !label) continue;
      const sync = ()=>{ label.textContent = fmt(input.value, kind); };
      input.addEventListener('input', sync);
      sync();
    }
  }
  showExitConfirm(show, mode='exit'){
    this.show(this.$exitConfirm, show);
    if(!show) return;
    const kind = mode === 'restart' ? 'restart' : 'exit';
    if(this.$exitTitle){
      this.$exitTitle.textContent = (kind === 'restart') ? 'Restart Run?' : 'Exit to Main Menu?';
    }
    if(this.$exitTag){
      this.$exitTag.textContent = (kind === 'restart')
        ? 'Are you sure you want to restart?'
        : 'Your current run will be lost.';
    }
    if(this.$exitConfirmBtn){
      this.$exitConfirmBtn.textContent = (kind === 'restart') ? 'Restart' : 'Exit';
    }
  }

  setLoadHeading(title, tag){
    if(this.$loadTitle && typeof title==='string') this.$loadTitle.textContent = title;
    if(this.$loadTag && typeof tag==='string') this.$loadTag.textContent = tag;
  }
  setLoadSlotMeta(slot, text){
    // Legacy: no-op now that slots have been replaced by login.
    if(!this.$loadSlots || !this.$loadSlots.length) return;
  }

  // Login helpers
  setLoginStatus(message, ok=true){
    const color = ok ? (COLORS.accent || '#17e7a4') : (COLORS.danger || '#ff5370');
    if(this.$loginStatus){
      this.$loginStatus.textContent = message || '';
      this.$loginStatus.style.color = color;
    }
    if(this.$pauseLoginStatus){
      this.$pauseLoginStatus.textContent = message || '';
      this.$pauseLoginStatus.style.color = color;
    }
  }
  clearLoginForm(){
    if(this.$loginUsername) this.$loginUsername.value = '';
    if(this.$loginPassword) this.$loginPassword.value = '';
    if(this.$pauseLoginUsername) this.$pauseLoginUsername.value = '';
    if(this.$pauseLoginPassword) this.$pauseLoginPassword.value = '';
    this.setLoginStatus('');
  }
  setCreateStatus(message, ok=true){
    if(!this.$createStatus) return;
    this.$createStatus.textContent = message || '';
    this.$createStatus.style.color = ok ? (COLORS.accent || '#17e7a4') : (COLORS.danger || '#ff5370');
  }
  clearCreateForm(){
    if(this.$createUsername) this.$createUsername.value = '';
    if(this.$createPassword) this.$createPassword.value = '';
    if(this.$createConfirm) this.$createConfirm.value = '';
    this.setCreateStatus('');
  }

  // Render passive slots layout
  renderPassivePanel(state){
    if(!this.$passiveLines) return;
    const capacity = state?.capacity || 4;
    // Toggle compact class when expanded to 5-6 slots to reduce scrolling
    if(this.$passivePanel){
      this.$passivePanel.classList.toggle('compact', capacity > 4);
    }
    const slots = Array.isArray(state?.slots) ? state.slots.slice(0, capacity) : [];
    this.$passiveLines.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'pp-meta';
    const used = slots.filter(Boolean).length;
    header.textContent = `Nano-Tech Upgrades: ${used}/${capacity}`;
    this.$passiveLines.appendChild(header);
    const scroll = document.createElement('div');
    scroll.className = 'passive-slot-scroll';
    const grid = document.createElement('div');
    grid.className = 'passive-slot-grid';
    for(let i=0;i<capacity;i++){
      const data = slots[i] || null;
      const tier = (data && data.tier) || 'common';
      const card = document.createElement('div');
      card.className = `passive-slot tier-${tier}` + (data ? ' filled' : '');
      if(data){
        const tierBadge = document.createElement('div');
        tierBadge.className = 'slot-tier-badge tier-' + tier;
        tierBadge.textContent = tier==='super' ? 'Super Rare' : (tier==='rare' ? 'Rare' : 'Common');
        card.appendChild(tierBadge);
        const name = document.createElement('div');
        name.className = 'slot-name';
        name.textContent = data.name || 'Nano-Tech Upgrade';
        card.appendChild(name);
        if(data.desc){
          const desc = document.createElement('div');
          desc.className = 'slot-desc';
          desc.textContent = data.desc;
          card.appendChild(desc);
        }
        const refund = document.createElement('button');
        refund.className = 'slot-refund';
        const refundLabel = Math.max(0, data.refund|0);
        refund.textContent = `Recycle ${refundLabel>0?`⟐${refundLabel}`:'⟐0'}`;
        refund.addEventListener('click', (e)=>{
          e.stopPropagation();
          this.emit('removePassive', data.key);
        });
        card.appendChild(refund);
      } else {
        const empty = document.createElement('div');
        empty.className = 'slot-empty';
        empty.textContent = 'Empty Nano-Tech Slot';
        card.appendChild(empty);
      }
      grid.appendChild(card);
    }
    scroll.appendChild(grid);
    this.$passiveLines.appendChild(scroll);
  }

  setCombatStats({ baseDamage=0, crit=0, critDmg=0, slow=0, burn=0, targeting=0 }={}){
    const fmt = (v)=> {
      const pct = Math.max(0, v*100);
      return `+${Math.round(pct)}%`;
    };
    if(this.$statBaseDmg) this.$statBaseDmg.textContent = fmt(baseDamage);
    if(this.$statCrit) this.$statCrit.textContent = fmt(crit);
    if(this.$statCritDmg) this.$statCritDmg.textContent = fmt(critDmg);
    if(this.$statSlow) this.$statSlow.textContent = fmt(slow);
    if(this.$statBurn) this.$statBurn.textContent = fmt(burn);
    if(this.$statTarget) this.$statTarget.textContent = fmt(targeting);
  }

  // Show/hide the wave status; label is fixed to "Wave in progress"
  setWaveStatus(show){
    if(!this.$waveStatus) return;
    // Always visible; dim when inactive
    this.$waveStatus.style.display = 'inline-flex';
    this.$waveStatus.classList.toggle('inactive', !show);
  }

  // Update the wave status label with remaining enemies
  setWaveRemaining(rem, total){
    if(!this.$waveStatusLabel) return;
    const r = Math.max(0, rem|0);
    if(total && total>0){
      this.$waveStatusLabel.textContent = `Enemies remaining: ${r}`;
    } else {
      // No active wave configured; show a ready state
      this.$waveStatusLabel.textContent = r>0 ? `Enemies remaining: ${r}` : 'Wave ready';
    }
  }

  // 0..1 remaining fraction for the shrinking bar
  setWaveProgress(rem){
    if(!this.$waveBarFill) return;
    const v = Math.max(0, Math.min(1, rem));
    this.$waveBarFill.style.width = `${Math.round(v*100)}%`;
  }

  highlightTowerBtn(key){
    if(!this.$towerBtns) return;
    for(const b of this.$towerBtns){ b.classList.toggle('selected', b.dataset.tower===key); }
  }

  // Assembly War: unlock missions up to a given id (1-based)
  setMissionUnlock(maxId){
    if(!this.$missionCards || !this.$missionCards.length) return;
    const level = Math.max(1, maxId|0);
    for(const card of this.$missionCards){
      const id = parseInt(card.dataset.mission||'0', 10)||0;
      if(id && id <= level){
        card.classList.remove('locked');
        card.disabled = false;
      } else if(id){
        card.classList.add('locked');
        card.disabled = true;
      }
    }
  }

  show(el, show){ if(!el) return; el.classList.toggle('visible', !!show); }
  showMainMenu(show){
    const isVisible = (show === undefined)
      ? !!(this.$mainMenu && this.$mainMenu.classList.contains('visible'))
      : !!show;
    if(this.$mainMenu) this.$mainMenu.classList.toggle('visible', isVisible);
    document.body.classList.toggle('mainmenu-visible', isVisible);
  }
  showLoadMenu(show){
    if(this.$loadMenu) this.$loadMenu.classList.toggle('visible', !!show);
    if(show && this.$createMenu) this.$createMenu.classList.remove('visible');
    this.updateModalMask();
  }
  showCreateMenu(show){
    if(this.$createMenu) this.$createMenu.classList.toggle('visible', !!show);
    if(show && this.$loadMenu) this.$loadMenu.classList.remove('visible');
    this.updateModalMask();
  }
  updateModalMask(){
    if(!this.$root) return;
    const loadVisible = this.$loadMenu && this.$loadMenu.classList.contains('visible');
    const createVisible = this.$createMenu && this.$createMenu.classList.contains('visible');
    const boardVisible = this.$leaderboard && this.$leaderboard.classList.contains('visible');
    const mapSelVisible = this.$mapOverlay && this.$mapOverlay.classList.contains('visible');
    const assemblyVisible = this.$assembly && this.$assembly.classList.contains('visible');
    const modalActive = !!(loadVisible || createVisible || boardVisible || mapSelVisible || assemblyVisible);
    this.$root.classList.toggle('modal-overlay', modalActive);
    const menuVisible = this.$mainMenu && this.$mainMenu.classList.contains('visible');
    document.body.classList.toggle('mainmenu-visible', modalActive || menuVisible);
  }
  showLeaderboard(show){
    if(this.$leaderboard) this.$leaderboard.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showMainSettings(show){ if(this.$mainSettings) this.$mainSettings.classList.toggle('visible', !!show); }
  showMenu(show){ this.show(this.$menu, show); }
  showAssembly(show){
    if(this.$assembly) this.$assembly.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showMapSelect(show){
    if(this.$mapOverlay) this.$mapOverlay.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showPause(show){
    this.show(this.$pauseOverlay, show);
    if(show){
      this.showSettings(false);
      if(this.showPauseLogin) this.showPauseLogin(false);
    }
  }
  showSettings(show){
    if(!this.$settingsPanel) return;
    this.$settingsPanel.style.display = show? 'block' : 'none';
    if(show && this.$pauseLoginPanel){
      this.$pauseLoginPanel.style.display = 'none';
    }
    if(this.$pauseActions) this.$pauseActions.style.display = show? 'none' : 'flex';
  }
  showPauseLogin(show){
    if(!this.$pauseLoginPanel) return;
    this.$pauseLoginPanel.style.display = show ? 'block' : 'none';
    if(show && this.$settingsPanel){
      this.$settingsPanel.style.display = 'none';
    }
    if(this.$pauseActions) this.$pauseActions.style.display = show ? 'none' : 'flex';
    if(show && this.$pauseLoginUsername){
      try{ this.$pauseLoginUsername.focus(); }catch(e){}
    }
  }
  showGameOver(show){ this.show(this.$gameover, show); }
  showSell(show, text){ if(this.$sellText && typeof text==='string') this.$sellText.textContent = text; this.show(this.$sellOverlay, show); }
  showSell(show, text){ if(this.$sellText && typeof text==='string') this.$sellText.textContent = text; this.show(this.$sellOverlay, show); }
  showShop(show){ this.show(this.$shop, show); }
  showSandbox(show){ this.show(this.$sandbox, show); }
  setLeaderboard(entries=[]){
    if(!this.$leaderboardList) return;
    this.$leaderboardList.innerHTML = '';
    if(!entries || !entries.length){
      const li = document.createElement('li');
      li.style.justifyContent = 'center';
      li.textContent = 'No entries yet.';
      this.$leaderboardList.appendChild(li);
      return;
    }
    entries.forEach((entry, idx)=>{
      const li = document.createElement('li');
      const badge = document.createElement('div');
      badge.className = 'rank-glow';
      badge.textContent = `#${idx+1}`;
      li.appendChild(badge);
      const nameWrap = document.createElement('div');
      nameWrap.className = 'rank-name';
      const name = document.createElement('span');
      name.className = 'rank';
      name.textContent = entry.username || 'Unknown Operative';
      nameWrap.appendChild(name);
      const waves = document.createElement('span');
      waves.className = 'waves';
      const perfect = Math.max(0, entry.perfectCombo || 0);
      const parts = [`${entry.waves ?? 0} waves`];
      parts.push(`Perfect Combo ${perfect}`);
      waves.textContent = parts.join(' • ');
      nameWrap.appendChild(waves);
      li.appendChild(nameWrap);
      this.$leaderboardList.appendChild(li);
    });
  }
  setLeaderboardStatus(message, ok=true){
    if(!this.$leaderboardStatus) return;
    this.$leaderboardStatus.textContent = message || '';
    this.$leaderboardStatus.style.color = ok ? (COLORS.accent || '#17e7a4') : (COLORS.danger || '#ff5370');
  }
  setLeaderboardMap(key, suppressEmit=false){
    if(!this.lbMaps || !this.lbMaps.length) return;
    const idx = this.lbMaps.findIndex(m=> m.key===key);
    if(idx>=0) this.lbMapIdx = idx;
    const m = this.lbMaps[this.lbMapIdx] || this.lbMaps[0];
    if(m){
      if(this.$lbMapTitle) this.$lbMapTitle.textContent = m.name || '';
      if(this.$lbMapCanvas) drawMapPreview(this.$lbMapCanvas, m);
      this.selectedLbMapKey = m.key;
      if(!suppressEmit) this.emit('leaderboardSelectMap', m.key);
    }
  }
  getLeaderboardMapKey(){
    const m = (this.lbMaps && this.lbMaps[this.lbMapIdx]) || null;
    return m ? m.key : null;
  }

  // Render current shop offers; `offers` = [{name,desc,cost,_purchased}]
  renderShop(offers=[], fragments=0){
    if(!this.$shopItems) return;
    this.$shopItems.innerHTML = '';
    offers.forEach((o, idx)=>{
      const tier = o.tier || 'common';
      const tierLabel = o.tierLabel || (tier==='super' ? 'Super Rare' : (tier==='rare' ? 'Rare' : 'Common'));
      const ownedCount = o.ownedCount || 0;
      const atLimit = !!o.atLimit;
      const card = document.createElement('div');
      card.className = 'shop-card tier-' + tier + (o._purchased? ' purchased' : '');
      const badge = document.createElement('div');
      badge.className = 'tier-tag tier-' + tier;
      badge.textContent = tierLabel;
      card.appendChild(badge);
      const title = document.createElement('h4'); title.textContent = o.name; card.appendChild(title);
      const desc = document.createElement('div'); desc.className='desc'; desc.textContent = o.desc; card.appendChild(desc);
      // Passive abilities: keep ambiguous (no dots). Show Buy, Maxed when capped.
      const max = o.maxLevel || 5; const lvl = Math.max(0, Math.min(max, o.level||0));
      const price = document.createElement('div');
      const showCost = o.slotPassive ? (!atLimit && !o.slotsFull) : (o.cost>0 && lvl<max);
      price.className = 'price' + (showCost ? ' fragments' : '');
      if(showCost){
        price.textContent = `${o.cost}`;
      } else if(o.slotPassive){
        if(o.slotsFull) price.textContent = 'No Slots';
        else if(atLimit) price.textContent = 'Max Stacks';
        else price.textContent = ownedCount>0 ? `Installed ×${ownedCount}` : 'Installed';
      } else {
        price.textContent = (lvl>=max ? 'Maxed' : 'Free');
      }
      card.appendChild(price);
      const btn = document.createElement('button');
      const dev = !!this.devMode;
      let label = (lvl>=max) ? 'Maxed' : 'Buy';
      if(o.slotPassive){
        if(atLimit) label = 'Maxed';
        else if(o.slotsFull) label = 'No Slots';
        else label = ownedCount>0 ? 'Stack +1' : 'Install';
      } else if(o.uniqueOwned){
        label = 'Unlocked';
      }
      btn.textContent = label;
      const currencyBlocked = (!dev && (o.cost>fragments));
      btn.disabled = (lvl>=max) || !!o._purchased || (o.slotPassive && (o.slotsFull || atLimit)) || (!!o.uniqueOwned && !o.slotPassive) || currencyBlocked;
      btn.addEventListener('click', ()=> this.emit('shopBuy', idx));
      card.appendChild(btn);
      this.$shopItems.appendChild(card);
    });
  }

  setShopRerollEnabled(v){ if(this.$shopReroll) this.$shopReroll.disabled = !v; }

  setRerollPrice(price){
    if(!this.$shopReroll) return;
    const val = Math.max(0, Math.round(price||0));
    this.$shopReroll.textContent = `Reroll (${val}⟐)`;
  }

  // Render ability unlocks at the bottom of the shop
  renderShopAbilities(abilities=[], coreShards=0){
    if(!this.$shopAbilities) return;
    this.$shopAbilities.innerHTML = '';
    for(const a of abilities){
      const max= a.maxLevel || 5; const lvl = Math.max(0, Math.min(max, a.level||0));
      const card = document.createElement('div');
      card.className = 'shop-card' + ((lvl>=max)? ' purchased' : '');
      const title = document.createElement('h4'); title.textContent = a.name; card.appendChild(title);
      const desc = document.createElement('div'); desc.className='desc'; desc.textContent = a.desc; card.appendChild(desc);
      // Preview lines (current -> next)
      if(Array.isArray(a.preview) && a.preview.length){
        for(const line of a.preview){ const d=document.createElement('div'); d.className='desc'; d.textContent = line; card.appendChild(d); }
      }
      const showCost = (lvl<max && a.cost>0);
      const price = document.createElement('div');
      price.className = 'price' + (showCost ? ' cores' : '');
      price.textContent = showCost ? `${a.cost}` : (lvl>=max ? 'Maxed' : 'Free');
      card.appendChild(price);
      const btn = document.createElement('button');
      btn.textContent = (lvl>=max) ? 'Maxed' : (lvl>0 ? 'Upgrade' : 'Unlock');
      const dev = !!this.devMode;
      const needsCurrency = (lvl<max) && (a.cost>0);
      const cannotAfford = needsCurrency && !dev && (a.cost>coreShards);
      btn.disabled = (lvl>=max) || cannotAfford;
      btn.addEventListener('click', ()=> this.emit('shopBuyAbility', a.key));
      // attach dots inside the button
      if(this._setBtnWithDots) this._setBtnWithDots(btn, btn.textContent, lvl, 5);
      card.appendChild(btn);
      this.$shopAbilities.appendChild(card);
    }
  }

  // Dev: show/hide dev-only controls
  setDevModeUI(on){
    this.devMode = !!on;
    if(this.$devOpenShop) this.$devOpenShop.style.display = on? 'inline-block' : 'none';
    if(this.$shopDevActions) this.$shopDevActions.style.display = on? 'flex' : 'none';
    const devRow = document.getElementById('upg-dev-actions');
    if(devRow) devRow.style.display = on? 'flex' : 'none';
    // update toggle UI states in both locations
    if(this.$devToggleMain) this.$devToggleMain.checked = !!on;
    this.setLeaderboardDevWarning(on);
    // Credits label is refreshed by game via setCredits after this call
  }

  setLeaderboardDevWarning(on){
    if(!this.$leaderboardDevWarning) return;
    if(on){
      this.$leaderboardDevWarning.textContent = 'Developer Mode is on — leaderboard scores are disabled.';
      this.$leaderboardDevWarning.classList.add('visible');
    } else {
      this.$leaderboardDevWarning.classList.remove('visible');
    }
  }

  // Helper: set a button label and attach level dots (max provided)
  _setBtnWithDots(btn, label, level, max, opts={} ){
    if(!btn) return;
    btn.textContent = label;
    btn.classList.add('has-dots');
    // remove any existing level-dots inside the button
    if(btn.children && btn.children.length){
      for(let i=btn.children.length-1;i>=0;i--){
        const ch = btn.children[i];
        if(ch && ch.classList && ch.classList.contains('level-dots')) btn.removeChild(ch);
      }
    }
    const dots = document.createElement('div'); dots.className='level-dots';
    for(let i=0;i<max;i++){
      const d=document.createElement('span');
      let cls = 'dot';
      if(i<level){ cls += ' filled'; if(opts.dim) cls += ' dim'; }
      d.className = cls; dots.appendChild(d);
    }
    // place dots inside the button, right-aligned by CSS
    btn.appendChild(dots);
    // make room for dots: compute padding based on count
    const dotW = 8, gap = 4, sidePad = 18; // match CSS
    const needed = dotW*max + gap*(max-1) + sidePad;
    btn.style.paddingRight = `${needed}px`;
  }

  // Ability helpers
  setAbilityVisible(key, show){
    const el = key==='bomb'? this.$abilBomb : key==='overclock'? this.$abilOverclock : key==='cryo'? this.$abilCryo : null;
    const baseLabel = key==='bomb' ? '💣 Bomb' : key==='overclock' ? '⚡ Overclock' : '❄️ Cryo';
    if(!el) return;
    if(show){
      el.classList.remove('locked','active','cooldown','ready');
      // do not force enabled here; updateAbilityUI controls cooldown/ready state
    } else {
      // keep visible but locked/disabled
      el.classList.add('locked');
      el.disabled = true;
      el.textContent = `${baseLabel} (Locked)`;
    }
  }
  setAbilityCooldown(key, ready, seconds, labelOverride=null, activeSeconds=null){
    const el = key==='bomb'? this.$abilBomb : key==='overclock'? this.$abilOverclock : key==='cryo'? this.$abilCryo : null;
    if(!el) return;
    const baseLabel = key==='bomb' ? '💣 Bomb' : key==='overclock' ? '⚡ Overclock' : '❄️ Cryo';
    // Reset shared state classes before applying specific mode
    el.classList.remove('locked','active','cooldown','ready');
    // If ability is currently active, show remaining duration instead of cooldown.
    if(typeof activeSeconds === 'number' && activeSeconds > 0){
      const secs = Math.max(0, activeSeconds);
      el.classList.add('active');
      el.disabled = true;
      el.textContent = `${baseLabel} (Active ${secs.toFixed(1)}s)`;
      return;
    }
    // Consider tiny residuals as ready (avoid flashing 0.0s while enabled)
    const isReady = !!ready || (typeof seconds==='number' && seconds<=0.05);
    if(isReady){
      const stateLabel = labelOverride || 'Ready';
      el.classList.add('ready');
      el.textContent = `${baseLabel} (${stateLabel})`;
      el.disabled = false;
    } else {
      const secs = Math.max(0, Number(seconds)||0);
      el.classList.add('cooldown');
      el.textContent = `${baseLabel} (CD ${secs.toFixed(1)}s)`;
      el.disabled = true;
    }
  }

  setUpgradePanel(tower, credits){
    // Clear any lingering tooltip when the panel content changes
    if(this.clearTip) this.clearTip();
    if(!tower){ this.$upg.classList.add('hidden'); this.$upg.style.display='none'; return; }
    this.$upgName.textContent = tower.name;
    this.$upg.style.display='flex';
    if(this.setUpgradeTips) this.setUpgradeTips(tower);
    // Color-code upgrade controls to match tower base color
    const tint = tower.baseColor || null;
    if(this.$upgIcon){ this.$upgIcon.style.background = tint || 'var(--accent-2)'; this.$upgIcon.style.boxShadow = tint ? `0 0 8px ${tint}` : ''; }
    if(this.$upgTitle){ this.$upgTitle.style.color = tint || 'var(--muted)'; }
    const applyTint = (el)=>{
      if(!el) return;
      if(tint){
        el.style.borderColor = tint;
        el.style.boxShadow = `inset 0 0 0 1px ${tint}`;
      } else {
        el.style.borderColor = '';
        el.style.boxShadow = '';
      }
    };
    applyTint(this.$upgSlow);
    applyTint(this.$upgRate);
    applyTint(this.$upgRange);
    applyTint(this.$upgBurn);
    // Update button labels and states
    if(tower.hasSlow){ this.$upgSlow.textContent = 'Slow Module'; this.$upgSlow.disabled = true; }
    else { this.$upgSlow.textContent = `Install Slow Module (${UPGRADE_COSTS.slowModule})`; this.$upgSlow.disabled = false; }
    // Dot row: binary (0/1) — dim when installed
    if(this._setBtnWithDots) this._setBtnWithDots(this.$upgSlow, this.$upgSlow.textContent, tower.hasSlow?1:0, 1, { dim: tower.hasSlow });
    // Rate (0..3)
    const rateLvl = tower.rateLevel || 0;
    const rateCosts = [UPGRADE_COSTS.rateModule, Math.round(UPGRADE_COSTS.rateModule*1.5), Math.round(UPGRADE_COSTS.rateModule*2.0)];
    if(rateLvl>=3){ this.$upgRate.textContent = 'Upgrade DPS'; this.$upgRate.disabled = true; }
    else { const cost = rateCosts[rateLvl]; this.$upgRate.textContent = `Upgrade DPS (${cost})`; this.$upgRate.disabled = false; }
    if(this._setBtnWithDots) this._setBtnWithDots(this.$upgRate, this.$upgRate.textContent, rateLvl, 3);
    // Range (0..3)
    const rangeLvl = tower.rangeLevel || 0;
    const rangeCosts = [UPGRADE_COSTS.rangeModule, Math.round(UPGRADE_COSTS.rangeModule*1.5), Math.round(UPGRADE_COSTS.rangeModule*2.0)];
    if(rangeLvl>=3){ this.$upgRange.textContent = 'Upgrade Fire Range'; this.$upgRange.disabled = true; }
    else { const cost = rangeCosts[rangeLvl]; this.$upgRange.textContent = `Upgrade Fire Range (${cost})`; this.$upgRange.disabled = false; }
    if(this._setBtnWithDots) this._setBtnWithDots(this.$upgRange, this.$upgRange.textContent, rangeLvl, 3);
    if(tower.hasBurn){ this.$upgBurn.textContent = 'Burn Module'; this.$upgBurn.disabled = true; }
    else { this.$upgBurn.textContent = `Install Burn Module (${UPGRADE_COSTS.burnModule})`; this.$upgBurn.disabled = false; }
    if(this._setBtnWithDots) this._setBtnWithDots(this.$upgBurn, this.$upgBurn.textContent, tower.hasBurn?1:0, 1, { dim: tower.hasBurn });
    // Sell button label
    if(this.$sell){
      const invested = Math.max(0, Math.round(tower.invested||0));
      const refund = Math.max(0, Math.floor(invested * 0.25));
      this.$sell.textContent = `Sell Tower (+${refund}⚛)`;
      this.$sell.disabled = invested<=0;
    }
  }

  // Brief toast above the upgrade panel
  showPanelToast(text, kind='danger'){
    if(!this.$upg) return;
    const el = document.createElement('div');
    el.className = 'upg-toast';
    el.textContent = text;
    // Accent color variants
    if(kind==='success'){
      el.style.background = 'linear-gradient(180deg, rgba(23,231,164,.2), rgba(23,231,164,.1))';
      el.style.borderColor = 'rgba(23,231,164,.55)';
      el.style.color = '#e6fff6';
    } else if(kind!=='danger'){
      el.style.background = 'linear-gradient(180deg, rgba(0,186,255,.2), rgba(0,186,255,.1))';
      el.style.borderColor = 'rgba(0,186,255,.55)';
      el.style.color = '#d5f6ff';
    }
    this.$upg.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 1100);
  }

  setSignedInUser(name){
    this.isSignedIn = !!name;
    if(this.$signinBanner && this.$signinName){
      if(name){
        this.$signinName.textContent = name;
      } else {
        this.$signinName.textContent = 'Guest';
      }
      this.$signinBanner.style.display = 'flex';
    }
    this.updateAuthButtons();
    this.updateLeaderboardWarning(name);
  }
  updateAuthButtons(){
    const signed = !!this.isSignedIn;
    if(this.$btnMainLoadUser){
      this.$btnMainLoadUser.textContent = signed ? 'Sign Out' : 'Sign In';
    }
    if(this.$btnLeaderboardSignIn){
      this.$btnLeaderboardSignIn.textContent = signed ? 'Sign Out' : 'Sign In';
    }
    if(this.$loginUser){
      this.$loginUser.textContent = signed ? 'Sign Out' : 'Sign In';
    }
    if(this.$loginCreate){
      this.$loginCreate.style.display = signed ? 'none' : '';
    }
  }
  updateLeaderboardWarning(name){
    if(!this.$leaderboardWarning) return;
    if(name){
      this.$leaderboardWarning.textContent = 'Welcome ';
      const span = document.createElement('span');
      span.className = 'lb-username';
      span.textContent = name;
      this.$leaderboardWarning.appendChild(span);
      this.$leaderboardWarning.classList.add('signed-in');
      this.$leaderboardWarning.classList.remove('warn');
    } else {
      this.$leaderboardWarning.textContent = 'Sign in to compete for a spot on the leaderboard.';
      this.$leaderboardWarning.classList.remove('signed-in');
      this.$leaderboardWarning.classList.add('warn');
    }
  }
}
