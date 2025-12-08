// Keep the initial preload focused on lightweight, menu‑adjacent art so
// startup memory stays low. Heavier gameplay assets (map textures,
// enemy sheets, tower sprites, etc.) are loaded on demand when a run
// actually starts.
const IMAGE_ASSETS = [
  // Main menu / hub background + subtle space layer
  'data/Space-Background.png',
  // Small character headshots used in menu/UI
  'data/Volt.png',
  'data/Torque.png',
  'data/Lumen.png'
];

// During the explicit asset preload phase we intentionally cap the
// visible progress so the bar never sits at 100% while additional
// bootstrap work (module import, sprite preprocessing, etc) finishes.
const MAX_ASSET_PROGRESS = 80; // percent

function isHostedWebBuild(){
  try{
    if(typeof window === 'undefined') return false;
    const loc = window.location || {};
    const protocol = String(loc.protocol || '').toLowerCase();
    return protocol === 'http:' || protocol === 'https:';
  }catch(e){
    return false;
  }
}

function preloadImage(url){
  return new Promise((resolve)=>{
    if(typeof Image === 'undefined'){
      resolve({ url, ok:true });
      return;
    }
    const img = new Image();
    img.onload = ()=> resolve({ url, ok:true });
    img.onerror = ()=> resolve({ url, ok:false });
    img.src = url;
  });
}

async function preloadAssets(){
  const barFill = document.getElementById('loading-bar-fill');
  const textEl = document.getElementById('loading-text');
  const total = IMAGE_ASSETS.length;
  let loaded = 0;

  const updateProgress = ()=>{
    const frac = total > 0 ? (loaded / total) : 1;
    const pct = Math.round(frac * MAX_ASSET_PROGRESS);
    if(barFill){
      barFill.style.width = `${Math.max(10, pct)}%`;
    }
    if(textEl){
      textEl.textContent = 'Loading assets…';
    }
  };

  updateProgress();
  for(const url of IMAGE_ASSETS){
    await preloadImage(url);
    loaded += 1;
    updateProgress();
  }
  await new Promise((resolve)=> setTimeout(resolve, 150));
}

function animateToFull(barFill, textEl){
  if(!barFill){
    if(textEl) textEl.textContent = 'Preparing reactor core…';
    return Promise.resolve();
  }
  const startWidth = parseFloat(barFill.style.width || '0') || 0;
  const start = (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
  const duration = 420; // ms
  return new Promise((resolve)=>{
    const step = (now)=>{
      const t = Math.min(1, ((typeof now === 'number' ? now : Date.now()) - start) / duration);
      const w = startWidth + (100 - startWidth) * t;
      barFill.style.width = `${w}%`;
      if(textEl){
        textEl.textContent = 'Preparing reactor core…';
      }
      if(t < 1){
        if(typeof requestAnimationFrame !== 'undefined'){
          requestAnimationFrame(step);
        } else {
          setTimeout(()=> step(), 16);
        }
      } else {
        resolve();
      }
    };
    if(typeof requestAnimationFrame !== 'undefined'){
      requestAnimationFrame(step);
    } else {
      step();
    }
  });
}

async function boot(){
  const overlay = document.getElementById('loading-overlay');
  const barFill = document.getElementById('loading-bar-fill');
  const textEl = document.getElementById('loading-text');
  const t0 = (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
  const webHub = isHostedWebBuild();
  try{
    if(!webHub){
      await preloadAssets();
    }
  }catch(e){
    console.warn('Asset preload failed', e);
  }
  try{
    if(webHub){
      const mod = await import('./hub.js');
      if(mod && typeof mod.initHub === 'function'){
        await mod.initHub();
      }
    }else{
      await import('./main.js');
    }
  }catch(e){
    console.error(webHub ? 'Hub bootstrap failed' : 'Game bootstrap failed', e);
  }
  // Ensure there is a small minimum loading duration so any one‑time
  // initialization hitches are hidden behind the loading screen, and
  // wait for at least one paint after the game bootstraps before
  // removing the overlay so the main menu is fully interactive.
  try{
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    const minDuration = 900; // ms
    const remaining = Math.max(0, minDuration - (now - t0));
    if(remaining > 0){
      await new Promise((resolve)=> setTimeout(resolve, remaining));
    }
    // Smoothly drive the bar from its capped value up to 100% so the
    // last bit of startup feels intentional rather than a frozen bar.
    await animateToFull(barFill, textEl);
    await new Promise((resolve)=> requestAnimationFrame(()=> resolve()));
  }catch(e){}
  if(overlay){
    overlay.classList.add('hidden');
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>{ boot(); });
}else{
  boot();
}
