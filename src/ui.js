import { GAME_RULES, COLORS, UPGRADE_COSTS, getHpColor, TOWER_TYPES } from './config.js';
import { MAPS, drawMapPreview } from './maps.js';
import { punchOutSpriteBackground } from './tower.js';

function detectRuntimeFlavor(){
  let isDesktop = false;
  let isLocal = false;
  try{
    if(typeof window !== 'undefined'){
      // Primary: bridge injected by Electron preload.
      if(window.NANO_DESKTOP && window.NANO_DESKTOP.flavor === 'desktop'){
        isDesktop = true;
      }
      const flavor = window.NANO_BUILD_FLAVOR;
      if(!isDesktop){
        if(flavor === 'desktop'){
          isDesktop = true;
        }else if(flavor === 'local'){
          isLocal = true;
        }
      }
      if(!isDesktop && !isLocal){
        let ua = '';
        try{
          ua = (window.navigator && window.navigator.userAgent) || '';
        }catch(e){}
        if(/electron/i.test(ua)){
          isDesktop = true;
        }else if(window.location && window.location.protocol === 'file:'){
          isLocal = true;
        }
      }
    }
  }catch(e){}
  return { isDesktop, isLocal };
}

export class UIManager{
  constructor(){
    this.listeners = { startWave: [], startGame: [], pause: [], resume: [], retry: [], restart: [], sandboxStart: [], sandboxReset: [], sandboxOpen: [], toMenu: [], toMissionSelect: [], selectTowerType: [], upgradeSlow: [], upgradeRate: [], upgradeRange: [], upgradeBurn: [], sellTower: [], sellConfirm: [], sellCancel: [], selectMap: [], toggleFast: [], closeUpg: [], toggleVolume: [], setVolume: [], shopBuy: [], shopReroll: [], shopContinue: [], shopBuyAbility: [], useBomb: [], useOverclock: [], useCryo: [], toggleDev: [], toggleDebug: [], toggleAutoSpeed: [], exitConfirm: [], exitCancel: [], exitToMenuImmediate: [], exitToDesktop: [], openShop: [], closeShop: [], devUnlockUlts: [], devUpgradeMax: [], mainNew: [], mainLoad: [], mainAssembly: [], loadSlot: [], openAssembly: [], closeAssembly: [], startMission: [], assemblySave: [], assemblyLoad: [], openAssemblyCore: [], menuBack: [], mainSettings: [], mainSettingsBack: [], loadBack: [], loginUser: [], openCreateUser: [], closeCreateUser: [], createUser: [], openLeaderboard: [], closeLeaderboard: [], leaderboardSignIn: [], logout: [], removePassive: [], leaderboardSelectMap: [], pauseLoginOpen: [], mainDownload: [], mainHowTo: [], closeHowTo: [], mainBug: [], closeBug: [], mainPatchNotes: [], closePatchNotes: [], openUserProfile: [], closeUserProfile: [], leaderboardSearch: [], mainUserProfile: [] };
    const flavor = detectRuntimeFlavor();
    this.isDesktopRuntime = !!flavor.isDesktop;
    this.isLocalRuntime = !!flavor.isLocal;
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
    this.$towerIcons = Array.from(document.querySelectorAll('.tower-palette .tower-icon'));
    // Helper: update tower palette prices; Game can call this to reflect
    // character-specific discounts so the labels always match actual costs.
    this.setTowerCosts = (costs)=>{
      if(!this.$towerBtns || !this.$towerBtns.length) return;
      for(const btn of this.$towerBtns){
        const key = btn?.dataset?.tower;
        const span = btn.querySelector('.tower-cost');
        if(!span) continue;
        const def = key && TOWER_TYPES[key];
        const base = def ? def.cost : null;
        const v = (costs && Object.prototype.hasOwnProperty.call(costs, key)) ? costs[key] : base;
        if(v != null){
          span.textContent = `(${v})`;
        }
      }
    };
    // Initialize palette prices with base config values; Game will
    // override with character-adjusted costs when appropriate.
    this.setTowerCosts();
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
    this.$pauseActions = this.$pauseOverlay ? this.$pauseOverlay.querySelector('.pause-actions') : null;
    this.$btnSettings = document.getElementById('btn-settings');
    this.$settingsPanel = document.getElementById('settings-panel');
    this.$btnPauseLogin = document.getElementById('btn-pause-login');
    this.$pauseLoginPanel = document.getElementById('pause-login-panel');
    this.$pauseLoginUsername = document.getElementById('pause-login-username');
    this.$pauseLoginPassword = document.getElementById('pause-login-password');
    this.$pauseLoginStatus = document.getElementById('pause-login-status');
    this.$pauseLoginSubmit = document.getElementById('btn-pause-login-submit');
    this.$pauseLoginBack = document.getElementById('btn-pause-login-back');
    this.$pauseBugPanel = document.getElementById('pause-bug-panel');
    this.$pauseBugForm = document.getElementById('bug-form-pause');
    this.$pauseBugStatus = document.getElementById('bug-status-pause');
    this.$btnPauseBug = document.getElementById('btn-pause-bug');
    this.$btnPauseBugBack = document.getElementById('btn-pause-bug-back');
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
    this.$statBaseDmgRaw = document.getElementById('stat-basedmg-raw');
    this.$statBaseDmg = document.getElementById('stat-basedmg');
    this.$statCritRaw = document.getElementById('stat-crit-raw');
    this.$statCritDmgRaw = document.getElementById('stat-critdmg-raw');
    this.$statCritDmg = document.getElementById('stat-critdmg');
    this.$statCrit = document.getElementById('stat-crit');
    this.$statSlowRaw = document.getElementById('stat-slow-raw');
    this.$statSlow = document.getElementById('stat-slow');
    this.$statBurnRaw = document.getElementById('stat-burn-raw');
    this.$statBurn = document.getElementById('stat-burn');
    this.$statTargetRaw = document.getElementById('stat-target-raw');
    this.$statTarget = document.getElementById('stat-target');
    this.$statPuddleRaw = document.getElementById('stat-puddle-raw');
    this.$statPuddle = document.getElementById('stat-puddle');
    this.$statLaserStabRaw = document.getElementById('stat-laserstab-raw');
    this.$statLaserStab = document.getElementById('stat-laserstab');
    this.$combatStats = document.getElementById('combat-stats');
    this.$combatToggle = document.getElementById('combat-stats-toggle');
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
    this.$leaderboardLoading = document.getElementById('leaderboard-loading');
    this.$lbSearchInput = document.getElementById('leaderboard-search-input');
    this.$lbSearchBtn = document.getElementById('btn-leaderboard-search');
    // Desktop-only exit overlay (pause → Exit)
    this.$appExitOverlay = document.getElementById('app-exit-overlay');
    this.$btnAppExitCancel = document.getElementById('btn-app-exit-cancel');
    this.$btnAppExitMenu = document.getElementById('btn-app-exit-menu');
    this.$btnAppExitDesktop = document.getElementById('btn-app-exit-desktop');
    // Mode loading overlay (for Endless / Sandbox / Assembly transitions)
    this.$modeLoading = document.getElementById('mode-loading-overlay');
    this.$modeLoadingTitle = document.getElementById('mode-loading-title');
    this.$modeLoadingSub = document.getElementById('mode-loading-sub');
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
    // Character select under map carousel
    this.$characterRow = document.getElementById('character-row');
    this.$characterButtons = Array.from(document.querySelectorAll('.character-btn'));
    this.selectedCharacterKey = 'volt';
    this.$modesOverlay = document.getElementById('gamemodes-overlay');
    this.$btnMainModes = document.getElementById('btn-main-modes');
    this.$btnMainDownload = document.getElementById('btn-main-download');
    this.$playMenuOverlay = document.getElementById('playmenu-overlay');
    this.$profileMenuOverlay = document.getElementById('profilemenu-overlay');
    this.$databaseOverlay = document.getElementById('database-overlay');
    this.$btnModesBack = document.getElementById('btn-modes-back');
    this.$btnMainEndless = document.getElementById('btn-main-endless');
    this.$btnMainLeaderboard = document.getElementById('btn-main-leaderboard');
    this.$btnMainAssembly = document.getElementById('btn-main-assembly');
    this.$btnMainSandbox = document.getElementById('btn-main-sandbox');
    this.$btnMainSettings = document.getElementById('btn-main-settings');
    this.$btnMainHowTo = document.getElementById('btn-main-howto');
    this.$btnMainPlay = document.getElementById('btn-main-play');
    this.$btnMainProfile = document.getElementById('btn-main-profile');
    this.$btnMainDatabase = document.getElementById('btn-main-database');
    this.$howToOverlay = document.getElementById('howto-overlay');
    this.$btnMainPatchNotes = document.getElementById('btn-main-patchnotes');
    this.$patchNotesOverlay = document.getElementById('patchnotes-overlay');
    this.$patchVersionSelect = document.getElementById('patch-version-select');
    this.$patchVersionSummary = document.getElementById('patch-version-summary');
    this.$patchNotesList = document.getElementById('patchnotes-list');
    this.$btnMainBug = document.getElementById('btn-play-bug');
    this.$bugOverlay = document.getElementById('bug-overlay');
    this.$bugForm = document.getElementById('bug-form');
    this.$bugStatus = document.getElementById('bug-status');
    this._bugOrigin = 'mainmenu';
    // Player profile overlay
    this.$profileOverlay = document.getElementById('profile-overlay');
    this.$profileUsername = document.getElementById('profile-username');
    this.$profileJoined = document.getElementById('profile-joined');
    this.$profileLastSeen = document.getElementById('profile-last-seen');
    this.$profileRoles = document.getElementById('profile-roles');
    this.$profileBestPerfect = document.getElementById('profile-best-perfect');
    this.$profileMissionUnlock = document.getElementById('profile-mission-unlock');
    this.$profileTotalRuns = document.getElementById('profile-total-runs');
    this.$profileFavoriteCharacter = document.getElementById('profile-favorite-character');
    this.$profileBestMaps = document.getElementById('profile-best-maps');
    this.$profileRuns = document.getElementById('profile-runs');
    this.$profileRunsEmpty = document.getElementById('profile-runs-empty');
    this.$profileLoading = document.getElementById('profile-loading');
    this.$profileError = document.getElementById('profile-error');
    this.$btnProfileClose = document.getElementById('btn-profile-close');
    this.$profileSearchInput = document.getElementById('profile-search-input');
    this.$btnProfileSearch = document.getElementById('btn-profile-search');
    this.$btnDbHowTo = document.getElementById('btn-db-howto');
    this.$btnDbTowers = document.getElementById('btn-db-towers');
    this.$btnDbStatus = document.getElementById('btn-db-status');
    this.$btnDbCharacters = document.getElementById('btn-db-characters');
    this.$btnDbPatch = document.getElementById('btn-db-patchnotes');
    // Main settings controls
    this.$mainSettingsPrimary = document.getElementById('mainsettings-primary');
    this.$mainSettingsDesktopActions = document.getElementById('mainsettings-desktop-actions');
    this.$btnMainFullscreen = document.getElementById('btn-main-fullscreen');
    this.$btnMainDevSettings = document.getElementById('btn-main-devsettings');
    this.$mainDevSettingsPanel = document.getElementById('main-devsettings-panel');
    this.$mainDevSettingsActions = document.getElementById('main-devsettings-actions');
    this.$btnMainDevSettingsClose = document.getElementById('btn-main-devsettings-close');
    this.$mainSettingsBackRow = document.getElementById('mainsettings-back-row');
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
    this.$loginStaySignedIn = document.getElementById('login-stay-signedin');
    this.$pauseLoginStaySignedIn = document.getElementById('pause-login-stay-signedin');
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
    // HP bar + character portrait + pilot dialogue
    this.$hpFill = document.getElementById('hp-fill');
    this.$hpCharSprite = document.getElementById('hp-char-sprite');
    this.$hpCharIcon = document.getElementById('hp-char-icon');
    this.$hpCharInner = document.getElementById('hp-char-inner');
    this.$pilotDialog = document.getElementById('pilot-dialog');
    this.maxLives = (GAME_RULES && GAME_RULES.startingLives) ? GAME_RULES.startingLives : 30;
    // HP portrait animation state (blink/talk loops). We keep a single
    // active sheet pair (blink + talk) for whichever character is
    // currently selected so the logic is identical for all characters.
    this._hpAnim = {
      key: null,
      mode: 'blink', // 'blink' | 'talk'
      frameIndex: 0,
      frameTime: 0,
      fps: 24,
      paused: false,
      blinkSheet: null,
      talkSheet: null,
      canvas: null,
      ctx: null,
      loopHandle: null,
      lastTs: null
    };
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
      rate: { title:'Upgrade Tower Damage', lines:['Increase this tower\'s damage.', 'Max 3 levels.'] },
      range: { title:'Upgrade Fire Range', lines:['Increase range by 15% per level.', 'Max 3 levels.'] },
      start: { title:'Start Wave', lines:['Begin spawning the next wave of enemies.'] },
      fast: { title:'Speed', lines:['Cycles 1x → 2x → 3x → 4x.', 'Resets to 1x on bosses/bonus/difficulty.'] },
      character: { title:'Pilot', lines:['Character-specific passive bonuses.'] },
      // Tower palette tooltips
      tower_basic: { title:'Cannon', lines:['Single‑target ballistic turret.', 'Solid all‑rounder; supports slow/burn.'] },
      tower_laser: { title:'Laser', lines:['Continuous beam damage over time.', 'Great vs tough enemies; precise aim.'] },
      tower_splash: { title:'Moarter', lines:['Launches arcing shells that create Acid puddles.', 'Strong vs groups; excels at area control.'] }
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

    // Character select tooltips (map select)
    this.characterTips = {
      volt: {
        title: 'Volt — Cannon Specialist',
        lines: [
          '• Cannon: +12% damage, +3% fire rate /5 waves.',
          '• Cannon: +15% rotation speed.',
          '• Cannon: -20% placement cost.',
          '• Laser: -10% stability.',
          '• Acid Puddles: -10% spread rate.'
        ]
      },
      lumen: {
        title: 'Lumen — Laser Specialist',
        lines: [
          '• Laser: +10% DPS, +3% DPS /5 waves.',
          '• Laser: +25% stability.',
          '• Laser: -20% placement cost.',
          '• Economy: -20% tower upgrade costs.',
          '• Cannon: -10% rotation speed.',
          '• Acid Puddles: -10% spread rate.'
        ]
      },
      torque: {
        title: 'Torque — Moarter Specialist',
        lines: [
          '• Moarter: +20% Acid puddle radius, +5% DPS /5 waves.',
          '• Moarter: +20% Acid Spread rate, -20% placement cost.',
          '• Debuffs: Burn & Slow +20% power.',
          '• Cannon: -10% rotation speed.',
          '• Laser: -5% stability.'
        ]
      }
    };
    if(this.$characterButtons && this.$characterButtons.length){
      const characterTips = this.characterTips;
      this.$characterButtons.forEach((btn)=>{
        const key = (btn.dataset && btn.dataset.character) || '';
        const tip = characterTips[key];
        if(tip) attachTip(btn, tip, { preferBelow:true });
      });
    }
    // Player portrait tooltip (uses dynamic character data)
    attachTip(this.$hpCharIcon, 'character', { preferBelow:true });

    // Make the combat stats card draggable within the full stage
    // (wave panel + board + passive panel) instead of only the board
    // column so it behaves consistently on ultrawide layouts and can
    // be parked over the side panels if desired.
    if(this.$combatStats){
      const shell = document.getElementById('canvas-shell');
      const stage = document.querySelector('.stage-wrap');
      const card = this.$combatStats;
      let drag = null;
      const onPointerDown = (e)=>{
        const isTouch = e.pointerType === 'touch';
        if(!isTouch && e.button !== 0) return;
        // Don't start a drag when clicking the minimize/expand toggle or other buttons.
        if(e.target && (e.target.closest('#combat-stats-toggle') || e.target.closest('button'))){
          return;
        }
        if(!shell || !stage) return;
        const rect = card.getBoundingClientRect();
        const shellRect = shell.getBoundingClientRect();
        drag = {
          pointerId: e.pointerId,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          shellLeft: shellRect.left,
          shellTop: shellRect.top
        };
        card.classList.add('dragging');
        card.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      };
      const onPointerMove = (e)=>{
        if(!drag || e.pointerId !== drag.pointerId || !shell || !stage) return;
        const shellRect = shell.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        // Desired viewport position for the card's top-left based on pointer + offset.
        let vLeft = e.clientX - drag.offsetX;
        let vTop = e.clientY - drag.offsetY;
        const margin = 4;
        const minLeft = stageRect.left + margin;
        const maxLeft = stageRect.right - cardRect.width - margin;
        const minTop = stageRect.top + margin;
        const maxTop = stageRect.bottom - cardRect.height - margin;
        vLeft = Math.max(minLeft, Math.min(maxLeft, vLeft));
        vTop = Math.max(minTop, Math.min(maxTop, vTop));
        // Convert back to shell-relative coordinates.
        const left = vLeft - drag.shellLeft;
        const top = vTop - drag.shellTop;
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
      };
      const endDrag = (e)=>{
        if(!drag || (e && typeof e.pointerId === 'number' && e.pointerId !== drag.pointerId)) return;
        drag = null;
        card.classList.remove('dragging');
        if(e && typeof e.pointerId === 'number'){
          card.releasePointerCapture?.(e.pointerId);
        }
      };
      card.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    }
    // Minimize / expand toggle for combat stats: when minimized, only the
    // title bar with the toggle button is visible (small bar).
    if(this.$combatStats && this.$combatToggle){
      const card = this.$combatStats;
      const toggle = this.$combatToggle;
      const setMinimized = (min)=>{
        if(min){
          card.classList.add('minimized');
          toggle.textContent = '+';
          toggle.setAttribute('aria-label','Expand combat stats');
        } else {
          card.classList.remove('minimized');
          toggle.textContent = '−';
          toggle.setAttribute('aria-label','Minimize combat stats');
        }
      };
      let minimized = false;
      setMinimized(minimized);
      toggle.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        minimized = !minimized;
        setMinimized(minimized);
      });
    }
    // Make the tower upgrade panel draggable within the full stage
    // (wave + board + passive panels) instead of only the board
    // column. This matches the combat stats card so both can sit
    // wherever is most comfortable for the player.
    if(this.$upg){
      const panel = this.$upg;
      const shell = document.getElementById('canvas-shell');
      const stage = document.querySelector('.stage-wrap');
      let drag = null;
      const onPointerDownUpg = (e)=>{
        const isTouch = e.pointerType === 'touch';
        if(!isTouch && e.button !== 0) return;
        // Don't hijack clicks on interactive controls (upgrade buttons,
        // sell, close, etc.) so they still behave normally.
        const target = e.target;
        if(target && (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea') || target.closest('select'))){
          return;
        }
        if(!shell || !stage) return;
        const rect = panel.getBoundingClientRect();
        const shellRect = shell.getBoundingClientRect();
        drag = {
          pointerId: e.pointerId,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          shellLeft: shellRect.left,
          shellTop: shellRect.top
        };
        panel.classList.add('dragging');
        // Switch to explicit top/left anchoring for the duration of the drag.
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.transform = 'none';
        panel.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      };
      const onPointerMoveUpg = (e)=>{
        if(!drag || e.pointerId !== drag.pointerId || !shell || !stage) return;
        const shellRect = shell.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        // Desired viewport position for the panel's top-left based on pointer + offset.
        let vLeft = e.clientX - drag.offsetX;
        let vTop = e.clientY - drag.offsetY;
        const margin = 4;
        const minLeft = stageRect.left + margin;
        const maxLeft = stageRect.right - panelRect.width - margin;
        const minTop = stageRect.top + margin;
        const maxTop = stageRect.bottom - panelRect.height - margin;
        vLeft = Math.max(minLeft, Math.min(maxLeft, vLeft));
        vTop = Math.max(minTop, Math.min(maxTop, vTop));
        // Convert back to shell-relative coordinates.
        const left = vLeft - drag.shellLeft;
        const top = vTop - drag.shellTop;
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
      };
      const endDragUpg = (e)=>{
        if(!drag || (e && typeof e.pointerId === 'number' && e.pointerId !== drag.pointerId)) return;
        drag = null;
        panel.classList.remove('dragging');
        if(e && typeof e.pointerId === 'number'){
          panel.releasePointerCapture?.(e.pointerId);
        }
      };
      panel.addEventListener('pointerdown', onPointerDownUpg);
      window.addEventListener('pointermove', onPointerMoveUpg);
      window.addEventListener('pointerup', endDragUpg);
      window.addEventListener('pointercancel', endDragUpg);
    }
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
        title:'Cores (✦)',
        lines:['Recovered from major bosses.', 'Unlock ultimate abilities and reactor perks.']
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
    // Tower palette icons: reuse the same sprites as in-game towers,
    // but punch out their flat backgrounds so the buttons don't show
    // the grey/white squares behind the art.
    const initTowerIcons = ()=>{
      if(!this.$palette || !this.$towerIcons || !this.$towerIcons.length) return;
      if(typeof Image === 'undefined' || typeof document === 'undefined') return;
      const iconDefs = [
        { selector: '.tower-icon-basic', url: 'data/tower-cannon.png' },
        { selector: '.tower-icon-laser', url: 'data/tower-laser.png' },
        { selector: '.tower-icon-splash', url: 'data/tower-splash.png' }
      ];
      for(const def of iconDefs){
        const el = this.$palette.querySelector(def.selector);
        if(!el) continue;
        try{
          const img = new Image();
          img.src = def.url;
          img.onload = ()=>{
            try{
              const source = punchOutSpriteBackground ? punchOutSpriteBackground(img) || img : img;
              const iconCanvas = document.createElement('canvas');
              // Slightly larger internal framebuffer so downscaling looks clean.
              iconCanvas.width = 96;
              iconCanvas.height = 96;
              const ctx = iconCanvas.getContext('2d');
              if(!ctx || !source) return;
              ctx.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
              const srcW = source.width || 1;
              const srcH = source.height || 1;
              const srcMax = Math.max(srcW, srcH) || 1;
              const targetSize = 70; // leave a small margin inside the frame
              const scale = targetSize / srcMax;
              const drawW = srcW * scale;
              const drawH = srcH * scale;
              const dx = (iconCanvas.width - drawW) / 2;
              const dy = (iconCanvas.height - drawH) / 2;
              ctx.drawImage(source, dx, dy, drawW, drawH);
              iconCanvas.style.width = '100%';
              iconCanvas.style.height = '100%';
              iconCanvas.style.display = 'block';
              iconCanvas.style.imageRendering = 'auto';
              el.innerHTML = '';
              el.style.backgroundImage = 'none';
              el.style.backgroundColor = 'transparent';
              el.appendChild(iconCanvas);
            }catch(e){}
          };
        }catch(e){}
      }
    };
    initTowerIcons();
    // Character portraits/icons (map select + HUD): use the Volt /
    // Torque / Lumen art, punch out their flat backgrounds, and then
    // auto‑crop to the opaque pixel bounds so each character fills the
    // frame consistently even if the source sprites have different
    // padding.
    const drawProcessedSpriteInto = (url, targetEl, opts={})=>{
      if(!targetEl || !url) return;
      if(typeof Image === 'undefined' || typeof document === 'undefined') return;
      try{
        const img = new Image();
        img.src = url;
        img.onload = ()=>{
          try{
            let source = punchOutSpriteBackground ? punchOutSpriteBackground(img) || img : img;
            if(!opts.disableAutoCrop && typeof document !== 'undefined' && source && source.width && source.height){
              try{
                const off = document.createElement('canvas');
                off.width = source.width;
                off.height = source.height;
                const oc = off.getContext('2d');
                if(oc){
                  oc.clearRect(0,0,off.width,off.height);
                  oc.drawImage(source,0,0);
                  const id = oc.getImageData(0,0,off.width,off.height);
                  const data = id.data;
                  let minX = off.width, minY = off.height, maxX = -1, maxY = -1;
                  for(let y=0;y<off.height;y++){
                    for(let x=0;x<off.width;x++){
                      const idx = (y*off.width + x)*4;
                      const a = data[idx+3];
                      if(a>20){
                        if(x<minX) minX = x;
                        if(y<minY) minY = y;
                        if(x>maxX) maxX = x;
                        if(y>maxY) maxY = y;
                      }
                    }
                  }
                  if(maxX>=minX && maxY>=minY){
                    const pad = (typeof opts.cropPad === 'number') ? opts.cropPad : 4;
                    minX = Math.max(0, minX - pad);
                    minY = Math.max(0, minY - pad);
                    maxX = Math.min(off.width-1, maxX + pad);
                    maxY = Math.min(off.height-1, maxY + pad);
                    const cropW = maxX - minX + 1;
                    const cropH = maxY - minY + 1;
                    if(cropW>0 && cropH>0){
                      const trimmed = document.createElement('canvas');
                      trimmed.width = cropW;
                      trimmed.height = cropH;
                      const tc = trimmed.getContext('2d');
                      if(tc){
                        tc.clearRect(0,0,cropW,cropH);
                        tc.drawImage(off, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
                        source = trimmed;
                      }
                    }
                  }
                }
              }catch(e){}
            }
            const size = opts.size || 96;
            const targetSize = opts.targetSize || 70;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if(!ctx || !source) return;
            ctx.clearRect(0, 0, size, size);
            const srcW = source.width || 1;
            const srcH = source.height || 1;
            const srcMax = Math.max(srcW, srcH) || 1;
            const scale = targetSize / srcMax;
            const drawW = srcW * scale;
            const drawH = srcH * scale;
            const dx = (size - drawW) / 2;
            const dy = (size - drawH) / 2;
            ctx.drawImage(source, dx, dy, drawW, drawH);
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';
            canvas.style.imageRendering = opts.pixelated ? 'pixelated' : 'auto';
            if(opts.replaceChildren){
              targetEl.innerHTML = '';
              targetEl.appendChild(canvas);
            } else {
              targetEl.appendChild(canvas);
            }
          }catch(e){}
        };
      }catch(e){}
    };
    // expose helper for use by other methods (e.g., HP portrait)
    this._drawProcessedSpriteInto = drawProcessedSpriteInto;

    const initCharacterIcons = ()=>{
      if(!this.$characterButtons || !this.$characterButtons.length) return;
      if(typeof Image === 'undefined' || typeof document === 'undefined') return;
      this.$characterButtons.forEach((btn)=>{
        const key = (btn.dataset && btn.dataset.character) || '';
        const iconEl = btn.querySelector('.character-icon');
        if(!key || !iconEl) return;
        const imgTag = iconEl.querySelector('img');
        const url = imgTag ? imgTag.src : (
          key === 'volt' ? 'data/Volt.png' :
          key === 'torque' ? 'data/Torque.png' :
          key === 'lumen' ? 'data/Lumen.png' : null
        );
        if(!url) return;
        // Auto-crop + uniform scale so each character fills the
        // map-select icon consistently. Slightly increase the internal
        // target size so the portraits read a bit larger while still
        // fitting comfortably inside the frame.
        const targetSize = 84;
        drawProcessedSpriteInto(url, iconEl, { size:96, targetSize, replaceChildren:true });
      });
    };
    initCharacterIcons();
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
      const kind = tower.kind || 'basic';
      const rateLvl = tower.rateLevel||0;
      const nextRate = Math.min(3, rateLvl+1);
      const rateCosts = [UPGRADE_COSTS.rateModule, Math.round(UPGRADE_COSTS.rateModule*1.5), Math.round(UPGRADE_COSTS.rateModule*2.0)];
      const nextRateCost = rateLvl<3 ? rateCosts[rateLvl] : null;
      // Per-tower damage description
      let rateDesc = 'Increase this tower\'s damage.';
      if(kind === 'basic'){
        rateDesc = 'Cannon shells deal increased damage.';
      } else if(kind === 'laser'){
        rateDesc = 'Laser beam deals increased damage over time.';
      } else if(kind === 'splash'){
        rateDesc = 'Moarter shells and Acid puddles deal increased damage.';
      }
      this.tipText.rate.lines = [
        rateDesc,
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
      // Slow / Burn module descriptions per tower type
      let slowDesc = 'Bullets briefly slow enemies.';
      let burnDesc = 'Bullets apply burning damage over time.';
      if(kind === 'laser'){
        slowDesc = 'Laser beam slows enemies it hits.';
        burnDesc = 'Laser beam applies burning damage over time.';
      } else if(kind === 'splash'){
        slowDesc = 'Acid puddles briefly slow enemies standing in them.';
        burnDesc = 'Acid puddles apply burning damage over time.';
      }
      this.tipText.slow.lines = [
        tower.hasSlow ? 'Installed' : 'Not installed',
        slowDesc
      ];
      this.tipText.burn.lines = [
        tower.hasBurn ? 'Installed' : 'Not installed',
        burnDesc
      ];
    };
    this.$devOpenShop = document.getElementById('btn-dev-open-shop');
    // Initialize as locked/disabled by default; game unlocks via setAbilityVisible
    if(this.$abilBomb){ this.$abilBomb.disabled = true; this.$abilBomb.classList.add('locked'); this.$abilBomb.textContent = 'Bomb (Locked)'; }
    if(this.$abilOverclock){ this.$abilOverclock.disabled = true; this.$abilOverclock.classList.add('locked'); this.$abilOverclock.textContent = 'Overclock (Locked)'; }
    if(this.$abilCryo){ this.$abilCryo.disabled = true; this.$abilCryo.classList.add('locked'); this.$abilCryo.textContent = 'Cryo (Locked)'; }

    this.listeners = { startWave: [], startGame: [], pause: [], resume: [], retry: [], restart: [], sandboxStart: [], sandboxReset: [], toMenu: [], toMissionSelect: [], selectTowerType: [], upgradeSlow: [], upgradeRate: [], upgradeRange: [], upgradeBurn: [], sellTower: [], sellConfirm: [], sellCancel: [], selectMap: [], toggleFast: [], closeUpg: [], toggleVolume: [], setVolume: [], shopBuy: [], shopReroll: [], shopContinue: [], shopBuyAbility: [], useBomb: [], useOverclock: [], useCryo: [], toggleDev: [], toggleDebug: [], toggleAutoSpeed: [], exitConfirm: [], exitCancel: [], exitToMenuImmediate: [], exitToDesktop: [], openShop: [], closeShop: [], devUnlockUlts: [], devUpgradeMax: [], mainNew: [], mainLoad: [], mainAssembly: [], loadSlot: [], openAssembly: [], closeAssembly: [], startMission: [], assemblySave: [], assemblyLoad: [], openAssemblyCore: [], menuBack: [], mainSettings: [], mainSettingsBack: [], loadBack: [], loginUser: [], openCreateUser: [], closeCreateUser: [], createUser: [], openLeaderboard: [], closeLeaderboard: [], leaderboardSignIn: [], logout: [], removePassive: [], leaderboardSelectMap: [], pauseLoginOpen: [], mainDownload: [], mainHowTo: [], closeHowTo: [], mainBug: [], closeBug: [], mainPatchNotes: [], closePatchNotes: [], openUserProfile: [], closeUserProfile: [], leaderboardSearch: [], mainUserProfile: [] };
    // Track dev mode state for UI behavior (e.g., enabling shop buttons and credit label)
    this.devMode = false;
    this.setFragments(0);
    this.setCoreShards(0);
    this.initSandboxValueBindings();

    if(this.$characterButtons && this.$characterButtons.length){
      const initialSelected = this.$characterButtons.find(btn=> btn.classList.contains('selected'));
      const initialKey = initialSelected && initialSelected.dataset ? initialSelected.dataset.character : null;
      if(initialKey){
        this.selectedCharacterKey = initialKey;
      } else {
        const first = this.$characterButtons[0];
        const firstKey = first && first.dataset ? first.dataset.character : null;
        if(firstKey) this.selectedCharacterKey = firstKey;
      }
      const updateCharacterHighlight = ()=>{
        this.$characterButtons.forEach((btn)=>{
          const key = btn.dataset ? btn.dataset.character : null;
          btn.classList.toggle('selected', key === this.selectedCharacterKey);
        });
      };
      updateCharacterHighlight();
      this.$characterButtons.forEach((btn)=>{
        btn.addEventListener('click', ()=>{
          const key = btn.dataset ? btn.dataset.character : null;
          if(!key || key === this.selectedCharacterKey) return;
          this.selectedCharacterKey = key;
          updateCharacterHighlight();
          // Immediately sync the HP portrait to the newly selected
          // character so blink/talk animations follow the map-select
          // choice, even before the Game instance reacts.
          if(typeof this.setCharacterPortrait === 'function'){
            this.setCharacterPortrait(key);
          }
          this.emit('selectCharacter', key);
        });
      });
    }

    if(this.$start){
      this.$start.addEventListener('click', ()=> this.emit('startWave'));
    }
    // Main menu buttons
    if(this.$btnMainDownload){
      // Hosted build vs local build vs desktop build:
      // - Hosted: "Download" (grab launcher from same domain)
      // - Local file:// copy: "Check for Updates" (points at public launcher)
      // - Desktop (Electron) build: repurpose as an Exit button so
      //   players rely on the launcher for updates.
      let isDesktop = false;
      let isLocal = false;
      try{
        if(typeof window !== 'undefined'){
          const flavor = window.NANO_BUILD_FLAVOR;
          if(flavor === 'desktop'){
            isDesktop = true;
          }else if(flavor === 'local'){
            isLocal = true;
          }else{
            let ua = '';
            try{
              ua = (window.navigator && window.navigator.userAgent) || '';
            }catch(e){}
            if(/electron/i.test(ua)){
              // Electron desktop build (AppImage / EXE / dev electron .)
              isDesktop = true;
            }else if(window.location && window.location.protocol === 'file:'){
              // Plain local HTML (zip extract / file://)
              isLocal = true;
            }
          }
        }
      }catch(e){}

      if(isDesktop){
        this.$btnMainDownload.textContent = 'Exit';
        this.$btnMainDownload.addEventListener('click', ()=>{
          try{
            if(typeof window !== 'undefined'){
              if(window.NANO_DESKTOP && typeof window.NANO_DESKTOP.quit === 'function'){
                window.NANO_DESKTOP.quit();
              }else if(window.close){
                window.close();
              }
            }
          }catch(e){}
        });
      }else{
        const hostedUrl = (typeof window !== 'undefined' && window.NANO_DOWNLOAD_URL)
          ? window.NANO_DOWNLOAD_URL
          : 'downloads/NanoSiegeLauncher-linux.AppImage';
        const remoteUrl = (typeof window !== 'undefined' && window.NANO_REMOTE_DOWNLOAD_URL)
          ? window.NANO_REMOTE_DOWNLOAD_URL
          : hostedUrl;
        this.$btnMainDownload.textContent = isLocal ? 'Check for Updates' : 'Download';
        this.$btnMainDownload.addEventListener('click', ()=>{
          try{
            const target = isLocal ? remoteUrl : hostedUrl;
            // Trigger a download without navigating the page so the
            // game shell stays at the correct / index instead of a
            // subdirectory like /downloads/.
            const a = document.createElement('a');
            a.href = target;
            a.download = '';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
          }catch(e){}
        });
      }
    }
    // Main menu → submenus
    if(this.$btnMainPlay){
      this.$btnMainPlay.addEventListener('click', ()=>{
        if(this.showMainMenu) this.showMainMenu(false);
        if(this.showPlayMenu) this.showPlayMenu(true);
      });
    }
    if(this.$btnMainProfile){
      this.$btnMainProfile.addEventListener('click', ()=>{
        if(this.showMainMenu) this.showMainMenu(false);
        if(this.showProfileMenu) this.showProfileMenu(true);
      });
    }
    if(this.$btnMainDatabase){
      this.$btnMainDatabase.addEventListener('click', ()=>{
        if(this.showMainMenu) this.showMainMenu(false);
        if(this.showDatabase) this.showDatabase(true);
      });
    }
    // Profile submenu buttons
    const $btnProfileUser = document.getElementById('btn-profile-userprofile');
    const $btnProfileSignOut = document.getElementById('btn-profile-signout');
    const $btnProfileBack = document.getElementById('btn-profile-back');
    if($btnProfileUser){
      $btnProfileUser.addEventListener('click', ()=>{
        // Open the current user's profile (or route through sign-in).
        this.emit('mainUserProfile');
      });
    }
    if($btnProfileSignOut){
      $btnProfileSignOut.addEventListener('click', ()=>{
        this.emit('logout', { source:'mainmenu' });
        if(this.showProfileMenu) this.showProfileMenu(false);
        if(this.showMainMenu) this.showMainMenu(true);
      });
    }
    if($btnProfileBack){
      $btnProfileBack.addEventListener('click', ()=>{
        if(this.showProfileMenu) this.showProfileMenu(false);
        if(this.showMainMenu) this.showMainMenu(true);
      });
    }
    // Play submenu buttons
    const $btnPlayModes = document.getElementById('btn-play-modes');
    const $btnPlayLeaderboard = document.getElementById('btn-play-leaderboard');
    const $btnPlayBack = document.getElementById('btn-play-back');
    if($btnPlayModes){
      $btnPlayModes.addEventListener('click', ()=>{
        if(this.showPlayMenu) this.showPlayMenu(false);
        if(this.showGameModes) this.showGameModes(true);
      });
    }
    if($btnPlayLeaderboard){
      $btnPlayLeaderboard.addEventListener('click', ()=>{
        if(this.showPlayMenu) this.showPlayMenu(false);
        this.emit('openLeaderboard', { origin:'play' });
      });
    }
    if($btnPlayBack){
      $btnPlayBack.addEventListener('click', ()=>{
        if(this.showPlayMenu) this.showPlayMenu(false);
        if(this.showMainMenu) this.showMainMenu(true);
      });
    }
    // Database submenu buttons
    const $btnDbBack = document.getElementById('btn-db-back');
    if(this.$btnDbHowTo){
      this.$btnDbHowTo.addEventListener('click', ()=>{
        if(this.showDatabase) this.showDatabase(false);
        if(this.$howToOverlay) this.$howToOverlay.classList.add('visible');
        this.updateModalMask();
        this.emit('mainHowTo');
      });
    }
    if(this.$btnDbPatch){
      this.$btnDbPatch.addEventListener('click', ()=>{
        if(this.showDatabase) this.showDatabase(false);
        if(this.$patchNotesOverlay) this.$patchNotesOverlay.classList.add('visible');
        this.updateModalMask();
        this.emit('mainPatchNotes');
      });
    }
    // For now, tower/status/character codex buttons route to How To Play
    // until dedicated overlays are implemented.
    const codexButtons = [this.$btnDbTowers, this.$btnDbStatus, this.$btnDbCharacters];
    codexButtons.forEach((btn)=>{
      if(!btn) return;
      btn.addEventListener('click', ()=>{
        if(this.showDatabase) this.showDatabase(false);
        if(this.$howToOverlay) this.$howToOverlay.classList.add('visible');
        this.updateModalMask();
        this.emit('mainHowTo');
      });
    });
    if($btnDbBack){
      $btnDbBack.addEventListener('click', ()=>{
        if(this.showDatabase) this.showDatabase(false);
        if(this.showMainMenu) this.showMainMenu(true);
        this.updateModalMask();
      });
    }
    if(this.$btnMainEndless){
      this.$btnMainEndless.addEventListener('click', ()=>{
        // Endless Cycle: go straight to map select (from game modes).
        if(this.showGameModes) this.showGameModes(false);
        if(this.showMapSelect) this.showMapSelect(true);
        if(this.setMapStartLabel) this.setMapStartLabel('Start Endless Cycle');
      });
    }
    if(this.$btnMapBack){
      this.$btnMapBack.addEventListener('click', ()=>{
        if(this.showMapSelect) this.showMapSelect(false);
        // Return to game mode selection from map select
        if(this.showGameModes) this.showGameModes(true);
      });
    }
    if(this.$btnMapStart){
      this.$btnMapStart.addEventListener('click', ()=>{
        if(this.showMapSelect) this.showMapSelect(false);
        this.emit('startGame');
      });
    }
    if(this.$btnModesBack){
      this.$btnModesBack.addEventListener('click', ()=>{
        if(this.showGameModes) this.showGameModes(false);
        if(this.showPlayMenu){
          this.showPlayMenu(true);
        }else if(this.showMainMenu){
          this.showMainMenu(true);
        }
      });
    }
    if(this.$btnMainLeaderboard){ this.$btnMainLeaderboard.addEventListener('click', ()=> this.emit('openLeaderboard')); }
    if(this.$btnMainAssembly){
      this.$btnMainAssembly.addEventListener('click', ()=>{
        if(this.showGameModes) this.showGameModes(false);
        this.emit('mainAssembly');
      });
    }
    if(this.$btnMainSandbox){
      this.$btnMainSandbox.addEventListener('click', ()=>{
        if(this.showGameModes) this.showGameModes(false);
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
    if(this.$pauseMenu){
      if(this.isDesktopRuntime && this.$appExitOverlay){
        this.$pauseMenu.textContent = 'Exit';
        this.$pauseMenu.addEventListener('click', ()=>{
          this.$appExitOverlay.classList.add('visible');
        });
      }else{
        this.$pauseMenu.addEventListener('click', ()=> this.emit('toMenu'));
      }
    }
    if(this.$btnPauseBug){
      this.$btnPauseBug.addEventListener('click', ()=>{
        if(this.showPauseBug) this.showPauseBug(true);
      });
    }
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
        if(this.showSandbox) this.showSandbox(false);
        if(this.showGameModes){
          this.showGameModes(true);
        }else if(this.showMainMenu){
          this.showMainMenu(true);
        }
      });
    }
    if(this.$sandboxReset){ this.$sandboxReset.addEventListener('click', ()=> this.emit('sandboxReset')); }
    if(this.$sandboxStart){ this.$sandboxStart.addEventListener('click', ()=> this.emit('sandboxStart')); }
    // Main menu settings controls
    if(this.$volSliderMain){ this.$volSliderMain.addEventListener('input', ()=> this.emit('setVolume', parseInt(this.$volSliderMain.value,10)||0)); }
    const $btnMainSettingsBack = document.getElementById('btn-main-settings-back');
    if($btnMainSettingsBack){ $btnMainSettingsBack.addEventListener('click', ()=> this.emit('mainSettingsBack')); }
    const $btnHowToBack = document.getElementById('btn-howto-back');
    if(this.$btnMainHowTo){
      this.$btnMainHowTo.addEventListener('click', ()=>{
        // Hide the database menu while the How To Play overlay is active so
        // panels do not visually stack.
        if(this.showDatabase) this.showDatabase(false);
        if(this.$howToOverlay) this.$howToOverlay.classList.add('visible');
        this.updateModalMask();
        this.emit('mainHowTo');
      });
    }
    if($btnHowToBack){
      $btnHowToBack.addEventListener('click', ()=>{
        if(this.$howToOverlay) this.$howToOverlay.classList.remove('visible');
        // Return to Database if it was the entry point; otherwise fall
        // back to the main menu.
        if(this.showDatabase){
          this.showDatabase(true);
        }else if(this.showMainMenu){
          this.showMainMenu(true);
        }
        this.updateModalMask();
        this.emit('closeHowTo');
      });
    }
    const $btnPatchBack = document.getElementById('btn-patch-back');
    if(this.$btnMainPatchNotes){
      this.$btnMainPatchNotes.addEventListener('click', ()=>{
        if(this.showDatabase) this.showDatabase(false);
        if(this.$patchNotesOverlay) this.$patchNotesOverlay.classList.add('visible');
        this.updateModalMask();
        this.emit('mainPatchNotes');
      });
    }
    if($btnPatchBack){
      $btnPatchBack.addEventListener('click', ()=>{
        if(this.$patchNotesOverlay) this.$patchNotesOverlay.classList.remove('visible');
        if(this.showDatabase){
          this.showDatabase(true);
        }else if(this.showMainMenu){
          this.showMainMenu(true);
        }
        this.updateModalMask();
        this.emit('closePatchNotes');
      });
    }
    // Bug Reports overlay: reachable from the Play submenu.
    const $btnBugBack = document.getElementById('btn-bug-back');
    if(this.$btnMainBug){
      this.$btnMainBug.addEventListener('click', ()=>{
        this._bugOrigin = 'play';
        if(this.showPlayMenu) this.showPlayMenu(false);
        if(this.$bugOverlay) this.$bugOverlay.classList.add('visible');
        this.updateModalMask();
        this.emit('mainBug');
      });
    }
    if($btnBugBack){
      $btnBugBack.addEventListener('click', ()=>{
        if(this.$bugOverlay) this.$bugOverlay.classList.remove('visible');
        if(this._bugOrigin === 'play' && this.showPlayMenu){
          this.showPlayMenu(true);
        }else if(this.showMainMenu){
          this.showMainMenu(true);
        }
        this._bugOrigin = 'mainmenu';
        this.updateModalMask();
        this.emit('closeBug');
      });
    }
    if(this.$bugForm){
      this.$bugForm.addEventListener('submit', async (ev)=>{
        ev.preventDefault();
        if(this.$bugStatus){
          this.$bugStatus.textContent = 'Sending report…';
          this.$bugStatus.style.color = COLORS.accent || '#17e7a4';
        }
        try{
          const action = this.$bugForm.getAttribute('action') || 'https://formspree.io/f/xjknrlka';
          const fd = new FormData(this.$bugForm);
          const res = await fetch(action, {
            method:'POST',
            body: fd,
            headers:{ 'Accept':'application/json' }
          });
          if(res.ok){
            if(this.$bugStatus){
              this.$bugStatus.textContent = 'Thank you — your report has been submitted.';
              this.$bugStatus.style.color = COLORS.accent || '#17e7a4';
            }
            this.$bugForm.reset();
          } else {
            if(this.$bugStatus){
              this.$bugStatus.textContent = 'Submission failed. Please try again in a moment.';
              this.$bugStatus.style.color = COLORS.danger || '#ff5370';
            }
          }
        }catch(e){
          if(this.$bugStatus){
            this.$bugStatus.textContent = 'Network error while sending report.';
            this.$bugStatus.style.color = COLORS.danger || '#ff5370';
          }
        }
      });
    }
    if(this.$pauseBugForm){
      this.$pauseBugForm.addEventListener('submit', async (ev)=>{
        ev.preventDefault();
        if(this.$pauseBugStatus){
          this.$pauseBugStatus.textContent = 'Sending report…';
          this.$pauseBugStatus.style.color = COLORS.accent || '#17e7a4';
        }
        try{
          const action = this.$pauseBugForm.getAttribute('action') || 'https://formspree.io/f/xjknrlka';
          const fd = new FormData(this.$pauseBugForm);
          const res = await fetch(action, {
            method:'POST',
            body: fd,
            headers:{ 'Accept':'application/json' }
          });
          if(res.ok){
            if(this.$pauseBugStatus){
              this.$pauseBugStatus.textContent = 'Thank you — your report has been submitted.';
              this.$pauseBugStatus.style.color = COLORS.accent || '#17e7a4';
            }
            this.$pauseBugForm.reset();
          } else if(this.$pauseBugStatus){
            this.$pauseBugStatus.textContent = 'Submission failed. Please try again in a moment.';
            this.$pauseBugStatus.style.color = COLORS.danger || '#ff5370';
          }
        }catch(e){
          if(this.$pauseBugStatus){
            this.$pauseBugStatus.textContent = 'Network error while sending report.';
            this.$pauseBugStatus.style.color = COLORS.danger || '#ff5370';
          }
        }
      });
    }
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
          password: this.$loginPassword ? (this.$loginPassword.value||'') : '',
          staySignedIn: this.$loginStaySignedIn ? !!this.$loginStaySignedIn.checked : false
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
          password: this.$pauseLoginPassword ? (this.$pauseLoginPassword.value||'') : '',
          staySignedIn: this.$pauseLoginStaySignedIn ? !!this.$pauseLoginStaySignedIn.checked : false
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
    if(this.$btnPauseBugBack){
      this.$btnPauseBugBack.addEventListener('click', ()=>{
        if(this.showPauseBug) this.showPauseBug(false);
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
    if(this.$lbSearchBtn){
      this.$lbSearchBtn.addEventListener('click', ()=>{
        const term = this.$lbSearchInput ? (this.$lbSearchInput.value||'').trim() : '';
        if(!term) return;
        this.emit('openUserProfile', { username: term, origin:'leaderboard' });
      });
    }
    if(this.$lbSearchInput){
      this.$lbSearchInput.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter'){
          e.preventDefault();
          if(this.$lbSearchBtn) this.$lbSearchBtn.click();
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
    // Debug sprite tuning toggle (main settings only)
    this.$debugToggleMain = document.getElementById('debug-toggle-main');
    const onDebugChange = (src)=>{
      const v = !!src.checked;
      if(this.$debugToggleMain && this.$debugToggleMain!==src) this.$debugToggleMain.checked = v;
      this.emit('toggleDebug', v);
    };
    if(this.$debugToggleMain){ this.$debugToggleMain.addEventListener('change', ()=> onDebugChange(this.$debugToggleMain)); }

    // Desktop-only main settings controls (fullscreen + dev settings sub-screen)
    const isDesktopRuntime = this.isDesktopRuntime;
    if(this.$mainSettingsDesktopActions){
      this.$mainSettingsDesktopActions.style.display = isDesktopRuntime ? 'flex' : 'none';
    }
    if(this.$mainDevSettingsPanel && this.$mainDevSettingsActions){
      // Hosted build: show dev panel inline, hide its inner back button.
      // Desktop build: keep dev panel hidden until "Developer Settings"
      // is pressed, and show its own back button when visible.
      if(isDesktopRuntime){
        this.$mainDevSettingsPanel.style.display = 'none';
        this.$mainDevSettingsActions.style.display = 'flex';
      }else{
        this.$mainDevSettingsPanel.style.display = 'block';
        this.$mainDevSettingsActions.style.display = 'none';
      }
    }

    if(isDesktopRuntime && this.$btnMainDevSettings && this.$mainDevSettingsPanel){
      this.$btnMainDevSettings.addEventListener('click', ()=>{
        if(this.$mainSettingsPrimary) this.$mainSettingsPrimary.style.display = 'none';
        if(this.$mainSettingsDesktopActions) this.$mainSettingsDesktopActions.style.display = 'none';
        if(this.$mainSettingsBackRow) this.$mainSettingsBackRow.style.display = 'none';
        this.$mainDevSettingsPanel.style.display = 'block';
      });
    }
    if(isDesktopRuntime && this.$btnMainDevSettingsClose && this.$mainDevSettingsPanel){
      this.$btnMainDevSettingsClose.addEventListener('click', ()=>{
        this.$mainDevSettingsPanel.style.display = 'none';
        if(this.$mainSettingsPrimary) this.$mainSettingsPrimary.style.display = 'block';
        if(this.$mainSettingsDesktopActions) this.$mainSettingsDesktopActions.style.display = 'flex';
        if(this.$mainSettingsBackRow) this.$mainSettingsBackRow.style.display = 'flex';
      });
    }

    if(this.$btnProfileClose){
      this.$btnProfileClose.addEventListener('click', ()=>{
        this.emit('closeUserProfile');
      });
    }
    if(this.$btnProfileSearch){
      const doProfileSearch = ()=>{
        const term = this.$profileSearchInput ? (this.$profileSearchInput.value||'').trim() : '';
        if(!term) return;
        this.emit('openUserProfile', { username: term, origin:'profile' });
      };
      this.$btnProfileSearch.addEventListener('click', doProfileSearch);
      if(this.$profileSearchInput){
        this.$profileSearchInput.addEventListener('keydown', (e)=>{
          if(e.key === 'Enter'){
            e.preventDefault();
            doProfileSearch();
          }
        });
      }
    }
    if(isDesktopRuntime && this.$btnMainFullscreen){
      let isDesktopFullscreen = false;
      const applyFullscreenLabel = (isFullscreen)=>{
        isDesktopFullscreen = !!isFullscreen;
        this.$btnMainFullscreen.textContent = isDesktopFullscreen
          ? 'Switch to Windowed'
          : 'Switch to Fullscreen';
      };
      const updateFsLabel = ()=>{
        try{
          if(typeof window !== 'undefined' && window.NANO_DESKTOP && typeof window.NANO_DESKTOP.getFullscreen === 'function'){
            window.NANO_DESKTOP.getFullscreen().then((isFullscreen)=>{
              applyFullscreenLabel(isFullscreen);
            }).catch(()=>{});
          }else{
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
            applyFullscreenLabel(isFullscreen);
          }
        }catch(e){}
      };
      const toggleFs = ()=>{
        try{
          if(typeof window !== 'undefined' && window.NANO_DESKTOP && typeof window.NANO_DESKTOP.toggleFullscreen === 'function'){
            window.NANO_DESKTOP.toggleFullscreen().then((isFullscreen)=>{
              applyFullscreenLabel(isFullscreen);
            }).catch(()=>{});
            return;
          }
        }catch(e){}
        try{
          const rootEl = document.documentElement;
          const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
          if(isFullscreen){
            if(document.exitFullscreen){
              document.exitFullscreen().catch(()=>{});
            }else if(document.webkitExitFullscreen){
              document.webkitExitFullscreen();
            }
          }else{
            if(rootEl.requestFullscreen){
              rootEl.requestFullscreen().catch(()=>{});
            }else if(rootEl.webkitRequestFullscreen){
              rootEl.webkitRequestFullscreen();
            }
          }
        }catch(e){}
      };
      updateFsLabel();
      this.$btnMainFullscreen.addEventListener('click', toggleFs);
      if(typeof window !== 'undefined' && window.NANO_DESKTOP && typeof window.NANO_DESKTOP.onFullscreenChanged === 'function'){
        try{
          window.NANO_DESKTOP.onFullscreenChanged((isFullscreen)=>{
            try{
              applyFullscreenLabel(isFullscreen);
            }catch(e){}
          });
        }catch(e){}
      }else{
        document.addEventListener('fullscreenchange', updateFsLabel);
        document.addEventListener('webkitfullscreenchange', updateFsLabel);
      }
    }

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

    // Desktop-only exit choice overlay handlers (pause → Exit)
    if(this.$appExitOverlay && isDesktopRuntime){
      if(this.$btnAppExitCancel){
        this.$btnAppExitCancel.addEventListener('click', ()=>{
          this.$appExitOverlay.classList.remove('visible');
        });
      }
      if(this.$btnAppExitMenu){
        this.$btnAppExitMenu.addEventListener('click', ()=>{
          this.$appExitOverlay.classList.remove('visible');
          this.emit('exitToMenuImmediate');
        });
      }
      if(this.$btnAppExitDesktop){
        this.$btnAppExitDesktop.addEventListener('click', ()=>{
          this.$appExitOverlay.classList.remove('visible');
          this.emit('exitToDesktop');
        });
      }
    }

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

    // Ensure the initial overlay state (typically the main menu) correctly
    // applies the global mainmenu-visible body class so the gameboard stays
    // hidden behind fullscreen menus until gameplay begins.
    this.updateModalMask();
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
      const col = getHpColor(pct);
      this.$hpFill.style.background = `linear-gradient(90deg, ${col}, ${col})`;
      const r = parseInt(col.slice(1,3),16);
      const g = parseInt(col.slice(3,5),16);
      const b = parseInt(col.slice(5,7),16);
      this.$hpFill.style.boxShadow = `inset 0 0 10px rgba(${r}, ${g}, ${b}, 0.45)`;
      this.$hpFill.classList.remove('low');
    }
  }
  setMaxLives(max){ this.maxLives = Math.max(1, max|0); this.setLives(this.maxLives); }
  setUpgradeCostMultiplier(mul){
    const v = Number.isFinite(mul) && mul>0 ? mul : 1;
    this.upgradeCostMul = v;
  }
  setCharacterPortrait(key){
    if(!this.$hpCharSprite) return;
    const map = {
      volt: 'data/Volt.png',
      torque: 'data/Torque.png',
      lumen: 'data/Lumen.png'
    };
    const safeKey = (key === 'torque' || key === 'lumen' || key === 'volt') ? key : 'volt';
    // Keep UI's notion of the active character in sync.
    this.selectedCharacterKey = safeKey;
    const url = map[safeKey] || map.volt;
    // Keep HUD tooltip in sync with the active character.
    if(this.characterTips && this.characterTips[safeKey]){
      this.tipText.character = this.characterTips[safeKey];
    }
    if(this.$hpCharIcon){
      this.$hpCharIcon.classList.remove('theme-volt','theme-lumen','theme-torque');
      this.$hpCharIcon.classList.add(`theme-${safeKey}`);
    }
    // Reset HP portrait animation for this character so each run and
    // selection starts from a clean state with the correct sheets.
    if(this._hpAnim){
      try{
        const anim = this._hpAnim;
        if(anim.loopHandle && typeof window !== 'undefined' && window.cancelAnimationFrame){
          window.cancelAnimationFrame(anim.loopHandle);
        }
      }catch(e){}
      if(this.$hpCharSprite){
        try{ this.$hpCharSprite.innerHTML = ''; }catch(e){}
      }
      this._hpAnim = {
        key: safeKey,
        mode: 'blink',
        frameIndex: 0,
        frameTime: 0,
        fps: 24,
        paused: false,
        blinkSheet: null,
        talkSheet: null,
        canvas: null,
        ctx: null,
        loopHandle: null,
        lastTs: null
      };
      this._ensureHpSheetsForKey(safeKey);
      this._startHpAnimLoop();
    }
  }

  showPilotLine(text, key='volt'){
    if(!this.$pilotDialog || !text) return;
    const el = this.$pilotDialog;
    const safeKey = key || 'volt';
    el.textContent = text;
    el.dataset.char = safeKey;
    el.classList.add('visible');
    // Trigger talking animation on the active HP portrait; if a blink
    // is in progress, the system will finish that blink before
    // starting the talking loop for a smoother transition.
    if(this._hpAnim){
      this._requestHpTalkAnimation(safeKey);
    }
    if(this._pilotTimer){
      try{ clearTimeout(this._pilotTimer); }catch(e){}
    }
    this._pilotTimer = setTimeout(()=>{
      el.classList.remove('visible');
    }, 4200);
  }

  _ensureHpSheetsForKey(key){
    if(!this._hpAnim || !key) return;
    const anim = this._hpAnim;
    const baseMap = { volt:'Volt', torque:'Torque', lumen:'Lumen' };
    const base = baseMap[key] || baseMap.volt;
    const makeLoader = (kind)=>{
      const existing = (kind === 'talk') ? anim.talkSheet : anim.blinkSheet;
      // If we already have a ready sheet for this character and kind,
      // there is nothing more to do.
      if(existing && existing.ready && existing.key === key){
        return;
      }
      // Files are expected as e.g. Volt-Blinking.png / Volt-Talking.png
      const suffix = kind === 'talk' ? '-Talking' : '-Blinking';
      const url = `data/${base}${suffix}.png`;
      if(typeof Image === 'undefined' || typeof document === 'undefined'){
        return;
      }
      const img = new Image();
      const sheet = {
        key,
        img,
        url,
        cols: 4,
        // Sprite sheets are laid out as 4 columns by 30 rows,
        // plus one extra frame at the very end (4×30 + 1 = 121
        // frames total). We treat this as a 4×31 grid and only
        // use the first 121 cells; the remaining 3 cells in the
        // last row are ignored.
        frameCount: 121,
        frameW: 0,
        frameH: 0,
        ready: false,
        loading: true,
        failed: false
      };
      if(kind === 'talk'){
        anim.talkSheet = sheet;
      }else{
        anim.blinkSheet = sheet;
      }
      img.onload = ()=>{
        // Treat the flat teal/blue background as transparent so only
        // the pilot art is visible over the HUD camera feed.
        let source = img;
        try{
          if(punchOutSpriteBackground){
            const processed = punchOutSpriteBackground(img);
            if(processed) source = processed;
          }
        }catch(e){}
        const cols = sheet.cols || 4;
        const totalFrames = sheet.frameCount || 121;
        const totalRows = Math.max(1, Math.ceil(totalFrames / cols)); // 4×30 +1 → 31 rows
        const fw = source.width / cols;
        const fh = source.height / totalRows;
        sheet.img = source;
        sheet.frameW = fw;
        sheet.frameH = fh;
        sheet.frameCount = totalFrames;
        sheet.ready = true;
        sheet.loading = false;
        sheet.failed = false;
      };
      img.onerror = ()=>{
        sheet.ready = false;
        sheet.loading = false;
        sheet.failed = true;
      };
      img.src = url;
    };
    makeLoader('blink');
    makeLoader('talk');
  }

  _ensureHpAnimCanvas(){
    if(!this._hpAnim || !this.$hpCharSprite) return;
    const anim = this._hpAnim;
    if(anim.canvas && anim.ctx) return;
    if(typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.imageRendering = 'auto';
    this.$hpCharSprite.appendChild(canvas);
    anim.canvas = canvas;
    anim.ctx = canvas.getContext('2d');
  }

  _startHpAnimLoop(){
    if(!this._hpAnim) return;
    const anim = this._hpAnim;
    if(anim.loopHandle || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function'){
      return;
    }
    const step = (ts)=>{
      anim.loopHandle = window.requestAnimationFrame(step);
      if(anim.lastTs == null){
        anim.lastTs = ts;
        return;
      }
      const dtMs = ts - anim.lastTs;
      anim.lastTs = ts;
      const dt = dtMs>0 ? dtMs/1000 : 0;
      this._updateHpPortraitAnim(dt);
    };
    anim.lastTs = null;
    anim.loopHandle = window.requestAnimationFrame(step);
  }

  setHpPortraitPaused(paused){
    if(!this._hpAnim) return;
    const anim = this._hpAnim;
    anim.paused = !!paused;
    if(!paused){
      // When resuming from a pause, reset the timing origin so the
      // next animation frame uses a fresh dt instead of a huge jump.
      anim.lastTs = null;
    }
  }

  _requestHpTalkAnimation(key){
    if(!this._hpAnim) return;
    const anim = this._hpAnim;
    // If a talking animation is already running, ignore additional
    // requests so we never restart or layer a second talking loop on
    // top of the current one.
    if(anim.mode === 'talk'){
      return;
    }
    const safeKey = key || anim.key || 'volt';
    anim.key = safeKey;
    this._ensureHpSheetsForKey(safeKey);
    // Simple flow: as soon as talking starts, switch to the talking
    // sheet from frame 0 and let it run all the way to the end.
    anim.mode = 'talk';
    anim.frameIndex = 0;
    anim.frameTime = 0;
    this._startHpAnimLoop();
  }

  _updateHpPortraitAnim(dt){
    if(!this._hpAnim || !this.$hpCharSprite) return;
    const anim = this._hpAnim;
    if(anim.paused){
      return;
    }
    // Always follow the character whose portrait was last set.
    const key = anim.key || 'volt';
    if(!anim.blinkSheet){
      // No sheet yet: kick off a load for this character.
      this._ensureHpSheetsForKey(key);
      return;
    }
    if(anim.blinkSheet.failed){
      // One-time failure (e.g., missing sheet for this pilot); nothing
      // to animate. Leave the existing portrait content untouched.
      return;
    }
    if(!anim.blinkSheet.ready){
      // Still loading; try again on the next frame.
      return;
    }
    const blinkSheet = anim.blinkSheet;
    const talkSheet = anim.talkSheet && anim.talkSheet.ready ? anim.talkSheet : null;
    this._ensureHpAnimCanvas();
    if(!anim.canvas || !anim.ctx) return;

    const blinkFrames = Math.max(1, blinkSheet.frameCount || 1);
    const talkFrames = talkSheet && talkSheet.frameCount ? talkSheet.frameCount : 0;
    const frameDur = 1 / (anim.fps || 24);

    anim.frameTime += dt;
    while(anim.frameTime >= frameDur){
      anim.frameTime -= frameDur;
      anim.frameIndex++;
      if(anim.mode === 'talk' && talkSheet && talkFrames > 0){
        if(anim.frameIndex >= talkFrames){
          // Talking finished: return to blinking, starting at frame 0.
          anim.mode = 'blink';
          anim.frameIndex = 0;
        }
      }else{
        // Blinking: simple loop over all frames.
        if(anim.frameIndex >= blinkFrames){
          anim.frameIndex = 0;
        }
      }
    }

    // Choose which sheet/frame to draw for the current mode.
    let sheet = blinkSheet;
    if(anim.mode === 'talk' && talkSheet && talkFrames > 0){
      sheet = talkSheet;
    }
    const frameIndex = anim.frameIndex;

    const ctx = anim.ctx;
    const canvas = anim.canvas;
    if(!ctx || !canvas || !sheet || !sheet.img) return;
    const cols = sheet.cols || 1;
    const frameW = sheet.frameW || (sheet.img.width / cols);
    const frameH = sheet.frameH || frameW;
    if(frameW<=0 || frameH<=0) return;
    const fi = Math.max(0, Math.min(frameIndex, (sheet.frameCount||1)-1));
    const col = fi % cols;
    const row = Math.floor(fi / cols);
    const sx = col * frameW;
    const sy = row * frameH;

    ctx.clearRect(0,0,canvas.width,canvas.height);
    const margin = 6;
    const maxW = canvas.width - margin*2;
    const maxH = canvas.height - margin*2;
    const scale = Math.min(maxW / frameW, maxH / frameH);
    const drawW = frameW * scale;
    const drawH = frameH * scale;
    const dx = (canvas.width - drawW) / 2;
    const dy = (canvas.height - drawH) / 2;
    ctx.drawImage(sheet.img, sx, sy, frameW, frameH, dx, dy, drawW, drawH);
  }
  
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
    const kind = mode === 'restart' ? 'restart' : (mode === 'quit' ? 'quit' : 'exit');
    if(this.$exitTitle){
      if(kind === 'restart'){
        this.$exitTitle.textContent = 'Restart Run?';
      }else if(kind === 'quit'){
        this.$exitTitle.textContent = 'Exit Game?';
      }else{
        this.$exitTitle.textContent = 'Exit to Main Menu?';
      }
    }
    if(this.$exitTag){
      if(kind === 'restart'){
        this.$exitTag.textContent = 'Are you sure you want to restart?';
      }else if(kind === 'quit'){
        this.$exitTag.textContent = 'Are you sure you want to quit Nano‑Siege?';
      }else{
        this.$exitTag.textContent = 'Your current run will be lost.';
      }
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
    if(this.$loginStaySignedIn) this.$loginStaySignedIn.checked = false;
    if(this.$pauseLoginStaySignedIn) this.$pauseLoginStaySignedIn.checked = false;
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

  setCombatStats({
    baseDamage=0, crit=0, critDmg=0, slow=0, burn=0, targeting=0, puddle=0, laserStab=0,
    baseDamageRaw=1, critRaw=0, critDmgRaw=0, slowRaw=1, burnRaw=1, targetingRaw=1, puddleRaw=1, laserStabRaw=1
  }={}){
    const fmtDelta = (v)=> {
      const pct = Math.round(v*100);
      const sign = pct > 0 ? '+' : (pct < 0 ? '' : '+');
      return `${sign}${pct}%`;
    };
    const fmtMul = (v)=> {
      const val = Number.isFinite(v) ? v : 1;
      return `${val.toFixed(2)}x`;
    };
    const fmtPct = (v)=> {
      const pct = Math.round(v*100);
      return `${pct}%`;
    };
    if(this.$statBaseDmgRaw) this.$statBaseDmgRaw.textContent = fmtMul(baseDamageRaw);
    if(this.$statBaseDmg) this.$statBaseDmg.textContent = fmtDelta(baseDamage);
    if(this.$statCritRaw) this.$statCritRaw.textContent = fmtPct(critRaw);
    if(this.$statCrit) this.$statCrit.textContent = fmtDelta(crit);
    if(this.$statCritDmgRaw) this.$statCritDmgRaw.textContent = fmtPct(critDmgRaw);
    if(this.$statCritDmg) this.$statCritDmg.textContent = fmtDelta(critDmg);
    if(this.$statSlowRaw) this.$statSlowRaw.textContent = fmtMul(slowRaw);
    if(this.$statSlow) this.$statSlow.textContent = fmtDelta(slow);
    if(this.$statBurnRaw) this.$statBurnRaw.textContent = fmtMul(burnRaw);
    if(this.$statBurn) this.$statBurn.textContent = fmtDelta(burn);
    if(this.$statTargetRaw) this.$statTargetRaw.textContent = fmtMul(targetingRaw);
    if(this.$statTarget) this.$statTarget.textContent = fmtDelta(targeting);
    if(this.$statPuddleRaw) this.$statPuddleRaw.textContent = fmtMul(puddleRaw);
    if(this.$statPuddle) this.$statPuddle.textContent = fmtDelta(puddle);
    if(this.$statLaserStabRaw) this.$statLaserStabRaw.textContent = fmtMul(laserStabRaw);
    if(this.$statLaserStab) this.$statLaserStab.textContent = fmtDelta(laserStab);
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
    this.updateModalMask();
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
    const profileVisible = this.$profileOverlay && this.$profileOverlay.classList.contains('visible');
    const playMenuVisible = this.$playMenuOverlay && this.$playMenuOverlay.classList.contains('visible');
    const profileMenuVisible = this.$profileMenuOverlay && this.$profileMenuOverlay.classList.contains('visible');
    const databaseVisible = this.$databaseOverlay && this.$databaseOverlay.classList.contains('visible');
    const mapSelVisible = this.$mapOverlay && this.$mapOverlay.classList.contains('visible');
    const modesVisible = this.$modesOverlay && this.$modesOverlay.classList.contains('visible');
    const assemblyVisible = this.$assembly && this.$assembly.classList.contains('visible');
    const mainSettingsVisible = this.$mainSettings && this.$mainSettings.classList.contains('visible');
    const howtoVisible = this.$howToOverlay && this.$howToOverlay.classList.contains('visible');
    const bugVisible = this.$bugOverlay && this.$bugOverlay.classList.contains('visible');
    const patchVisible = this.$patchNotesOverlay && this.$patchNotesOverlay.classList.contains('visible');
    const sandboxVisible = this.$sandbox && this.$sandbox.classList.contains('visible');
    const modalActive = !!(loadVisible || createVisible || boardVisible || profileVisible || playMenuVisible || profileMenuVisible || databaseVisible || mapSelVisible || modesVisible || assemblyVisible || mainSettingsVisible || howtoVisible || bugVisible || patchVisible || sandboxVisible);
    this.$root.classList.toggle('modal-overlay', modalActive);
    const primaryMenuVisible = this.$mainMenu && this.$mainMenu.classList.contains('visible');
    // Treat all fullscreen main-menu flows (main menu, game modes, map select,
    // auth, leaderboard, settings, sandbox lab, etc.) as "menu mode" so the
    // in-game board/HUD are fully hidden behind the global background. The
    // Assembly overlay lives inside the game container and should not trigger
    // this global fade.
    const fullscreenMenuVisible = !!(
      primaryMenuVisible ||
      loadVisible ||
      createVisible ||
      boardVisible ||
      profileVisible ||
      playMenuVisible ||
      profileMenuVisible ||
      databaseVisible ||
      mapSelVisible ||
      modesVisible ||
      mainSettingsVisible ||
      howtoVisible ||
      bugVisible ||
      patchVisible ||
      sandboxVisible
    );
    document.body.classList.toggle('mainmenu-visible', fullscreenMenuVisible);
  }
  showLeaderboard(show){
    if(this.$leaderboard) this.$leaderboard.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showUserProfile(show){
    if(this.$profileOverlay) this.$profileOverlay.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  setPatchNotes(data){
    if(!data || !this.$patchVersionSelect || !this.$patchNotesList) return;
    const meta = data.meta || null;
    const versions = Array.isArray(data.versions) ? data.versions : [];
    this._patchMeta = meta;
    this._patchVersions = versions;

    while(this.$patchVersionSelect.firstChild){
      this.$patchVersionSelect.removeChild(this.$patchVersionSelect.firstChild);
    }
    let initial = null;
    const currentGame = meta && (meta.gameVersion || meta.version);
    for(const v of versions){
      if(!v || !v.version) continue;
      const opt = document.createElement('option');
      opt.value = v.version;
      opt.textContent = v.version;
      this.$patchVersionSelect.appendChild(opt);
      if(!initial) initial = v;
      if(currentGame && v.version === currentGame){
        initial = v;
      }
    }
    if(!initial && versions.length){
      initial = versions[0];
    }
    const applySelection = (entry)=>{
      if(!entry) return;
      if(this.$patchVersionSelect){
        this.$patchVersionSelect.value = entry.version;
      }
      if(this.$patchVersionSummary){
        const parts = [];
        parts.push(`Game v${entry.version}`);
        const launcherVersion = meta && meta.launcherVersion;
        if(launcherVersion){
          parts.push(`Launcher v${launcherVersion}`);
        }
        this.$patchVersionSummary.textContent = parts.join(' • ');
      }
      while(this.$patchNotesList.firstChild){
        this.$patchNotesList.removeChild(this.$patchNotesList.firstChild);
      }
      const lines = Array.isArray(entry.notes) ? entry.notes : [];
      for(const line of lines){
        const li = document.createElement('li');
        li.textContent = line;
        this.$patchNotesList.appendChild(li);
      }
    };
    this._applyPatchNotesSelection = applySelection;
    if(initial){
      applySelection(initial);
    }else{
      if(this.$patchVersionSummary) this.$patchVersionSummary.textContent = '';
      while(this.$patchNotesList.firstChild){
        this.$patchNotesList.removeChild(this.$patchNotesList.firstChild);
      }
    }
    if(this.$patchVersionSelect){
      this.$patchVersionSelect.onchange = ()=>{
        if(!this._patchVersions || !this._applyPatchNotesSelection) return;
        const v = this.$patchVersionSelect.value;
        const entry = this._patchVersions.find((e)=> e && e.version === v);
        if(entry) this._applyPatchNotesSelection(entry);
      };
    }
  }
  showMainSettings(show){
    if(this.$mainSettings) this.$mainSettings.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showMenu(show){ this.show(this.$menu, show); }
  showAssembly(show){
    if(this.$assembly) this.$assembly.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showMapSelect(show){
    if(this.$mapOverlay) this.$mapOverlay.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showGameModes(show){
    if(this.$modesOverlay) this.$modesOverlay.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showPlayMenu(show){
    if(this.$playMenuOverlay) this.$playMenuOverlay.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showProfileMenu(show){
    if(this.$profileMenuOverlay) this.$profileMenuOverlay.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showDatabase(show){
    if(this.$databaseOverlay) this.$databaseOverlay.classList.toggle('visible', !!show);
    this.updateModalMask();
  }
  showPause(show){
    this.show(this.$pauseOverlay, show);
    if(show){
      this.showSettings(false);
      if(this.showPauseLogin) this.showPauseLogin(false);
      if(this.showPauseBug) this.showPauseBug(false);
    }
  }
  showSettings(show){
    if(!this.$settingsPanel) return;
    this.$settingsPanel.style.display = show? 'block' : 'none';
    if(show && this.$pauseLoginPanel){
      this.$pauseLoginPanel.style.display = 'none';
    }
    if(show && this.$pauseBugPanel){
      this.$pauseBugPanel.style.display = 'none';
    }
    if(this.$pauseActions) this.$pauseActions.style.display = show? 'none' : 'flex';
  }
  showPauseLogin(show){
    if(!this.$pauseLoginPanel) return;
    this.$pauseLoginPanel.style.display = show ? 'block' : 'none';
    if(show && this.$settingsPanel){
      this.$settingsPanel.style.display = 'none';
    }
    if(show && this.$pauseBugPanel){
      this.$pauseBugPanel.style.display = 'none';
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
  showSandbox(show){
    this.show(this.$sandbox, show);
    this.updateModalMask();
  }
  showPauseBug(show){
    if(!this.$pauseBugPanel) return;
    this.$pauseBugPanel.style.display = show ? 'block' : 'none';
    if(show){
      if(this.$settingsPanel) this.$settingsPanel.style.display = 'none';
      if(this.$pauseLoginPanel) this.$pauseLoginPanel.style.display = 'none';
    }
    if(this.$pauseActions) this.$pauseActions.style.display = show ? 'none' : 'flex';
  }
  _getCharacterMeta(key){
    const k = (key || '').trim().toLowerCase();
    if(!k) return null;
    const map = {
      volt: { key:'volt', label:'Volt' },
      lumen: { key:'lumen', label:'Lumen' },
      torque: { key:'torque', label:'Torque' }
    };
    return map[k] || null;
  }
  _createCharacterChip(key, opts={}){
    if(typeof document === 'undefined') return null;
    const meta = this._getCharacterMeta(key);
    if(!meta) return null;
    const chip = document.createElement('span');
    chip.className = 'character-chip';
    chip.dataset.character = meta.key;
    const icon = document.createElement('span');
    icon.className = 'character-chip-icon';
    icon.setAttribute('aria-hidden', 'true');
    // Use the same processed/cropped character portraits as the map
    // select + HUD so the teal background in the raw PNGs is punched
    // out and the icons sit cleanly on any overlay.
    try{
      if(this._drawProcessedSpriteInto){
        let url = null;
        if(meta.key === 'volt') url = 'data/Volt.png';
        else if(meta.key === 'torque') url = 'data/Torque.png';
        else if(meta.key === 'lumen') url = 'data/Lumen.png';
        if(url){
          this._drawProcessedSpriteInto(url, icon, {
            size: 32,
            targetSize: 26,
            replaceChildren: true,
            cropPad: 2,
            pixelated: true
          });
        }
      }
    }catch(e){}
    const label = document.createElement('span');
    label.className = 'character-chip-label';
    label.textContent = typeof opts.label === 'string' && opts.label ? opts.label : meta.label;
    chip.appendChild(icon);
    chip.appendChild(label);
    return chip;
  }
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
      name.className = 'rank clickable';
      const uname = entry.username || 'Unknown Operative';
      name.textContent = uname;
      name.dataset.username = uname;
      name.addEventListener('click', ()=>{
        if(uname && uname !== 'Unknown Operative'){
          this.emit('openUserProfile', { username: uname, origin:'leaderboard' });
        }
      });
      nameWrap.appendChild(name);
      const waves = document.createElement('span');
      waves.className = 'waves';
      const perfect = Math.max(0, entry.perfectCombo || 0);
      const infoParts = [`${entry.waves ?? 0} waves`, `Perfect Combo ${perfect}`];
      waves.textContent = infoParts.join(' • ');
      nameWrap.appendChild(waves);
      // Optional: show which pilot was used for this run as a colored
      // chip with icon so character identity is immediately visible.
      const pilotKey = entry.character || entry.pilot || null;
      if(pilotKey){
        const chip = this._createCharacterChip(pilotKey);
        if(chip){
          chip.classList.add('rank-character-chip');
          nameWrap.appendChild(chip);
        }
      }
      li.appendChild(nameWrap);
      this.$leaderboardList.appendChild(li);
    });
  }
  setUserProfileLoading(on){
    if(!this.$profileLoading) return;
    this.$profileLoading.style.display = on ? 'block' : 'none';
    if(on && this.$profileError){
      this.$profileError.style.display = 'none';
      this.$profileError.textContent = '';
    }
  }
  setUserProfileError(message){
    if(!this.$profileError) return;
    this.$profileError.textContent = message || '';
    this.$profileError.style.display = message ? 'block' : 'none';
  }
  renderUserProfile(profile){
    if(this.$profileLoading) this.$profileLoading.style.display = 'none';
    this.setUserProfileError('');
    if(this.$profileBestMaps) this.$profileBestMaps.innerHTML = '';
    if(this.$profileRuns) this.$profileRuns.innerHTML = '';
    if(!profile){
      if(this.$profileUsername) this.$profileUsername.textContent = '';
      if(this.$profileJoined) this.$profileJoined.textContent = '';
      if(this.$profileLastSeen) this.$profileLastSeen.textContent = '';
      if(this.$profileRoles) this.$profileRoles.textContent = '';
      if(this.$profileBestPerfect) this.$profileBestPerfect.textContent = '0';
      if(this.$profileMissionUnlock) this.$profileMissionUnlock.textContent = '1';
      if(this.$profileTotalRuns) this.$profileTotalRuns.textContent = '0';
      if(this.$profileFavoriteCharacter) this.$profileFavoriteCharacter.textContent = '—';
      if(this.$profileRunsEmpty) this.$profileRunsEmpty.style.display = 'block';
      return;
    }
    const name = profile.username || 'Unknown Operative';
    const joinedMs = typeof profile.createdAt === 'number' ? profile.createdAt : null;
    const lastMs = typeof profile.lastLoginAt === 'number' ? profile.lastLoginAt : null;
    const roles = Array.isArray(profile.roles) && profile.roles.length ? profile.roles : ['user'];
    const bestPerfect = Number.isFinite(profile.bestPerfectCombo) ? profile.bestPerfectCombo|0 : 0;
    const mission = Number.isFinite(profile.missionUnlockLevel) ? profile.missionUnlockLevel|0 : 1;
    const rawRuns = Array.isArray(profile.scoreHistory) ? profile.scoreHistory.slice() : [];
    const totalRuns = rawRuns.length;
    const formatDate = (ms)=>{
      if(!ms || !Number.isFinite(ms)) return '—';
      try{
        return new Date(ms).toLocaleDateString();
      }catch(e){
        return '—';
      }
    };
    const formatDateTime = (ms)=>{
      if(!ms || !Number.isFinite(ms)) return '';
      try{
        return new Date(ms).toLocaleString();
      }catch(e){
        return '';
      }
    };
    if(this.$profileUsername) this.$profileUsername.textContent = name;
    if(this.$profileJoined) this.$profileJoined.textContent = `Joined: ${formatDate(joinedMs)}`;
    if(this.$profileLastSeen) this.$profileLastSeen.textContent = `Last Seen: ${formatDate(lastMs)}`;
    if(this.$profileRoles) this.$profileRoles.textContent = `Roles: ${roles.join(', ')}`;
    if(this.$profileBestPerfect) this.$profileBestPerfect.textContent = String(bestPerfect);
    if(this.$profileMissionUnlock) this.$profileMissionUnlock.textContent = String(mission);
    if(this.$profileTotalRuns) this.$profileTotalRuns.textContent = String(totalRuns);
    // Favorite character by frequency
    let favoriteCharKey = null;
    let favoriteCharLabel = '—';
    if(rawRuns.length){
      const counts = {};
      for(const r of rawRuns){
        const key = (r.character || r.pilot || '').trim().toLowerCase();
        if(!key) continue;
        counts[key] = (counts[key] || 0) + 1;
      }
      let bestKey = null;
      let bestCount = 0;
      for(const k in counts){
        if(counts[k] > bestCount){
          bestCount = counts[k];
          bestKey = k;
        }
      }
      if(bestKey){
        favoriteCharKey = bestKey;
        const meta = this._getCharacterMeta(bestKey);
        favoriteCharLabel = (meta && meta.label) || bestKey;
      }
    }
    if(this.$profileFavoriteCharacter){
      this.$profileFavoriteCharacter.textContent = '';
      if(favoriteCharKey){
        const chip = this._createCharacterChip(favoriteCharKey);
        if(chip){
          chip.classList.add('profile-character-chip');
          this.$profileFavoriteCharacter.appendChild(chip);
        } else {
          this.$profileFavoriteCharacter.textContent = favoriteCharLabel;
        }
      } else {
        this.$profileFavoriteCharacter.textContent = '—';
      }
    }
    // Best waves by map
    if(this.$profileBestMaps){
      const byMap = new Map();
      for(const r of rawRuns){
        const key = (r.map || '').trim() || 'unknown';
        const waves = Number.isFinite(r.waves) ? r.waves|0 : 0;
        if(waves <= 0) continue;
        const prev = byMap.get(key);
        if(!prev || waves > prev.waves){
          byMap.set(key, { map:key, waves });
        }
      }
      const bestEntries = Array.from(byMap.values()).sort((a,b)=> (b.waves||0) - (a.waves||0)).slice(0,5);
      if(!bestEntries.length){
        const li = document.createElement('li');
        li.textContent = 'No recorded runs yet.';
        this.$profileBestMaps.appendChild(li);
      }else{
        bestEntries.forEach(e=>{
          const li = document.createElement('li');
          const mapDef = MAPS.find(m=> m.key === e.map);
          const label = (mapDef && mapDef.name) || e.map || 'Unknown Map';
          li.textContent = `${label} — ${e.waves} waves`;
          this.$profileBestMaps.appendChild(li);
        });
      }
    }
    // Recent runs
    if(this.$profileRuns){
      const runs = rawRuns.slice().sort((a,b)=> (b.at||0) - (a.at||0)).slice(0,20);
      if(this.$profileRunsEmpty){
        this.$profileRunsEmpty.style.display = runs.length ? 'none' : 'block';
      }
      runs.forEach(r=>{
        const li = document.createElement('li');
        const mapDef = MAPS.find(m=> m.key === r.map);
        const mapLabel = (mapDef && mapDef.name) || r.map || 'Unknown Map';
        const waves = Number.isFinite(r.waves) ? r.waves|0 : 0;
        const perfect = Number.isFinite(r.perfectCombo) ? r.perfectCombo|0 : 0;
        const charKey = (r.character || r.pilot || '').trim().toLowerCase();
        const meta = this._getCharacterMeta(charKey);
        const charLabel = meta ? meta.label : (charKey || null);
        const main = document.createElement('div');
        main.className = 'run-main';
        const mainParts = [`${mapLabel} — ${waves} waves`, `PC ${perfect}`];
        main.textContent = mainParts.join(' — ');
        li.appendChild(main);
        if(charLabel){
          const chip = this._createCharacterChip(charKey);
          if(chip){
            chip.classList.add('profile-run-character-chip');
            li.appendChild(chip);
          } else {
            const spanChar = document.createElement('span');
            spanChar.className = 'run-character-fallback';
            spanChar.textContent = `Character: ${charLabel}`;
            li.appendChild(spanChar);
          }
        }
        const when = formatDateTime(r.at);
        if(when){
          const small = document.createElement('small');
          small.textContent = when;
          li.appendChild(document.createElement('br'));
          li.appendChild(small);
        }
        this.$profileRuns.appendChild(li);
      });
    }
  }
  setLeaderboardStatus(message, ok=true){
    if(!this.$leaderboardStatus) return;
    this.$leaderboardStatus.textContent = message || '';
    this.$leaderboardStatus.style.color = ok ? (COLORS.accent || '#17e7a4') : (COLORS.danger || '#ff5370');
  }
  setLeaderboardLoading(on){
    if(!this.$leaderboardLoading) return;
    this.$leaderboardLoading.classList.toggle('visible', !!on);
  }
  showModeLoading(title, sub){
    if(!this.$modeLoading) return;
    if(this.$modeLoadingTitle && typeof title==='string'){
      this.$modeLoadingTitle.textContent = title;
    }
    if(this.$modeLoadingSub && typeof sub==='string'){
      this.$modeLoadingSub.textContent = sub;
    }
    this.$modeLoading.classList.add('visible');
  }
  hideModeLoading(){
    if(!this.$modeLoading) return;
    this.$modeLoading.classList.remove('visible');
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

  // Debug: keep Debug Mode toggle in sync (no gameplay effects here;
  // game code reads the flag and applies sprite tuning behaviour).
  setDebugModeUI(on){
    const v = !!on;
    if(this.$debugToggleMain) this.$debugToggleMain.checked = v;
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
    const costMul = this.upgradeCostMul || 1;
    const applyCostMul = (base)=>{
      const v = Math.max(0, Number(base)||0);
      const scaled = Math.round(v * costMul);
      return scaled > 0 ? scaled : v;
    };
    // Update button labels and states
    if(tower.hasSlow){ this.$upgSlow.textContent = 'Slow Module'; this.$upgSlow.disabled = true; }
    else {
      const cost = applyCostMul(UPGRADE_COSTS.slowModule);
      this.$upgSlow.textContent = `Install Slow Module (${cost})`;
      this.$upgSlow.disabled = false;
    }
    // Dot row: binary (0/1) — dim when installed
    if(this._setBtnWithDots) this._setBtnWithDots(this.$upgSlow, this.$upgSlow.textContent, tower.hasSlow?1:0, 1, { dim: tower.hasSlow });
    // Rate (0..3)
    const rateLvl = tower.rateLevel || 0;
    const rateCosts = [UPGRADE_COSTS.rateModule, Math.round(UPGRADE_COSTS.rateModule*1.5), Math.round(UPGRADE_COSTS.rateModule*2.0)];
    if(rateLvl>=3){ this.$upgRate.textContent = 'Upgrade Tower Damage'; this.$upgRate.disabled = true; }
    else {
      const cost = applyCostMul(rateCosts[rateLvl]);
      this.$upgRate.textContent = `Upgrade Tower Damage (${cost})`;
      this.$upgRate.disabled = false;
    }
    if(this._setBtnWithDots) this._setBtnWithDots(this.$upgRate, this.$upgRate.textContent, rateLvl, 3);
    // Range (0..3)
    const rangeLvl = tower.rangeLevel || 0;
    const rangeCosts = [UPGRADE_COSTS.rangeModule, Math.round(UPGRADE_COSTS.rangeModule*1.5), Math.round(UPGRADE_COSTS.rangeModule*2.0)];
    if(rangeLvl>=3){ this.$upgRange.textContent = 'Upgrade Fire Range'; this.$upgRange.disabled = true; }
    else {
      const cost = applyCostMul(rangeCosts[rangeLvl]);
      this.$upgRange.textContent = `Upgrade Fire Range (${cost})`;
      this.$upgRange.disabled = false;
    }
    if(this._setBtnWithDots) this._setBtnWithDots(this.$upgRange, this.$upgRange.textContent, rangeLvl, 3);
    if(tower.hasBurn){ this.$upgBurn.textContent = 'Burn Module'; this.$upgBurn.disabled = true; }
    else {
      const cost = applyCostMul(UPGRADE_COSTS.burnModule);
      this.$upgBurn.textContent = `Install Burn Module (${cost})`;
      this.$upgBurn.disabled = false;
    }
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
      this.$leaderboardWarning.textContent = 'Leaderboard scores are recorded from signed-in runs.';
      this.$leaderboardWarning.classList.remove('signed-in');
      this.$leaderboardWarning.classList.add('warn');
    }
  }
}
