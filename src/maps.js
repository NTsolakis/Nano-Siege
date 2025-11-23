import { GRID_W, GRID_H, COLORS } from './config.js';

function line(x0,y0,x1,y1){
  const p=[]; let x=x0, y=y0;
  const sx = Math.sign(x1-x0) || 0;
  const sy = Math.sign(y1-y0) || 0;
  p.push([x,y]);
  while(x!==x1 || y!==y1){ if(x!==x1) x+=sx; else if(y!==y1) y+=sy; p.push([x,y]); }
  return p;
}
function pathOf(segments){
  let out=[]; segments.forEach((seg,i)=>{ const part=line(...seg); if(i>0) part.shift(); out=out.concat(part); }); return out;
}

// Three corridor‑style maps with more room (20x12 grid). All start on left, end near right.
export const MAPS = [
  {
    key: 'corridor',
    name: 'Nano Corridor',
    desc: 'Classic corridor with a few bends. Balanced lanes.',
    motif: 'circuit',
    colors: null,
    path: pathOf([
      [0,6, 7,6],   // right
      [7,6, 7,9],   // down
      [7,9, 12,9],  // right
      [12,9,12,3],  // up
      [12,3,19,3]   // right to exit
    ])
  },
  {
    key: 'lab',
    name: 'Lab Bends',
    desc: 'Clean lab hallways with gentle L-turns.',
    motif: 'diagonal',
    colors: { path: '#0b3346', pathEdge:'#00baff' },
    path: pathOf([
      [0,6, 4,6],   // right
      [4,6, 4,10],  // down
      [4,10,9,10],  // right
      [9,10,9,4],   // up
      [9,4, 14,4],  // right
      [14,4,14,8],  // down
      [14,8,19,8]   // right
    ])
  },
  {
    key: 'delta',
    name: 'Delta Walk',
    desc: 'Long straights with two vertical drops.',
    motif: 'rings',
    colors: { path: '#0a2b3b', pathEdge:'#28d4ff' },
    path: pathOf([
      [0,6, 5,6],   // right
      [5,6, 5,2],   // up
      [5,2, 11,2],  // right
      [11,2,11,9],  // down
      [11,9,19,9]   // right
    ])
  },
  {
    key: 'nexus',
    name: 'Core Nexus',
    desc: 'Reactor at center. Enemies enter from all four sides.',
    motif: 'rings',
    colors: { path: '#0b3346', pathEdge:'#28d4ff' },
    // Multi-path layout converging to center
    paths: (function(){
      const CX = Math.floor(GRID_W/2), CY = Math.floor(GRID_H/2);
      return [
        pathOf([[0,CY, CX,CY]]),
        pathOf([[GRID_W-1,CY, CX,CY]]),
        pathOf([[CX,0, CX,CY]]),
        pathOf([[CX,GRID_H-1, CX,CY]])
      ];
    })(),
    // Optional weights for spawn distribution (equal by default)
    pathWeights: [1,1,1,1],
    base: [ Math.floor(GRID_W/2), Math.floor(GRID_H/2) ]
  },
  {
    key: 'spire',
    name: 'Data Spire',
    desc: 'Tall vertical climb with late turn toward the core.',
    motif: 'circuit',
    colors: { path: '#092738', pathEdge:'#4fd1ff' },
    path: pathOf([
      [0,8, 4,8],    // right
      [4,8, 4,1],    // up
      [4,1, 11,1],   // right
      [11,1,11,10],  // down
      [11,10,19,10]  // right to exit
    ])
  },
  {
    key: 'cascade',
    name: 'Cascade Trench',
    desc: 'Zig-zag descent with staggered choke points.',
    motif: 'diagonal',
    colors: { path: '#082533', pathEdge:'#00f0ff' },
    path: pathOf([
      [0,3, 6,3],    // right
      [6,3, 6,7],    // down
      [6,7, 12,7],   // right
      [12,7,12,2],   // up
      [12,2,18,2],   // right to exit
    ])
  }
];

// Draw a small thumbnail preview for a map on a given canvas
export function drawMapPreview(canvas, map){
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,w,h);
  // background
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0,0,w,h);
  const tile = Math.min(w/GRID_W, h/GRID_H);
  const ox = (w - GRID_W*tile)/2;
  const oy = (h - GRID_H*tile)/2;
  // grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for(let gx=0; gx<=GRID_W; gx++){
    ctx.beginPath();
    ctx.moveTo(ox+gx*tile, oy);
    ctx.lineTo(ox+gx*tile, oy+GRID_H*tile);
    ctx.stroke();
  }
  for(let gy=0; gy<=GRID_H; gy++){
    ctx.beginPath();
    ctx.moveTo(ox, oy+gy*tile);
    ctx.lineTo(ox+GRID_W*tile, oy+gy*tile);
    ctx.stroke();
  }
  // path(s)
  const col = { ...COLORS, ...(map.colors||{}) };
  const drawCell = (gx,gy)=>{
    const x = ox + gx*tile, y = oy + gy*tile;
    ctx.fillStyle = col.path; ctx.fillRect(x,y,tile,tile);
    ctx.strokeStyle = col.pathEdge; ctx.globalAlpha = 0.25; ctx.strokeRect(x+0.5,y+0.5,tile-1,tile-1); ctx.globalAlpha = 1;
  };
  if(map.paths && Array.isArray(map.paths)){
    for(const p of map.paths){ for(const [gx,gy] of p) drawCell(gx,gy); }
  } else if(map.path){
    for(const [gx,gy] of map.path) drawCell(gx,gy);
  }
}
