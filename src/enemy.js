import { COLORS } from './config.js';
import { buffs } from './rogue.js';
import { punchOutSpriteBackground } from './tower.js';

let ENEMY_UID = 1;

// Ensure enemies never fully stall due to stacked slows + separation.
const MIN_SPEED = 8; // px/s safety floor

// Sprite scaling factors so visual size stays consistent wherever used.
const NANO_SPRITE_NORMAL_SIZE_MUL = 3.9;
const NANO_SPRITE_BOSS_SIZE_MUL = 4.8;

// Optional sprite-sheet support for select enemy variants (e.g., nano bot/boss).
// Drop your sheet into /data and update the config below to match.
const NANO_SPRITE = {
  img: null,
  baseImg: null,
  loaded: false,
  // Sheet layout: 10 columns, 12 full rows, last row with 5 frames = 125.
  cols: 10,
  frames: 125,
  fps: 14,
  frameW: 0,
  frameH: 0,
  tinted: null,      // lazily populated map: color -> tinted sheet canvas
  frameOffsets: null // optional per-frame vertical offsets to stabilize walk
};

// Optional static sprite art for flying drones. Uses a flat black
// background in the source PNG which we treat as transparent via
// punchOutSpriteBackground so the drone can hover over the board
// without a box.
export const DRONE_SPRITE = {
  img: null,
  loaded: false
};

function computeNanoFrameOffsets(sheet, cols, rows, frames){
  if(typeof document === 'undefined' || !sheet) return null;
  try{
    const off = document.createElement('canvas');
    off.width = sheet.width;
    off.height = sheet.height;
    const c = off.getContext('2d');
    if(!c) return null;
    c.drawImage(sheet, 0, 0);
    const id = c.getImageData(0, 0, off.width, off.height);
    const data = id.data;
    const frameW = off.width / cols;
    const frameH = off.height / rows;
    const offsets = new Array(frames).fill(0);
    const bottoms = [];
    for(let i=0;i<frames;i++){
      const col = i % cols;
      const row = Math.floor(i / cols);
      if(row >= rows) break;
      const startX = Math.floor(col * frameW);
      const startY = Math.floor(row * frameH);
      let bottom = -1;
      for(let y = Math.floor(frameH)-1; y>=0; y--){
        const sy = startY + y;
        let idx = (sy * off.width + startX) * 4;
        for(let x=0; x<frameW; x++){
          const a = data[idx+3];
          if(a > 15){
            bottom = y;
            break;
          }
          idx += 4;
        }
        if(bottom >= 0) break;
      }
      if(bottom >= 0){
        offsets[i] = bottom;
        bottoms.push(bottom);
      } else {
        offsets[i] = null;
      }
    }
    if(!bottoms.length) return null;
    const baseline = bottoms.reduce((a,b)=>a+b,0) / bottoms.length;
    for(let i=0;i<frames;i++){
      const b = offsets[i];
      offsets[i] = (b == null) ? 0 : (baseline - b);
    }
    return offsets;
  }catch(e){
    return null;
  }
}

if(typeof Image !== 'undefined'){
  const img = new Image();
  img.src = 'data/nano-boss-sheet.png';
  img.onload = ()=>{
    // Pre-process the sheet once: treat near‑black pixels as transparent
    // so the rectangular frame background disappears in-game and trim
    // dark artifacts along frame edges (e.g., bottom-right specks).
    let source = img;
    const cols = Math.max(1, NANO_SPRITE.cols|0);
    const rows = Math.max(1, Math.ceil((NANO_SPRITE.frames||1) / cols));
    try{
      if(typeof document !== 'undefined'){
        const off = document.createElement('canvas');
        off.width = img.width;
        off.height = img.height;
        const c = off.getContext('2d');
        if(c){
          c.drawImage(img, 0, 0);
          const id = c.getImageData(0, 0, off.width, off.height);
          const data = id.data;
          const frameW = off.width / cols;
          const frameH = off.height / rows;
          // Sample a few corners to detect a flat background color
          // (e.g. solid red or grey) and treat anything close to that
          // as transparent.
          let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
          const sample = (x,y)=>{
            if(x<0 || y<0 || x>=off.width || y>=off.height) return;
            const idx = (y*off.width + x)*4;
            const a = data[idx+3];
            if(a===0) return;
            bgR += data[idx];
            bgG += data[idx+1];
            bgB += data[idx+2];
            bgCount++;
          };
          sample(0,0);
          sample(off.width-1,0);
          sample(0,off.height-1);
          sample(off.width-1,off.height-1);
          if(bgCount>0){
            bgR /= bgCount;
            bgG /= bgCount;
            bgB /= bgCount;
          }
          const hasBg = bgCount>0;
          const bgThreshSq = 40*40;
          for(let i=0;i<data.length;i+=4){
            const r = data[i], g = data[i+1], b = data[i+2];
            const idx = (i/4)|0;
            const x = idx % off.width;
            const y = (idx / off.width)|0;
            const fx = x % frameW;
            const fy = y % frameH;
            const nearEdge =
              fx < 2 || fx > frameW-3 ||
              fy < 2 || fy > frameH-3;
            let makeTransparent = false;
            if(hasBg){
              const dr = r-bgR, dg = g-bgG, db = b-bgB;
              const distSq = dr*dr + dg*dg + db*db;
              if(distSq <= bgThreshSq){
                makeTransparent = true;
              }
            }
            // Pure/near‑pure black, or dark pixels hugging the frame
            // edges, become fully transparent as a fallback.
            if((r < 18 && g < 18 && b < 18) ||
               (nearEdge && r < 32 && g < 32 && b < 32)){
              makeTransparent = true;
            }
            if(makeTransparent){
              data[i+3] = 0;
            }
          }
          c.putImageData(id, 0, 0);
          source = off;
        }
      }
    }catch(e){}
    NANO_SPRITE.baseImg = source;
    NANO_SPRITE.img = source;
    NANO_SPRITE.loaded = true;
    NANO_SPRITE.frameW = img.width / cols;
    NANO_SPRITE.frameH = img.height / rows;
    NANO_SPRITE.frameOffsets = computeNanoFrameOffsets(source, cols, rows, NANO_SPRITE.frames||0);
    // Pre‑warm tinted variants for the most common enemy colors so the
    // first time each type spawns in a run we avoid a hitch from
    // generating its tint on the fly. This runs synchronously while the
    // game is still in its loading phase so it does not compete with
    // early UI interactions (e.g., opening Endless Cycle).
    try{
      const palette = (COLORS && Array.isArray(COLORS.typePalette)) ? COLORS.typePalette.slice() : [];
      const extras = [
        COLORS.enemy,
        COLORS.enemy2,
        COLORS.enemy3,
        COLORS.blob1,
        COLORS.blob2,
        COLORS.blob3,
        COLORS.boss
      ].filter(Boolean);
      const colors = [...palette, ...extras];
      for(const c of colors){
        if(c) getNanoTintedSheet(c);
      }
    }catch(e){}
  };
}

