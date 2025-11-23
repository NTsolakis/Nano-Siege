import { COLORS, TOWER_TYPES } from './config.js';
import { buffs } from './rogue.js';
import { audio } from './audio.js';
import { dist2, clamp } from './utils.js';

export class Bullet {
  constructor(x,y,tx,ty,speed,damage,{splashRadius=0, slow=null, burn=null, canPierce=false, color=null, cascadeBonus=0, extraChains=0, sourceX=null, sourceY=null, crit=false}={}){
    const dx = tx-x, dy = ty-y; const d = Math.hypot(dx,dy)||1;
    this.x=x; this.y=y;
    this.vx = dx/d*speed;
    this.vy = dy/d*speed;
    this.r = 3;
    this.life = 1.5; // seconds
    this.damage = damage;
    this.alive = true;
    this.splashRadius = splashRadius;
    this.slow = slow; // {pct,dur} or null
    this.burn = burn; // {dps,dur} or null
    this.canPierce = !!canPierce;
    this.pierceLeft = canPierce ? (1 + Math.max(0, extraChains|0)) : 0;
    this.lastPiercedId = null;
    this.color = color || null;
    this.cascadeBonus = cascadeBonus || 0;
    this.sourceX = sourceX;
    this.sourceY = sourceY;
    this.crit = !!crit;
  }
  update(dt){
    this.x += this.vx*dt; this.y += this.vy*dt; this.life -= dt;
    if(this.life<=0) this.alive=false;
  }
  draw(ctx){
    // Diamond shard bullet with subtle glow
    ctx.save();
    ctx.translate(this.x,this.y);
    const ang = Math.atan2(this.vy, this.vx);
    ctx.rotate(ang);
    ctx.fillStyle = COLORS.bullet;
    ctx.shadowColor = COLORS.accent2;
    ctx.shadowBlur = 10;
    const w = this.r*2.2, h = this.r*1.4;
    ctx.beginPath();
    ctx.moveTo( w*0.8, 0 );
    ctx.lineTo( 0, -h );
    ctx.lineTo( -w*0.6, 0 );
    ctx.lineTo( 0,  h );
    ctx.closePath();
    ctx.fill();
    // inner highlight
    ctx.globalAlpha = 0.7;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.moveTo(w*0.5, 0);
    ctx.lineTo(0, -h*0.6);
    ctx.lineTo(-w*0.35, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

class BaseTower {
  constructor(kind,gx,gy,tile){
    this.kind = kind; this.name = TOWER_TYPES[kind].name;
    this.gx=gx; this.gy=gy; this.tile=tile;
    this.x = gx*tile + tile/2; this.y = gy*tile + tile/2;
    this.range = TOWER_TYPES[kind].range;
    this.target = null;
    this.rotation = 0;
    // upgrades/modules
    this.hasSlow = false;
    this.rateLevel = 0; // 0..3
    this.rangeLevel = 0; // 0..3
    this.baseRange = TOWER_TYPES[kind].range;
    this.hasBurn = false;
    // visual: distinct base color per tower type (set by subclasses)
    this.baseColor = null;
    this.idleTimer = 999;
    this._resonanceCd = 0;
    this._resonanceArmed = false;
    this._lastTargetId = null;
    this._fluxCharge = 0;
    this._fluxBurst = 0;
    this.game = null; // set externally
    this.retargetDelay = 0.2;
    this.retargetTimer = 0;
    this.lastShotInterval = 0;
  }
  getRange(){
    const chronoBoost = buffs.chronoActive ? (1 + (buffs.chronoRangeBonus||0)) : 1;
    return this.baseRange * (1 + 0.15*this.rangeLevel) * (buffs.rangeMul||1) * chronoBoost;
  }
  acquireTarget(enemies, dt=0){
    const prevTarget = this.target;
    const prevId = prevTarget?.uid || null;
    if(dt){ this.retargetTimer = Math.max(0, (this.retargetTimer||0) - dt); }
    if(prevTarget && !prevTarget.alive){
      this.target = null;
      if(this.retargetDelay > 0){
        const speedBonus = Math.max(0, buffs.retargetSpeedBonus || 0);
        const mul = 1 + speedBonus;
        const baseDelay = this.retargetDelay;
        const effective = Math.max(0.05, baseDelay / mul);
        this.retargetTimer = Math.max(this.retargetTimer||0, effective);
      }
    }
    if(!this.target){
      if((this.retargetTimer||0) > 0){
        if(prevId && prevId !== (this.target?.uid || null)){
          this._resonanceArmed = false;
          this._lastTargetId = null;
        }
        return;
      }
      let best = null;
      let bestDist2 = Infinity;
      const range = this.getRange();
      // Hidden line-of-sight radius so towers can "see" farther than they can shoot.
      const visionRange = range * 2.0;
      const r2 = visionRange*visionRange;
      for(const e of enemies){
        if(!e.alive) continue;
        const d2v = dist2(this.x,this.y,e.x,e.y);
        if(d2v <= r2 && d2v < bestDist2){
          bestDist2 = d2v;
          best = e;
        }
      }
      this.target = best;
    } else {
      const d2v = dist2(this.x,this.y,this.target.x,this.target.y);
      const range = this.getRange();
      const rangeR2 = range*range;
      const visionRange = range * 2.0;
      const visionR2 = visionRange*visionRange;
      // Drop target if it leaves actual range or extended vision.
      if(d2v > rangeR2 || d2v > visionR2){
        this.target = null;
      }
    }
    const newId = this.target?.uid || null;
    if(newId !== prevId){
      this._resonanceArmed = !!newId;
      this._lastTargetId = newId;
    }
    if(this.target){
      const dx = this.target.x-this.x, dy=this.target.y-this.y; this.rotation=Math.atan2(dy,dx);
    }
  }
  tickPerkTimers(dt){
    this._resonanceCd = Math.max(0, (this._resonanceCd||0) - dt);
    this._fluxBurst = Math.max(0, (this._fluxBurst||0) - dt);
    const chargeNeeded = buffs.fluxChargeTime || 0;
    if(this.target && chargeNeeded>0){
      this._fluxCharge = Math.min(chargeNeeded + 1, (this._fluxCharge||0) + dt);
      if(this._fluxCharge >= chargeNeeded){
        this._fluxBurst = Math.max(this._fluxBurst||0, buffs.fluxBurstDuration||4);
        this._fluxCharge = 0;
      }
    } else {
      this._fluxCharge = 0;
    }
  }
  getFireRateBuff(){
    const flux = 1 + (buffs.fluxFireRateBonus || 0);
    const over = this._fluxBurst>0 ? (1 + (buffs.fluxOverheatBonus||0)) : 1;
    const chrono = 1 + (buffs.chronoActive ? (buffs.chronoFireBonus||0) : 0);
    return flux * over * chrono;
  }
  applyResonanceBonus(target, dmg){
    if(!target || !buffs.resonanceBonus) return dmg;
    if(!this._resonanceArmed || this._resonanceCd>0) return dmg;
    this._resonanceCd = buffs.resonanceCooldown || 3;
    this._resonanceArmed = false;
    return dmg * (1 + buffs.resonanceBonus);
  }
  applyTargetPainter(target, dmg){
    const chance = buffs.targetPainterChance || 0;
    if(!target || chance<=0) return { dmg, crit:false };
    const thr = buffs.targetPainterThreshold || 0.7;
    const ratio = Math.max(0, Math.min(1, target.hp / (target.maxHp || Math.max(target.hp,1))));
    if(ratio > thr && Math.random() < chance){
      return { dmg: dmg * (1 + (buffs.targetPainterBonus || 0)), crit:true };
    }
    return { dmg, crit:false };
  }
  drawBase(ctx){
    // Beveled hex base instead of a circle
    ctx.save();
    ctx.translate(this.x,this.y);
    const r = 16;
    // Outer glow
    const baseCol = this.baseColor || COLORS.tower;
    ctx.shadowColor = baseCol; ctx.shadowBlur = 10;
    // Hexagon
    const sides = 6;
    ctx.beginPath();
    for(let i=0;i<sides;i++){
      const a = i*(Math.PI*2/sides) + Math.PI/6;
      const px = Math.cos(a)*r, py = Math.sin(a)*r;
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath();
    // Fill with slight gradient illusion
    const grad = ctx.createLinearGradient(-r,-r,r,r);
    grad.addColorStop(0, '#0e2a20');
    grad.addColorStop(1, baseCol);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = baseCol;
    ctx.stroke();
    // Center bolt/cap
    ctx.fillStyle = COLORS.accent2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(0,0,3.5,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  drawIcon(ctx){ /* default: none */ }
  drawRange(ctx){
    // Range aura tinted to the tower's base color
    const hex = this.baseColor || COLORS.tower;
    const n = parseInt((hex||'#17e7a4').slice(1),16);
    const r=(n>>16)&255, g=(n>>8)&255, b=n&255;
    ctx.save();
    ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.getRange(),0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  tickIdleTimer(dt){
    this.idleTimer = (this.idleTimer ?? 0) + dt;
  }
  consumeAdaptiveBonus(){
    const threshold = buffs.idleShotThreshold || 3;
    const ready = (buffs.idleShotBonus > 0) && (this.idleTimer >= threshold);
    this.idleTimer = 0;
    return ready ? (1 + buffs.idleShotBonus) : 1;
  }
  getProjectileSpeed(baseSpeed){
    return baseSpeed * (buffs.projectileSpeedMul || 1);
  }
  upgradeRate(){ if(this.rateLevel<3) this.rateLevel++; }
  installSlow(){ this.hasSlow = true; }
  upgradeRange(){ if(this.rangeLevel<3){ this.rangeLevel++; this.range = this.baseRange * (1 + 0.15*this.rangeLevel); } }
  // range is derived via getRange(); this.range kept as legacy cache for UI
  installBurn(){ this.hasBurn = true; }
}

export class CannonTower extends BaseTower{
  constructor(gx,gy,tile){
    super('basic',gx,gy,tile);
    const def=TOWER_TYPES.basic;
    this.baseColor = COLORS.towerBasic;
    this.fireRate = def.fireRate;
    this.cooldown = 0;
    this.damage = def.damage;
    this.baseBulletSpeed = def.bulletSpeed;
    this.effects = []; // transient visuals: {type:'muzzle'|'burst'|'tracer', x,y,a?,t,x0?,y0?,x1?,y1?}
  }
  drawIcon(ctx){
    // Crosshair icon
    const col = this.baseColor || COLORS.accent2;
    ctx.save();
    ctx.translate(this.x, this.y + 9); // notch lower so barrel doesn't hide it
    ctx.strokeStyle = col; ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(0,0,5.5,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7,0); ctx.lineTo(7,0); ctx.moveTo(0,-7); ctx.lineTo(0,7); ctx.stroke();
    ctx.restore();
  }
  // Splash towers see slightly farther than they can actually hit,
  // so they can start leading shots earlier, but they only fire within
  // their visible range.
  acquireTarget(enemies, dt=0){
    const prevTarget = this.target;
    const prevId = prevTarget?.uid || null;
    if(dt){ this.retargetTimer = Math.max(0, (this.retargetTimer||0) - dt); }
    if(prevTarget && !prevTarget.alive){
      this.target = null;
      if(this.retargetDelay > 0){
        const speedBonus = Math.max(0, buffs.retargetSpeedBonus || 0);
        const mul = 1 + speedBonus;
        const baseDelay = this.retargetDelay;
        const effective = Math.max(0.05, baseDelay / mul);
        this.retargetTimer = Math.max(this.retargetTimer||0, effective);
      }
    }
    const range = this.getRange();
    const rangeR2 = range * range;
    const visionRange = range * 2.0;
    const visionR2 = visionRange * visionRange;
    if(!this.target){
      if((this.retargetTimer||0) > 0){
        if(prevId && prevId !== (this.target?.uid || null)){
          this._resonanceArmed = false;
          this._lastTargetId = null;
        }
        return;
      }
      // Prefer the closest enemy within hidden vision.
      let best = null;
      let bestDist2 = Infinity;
      for(const e of enemies){
        if(!e.alive) continue;
        const d2v = dist2(this.x,this.y,e.x,e.y);
        if(d2v <= visionR2 && d2v < bestDist2){
          bestDist2 = d2v;
          best = e;
        }
      }
      this.target = best;
    } else {
      const d2v = dist2(this.x,this.y,this.target.x,this.target.y);
      // Drop target once it leaves actual range (so we can reacquire a closer one),
      // or completely outside vision.
      if(d2v > rangeR2 || d2v > visionR2){
        this.target = null;
      }
    }
    const newId = this.target?.uid || null;
    if(newId !== prevId){
      this._resonanceArmed = !!newId;
      this._lastTargetId = newId;
    }
    // Rotation for splash is handled in update using the predicted impact point,
    // so we don't adjust the turret angle here.
  }
  update(dt,enemies){
    this.tickIdleTimer(dt);
    // effects ttl
    this.effects = this.effects.filter(e=> (e.t -= dt) > 0);

    this.acquireTarget(enemies, dt);
    this.tickPerkTimers(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if(this.target){
      // Only fire if target still within actual range
      const range = this.getRange();
      const d2v = dist2(this.x,this.y,this.target.x,this.target.y);
      if(d2v > range*range) return;
    }
    if(this.target && this.cooldown<=0){
      const rateMul = (1 + 0.2*this.rateLevel) * (buffs.fireRateMul||1) * this.getFireRateBuff();
      const interval = 1 / (this.fireRate*rateMul);
      this.cooldown = interval;
      this.lastShotInterval = interval;
      const slow = this.hasSlow? { pct:0.25*(buffs.slowPotencyMul||1), dur:1.8 } : null;
      const burn = this.hasBurn? { dps: 6*(buffs.burnDpsMul||1), dur: 2.0 } : null;
      const adaptive = this.consumeAdaptiveBonus();
      const baseDmg = (this.damage||0) * (buffs.baseDamageMul||1);
      let dmg = baseDmg * (buffs.dmgMul||1) * adaptive;
      dmg = this.applyResonanceBonus(this.target, dmg);
      const tp = this.applyTargetPainter(this.target, dmg);
      dmg = tp.dmg;
      const isCrit = tp.crit;
      const target = this.target;
      if(target && target.alive){
        const color = this.baseColor || COLORS.towerBasic;
        target.damage(dmg, 'bullet', { slowPct: slow?.pct, burnDps: burn?.dps, color, source:{x:this.x,y:this.y}, hitDamage:dmg, crit:isCrit });
        if(slow) target.applySlow(slow.pct, slow.dur);
        if(burn) target.applyBurn(burn.dps, burn.dur);
        const pierceChance = Math.min(1, buffs.pierceChance || 0);
        const cascadeBonus = (buffs.harmonicCascadeBonus||0) || 0;
        const extraChains = buffs.harmonicExtraChains || 0;
        if(pierceChance>0 && (cascadeBonus>0 || extraChains>0) && Math.random() < pierceChance){
          let chainsLeft = 1 + Math.max(0, extraChains|0);
          let current = target;
          while(chainsLeft>0){
            let best = null;
            let bestD2 = Infinity;
            for(const e of enemies){
              if(!e.alive || e===current) continue;
              const d2v = dist2(current.x,current.y,e.x,e.y);
              if(d2v < bestD2){ bestD2 = d2v; best = e; }
            }
            if(!best) break;
            const chainDmg = dmg * (1 + cascadeBonus);
            best.damage(chainDmg, 'bullet', { slowPct: slow?.pct, burnDps: burn?.dps, color, source:{x:current.x,y:current.y}, hitDamage:chainDmg });
            if(slow) best.applySlow(slow.pct, slow.dur);
            if(burn) best.applyBurn(burn.dps, burn.dur);
            this.effects.push({ type:'tracer', x0: current.x, y0: current.y, x1: best.x, y1: best.y, t:0.14 });
            current = best;
            chainsLeft--;
          }
        }
        this.effects.push({ type:'tracer', x0:this.x, y0:this.y, x1:target.x, y1:target.y, t:0.12 });
      }
      audio.zap();
      // muzzle flash
      const mx = this.x + Math.cos(this.rotation)*18;
      const my = this.y + Math.sin(this.rotation)*18;
      this.effects.push({ type:'muzzle', x:mx, y:my, a:this.rotation, t:0.12 });
    }
  }
  tryHit(enemies){ /* hitscan: handled in update */ }
  draw(ctx){
    // base + turret head (range drawn externally to avoid clutter)
    this.drawBase(ctx);
    // base icon
    this.drawIcon(ctx);
    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.rotate(this.rotation);
    // Turret head: beveled trapezoid
    ctx.fillStyle = COLORS.accent2;
    ctx.shadowColor = COLORS.accent2; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(4, -7);
    ctx.lineTo(22, -3.5);
    ctx.lineTo(22,  3.5);
    ctx.lineTo(4,  7);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // Muzzle highlight
    ctx.fillStyle = 'white';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(18,-2,3.5,4);
    ctx.globalAlpha = 1;
    ctx.restore();
    // effects
    for(const fx of this.effects){
      if(fx.type==='muzzle'){
        const ttl = 0.12;
        const p = Math.max(0, fx.t/ttl);
        const r = 6 + 10*(1-p);
        ctx.save();
        ctx.translate(fx.x, fx.y);
        ctx.rotate(fx.a||0);
        ctx.globalAlpha = 0.7*p;
        ctx.shadowColor = COLORS.accent2; ctx.shadowBlur = 12;
        ctx.fillStyle = COLORS.accent2;
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if(fx.type==='burst'){
        const ttl = 0.22;
        const p = Math.max(0, fx.t/ttl);
        ctx.save();
        ctx.globalAlpha = 0.6*p;
        ctx.strokeStyle = COLORS.accent2; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, 10*(1-p), 0, Math.PI*2); ctx.stroke();
        ctx.restore();
      } else if(fx.type==='tracer'){
        const ttl = 0.18;
        const life = Math.max(0, Math.min(ttl, ttl - fx.t));
        const p = life/ttl; // 0 → 1 along the path
        const x = fx.x0 + (fx.x1 - fx.x0)*p;
        const y = fx.y0 + (fx.y1 - fx.y0)*p - 4*(1-p); // slight arc lift
        const r = 3.2 + 0.6*p;
        const alpha = 0.2 + 0.6*p;
        ctx.save();
        ctx.globalAlpha = alpha;
        // Short trailing streak
        const tx = fx.x0 + (fx.x1 - fx.x0)*Math.max(0,p-0.2);
        const ty = fx.y0 + (fx.y1 - fx.y0)*Math.max(0,p-0.2) - 4*(1-p);
        ctx.strokeStyle = this.baseColor || COLORS.towerBasic;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        // Bullet head
        ctx.fillStyle = COLORS.bullet;
        ctx.shadowColor = this.baseColor || COLORS.towerBasic;
        ctx.shadowBlur = 6*p;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  // Stop any continuous/looping audio this tower may be playing
  stopAudio(){ /* default: no-op */ }
}

export class LaserTower extends BaseTower{
  constructor(gx,gy,tile){
    super('laser',gx,gy,tile);
    const def=TOWER_TYPES.laser;
    this.baseColor = COLORS.towerLaser;
    this.dps = def.dps;
    this.burnCooldown = 0;
    this._buzz = null;
    this.hitSparks = [];
  }
  drawIcon(ctx){
    // Lightning bolt
    const col = this.baseColor || COLORS.accent2;
    ctx.save();
    ctx.translate(this.x, this.y + 9);
    ctx.fillStyle = col; ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(-4,-2); ctx.lineTo(2,-2); ctx.lineTo(-1,3); ctx.lineTo(4,3); ctx.lineTo(-2,8); ctx.lineTo(1,2); ctx.lineTo(-4,2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  update(dt,enemies){
    this.tickIdleTimer(dt);
    this.acquireTarget(enemies, dt);
    this.tickPerkTimers(dt);
    // age out hit sparks
    this.hitSparks = (this.hitSparks||[]).filter(s=> (s.age += dt) < s.ttl);
    if(this.target){
      // Only apply beam damage while target is within real attack range.
      const range = this.getRange();
      const d2v = dist2(this.x,this.y,this.target.x,this.target.y);
      if(d2v > range*range){
        this.target = null;
        if(this._buzz){ this._buzz.stop(); this._buzz = null; }
        this._sparkCooldown = 0;
        return;
      }
      // damage over time
      const adaptive = this.consumeAdaptiveBonus();
      const baseDps = this.dps * (buffs.baseDamageMul||1);
      let dps = baseDps * (1 + 0.2*this.rateLevel) * (buffs.dmgMul||1) * this.getFireRateBuff() * adaptive;
      dps = this.applyResonanceBonus(this.target, dps);
      const tp = this.applyTargetPainter(this.target, dps);
      dps = tp.dmg;
      this.target.damage(dps*dt, 'laser', { dps, color: this.baseColor || COLORS.towerLaser, source:{x:this.x,y:this.y}, hitDamage:dps*dt, crit: tp.crit });
      if(this.hasSlow){ this.target.applySlow(0.35*(buffs.slowPotencyMul||1), 0.2); }
      if(this.hasBurn){ this.burnCooldown -= dt; if(this.burnCooldown<=0){ this.target.applyBurn(8*(buffs.burnDpsMul||1), 2.0); this.burnCooldown = 0.3; } }
      if(!this._buzz){ this._buzz = audio.buzz(); }
      // spawn endpoint spark (throttled)
      if(!this._sparkCooldown) this._sparkCooldown = 0;
      this._sparkCooldown -= dt;
      if(this._sparkCooldown <= 0){
        this.hitSparks.push({ x:this.target.x, y:this.target.y, age:0, ttl:0.25 });
        if(this.hitSparks.length>8) this.hitSparks.shift();
        this._sparkCooldown = 0.08;
      }
    } else {
      if(this._buzz){ this._buzz.stop(); this._buzz = null; }
      this._sparkCooldown = 0;
    }
  }
  stopAudio(){ if(this._buzz){ try{ this._buzz.stop(); }catch(e){} this._buzz=null; } }
  tryHit(enemies){/* no bullets */}
  draw(ctx){
    // base + emitter
    this.drawBase(ctx);
    this.drawIcon(ctx);
    // emitter head: triangular prism
    ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.rotation);
    ctx.shadowColor = COLORS.accent2; ctx.shadowBlur = 10;
    ctx.fillStyle = COLORS.accent2;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(16, 0);
    ctx.lineTo(0,  6);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // emitter ring
    ctx.strokeStyle = COLORS.accent2; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-2,0,6,0,Math.PI*2); ctx.stroke();
    ctx.restore();
    // beam
    if(this.target){
      ctx.save();
      ctx.strokeStyle = COLORS.accent2;
      ctx.lineWidth = this.hasSlow? 4 : 3;
      ctx.shadowColor = COLORS.accent2; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(this.x,this.y); ctx.lineTo(this.target.x, this.target.y); ctx.stroke();
      // inner highlight
      ctx.globalAlpha = 0.6; ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(this.x,this.y); ctx.lineTo(this.target.x, this.target.y); ctx.stroke();
      ctx.restore();
      // beam sparkles
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d = Math.hypot(dx,dy)||1; const ux = dx/d, uy = dy/d;
      for(let i=0;i<6;i++){
        const t = (i+1)/7;
        const px = this.x + ux*d*t + (Math.random()*2-1)*4;
        const py = this.y + uy*d*t + (Math.random()*2-1)*4;
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.shadowColor = COLORS.accent2; ctx.shadowBlur = 10;
        ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.arc(px,py,1.5,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }
    // draw endpoint sparks even after target lost (briefly)
    if(this.hitSparks && this.hitSparks.length){
      for(const s of this.hitSparks){
        const a = Math.max(0, 1 - s.age/s.ttl);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = COLORS.accent2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6 + 10*(1-a), 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}

export class SplashTower extends BaseTower{
  constructor(gx,gy,tile){
    super('splash',gx,gy,tile);
    const def=TOWER_TYPES.splash;
    this.baseColor = COLORS.towerSplash;
    this.fireRate = def.fireRate; this.cooldown=0;
    this.damage = def.damage; this.splashRadius = def.splashRadius; this.baseBulletSpeed = def.bulletSpeed;
    this.bubbles = []; // purely visual shells
    this.explosions = []; // {x,y,r,life}
    this.sparks = []; // shrapnel particles {x,y,vx,vy,life}
    this.telegraph = null; // ground target hint before firing
    this.retargetDelay = 0.6;
  }
  getLeadDistance(){
    // Aim roughly 1.5 tiles ahead of the current target along its path.
    const tilesAhead = 1.5;
    return tilesAhead * this.tile;
  }
  drawIcon(ctx){
    // Three droplets (triangular arrangement)
    const col = this.baseColor || COLORS.accent2;
    ctx.save();
    ctx.translate(this.x, this.y + 9);
    ctx.fillStyle = col; ctx.globalAlpha = 0.95;
    const drawDrop = (x,y)=>{ ctx.beginPath(); ctx.arc(x,y,2.2,0,Math.PI*2); ctx.fill(); };
    drawDrop(0,-2.5); drawDrop(-3,2); drawDrop(3,2);
    ctx.restore();
  }
  update(dt,enemies){
    this.tickIdleTimer(dt);
    // update bubble visuals (purely cosmetic)
    this.bubbles = this.bubbles.filter(b=> (b.t += dt) < b.ttl);
    // update explosions visuals
    this.explosions = this.explosions.filter(ex=> (ex.life-=dt) > 0);
    // update shrapnel
    this.sparks = this.sparks.filter(s=> (s.life-=dt) > 0);
    for(const s of this.sparks){ s.x += s.vx*dt; s.y += s.vy*dt; s.vy += 120*dt; }
    // telegraph age is driven by cooldown window; no free-running timer needed

    // Acquire / maintain target with extended vision so we can aim ahead
    this.acquireTarget(enemies, dt);
    this.tickPerkTimers(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);

    const puddleBaseR = this.tile * 0.6 * (buffs.splashRadiusMul||1); // a bit wider than one tile
    const range = this.getRange();
    // For actual shots, keep impact tiles within the real attack radius shown to the player.
    const r2 = range*range;

    // Compute future impact point (ahead along the path) if we have a target.
    let impact = null;
    if(this.target){
      const leadDist = this.getLeadDistance();
      const ahead = (typeof this.target.getFuturePos === 'function')
        ? this.target.getFuturePos(leadDist)
        : { x:this.target.x, y:this.target.y };
      let sx = ahead.x;
      let sy = ahead.y;
      // Snap to tile center so impact stays on the grid/path
      const gx = Math.floor(sx / this.tile);
      const gy = Math.floor(sy / this.tile);
      sx = gx * this.tile + this.tile/2;
      sy = gy * this.tile + this.tile/2;
      const d2 = dist2(this.x,this.y,sx,sy);
      if(d2 <= r2){
        impact = { x:sx, y:sy };
      } else {
        // Impact still out of real range; keep tracking but don't telegraph or fire yet.
        impact = null;
      }
    }

    // Ground telegraph: show only in the last part of the cooldown so it
    // looks like the tower is "locking in" the next shot, not idling forever.
    if(this.target && impact){
      const cycle = this.lastShotInterval || (1 / this.fireRate);
      const leadWindow = Math.min(1.0, cycle * 0.4); // up to ~1s of warning
      if(this.cooldown <= leadWindow){
        const elapsed = leadWindow - this.cooldown;
        this.telegraph = {
          x: impact.x,
          y: impact.y,
          r: puddleBaseR * 0.8,
          t: elapsed,
          ttl: leadWindow
        };
      } else {
        this.telegraph = null;
      }
    } else {
      this.telegraph = null;
    }

      if(this.target && impact && this.cooldown<=0){
      const rateMul = (1 + 0.2*this.rateLevel) * (buffs.fireRateMul||1) * this.getFireRateBuff();
	      const baseInterval = 1 / (this.fireRate*rateMul);
      const slow = this.hasSlow? { pct:0.35*(buffs.slowPotencyMul||1), dur:1.6 } : null;
      const burn = this.hasBurn? { dps: 5*(buffs.burnDpsMul||1), dur: 2.2 } : null;
	      const splashR = puddleBaseR;
      const adaptive = this.consumeAdaptiveBonus();
      const baseDmg = (this.damage||0) * (buffs.baseDamageMul||1);
      let dmg = baseDmg * (buffs.dmgMul||1) * adaptive;
      dmg = this.applyResonanceBonus(this.target, dmg);
      const tp = this.applyTargetPainter(this.target, dmg);
      dmg = tp.dmg;
	      const isCrit = tp.crit;
      // Use telegraphed impact point if present, otherwise the latest computed one.
	      const sx = this.telegraph ? this.telegraph.x : impact.x;
	      const sy = this.telegraph ? this.telegraph.y : impact.y;

	      // Aim the turret at the future impact point so it appears to
	      // lead the target instead of tracking the current enemy position.
	      if(sx != null && sy != null){
	        const adx = sx - this.x;
	        const ady = sy - this.y;
	        this.rotation = Math.atan2(ady, adx);
	      }
      const color = this.baseColor || COLORS.towerSplash;
      // No explicit direct AoE burst here; damage is handled by the puddle DoT.
      this.explosions.push({x:sx,y:sy,r:splashR,life:0.25});
      // bubble shell visual travelling toward impact point (continuous stream)
      const dx = sx - this.x;
      const dy = sy - this.y;
      const dist = Math.hypot(dx,dy) || 1;
      const travel = Math.min(0.7, Math.max(0.3, dist/320));
      const bubbleCount = 4;
      for(let i=0;i<bubbleCount;i++){
        this.bubbles.push({
          x0:this.x,
          y0:this.y,
          x1:sx,
          y1:sy,
          t:0,
          ttl:travel,
          phase:(i/bubbleCount)*0.3*travel,
          r:6 + i
        });
      }
      // Spawn a lingering puddle that damages / applies modules on contact.
      // Lifetime bumped so enemies have more time to walk through it.
      const puddleTtl = Math.max(2.8, baseInterval*2.8);
      const puddleDps = dmg * 0.35 / puddleTtl;
      const puddleBurn = burn ? burn.dps * 0.6 : 0;
      // Puddle slow should only apply if the Slow Module is installed.
      const puddleSlow = slow ? slow.pct * 0.85 : 0;
      if(this.game && this.game.addHazardZone){
        this.game.addHazardZone({
          x:sx,
          y:sy,
          r:splashR,
          dur:puddleTtl,
          slowPct:puddleSlow,
          dps:puddleDps,
          burnDps:puddleBurn,
          kind:'bubble',
          color: this.baseColor || COLORS.towerSplash
        });
      }
      // Gated fire cycle: wait until puddle expires before next shot
      this.cooldown = puddleTtl;
      this.lastShotInterval = puddleTtl;
      this.telegraph = null;
      for(let i=0;i<10;i++){
        const a = Math.random()*Math.PI*2; const sp = 120 + Math.random()*140;
        this.sparks.push({x:sx,y:sy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.25+Math.random()*0.2});
      }
      audio.bubble();
      if(this.game && this.game.handleSplashExplosion){
        this.game.handleSplashExplosion({ x:sx, y:sy, r:splashR });
      }
    }
  }
  tryHit(enemies){ /* hitscan AoE handled in update */ }
  draw(ctx){
    this.drawBase(ctx);
    this.drawIcon(ctx);
    // launcher: angled tube + cradle
    ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.rotation);
    // cradle ring
    ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-2,0,8,0,Math.PI*2); ctx.stroke();
    // tube
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.moveTo(-4, -6);
    ctx.lineTo(18, -3);
    ctx.lineTo(18,  3);
    ctx.lineTo(-4,  6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // bubble shells (purely visual)
    for(const b of this.bubbles){
      const phase = b.phase || 0;
      const p = clamp((b.t + phase) / b.ttl, 0, 1);
      const x = b.x0 + (b.x1 - b.x0)*p;
      const y = b.y0 + (b.y1 - b.y0)*p - 6*(1-p);
      const baseR = b.r || 6;
      const r = baseR * (0.9 + 0.4*p);
      const alpha = 0.25 + 0.5*(1-p);
      ctx.save();
      ctx.globalAlpha = alpha;
      const tint = this.baseColor || COLORS.towerSplash;
      const n = parseInt((tint||'#ff9e00').slice(1),16);
      const rr=(n>>16)&255, gg=(n>>8)&255, bb=n&255;
      const grad = ctx.createRadialGradient(x-2,y-2,r*0.2, x,y,r);
      grad.addColorStop(0,'rgba(255,255,255,0.95)');
      grad.addColorStop(0.4,`rgba(${rr},${gg},${bb},0.7)`);
      grad.addColorStop(1,`rgba(${rr},${gg},${bb},0.05)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x,y,r,0,Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${rr},${gg},${bb},0.7)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x,y,r*0.9,0,Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }
    // explosion effects
    for(const ex of this.explosions){
      const a = Math.max(0, ex.life/0.25);
      ctx.save(); ctx.strokeStyle = `rgba(0,186,255,${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ex.x,ex.y, ex.r*(1.1 - a*0.2), 0, Math.PI*2); ctx.stroke(); ctx.restore();
    }
    // shrapnel
    for(const s of this.sparks){
      const a = Math.max(0, s.life/0.45);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = COLORS.accent2; ctx.shadowBlur = 8;
      ctx.fillStyle = COLORS.accent2;
      ctx.beginPath(); ctx.arc(s.x,s.y,2,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
}

export function createTower(type,gx,gy,tile){
  switch(type){
    case 'laser': return new LaserTower(gx,gy,tile);
    case 'splash': return new SplashTower(gx,gy,tile);
    case 'basic': default: return new CannonTower(gx,gy,tile);
  }
}
