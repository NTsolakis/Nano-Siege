class AudioManager {
  constructor(){
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this.unlocked = false;
    this.volSteps = [0, 0.4, 0.7, 1.0];
    this.volIndex = 2; // default louder than before (~70%)
    this.currentVolume = this._readVolumePref('master', this.volSteps[this.volIndex]); // 0..1
    this.musicVolume = this._readVolumePref('music', 0.7);
    this.sfxVolume = this._readVolumePref('sfx', 0.9);
    this._music = null; // { source, gain, url, loop }
  }

  resume(){
    if(!this.enabled) return;
    if(!this.ctx){
      try{
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.currentVolume;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicVolume;
        this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxVolume;
        this.sfxGain.connect(this.master);
      }catch(e){
        console.warn('Audio init failed', e); this.enabled=false; return;
      }
    }
    if(this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = true;
  }

  now(){ return this.ctx ? this.ctx.currentTime : 0; }

  _readVolumePref(kind, fallback){
    if(typeof window === 'undefined' || !window.localStorage) return fallback;
    try{
      const raw = window.localStorage.getItem(`nano_vol_${kind}`);
      if(raw == null || raw === '') return fallback;
      const v = parseFloat(raw);
      if(!isFinite(v) || v<0 || v>1) return fallback;
      return v;
    }catch(e){
      return fallback;
    }
  }
  _writeVolumePref(kind, value){
    if(typeof window === 'undefined' || !window.localStorage) return;
    try{
      window.localStorage.setItem(`nano_vol_${kind}`, String(value));
    }catch(e){}
  }

  setVolumeIndex(i){
    this.volIndex = Math.max(0, Math.min(this.volSteps.length-1, i|0));
    this.currentVolume = this.volSteps[this.volIndex];
    if(this.master) this.master.gain.value = this.currentVolume;
    this._writeVolumePref('master', this.currentVolume);
  }

  cycleVolume(){
    const next = (this.volIndex + 1) % this.volSteps.length;
    this.setVolumeIndex(next);
    return this.getVolumeLabel();
  }

  getVolumeLabel(){
    const pct = Math.round((this.master? this.master.gain.value : this.currentVolume)*100);
    return `Volume: ${pct}%`;
  }

  // Absolute volume control (0..100)
  setVolumePercent(pct){
    const clamped = Math.max(0, Math.min(100, pct|0));
    this.currentVolume = clamped/100;
    if(this.master) this.master.gain.value = this.currentVolume;
    this._writeVolumePref('master', this.currentVolume);
    this._syncMusicElementVolume();
  }
  getVolumePercent(){
    return Math.round((this.master? this.master.gain.value : this.currentVolume)*100);
  }

  setMusicVolumePercent(pct){
    const clamped = Math.max(0, Math.min(100, pct|0));
    this.musicVolume = clamped/100;
    if(this.musicGain) this.musicGain.gain.value = this.musicVolume;
    this._writeVolumePref('music', this.musicVolume);
    this._syncMusicElementVolume();
  }
  getMusicVolumePercent(){
    return Math.round((this.musicGain? this.musicGain.gain.value : this.musicVolume)*100);
  }
  setSfxVolumePercent(pct){
    const clamped = Math.max(0, Math.min(100, pct|0));
    this.sfxVolume = clamped/100;
    if(this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
    this._writeVolumePref('sfx', this.sfxVolume);
  }
  getSfxVolumePercent(){
    return Math.round((this.sfxGain? this.sfxGain.gain.value : this.sfxVolume)*100);
  }

  // helpers
  oneShotOsc({type='sine', f0=440, f1=null, t=0.15, gain=0.3, attack=0.005, decay=null, filter=null}){
    if(!this.ctx || !this.unlocked) return;
    const ctx=this.ctx, t0=this.now();
    const osc = ctx.createOscillator(); osc.type=type; osc.frequency.setValueAtTime(f0, t0);
    if(f1!=null) osc.frequency.exponentialRampToValueAtTime(Math.max(1,f1), t0+t);
    let node = osc;
    if(filter){
      const biq = ctx.createBiquadFilter();
      biq.type = filter.type || 'lowpass';
      biq.frequency.value = filter.freq || 1200;
      biq.Q.value = filter.Q || 0.7;
      node.connect(biq); node = biq;
    }
    const g = ctx.createGain();
    const d = decay!=null? decay : t;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0+attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+d);
    node.connect(g); g.connect(this.sfxGain || this.master);
    osc.start(t0); osc.stop(t0+d+0.02);
  }

  // Sounds
  place(){
    // plop: short downward sine with a touch of lowpass
    const f0 = 220 + Math.random()*40, f1 = 90 + Math.random()*20;
    this.oneShotOsc({type:'sine', f0, f1, t:0.16, gain:0.35, filter:{type:'lowpass', freq:1400, Q:0.2}});
  }
  cash(){
    // two bright pings
    this.oneShotOsc({type:'triangle', f0:1200, f1:1400, t:0.10, gain:0.22});
    setTimeout(()=> this.oneShotOsc({type:'triangle', f0:1600, f1:1800, t:0.12, gain:0.18}), 60);
  }
  zap(){
    // short sci‑fi shot
    const f0 = 1400 + Math.random()*200, f1 = 700 + Math.random()*100;
    this.oneShotOsc({type:'square', f0, f1, t:0.06, gain:0.18, filter:{type:'highpass', freq:350, Q:0.7}});
  }

  damage(){
    // machine damage: low saw thud + metallic ping + sub thump
    this.oneShotOsc({type:'sawtooth', f0:220, f1:70, t:0.18, gain:0.4, filter:{type:'lowpass', freq:900, Q:0.4}});
    setTimeout(()=> this.oneShotOsc({type:'square', f0:900, f1:400, t:0.10, gain:0.22, filter:{type:'highpass', freq:600, Q:0.9}}), 35);
    setTimeout(()=> this.oneShotOsc({type:'sine', f0:140, f1:80, t:0.12, gain:0.28}), 70);
  }

  bubble(){
    // digital bubble: rising sine blip + quick second blip
    this.oneShotOsc({type:'sine', f0:220, f1:520, t:0.12, gain:0.22, filter:{type:'lowpass', freq:1500, Q:0.7}});
    setTimeout(()=> this.oneShotOsc({type:'sine', f0:260, f1:680, t:0.10, gain:0.18, filter:{type:'lowpass', freq:1600, Q:0.7}}), 70);
  }

  // Continuous buzzing for laser beams; returns a handle with stop()
  buzz(){
    if(!this.ctx || !this.unlocked) return { stop:()=>{} };
    const ctx=this.ctx, t0=this.now();
    const osc = ctx.createOscillator(); osc.type='sawtooth'; osc.frequency.value = 130 + Math.random()*20;
    const filt = ctx.createBiquadFilter(); filt.type='bandpass'; filt.frequency.value = 600; filt.Q.value=1.2;
    const vca = ctx.createGain(); vca.gain.value = 0.12;
    // tremolo
    const lfo = ctx.createOscillator(); lfo.type='sine'; lfo.frequency.value = 28 + Math.random()*6;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.1; // depth
    lfo.connect(lfoGain); lfoGain.connect(vca.gain);
    osc.connect(filt); filt.connect(vca); vca.connect(this.master);
    // ramp in
    vca.gain.setValueAtTime(0.0001, t0);
    vca.gain.exponentialRampToValueAtTime(0.12, t0+0.04);
    osc.start(); lfo.start();
    const stop = ()=>{
      const t1 = this.now();
      try{
        vca.gain.cancelScheduledValues(t1);
        vca.gain.exponentialRampToValueAtTime(0.0001, t1+0.05);
        osc.stop(t1+0.06); lfo.stop(t1+0.06);
      }catch(e){}
    };
    return { stop };
  }

  // Low HP alarm (intermittent beeps instead of a constant tone)
  startLowHp(){
    if(!this.ctx || !this.unlocked) return;
    if(this._lowHp) return;
    const beep = ()=>{
      // short, soft triangle chirp with slight band emphasis
      this.oneShotOsc({ type:'triangle', f0:520, f1:420, t:0.15, gain:0.14, filter:{type:'bandpass', freq:560, Q:0.9} });
    };
    // Beep immediately, then every ~2.4s with a little random jitter
    beep();
    const id = setInterval(()=>{
      try{ beep(); }catch(e){}
    }, 2400);
    this._lowHp = { timer:id };
  }
  stopLowHp(){
    const n=this._lowHp; if(!n) return; this._lowHp=null;
    if(n.timer){ try{ clearInterval(n.timer); }catch(e){} }
  }

  // Boss cues
  bossIntro(){
    // Deep rumble + alarm chirps
    this.oneShotOsc({type:'sawtooth', f0:140, f1:60, t:0.5, gain:0.35, filter:{type:'lowpass', freq:800, Q:0.4}});
    setTimeout(()=> this.oneShotOsc({type:'triangle', f0:700, f1:450, t:0.18, gain:0.22, filter:{type:'bandpass', freq:600, Q:1.1}}), 120);
    setTimeout(()=> this.oneShotOsc({type:'triangle', f0:650, f1:420, t:0.18, gain:0.20, filter:{type:'bandpass', freq:550, Q:1.1}}), 320);
  }
  bossSpawn(){
    // Heavier thud + bright ping
    this.oneShotOsc({type:'sawtooth', f0:180, f1:70, t:0.22, gain:0.45, filter:{type:'lowpass', freq:700, Q:0.5}});
    setTimeout(()=> this.oneShotOsc({type:'square', f0:1200, f1:900, t:0.09, gain:0.22, filter:{type:'highpass', freq:500, Q:0.8}}), 70);
  }

  // Reactor breach: low, heavy explosion with rumble
  reactorBreach(){
    if(!this.ctx || !this.unlocked) return;
    // Deep sub thud
    this.oneShotOsc({type:'sine', f0:120, f1:40, t:0.35, gain:0.55});
    // Rumble layer (filtered saw)
    this.oneShotOsc({type:'sawtooth', f0:90, f1:45, t:0.7, gain:0.32, filter:{type:'lowpass', freq:280, Q:0.7}});
    // Crack layer (quick noisy edge)
    setTimeout(()=> this.oneShotOsc({type:'square', f0:650, f1:260, t:0.12, gain:0.24, filter:{type:'highpass', freq:400, Q:0.9}}), 20);
    // Aftershock tail
    setTimeout(()=> this.oneShotOsc({type:'triangle', f0:70, f1:50, t:0.6, gain:0.18, filter:{type:'lowpass', freq:180, Q:0.6}}), 80);
  }

  // Short shop theme for teleport transition
  shopTheme(){
    if(!this.ctx || !this.unlocked) return;
    const seq = [
      { t:0.00, type:'triangle', f0:660,  f1:null,  d:0.12, g:0.18 },
      { t:0.10, type:'triangle', f0:880,  f1:null,  d:0.12, g:0.18 },
      { t:0.20, type:'triangle', f0:990,  f1:null,  d:0.14, g:0.18 },
      { t:0.36, type:'sine',     f0:1320, f1:880,  d:0.25, g:0.22 },
      { t:0.62, type:'sine',     f0:990,  f1:660,  d:0.20, g:0.20 }
    ];
    for(const n of seq){
      setTimeout(()=> this.oneShotOsc({type:n.type, f0:n.f0, f1:n.f1, t:n.d, gain:n.g, filter:{type:'lowpass', freq:1800, Q:0.6}}), Math.floor(n.t*1000));
    }
  }

  // --- Music handling (HTMLAudioElement) ---
  _ensureMusicElement(url){
    try{
      if(typeof Audio === 'undefined') return null;
    }catch(e){
      return null;
    }
    // Reuse existing element if same track.
    if(this._music && this._music.el){
      if(this._music.url === url){
        return this._music.el;
      }
      try{
        this._music.el.pause();
      }catch(e){}
    }
    try{
      const el = new Audio(url);
      el.loop = true;
      el.volume = Math.max(0, Math.min(1, (this.musicVolume||1)*(this.currentVolume||1)));
      this._music = { el, url };
      return el;
    }catch(e){
      return null;
    }
  }

  _syncMusicElementVolume(){
    const m = this._music;
    if(!m || !m.el) return;
    const vol = Math.max(0, Math.min(1, (this.musicVolume||1)*(this.currentVolume||1)));
    try{
      m.el.volume = vol;
    }catch(e){}
  }

  _stopMusicImmediate(){
    const m = this._music;
    this._music = null;
    if(!m || !m.el) return;
    try{
      m.el.pause();
      m.el.currentTime = 0;
    }catch(e){}
  }

  fadeOutMusic(duration=0.5){
    const m = this._music;
    if(!m || !m.el) return;
    const el = m.el;
    const start = el.volume;
    if(start <= 0) return;
    const steps = 20;
    const stepMs = (duration*1000)/steps;
    let n = 0;
    const tick = ()=>{
      n++;
      const t = n/steps;
      const v = start*(1-t);
      try{
        el.volume = Math.max(0, v);
      }catch(e){}
      if(n < steps){
        setTimeout(tick, stepMs);
      }else{
        try{ el.pause(); }catch(e){}
      }
    };
    setTimeout(tick, stepMs);
  }

  playMusic(url, { loop=true } = {}){
    if(!this.enabled) return;
    const el = this._ensureMusicElement(url);
    if(!el) return;
    el.loop = !!loop;
    this._syncMusicElementVolume();
    try{
      el.play().catch(()=>{});
    }catch(e){}
  }
}

export const audio = new AudioManager();