// Load drone sprite (single frame, no animation).
if(typeof Image !== 'undefined'){
  (()=>{
    try{
      const img = new Image();
      img.onload = ()=>{
        let source = img;
        try{
          const processed = punchOutSpriteBackground(img);
          if(processed) source = processed;
        }catch(e){}
        DRONE_SPRITE.img = source;
        DRONE_SPRITE.loaded = true;
      };
      img.onerror = ()=>{
        DRONE_SPRITE.img = null;
        DRONE_SPRITE.loaded = false;
      };
      img.src = 'data/enemy-drone.png';
    }catch(e){}
  })();
}

function getNanoTintedSheet(color){
  if(!color || !NANO_SPRITE.baseImg) return NANO_SPRITE.img;
  if(typeof document === 'undefined') return NANO_SPRITE.img;
  const key = String(color);
  if(!NANO_SPRITE.tinted) NANO_SPRITE.tinted = {};
  if(NANO_SPRITE.tinted[key]) return NANO_SPRITE.tinted[key];
  const base = NANO_SPRITE.baseImg;
  const canvas = document.createElement('canvas');
  canvas.width = base.width;
  canvas.height = base.height;
  const c = canvas.getContext('2d');
  if(!c){
    NANO_SPRITE.tinted[key] = base;
    return base;
  }
  c.drawImage(base, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  // Softer overlay with a tiny blur to reduce grain and keep
  // the original shading/edges from the base sprite.
  c.globalAlpha = 0.32;
  c.filter = 'blur(0.35px) saturate(1.05)';
  c.fillStyle = color;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.filter = 'none';
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  NANO_SPRITE.tinted[key] = canvas;
  return canvas;
}

export class Enemy {
  constructor(waypoints, opts={}){
    this.waypoints = waypoints;
    // Track centerline position and render/collision position separately
    this.center = {x: waypoints[0].x, y: waypoints[0].y};
    this.pos = {x: waypoints[0].x, y: waypoints[0].y};
    this.idx = 1;
    this.baseSpeed = opts.speed ?? 60; // px/s
    this.speedMult = 1; // allows separation logic to throttle speed
    this.speed = this.baseSpeed;
    this.radius = opts.radius ?? 14;
    this.hp = opts.hp ?? 20;
    this.maxHp = this.hp;
    this.alive = true;
    this.reachedEnd = false;
    this.reward = opts.reward ?? 10;
    this.variant = opts.variant || 'base';
    this.bossIndex = (typeof opts.bossIndex === 'number') ? opts.bossIndex : null;
    // Color by dynamic type palette or legacy/blobs
    let color = COLORS.enemy;
    const m = /^t(\d+)$/.exec(this.variant||'');
    if(m){
      const idx = (parseInt(m[1],10) || 0);
      const pal = COLORS.typePalette || [];
      color = pal.length ? pal[idx % pal.length] : COLORS.enemy;
      this.tier = idx;
      this.isBoss = false;
      // Use the sprite sheet for regular tiered enemies as well,
      // so the new art is visible from early waves.
      this.spriteKey = 'nanoBot';
    } else if(/^boss(\d+)?$/.test(this.variant||'')){
      color = COLORS.boss || '#c77dff';
      this.isBoss = true;
      const mb = /^boss(\d+)?$/.exec(this.variant||'');
      this.bossIndex = (typeof this.bossIndex === 'number')
        ? this.bossIndex
        : (mb ? (parseInt(mb[1]||'0',10) || 0) : 0);
      // Primary wave bosses use the sprite sheet at a larger scale.
      this.spriteKey = 'nanoBoss';
    } else if((this.variant||'').startsWith('boss_')){
      // New boss archetypes
      color = COLORS.boss || '#c77dff';
      this.isBoss = true;
      this.bossIndex = (typeof this.bossIndex === 'number') ? this.bossIndex : 0;
      if(this.variant==='boss_ghost'){
        this.laserOnly = true; // only lasers can hurt while phasing
        this.ghostPhasing = true; // toggles intangible/materialize cycles
        this.intangible = true; // start intangible
        this.phaseTimer = 0;
        this.phaseOn = 1.8; // intangible duration
        this.phaseOff = 1.2; // materialized duration
      } else if(this.variant==='boss_split'){
        this.splitter = true; // will split on death (handled by game)
      } else if(this.variant==='boss_nano'){
        this.nanoSack = true; // will spawn swarm on death (handled by game)
      }
      // Archetype bosses share the giant sprite body.
      this.spriteKey = 'nanoBoss';
    } else if(this.variant==='v2') {
      color = COLORS.enemy2;
    } else if(this.variant==='v3') {
      color = COLORS.enemy3;
    } else if(this.variant==='drone'){
      // Flying recon drone — lighter, teal/cyan glow
      color = COLORS.drone || COLORS.accent2;
      this.isFlying = true;
    } else if(this.variant==='nano_minion'){
      // nano swarmlings spawned from nano boss
      color = COLORS.accent2;
      this.armorLevel = 0;
    } else if(this.variant==='boss_shard'){
      // medium shards from split boss
      color = COLORS.boss || '#c77dff';
    } else if(this.variant==='b1') {
      color = COLORS.blob1;
      this.spriteKey = 'nanoBot';
    } else if(this.variant==='b2') {
      color = COLORS.blob2;
      this.spriteKey = 'nanoBot';
    } else if(this.variant==='b3') {
      color = COLORS.blob3;
      this.spriteKey = 'nanoBot';
    }
    this.color = color;
    this.slows = []; // {pct, t}
    this.burns = []; // {dps, t}
    // Lane offset disabled by default for straight spacing (no zig-zag)
    this.lane = 0;
    // Optional flying wobble parameters (used by drones)
    if(this.isFlying){
      this.flightPhase = Math.random()*Math.PI*2;
      this.flightAmp = 10 + Math.random()*6;   // side-to-side amplitude (px)
      this.flightFreq = 1.6 + Math.random()*0.6; // zig-zag frequency
      this.loopAmp = 6 + Math.random()*4;      // gentle along-path bob
    }
    // Visual animation state
    this.angle = Math.random()*Math.PI*2; // for rotating shapes
    this.spinSpeed = (Math.random()<0.5? -1:1) * 0.8; // rad/s (slow, subtle)
    this.phase = Math.random()*Math.PI*2; // wobble phase for blobs
    // Per-enemy animation phase so sprite-sheet walk cycles don't all
    // start on the same frame and look synchronized.
    this.animPhase = Math.random()*10;
    // Smoothed facing angle for sprite-based enemies; follows path direction.
    this.renderAngle = 0;
    this.age = 0;
    this.hitFx = []; // transient hit text/flash
    this._lastHitFx = 0;
    this.laserCounter = null; // rolling DPS tally for active laser lock
    this.laserLinger = 0;     // keep rendering briefly after death for floaters
    // Initial segment unit vector for offset at spawn
    if(waypoints.length > 1){
      const dx0 = waypoints[1].x - waypoints[0].x;
      const dy0 = waypoints[1].y - waypoints[0].y;
      const d0 = Math.hypot(dx0,dy0) || 1; this.lastUx = dx0/d0; this.lastUy = dy0/d0;
    } else { this.lastUx = 1; this.lastUy = 0; }
    // Initial facing along the first segment.
    this.renderAngle = Math.atan2(this.lastUy, this.lastUx);
    // Apply initial offset
    this.pos.x = this.center.x - this.lastUy * this.lane;
    this.pos.y = this.center.y + this.lastUx * this.lane;

    // Spider visual configuration
    const tierVal = this.tier ?? 0;
    const bossVal = this.bossIndex ?? (this.isBoss?0:0);
    let pairs = 3 + Math.floor(tierVal/2); // tiers add legs gradually
    if(this.isBoss) pairs = Math.max(pairs, 4 + Math.floor(bossVal/2));
    this.legPairs = Math.max(3, Math.min(6, pairs)); // clamp 6–12 legs
    this.legLengthFactor = 1 + 0.08*tierVal + 0.12*(this.bossIndex||0);
    this.armorLevel = (this.isBoss ? 2 + (this.bossIndex||0) : Math.min(2, Math.floor(tierVal/2)));
    // Horizontal facing: 1 (right) or -1 (left)
    this.facing = (this.lastUx >= 0 ? 1 : -1);
    this.uid = ENEMY_UID++;
    this.targetLock = 0;
  }

  get x(){ return this.pos.x; }
  get y(){ return this.pos.y; }

  // Approximate radius of this enemy's visible body so spacing/separation
  // can prevent sprites from overlapping on the path.
  getBodyRadius(){
    const base = Math.max(4, this.radius || 0);
    if(this.spriteKey === 'nanoBot' || this.spriteKey === 'nanoBoss'){
      const sizeMul = this.isBoss ? NANO_SPRITE_BOSS_SIZE_MUL : NANO_SPRITE_NORMAL_SIZE_MUL;
      return base * sizeMul * 0.5;
    }
    // Drones use a slightly enlarged sprite disc in draw(); treat them
    // as modestly larger than their logical radius for spacing.
    if(this.variant === 'drone' && this.isFlying){
      return base * 1.1;
    }
    return base;
  }

  // Predict a point `distAhead` units further along this enemy's path,
  // following bends around corners. Does not mutate actual position.
  getFuturePos(distAhead=0){
    let rem = Math.max(0, distAhead||0);
    let cx = this.center.x;
    let cy = this.center.y;
    let i = this.idx;
    while(rem > 0 && i < this.waypoints.length){
      const target = this.waypoints[i];
      let dx = target.x - cx;
      let dy = target.y - cy;
      const segLen = Math.hypot(dx,dy);
      if(segLen <= 1e-3){
        i++;
        continue;
      }
      if(segLen <= rem){
        cx = target.x;
        cy = target.y;
        rem -= segLen;
        i++;
      } else {
        const ux = dx/segLen;
        const uy = dy/segLen;
        cx += ux * rem;
        cy += uy * rem;
        rem = 0;
      }
    }
    return { x: cx, y: cy };
  }

  update(dt){
    const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if(!this.alive){
      if(this.laserLinger>0){
        this.laserLinger = Math.max(0, this.laserLinger - dt);
      }
      return;
    }
    this.age += dt;
    this.angle += this.spinSpeed * dt;
    this.phase += dt*1.5;
    // Ghost boss phase toggling
    if(this.ghostPhasing){
      this.phaseTimer += dt;
      if(this.intangible){
        if(this.phaseTimer >= this.phaseOn){ this.phaseTimer = 0; this.intangible = false; this.hitFx = []; }
      } else {
        if(this.phaseTimer >= this.phaseOff){ this.phaseTimer = 0; this.intangible = true; this.hitFx = []; }
      }
    }
    // Update slows
    if(this.slows.length){
      for(const s of this.slows) s.t -= dt;
      this.slows = this.slows.filter(s=> s.t>0);
    }
    // Apply burns (damage over time) in visible ticks
    if(this.burns.length){
      let dps = 0;
      for(const b of this.burns){ b.t -= dt; if(b.t>0) dps += b.dps; }
      this.burns = this.burns.filter(b=> b.t>0);
      if(dps>0){
        const interval = 0.25; // seconds between visible burn ticks
        this._burnTick = (this._burnTick || 0) + dt;
        while(this._burnTick >= interval){
          this._burnTick -= interval;
          const dmg = dps * interval;
          this.damage(dmg, 'burn', { color:'#ff5370', small:true, type:'burn' });
        }
      } else {
        this._burnTick = 0;
      }
    } else {
      this._burnTick = 0;
    }
    // Flush laser counter shortly after beam ends
    if(this.laserCounter){
      const stopDelayMs = 220;
      if(nowTs - this.laserCounter.last > stopDelayMs){
        this.flushLaserCounter();
      }
    }
    if(this.laserLinger>0){
      this.laserLinger = Math.max(0, this.laserLinger - dt);
    }
    // Combine all active slows multiplicatively so multiple sources stack
    // with diminishing returns, but clamp so movement never drops below
    // 20% of the enemy's base speed.
    let slowMul = 1;
    for(const s of this.slows){
      const p = Math.max(0, Math.min(0.95, s.pct||0));
      slowMul *= (1 - p);
    }
    // slowMul is the remaining speed fraction; enforce a 20% floor.
    slowMul = Math.max(0.2, slowMul);
    // Apply movement with a small absolute safety floor as well.
    this.speed = Math.max(MIN_SPEED, this.baseSpeed * this.speedMult * slowMul);
    if(this.idx >= this.waypoints.length){
      this.reachedEnd = true;
      this.alive = false;
      return;
    }
    const target = this.waypoints[this.idx];
    // Move along path centerline
    let dx = target.x - this.center.x;
    let dy = target.y - this.center.y;
    let d = Math.hypot(dx,dy);
    const step = this.speed * dt;
    // If extremely close to the target, snap and advance to avoid precision stalls
    if(d <= 0.25){
      this.center.x = target.x; this.center.y = target.y; this.idx++;
    } else if(d > 0){
      const ux = dx/d, uy = dy/d; this.lastUx = ux; this.lastUy = uy;
      // Update horizontal facing only when there is sufficient horizontal motion
      if(Math.abs(ux) > 0.2){ this.facing = (ux >= 0 ? 1 : -1); }
      if(step >= d){
        this.center.x = target.x; this.center.y = target.y; this.idx++;
      } else {
        this.center.x += ux*step; this.center.y += uy*step;
      }
    }
    // Apply lane offset perpendicular to the segment direction
    let offX = -this.lastUy * this.lane;
    let offY =  this.lastUx * this.lane;
    // Flying drones wobble around the path for a more natural arc
    if(this.isFlying){
      const t = this.age || 0;
      const amp = this.flightAmp || 0;
      const freq = this.flightFreq || 0;
      const loopAmp = this.loopAmp || 0;
      const phase = this.flightPhase || 0;
      // Side-to-side zig‑zag perpendicular to the path direction
      const wobble = amp ? Math.sin(t * freq + phase) * amp : 0;
      offX += -this.lastUy * wobble;
      offY +=  this.lastUx * wobble;
      // Small forward/back loop along the path
      const bob = loopAmp ? Math.cos(t * (freq*0.7) + phase) * loopAmp : 0;
      offX += this.lastUx * bob * 0.25;
      offY += this.lastUy * bob * 0.25;
    }
    this.pos.x = this.center.x + offX;
    this.pos.y = this.center.y + offY;
    // Smoothly steer the rendered facing toward the current path direction
    // so sprite-based enemies rotate smoothly around corners.
    {
      const target = Math.atan2(this.lastUy, this.lastUx);
      if(Number.isFinite(target)){
        if(!Number.isFinite(this.renderAngle)) this.renderAngle = target;
        let diff = target - this.renderAngle;
        while(diff > Math.PI) diff -= Math.PI*2;
        while(diff < -Math.PI) diff += Math.PI*2;
        const maxTurn = 6 * dt; // rad per second
        if(Math.abs(diff) > maxTurn) diff = maxTurn * Math.sign(diff);
        this.renderAngle += diff;
      }
    }
  }

  _labelAnchor(){
    const hasStatus = (this.burns && this.burns.length) || (this.slows && this.slows.length);
    const statusRows = hasStatus ? 1 : 0;
    return {
      x: this.pos.x + this.radius + 18,
      y: this.pos.y - this.radius - 10 - (22 * statusRows + 16)
    };
  }

  damage(amount, src, meta={}){
    // If intangible and requires laser, ignore non-laser sources
    if(this.laserOnly && this.intangible && src!=='laser') return;
    const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this.lastHit = { amount, src, meta, time: nowTs };
    this.hp -= amount;
    if(src === 'laser'){
      const anchor = this._labelAnchor();
      if(!this.laserCounter){ this.laserCounter = { total: 0, last: nowTs }; }
      this.laserCounter.ax = anchor.x;
      this.laserCounter.ay = anchor.y;
      this.laserCounter.total += Math.max(0, amount);
      this.laserCounter.last = nowTs;
      if(meta.color) this.laserCounter.color = meta.color;
    } else {
      // Skip visual spam for silent ticks (e.g., invisible chip damage)
      const isDot = !!meta.small;
      // Lower the visibility floor for Moarter/Acid puddle ticks so
      // players can clearly see DoT numbers as enemies walk through.
      let minAmt = isDot ? 0.4 : 1.5;
      if(isDot && meta.towerKind === 'splash'){
        minAmt = 0.15;
      }
      if(!(meta.silent) && amount > 0 && amount >= minAmt){
        const minGap = 100; // ms between floaters (reduce rapid spam/flicker)
        if(nowTs - this._lastHitFx >= minGap){
          const val = Math.max(1, Math.round(amount));
          const textVal = meta.crit ? `✦${val}` : `-${val}`;
          const anchor = this._labelAnchor();
          // Choose floater color based on damage source so Moarter
          // impact vs Acid puddle DoT are easy to distinguish.
          let color = meta.color || null;
          if(meta.impact && !meta.crit){
            // Moarter impact burst: bright orange.
            color = '#ffc46b';
          } else if(isDot && meta.towerKind === 'splash' && !meta.crit){
            // Acid puddle DoT: bright yellow so it stands apart.
            color = '#ffe66b';
          } else if(meta.type === 'burn' && !meta.crit){
            // Burn ticks keep their fire-red tint.
            color = '#ff5370';
          }
          this.hitFx.push({
            age: 0,
            ttl: meta.crit ? 1.35 : (isDot ? 0.8 : 1.15), // DoT ticks are shorter
            text: textVal,
            r: Math.max(6, this.radius - 2),
            ax: anchor.x,
            ay: anchor.y,
            color: meta.crit ? '#ffd47c' : color,
            crit: !!meta.crit,
            small: !!meta.small
          });
          if(this.hitFx.length > 6) this.hitFx.shift();
          this._lastHitFx = nowTs;
        }
      }
    }
    if(this.hp <= 0){
      this.flushLaserCounter(true);
      this.alive = false;
    }
  }

  flushLaserCounter(force=false){
    const lc = this.laserCounter;
    if(!lc) return;
    const total = Math.round(Math.max(0, lc.total || 0));
    if(!force && total < 1){
      this.laserCounter = null;
      return;
    }
    const anchor = this._labelAnchor();
    const ax = lc.ax != null ? lc.ax : anchor.x;
    const ay = lc.ay != null ? lc.ay : anchor.y;
    const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this.hitFx.push({
      age: 0,
      ttl: 1.15,
      text: `-${Math.max(1, total)}`,
      r: Math.max(6, this.radius - 2),
      ax, ay,
      color: (lc.color || null)
    });
    if(this.hitFx.length > 6) this.hitFx.shift();
    this._lastHitFx = nowTs;
    // Keep the enemy around briefly so the floater can render even if killed by the laser.
    this.laserLinger = Math.max(this.laserLinger||0, 0.7);
    this.laserCounter = null;
  }

  applySlow(pct, duration){
    // pct in [0,1]
    const clamped = Math.max(0, Math.min(0.95, pct));
    const dur = Math.max(0.05, duration);
    this.slows.push({ pct: clamped, t: dur, ttl: dur });
    this.latestSlow = Math.max(this.latestSlow||0, clamped);
  }

  applyBurn(dps, duration){
    const dur = Math.max(0.1, duration);
    const rate = Math.max(0, dps);
    const bonus = buffs?.burnDurationBonus || 0;
    this.burns.push({ dps: rate, t: dur + bonus });
    this.latestBurn = Math.max(this.latestBurn||0, rate);
  }

  markTargeted(progress){
    const p = Math.max(0, Math.min(1, progress||0));
    this.targetLock = Math.max(this.targetLock||0, p);
  }

  draw(ctx){
    const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const laserActive = this.laserCounter && (nowTs - this.laserCounter.last <= 220);
    const hasFloaters = this.hitFx && this.hitFx.length;
    if(!this.alive && !hasFloaters && !laserActive) return;
    // Advance hit FX lifetimes (draw may be called more frequently than update cadence assumptions)
    if(this.hitFx && this.hitFx.length){
      for(const fx of this.hitFx){ fx.age += 1/60; }
      this.hitFx = this.hitFx.filter(fx=> fx.age < fx.ttl);
    }
    if(this.alive){
      // Ground nano‑bots vs. flying drones share HP/status UI but
      // have distinct bodies.
      const useNanoSprite = !!this.spriteKey && NANO_SPRITE.loaded && NANO_SPRITE.img;
      const useDroneSprite = (this.variant === 'drone') && DRONE_SPRITE.loaded && DRONE_SPRITE.img;
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
      if(useNanoSprite){
        // Rotate sprite to follow path direction; base art is rotated
        // 90° counter-clockwise so we offset by -PI/2.
        const heading = Number.isFinite(this.renderAngle) ? this.renderAngle : 0;
        ctx.rotate(heading - Math.PI/2);
        const cfg = NANO_SPRITE;
        const sheet = getNanoTintedSheet(this.color);
        const frameCount = Math.max(1, cfg.frames|0);
        const cols = Math.max(1, cfg.cols|0);
        const rows = Math.max(1, Math.ceil(frameCount / cols));
        const fw = cfg.frameW || (sheet.width / cols);
        const fh = cfg.frameH || (sheet.height / rows);
        const t = (this.age || 0) + (this.animPhase || 0);
        // Speed up the animation for faster-moving enemies so the walk
        // cycle roughly tracks travel speed, but keep a moderate global
        // cadence so the motion doesn't feel too jumpy.
        const base = Math.max(20, this.baseSpeed || 60);
        const speedNow = Math.max(10, this.speed || base);
        const speedFactor = Math.max(0.7, Math.min(2.0, speedNow / base));
        const walkBoost = 2.7; // 1.5x faster than previous 1.8
        // Optional debug override for sprite animation (frame window / speed).
        let dbg = null;
        if(typeof window !== 'undefined' && window.NANO_SPRITE_DEBUG){
          const g = window.NANO_SPRITE_DEBUG;
          if(g && g.enabled === true) dbg = g;
        }
        // Default walk cycle: frames 100–124 (final row cluster).
        const baseStart = Math.min(100, Math.max(0, frameCount-1));
        const baseEnd = Math.min(124, frameCount-1);
        const baseSpan = Math.max(1, baseEnd - baseStart + 1);
        let startFrame = baseStart;
        let span = baseSpan;
        let extraFpsMul = 1;
        if(dbg){
          if(Number.isFinite(dbg.start)){
            startFrame = Math.max(0, Math.min(frameCount-1, dbg.start|0));
          }
          if(Number.isFinite(dbg.span)){
            span = Math.max(1, Math.min(frameCount - startFrame, dbg.span|0));
          }
          if(typeof dbg.fpsMul === 'number' && isFinite(dbg.fpsMul) && dbg.fpsMul>0){
            extraFpsMul = dbg.fpsMul;
          }
          // Keep global debug state clamped so hotkeys never "drift"
          // far outside the valid frame range and feel stuck.
          dbg.start = startFrame;
          dbg.span = span;
        }
        const fps = (cfg.fps || 14) * speedFactor * walkBoost * extraFpsMul;
        const endFrame = Math.min(frameCount-1, startFrame + span - 1);
        const s = Math.max(0, startFrame|0);
        const e = Math.max(s, endFrame|0);
        const spanFrames = (e - s + 1) || 1;
        const raw = Math.floor(t * fps) % spanFrames;
        const idx = s + raw;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const sx = col * fw;
        const sy = row * fh;
        const baseSize = Math.max(fw, fh) || 1;
        // Slightly larger so ground‑bound nano enemies fill the path
        // more fully without overlapping neighbouring lanes.
        const sizeMul = this.isBoss ? NANO_SPRITE_BOSS_SIZE_MUL : NANO_SPRITE_NORMAL_SIZE_MUL;
        const desiredDiameter = this.radius * sizeMul;
        const scale = desiredDiameter / baseSize;
        // Stabilize vertical position so the enemy doesn't appear to
        // shrink or grow when frames are drawn slightly higher/lower
        // within their cells in the sheet.
        let offsetY = 0;
        const offs = NANO_SPRITE.frameOffsets;
        if(offs && offs.length > idx){
          offsetY = (offs[idx] || 0) * scale;
        }
        // Cache debug info for on-screen overlay when enabled.
        if(dbg){
          this._nanoSpriteDebug = {
            idx,
            start: s,
            span: spanFrames,
            speed: extraFpsMul
          };
        } else if(this._nanoSpriteDebug){
          this._nanoSpriteDebug = null;
        }
        ctx.save();
        ctx.drawImage(
          sheet,
          sx, sy, fw, fh,
          -fw*scale/2,
          -fh*scale/2 + offsetY,
          fw*scale,
          fh*scale
        );
        ctx.restore();
      } else if(useDroneSprite){
        // Static drone hull using dedicated sprite art. We still tint
        // glows and hit/stun effects via this.color, but the sprite
        // itself is a single frame (no walk cycle).
        const img = DRONE_SPRITE.img;
        if(img){
          const baseSize = Math.max(img.width, img.height) || 1;
          const desiredDiameter = this.radius * 2.1; // tuned so drones sit comfortably on the lane
          const scale = desiredDiameter / baseSize;
          const heading = Number.isFinite(this.renderAngle) ? this.renderAngle : 0;
          ctx.save();
          // Drone art is authored facing "down" in the PNG. Align that
          // downward nose with the actual flight direction by rotating
          // 90° clockwise relative to the path heading.
          ctx.rotate(heading + Math.PI/2);
          ctx.shadowColor = this.color || COLORS.drone || COLORS.accent2;
          ctx.shadowBlur = 18;
          ctx.globalAlpha = 0.98;
          ctx.drawImage(
            img,
            -img.width*scale/2,
            -img.height*scale/2,
            img.width*scale,
            img.height*scale
          );
          ctx.restore();
        }
      } else {
        ctx.scale(this.facing || 1, 1);
        const R = this.radius;
        const isFlying = !!this.isFlying;
        const pairs = isFlying ? 0 : (this.legPairs || 3);
        const stepRate = 6 + Math.min(10, this.speed/12);
        const amp = 0.5; // radians swing
        const lenF = Math.max(0.8, this.legLengthFactor || 1);
        const seg1 = Math.max(6, R*0.7*lenF), seg2 = Math.max(6, R*0.9*lenF);
        // Boss abdomen glow behind body (ground bosses only)
        if(this.isBoss && !isFlying){
          const pulse = 0.6 + 0.4*(Math.sin(this.age*3)*0.5 + 0.5);
          ctx.save();
          ctx.globalAlpha = 0.24 * pulse;
          ctx.shadowColor = this.color; ctx.shadowBlur = 24 + R*0.6;
          ctx.fillStyle = this.color;
          ctx.beginPath(); ctx.ellipse(-R*0.6, 0, R*0.65, R*0.5, 0, 0, Math.PI*2); ctx.fill();
          ctx.restore();
        }
        if(!isFlying){
          // Spider legs for ground nano‑bots
          const lw = 2 + Math.min(2, (this.armorLevel||0)*0.3);
          ctx.lineWidth = lw;
          ctx.strokeStyle = this.color;
          ctx.shadowColor = this.color; ctx.shadowBlur = 8;
          for(let i=0;i<pairs;i++){
            const t0 = (pairs>1? (i/(pairs-1)) : 0.5) - 0.5; // -0.5..0.5
            const baseY = t0 * (R*0.9);
            for(const side of [-1,1]){
              const phase = this.phase*stepRate + i*0.6 + (side===-1?0:Math.PI);
              const swing = Math.sin(phase) * amp;
              const baseA = (side===-1? Math.PI: 0) + (side===-1?-0.2:0.2);
              const a1 = baseA + swing*0.6;
              const x1 = Math.cos(a1)*seg1;
              const y1 = baseY + Math.sin(a1)*seg1;
              const a2 = a1 + (side===-1? -0.9: 0.9) + swing*0.4;
              const x2 = x1 + Math.cos(a2)*seg2;
              const y2 = y1 + Math.sin(a2)*seg2;
              ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
              // foot glint
              ctx.save(); ctx.shadowBlur = 6; ctx.fillStyle = 'white'; ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(x2,y2,1.5,0,Math.PI*2); ctx.fill(); ctx.restore();
            }
          }
          ctx.shadowBlur = 0;
          // Armor/plating outlines (scale with tier/boss)
          const plates = Math.max(0, Math.min(5, this.armorLevel||0));
          for(let i=0;i<plates;i++){
            const s = 1.05 + i*0.12;
            ctx.save();
            const a = 0.12 + i*0.06 + 0.08*Math.sin(this.age*2 + i*0.8);
            ctx.globalAlpha = Math.max(0.05, Math.min(0.6, a));
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(0, 0, R*0.9*s, R*0.75*s, 0, 0, Math.PI*2); ctx.stroke();
            ctx.restore();
          }
        }
        // Body core
        ctx.fillStyle = this.color;
        if(this.ghostPhasing && this.intangible && !isFlying){ ctx.globalAlpha = 0.45; }
        if(isFlying){
          // Compact drone hull (disc) slightly tilted
          ctx.save();
          ctx.rotate(0.18*Math.sin(this.age*1.1));
          ctx.beginPath(); ctx.ellipse(0,0,R*0.95,R*0.65,0,0,Math.PI*2); ctx.fill();
          // Rotor hub
          ctx.fillStyle = '#0b1f29';
          ctx.beginPath(); ctx.arc(0,0,R*0.32,0,Math.PI*2); ctx.fill();
          // Crossed rotor blades
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 2;
          const spin = this.age*6;
          for(let i=0;i<2;i++){
            const a = spin + i*Math.PI/2;
            const bx = Math.cos(a)*R*1.1;
            const by = Math.sin(a)*R*1.1;
            ctx.beginPath(); ctx.moveTo(-bx*0.4,-by*0.4); ctx.lineTo(bx,by); ctx.stroke();
          }
          ctx.restore();
          // Side fins / wings
          ctx.save();
          ctx.fillStyle = 'rgba(98,240,255,0.85)';
          ctx.globalAlpha = 0.9;
          const wingSpan = R*1.4;
          ctx.beginPath();
          ctx.moveTo(-wingSpan, -R*0.15);
          ctx.quadraticCurveTo(-R*0.2, -R*0.8, 0, -R*0.2);
          ctx.quadraticCurveTo(R*0.2, -R*0.8, wingSpan, -R*0.15);
          ctx.quadraticCurveTo(R*0.2, -R*0.3, 0, -R*0.05);
          ctx.quadraticCurveTo(-R*0.2, -R*0.3, -wingSpan, -R*0.15);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath(); ctx.ellipse(0,0,R*0.95,R*0.8,0,0,Math.PI*2); ctx.fill();
        }
        if(this.ghostPhasing && this.intangible && !isFlying){ ctx.globalAlpha = 1; }
        if(!isFlying){
          // Shimmer sweep across plating (bosses emphasized)
          const sweepA = (this.age*1.2) % (Math.PI*2);
          ctx.save();
          ctx.globalAlpha = this.isBoss? 0.35 : 0.2;
          ctx.strokeStyle = 'white';
          ctx.lineWidth = this.isBoss? 2.0 : 1.4;
          ctx.shadowColor = 'white'; ctx.shadowBlur = this.isBoss? 10 : 6;
          ctx.beginPath(); ctx.ellipse(0, 0, R*0.85, R*0.7, 0, sweepA, sweepA + Math.PI*0.6); ctx.stroke();
          ctx.restore();
          // Dorsal highlight and eye
          ctx.fillStyle = 'white'; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(R*0.15, -R*0.1, Math.max(2, R*0.25), 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(R*0.35,0, R*0.12, 0, Math.PI*2); ctx.fill();
        }
      }
      ctx.restore();

      // Optional sprite debug overlay (shows current frame/window).
      if(typeof window !== 'undefined' && window.NANO_SPRITE_DEBUG && this._nanoSpriteDebug){
        const g = window.NANO_SPRITE_DEBUG;
        const enabled = !!g.enabled;
        if(enabled){
          const info = this._nanoSpriteDebug;
          const end = info.start + info.span - 1;
          const speed = info.speed || 1;
          const speedLabelRaw = speed.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
          const label = `f${info.idx} [${info.start}–${end}] S=${speedLabelRaw}x`;
          ctx.save();
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          const x = this.pos.x;
          const y = this.pos.y - this.radius*1.5;
          ctx.strokeText(label, x, y);
          ctx.fillText(label, x, y);
          ctx.restore();
        }
      }

      // Health bar (hidden while debug sprite mode is active so frames
      // and overlay text are easier to see against the path).
      const debugEnabled = (typeof window !== 'undefined' && window.NANO_SPRITE_DEBUG && window.NANO_SPRITE_DEBUG.enabled === true);
      if(!debugEnabled){
        const w = 24, h = 4;
        const pct = Math.max(0, this.hp/this.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(this.pos.x - w/2, this.pos.y - this.radius - 10, w, h);
        ctx.fillStyle = COLORS.accent;
        ctx.fillRect(this.pos.x - w/2, this.pos.y - this.radius - 10, w*pct, h);
      }
    }

    // Rolling laser total (while beam is active)
    if(laserActive && this.laserCounter){
      const running = Math.max(1, Math.round(this.laserCounter.total||0));
      const anchor = this._labelAnchor();
      const pulse = 0.88 + 0.12*Math.sin(this.age*4);
      ctx.save();
      ctx.globalAlpha = pulse;
      const lcColor = this.laserCounter.color || COLORS.accent2 || '#62f0ff';
      ctx.fillStyle = lcColor;
      ctx.font = 'bold 21px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`-${running}`, anchor.x + 2, anchor.y - 4);
      ctx.restore();
    }

    // Hit text / floaters (no ring, targeting indicator handles focus visuals)
    if(this.hitFx && this.hitFx.length){
      for(const fx of this.hitFx){
        const p = Math.max(0, Math.min(1, fx.age / fx.ttl));
        const a = 1 - p;
        // Push damage numbers above any status text (burn/slow) for readability,
        // and offset to the top-right so they don't collide horizontally.
        const anchor = this._labelAnchor();
        const labelAnchorX = fx.ax != null ? fx.ax : anchor.x;
        const labelBaseY = fx.ay != null ? fx.ay : anchor.y;
        // Ease the floater up-right as it fades.
        const eased = 1 - Math.pow(1-p, 3); // softer ease-out
        const flutter = fx.crit ? Math.sin(fx.age * 18) * 6 : 0;
        const driftX = (fx.crit ? 4 : 2) + eased * (fx.crit ? 12 : 8) + flutter;
        const driftY = -6 - eased * 12 - (fx.crit ? 4 : 0);
        const y = labelBaseY + driftY;
        ctx.save();
        // Apply a slight fade curve to avoid flicker on tiny hits.
        const alphaCurve = Math.pow(a, 1.1);
        ctx.globalAlpha = alphaCurve;
        const txtColor = fx.color || 'white';
        ctx.fillStyle = txtColor;
        const fontSize = fx.small ? 20 : (fx.crit ? 30 : 27);
        ctx.font = (fx.crit ? '800 ' : 'bold ') + fontSize + 'px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(fx.text || '-?', labelAnchorX + driftX, y);
        ctx.restore();
      }
    }

    if(this.alive){
      const hasBurn = this.burns.length > 0;
      const hasSlow = this.slows.length > 0;
      // Slow timer bar below HP bar (shows longest remaining slow)
      if(hasSlow){
        let maxT = 0, maxTtl = 0;
        for(const s of this.slows){
          if(s.t > maxT){
            maxT = s.t;
            maxTtl = s.ttl || s.t;
          }
        }
        if(maxTtl > 0){
          const frac = Math.max(0, Math.min(1, maxT / maxTtl));
          const bw = 24, bh = 3;
          const bx = this.pos.x - bw/2;
          const by = this.pos.y - this.radius - 4;
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = 'rgba(0,186,255,0.9)';
          ctx.fillRect(bx, by, bw*frac, bh);
          ctx.restore();
        }
      }
      // Icons above head to indicate burn/slow
      const icons = [];
      if(hasBurn) icons.push('burn');
      if(hasSlow) icons.push('slow');
      if(icons.length){
        const size = 18;
        const spacing = 6;
        const totalW = size*icons.length + spacing*(icons.length-1);
        const baseX = this.pos.x - totalW/2;
        const baseY = this.pos.y - this.radius - 26;
        const t = this.age || 0;
        const drawFlame = ()=>{
          const r = size*0.5;
          const grad = ctx.createLinearGradient(0, -r, 0, r);
          grad.addColorStop(0, '#ffd04d');
          grad.addColorStop(1, '#ff7a00');
          ctx.fillStyle = grad;
          ctx.shadowColor = '#ffb347';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(0, -r*0.95);
          ctx.quadraticCurveTo(r*0.75, -r*0.35, r*0.25, r*0.65);
          ctx.quadraticCurveTo(0, r, -r*0.25, r*0.65);
          ctx.quadraticCurveTo(-r*0.75, -r*0.35, 0, -r*0.95);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#fff2b2';
          ctx.beginPath();
          ctx.moveTo(0, -r*0.4);
          ctx.quadraticCurveTo(r*0.25, -r*0.05, r*0.05, r*0.45);
          ctx.quadraticCurveTo(0, r*0.65, -r*0.05, r*0.45);
          ctx.quadraticCurveTo(-r*0.25, -r*0.05, 0, -r*0.4);
          ctx.fill();
        };
        const drawSnow = ()=>{
          const r = size*0.22;
          ctx.strokeStyle = '#a9e6ff';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          const arms = 6;
          for(let i=0;i<arms;i++){
            const a = i*(Math.PI*2/arms);
            const ax = Math.cos(a)*size*0.45;
            const ay = Math.sin(a)*size*0.45;
            ctx.beginPath();
            ctx.moveTo(-ax*0.2, -ay*0.2);
            ctx.lineTo(ax, ay);
            ctx.stroke();
            // branch tips
            const bx = Math.cos(a + Math.PI/6)*r, by = Math.sin(a + Math.PI/6)*r;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - by, ay + bx); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + by, ay - bx); ctx.stroke();
          }
          ctx.fillStyle = 'rgba(169,230,255,0.75)';
          ctx.beginPath(); ctx.arc(0,0,size*0.18,0,Math.PI*2); ctx.fill();
        };
        icons.forEach((kind, idx)=>{
          const x = baseX + idx*(size+spacing) + size/2;
          // Gentle hover while active
          const bobY = Math.sin(t*2 + idx*0.8) * 1.8;
          const driftX = Math.cos(t*1.4 + idx*0.6) * 1.2;
          ctx.save();
          ctx.translate(x + driftX, baseY + bobY);
          if(kind==='burn') drawFlame();
          else drawSnow();
          ctx.restore();
        });
      }
    }
  }
}
