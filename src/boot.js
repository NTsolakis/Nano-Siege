const IMAGE_ASSETS = [
  'data/loading-bg.gif',
  'data/board-bg.png',
  'data/tower-cannon.png',
  'data/tower-laser.png',
  'data/tower-splash.png',
  'data/nano-boss-sheet.png'
];

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
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 100;
    if(barFill){
      barFill.style.width = `${Math.max(10, pct)}%`;
    }
    if(textEl){
      textEl.textContent = `Loading assets… ${pct}%`;
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

async function boot(){
  const overlay = document.getElementById('loading-overlay');
  try{
    await preloadAssets();
  }catch(e){
    console.warn('Asset preload failed', e);
  }
  try{
    await import('./main.js');
  }catch(e){
    console.error('Game bootstrap failed', e);
  }
  if(overlay){
    overlay.classList.add('hidden');
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=>{ boot(); });
}else{
  boot();
}
