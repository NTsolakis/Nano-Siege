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
  const zoomToken = getComputedStyle(root).getPropertyValue('--canvas-zoom') || '1';
  const zoom = parseFloat(zoomToken) || 1;
  let width = usableWidth * zoom;
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
