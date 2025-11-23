import { GRID_W, GRID_H, TILE_SIZE, COLORS } from './config.js';
import { worldFromGrid } from './utils.js';

export class Grid {
  constructor(mapDef=null){
    this.w = GRID_W; this.h = GRID_H; this.tile = TILE_SIZE;
    const defaultPath = [
      [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],
      [5,5],[5,6],[5,7],
      [6,7],[7,7],[8,7],[9,7],[10,7],
      [10,6],[10,5],[10,4],[10,3],[10,2],
      [11,2],[12,2],[13,2],[14,2],[15,2]
    ];
    // Support single path (path) or multi-path maps (paths)
    const mp = mapDef && mapDef.paths;
    const sp = mapDef && mapDef.path;
    this.colors = { ...COLORS, ...(mapDef && mapDef.colors ? mapDef.colors : {}) };
    this.occupied = new Set();

    if(mp && Array.isArray(mp) && mp.length && Array.isArray(mp[0])){
      this.pathsCells = mp; // array of array of [gx,gy]
      // Union set of all path cells
      this.pathSet = new Set();
      for(const p of this.pathsCells){ for(const [x,y] of p){ this.pathSet.add(`${x},${y}`); } }
      this.waypoints = this.pathsCells.map(path => path.map(([gx,gy])=> worldFromGrid(gx,gy,this.tile)));
      // Optional per-path weights (for weighted spawn distribution)
      this.pathWeights = Array.isArray(mapDef.pathWeights) && mapDef.pathWeights.length===this.pathsCells.length
        ? mapDef.pathWeights.slice() : new Array(this.pathsCells.length).fill(1);
    } else {
      this.pathCells = sp ? sp : defaultPath;
      this.pathSet = new Set(this.pathCells.map(([x,y])=>`${x},${y}`));
      this.waypoints = this.pathCells.map(([gx,gy]) => worldFromGrid(gx,gy,this.tile));
    }

    // Base world position (reactor)
    if(mapDef && Array.isArray(mapDef.base) && mapDef.base.length>=2){
      const [bx,by] = mapDef.base; const b = worldFromGrid(bx,by,this.tile); this.base = { x:b.x, y:b.y };
      // Prevent building on base tile
      this.pathSet.add(`${bx},${by}`);
    } else {
      if(Array.isArray(this.waypoints) && this.waypoints.length){
        if(Array.isArray(this.waypoints[0])){
          const last = this.waypoints[0][this.waypoints[0].length-1]; this.base = { x:last.x, y:last.y };
        } else {
          const last = this.waypoints[this.waypoints.length-1]; this.base = { x:last.x, y:last.y };
        }
      }
    }
  }

  inBounds(gx,gy){ return gx>=0 && gx<this.w && gy>=0 && gy<this.h; }
  isPath(gx,gy){ return this.pathSet.has(`${gx},${gy}`); }
  isOccupied(gx,gy){ return this.occupied.has(`${gx},${gy}`); }
  canPlace(gx,gy){ return this.inBounds(gx,gy) && !this.isPath(gx,gy) && !this.isOccupied(gx,gy); }
  occupy(gx,gy){ this.occupied.add(`${gx},${gy}`); }
  release(gx,gy){ this.occupied.delete(`${gx},${gy}`); }

  draw(ctx, time=0){
    // grid background
    ctx.save();
    const C = this.colors;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for(let x=0;x<=this.w;x++){
      ctx.beginPath();
      ctx.moveTo(x*this.tile,0);
      ctx.lineTo(x*this.tile,this.h*this.tile);
      ctx.stroke();
    }
    for(let y=0;y<=this.h;y++){
      ctx.beginPath();
      ctx.moveTo(0,y*this.tile);
      ctx.lineTo(this.w*this.tile,y*this.tile);
      ctx.stroke();
    }

    // path(s)
    const drawCell = (gx,gy)=>{
      const x = gx*this.tile, y = gy*this.tile;
      ctx.fillStyle = C.path; ctx.fillRect(x,y,this.tile,this.tile);
      ctx.strokeStyle = C.pathEdge; ctx.globalAlpha = 0.2; ctx.strokeRect(x+0.5,y+0.5,this.tile-1,this.tile-1); ctx.globalAlpha = 1;
    };
    if(this.pathsCells){ for(const p of this.pathsCells){ for(const [gx,gy] of p) drawCell(gx,gy); } }
    else { for(const [gx,gy] of this.pathCells) drawCell(gx,gy); }

    // directional neon arrows along each path (skip last cell)
    const drawArrows = (cells)=>{
      for(let i=0;i<cells.length-1;i++){
        const [gx,gy] = cells[i];
        const [nx,ny] = cells[i+1];
        const dx = nx-gx, dy = ny-gy;
        const ang = Math.atan2(dy,dx);
        const cx = gx*this.tile + this.tile/2;
        const cy = gy*this.tile + this.tile/2;
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang);
        const pulse = 0.55 + 0.25*Math.sin(time*4 + i*0.7);
        ctx.globalAlpha = pulse; ctx.shadowColor = C.accent2; ctx.shadowBlur = 12; ctx.fillStyle = C.accent2;
        const w = Math.min(16, this.tile*0.28); const h = Math.min(20, this.tile*0.34);
        ctx.beginPath(); ctx.moveTo(-w*0.6, -w*0.5); ctx.lineTo(-w*0.6, w*0.5); ctx.lineTo(h, 0); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = pulse*0.6; ctx.shadowBlur = 20; ctx.fillStyle = 'white';
        ctx.beginPath(); ctx.moveTo(-w*0.2, -w*0.25); ctx.lineTo(-w*0.2, w*0.25); ctx.lineTo(h*0.6, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    };
    if(this.pathsCells){ for(const p of this.pathsCells) drawArrows(p); }
    else drawArrows(this.pathCells);
    ctx.restore();
  }
}
