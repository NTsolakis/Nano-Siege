import { CANVAS_W, CANVAS_H } from './config.js';
import { Game } from './game.js';

const root = document.documentElement;
const hud = document.querySelector('.hud');
const footer = document.querySelector('.footer');
const stage = document.querySelector('.stage-wrap');
const canvasShell = document.getElementById('canvas-shell');
const passivePanel = document.getElementById('passive-panel');
const wavePanel = document.querySelector('.wave-panel');

const updateStageSizing = ()=>{
  if(!stage || !canvasShell) return;
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const hudHeight = hud ? hud.offsetHeight : 0;
  const footerHeight = footer ? footer.offsetHeight : 0;
  const availableHeight = Math.max(260, viewportHeight - hudHeight - footerHeight - 32);
  root.style.setProperty('--stage-max-height', `${availableHeight}px`);

  const stageWidth = stage.clientWidth;
  const passiveWidth = passivePanel ? passivePanel.offsetWidth : 0;
  const waveWidth = wavePanel ? wavePanel.offsetWidth : 0;
  const stageStyles = getComputedStyle(stage);
  const gapToken = stageStyles.columnGap || stageStyles.gap || '0';
  const gapValue = parseFloat(gapToken) || 0;
  const isColumnLayout =
    stageStyles.display === 'flex' &&
    (stageStyles.flexDirection || '').includes('column');
  const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const isNarrowScreen = viewportWidth <= 860;

  const sideWidth = passiveWidth + waveWidth + gapValue * 2;
  const minCanvasWidth = isNarrowScreen ? 320 : 220;
  const usableWidth = isColumnLayout
    ? Math.max(minCanvasWidth, stageWidth)
    : Math.max(minCanvasWidth, stageWidth - sideWidth);
  const ratio = 16 / 9;
  // Let the canvas grow to the full usable width, height-capped later to preserve aspect.
  let width = usableWidth;
  let height = width / ratio;
  // On wider layouts we cap by height so the canvas
  // never exceeds the available vertical space.
  // On narrow/mobile layouts we intentionally skip this
  // so the map can grow to fill the center column.
  if(!isColumnLayout && !isNarrowScreen){
    if(height > availableHeight){
      height = availableHeight;
      width = height * ratio;
    }
  }
  canvasShell.style.width = `${width}px`;
  canvasShell.style.height = `${height}px`;
};

window.addEventListener('resize', updateStageSizing);
window.addEventListener('orientationchange', updateStageSizing);
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', updateStageSizing);
  window.visualViewport.addEventListener('scroll', updateStageSizing);
}

const canvas = document.getElementById('game');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

const game = new Game(canvas);
game.start();

// Browser back handling: keep navigation inside the game.
if(window.history && window.history.pushState){
  const pushStateSafe = (screen)=>{
    try{
      window.history.pushState({ nanoSiege:true, screen }, '');
    }catch(e){}
  };
  try{
    window.history.replaceState({ nanoSiege:true, screen:'menu' }, '');
    // Seed an initial in-page history entry so Back has somewhere to go.
    pushStateSafe('menu');
  }catch(e){}
  let backInFlight = false;
  window.addEventListener('popstate', (evt)=>{
    if(!evt.state || !evt.state.nanoSiege){
      // Let the browser handle non-game history entries.
      return;
    }
    const isInRun = game.state === 'playing' || game.state === 'paused' || game.state === 'exitConfirm';
    if(isInRun){
      if(backInFlight) return;
      backInFlight = true;
      if(typeof game.requestExitConfirm === 'function'){
        game.requestExitConfirm((ok)=>{
          if(ok){
            game.toMenu();
          } else {
            // Re‑assert game state in history so Back again re-prompts.
            pushStateSafe('game');
          }
          backInFlight = false;
        });
      } else {
        backInFlight = false;
      }
    } else {
      // From any menu/overlay, return to fullscreen main menu instead of leaving the page.
      if(typeof game.handleMenuBack === 'function') game.handleMenuBack();
      else game.toMenu();
      pushStateSafe('menu');
    }
  });

  // When gameplay starts or returns to menus, push explicit states so Back
  // can move between "game" and "menu" without leaving the page.
  if(typeof game.startGame === 'function'){
    const origStartGame = game.startGame.bind(game);
    game.startGame = (...args)=>{
      pushStateSafe('game');
      return origStartGame(...args);
    };
  }
  if(typeof game.toMenu === 'function'){
    const origToMenu = game.toMenu.bind(game);
    game.toMenu = (...args)=>{
      pushStateSafe('menu');
      return origToMenu(...args);
    };
  }
  if(typeof game.handleMenuBack === 'function'){
    const origHandleMenuBack = game.handleMenuBack.bind(game);
    game.handleMenuBack = (...args)=>{
      pushStateSafe('menu');
      return origHandleMenuBack(...args);
    };
  }
}

requestAnimationFrame(updateStageSizing);

const observerTargets = [hud, footer, passivePanel];
if(window.ResizeObserver){
  const observer = new ResizeObserver(updateStageSizing);
  observerTargets.forEach((target)=>{
    if(target) observer.observe(target);
  });
}

stage?.addEventListener('transitionend', updateStageSizing);

// Helpful: warn on context lost (some browsers)
canvas.addEventListener('webglcontextlost', (e)=>{ e.preventDefault(); alert('Context lost'); });
