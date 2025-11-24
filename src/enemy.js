import { COLORS } from './config.js';
import { buffs } from './rogue.js';

let ENEMY_UID = 1;

// Ensure enemies never fully stall due to stacked slows + separation.
const MIN_SPEED = 8; // px/s safety floor

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
    } else if(/^boss(\d+)?$/.test(this.variant||'')){
      color = COLORS.boss || '#c77dff';
      this.isBoss = true;
      const mb = /^boss(\d+)?$/.exec(this.variant||'');
      this.bossIndex = (typeof this.bossIndex === 'number')
        ? this.bossIndex
        : (mb ? (parseInt(mb[1]||'0',10) || 0) : 0);
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
    } else if(this.variant==='b2') {
      color = COLORS.blob2;
    } else if(this.variant==='b3') {
      color = COLORS.blob3;
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
      const minAmt = isDot ? 0.4 : 1.5;
      if(!(meta.silent) && amount > 0 && amount >= minAmt){
        const minGap = 100; // ms between floaters (reduce rapid spam/flicker)
        if(nowTs - this._lastHitFx >= minGap){
          const val = Math.max(1, Math.round(amount));
          const textVal = meta.crit ? `✦${val}` : `-${val}`;
          const anchor = this._labelAnchor();
          this.hitFx.push({
            age: 0,
            ttl: meta.crit ? 1.35 : (isDot ? 0.8 : 1.15), // DoT ticks are shorter
            text: textVal,
            r: Math.max(6, this.radius - 2),
            ax: anchor.x,
            ay: anchor.y,
            color: meta.crit ? '#ffd47c' : (meta.color || null),
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
      ctx.save();
      ctx.translate(this.pos.x, this.pos.y);
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
      ctx.restore();

      // Health bar
      const w = 24, h = 4;
      const pct = Math.max(0, this.hp/this.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(this.pos.x - w/2, this.pos.y - this.radius - 10, w, h);
      ctx.fillStyle = COLORS.accent;
      ctx.fillRect(this.pos.x - w/2, this.pos.y - this.radius - 10, w*pct, h);
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
      // Status rings / aura
      const hasBurn = this.burns.length > 0;
      const hasSlow = this.slows.length > 0;
      // Status rings remain centered
      if(hasBurn){
        ctx.strokeStyle = 'rgba(255,120,0,0.8)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius+10, 0, Math.PI*2);
        ctx.stroke();
      }
      if(hasSlow){
        ctx.strokeStyle = 'rgba(0,186,255,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius+6, 0, Math.PI*2);
        ctx.stroke();
      }
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
