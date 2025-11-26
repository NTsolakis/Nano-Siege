import { GRID_W, GRID_H, TILE_SIZE, COLORS } from './config.js';
import { worldFromGrid } from './utils.js';

export class Grid {
  constructor(mapDef=null){
    this.w = GRID_W; this.h = GRID_H; this.tile = TILE_SIZE;
    this.motif = (mapDef && mapDef.motif) || 'circuit';
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

    // Optional PCB board texture image, used as the base layer for the
    // gameboard. Falls back to the procedural gradient if not available.
    this.boardTexture = null;
    this.boardTextureLoaded = false;
    if(typeof Image !== 'undefined'){
      const img = new Image();
      img.onload = ()=>{ this.boardTextureLoaded = true; };
      img.onerror = ()=>{ this.boardTextureLoaded = false; };
      // Allow per‑map override but default to the shared board art.
      img.src = (mapDef && mapDef.boardTextureUrl) || 'data/board-bg.png';
      this.boardTexture = img;
    }

    // Optional per-tile image for the enemy path. If present, this will be
    // drawn instead of the procedural gradient/glow tile artwork.
    this.pathTileImg = null;
    this.pathTileLoaded = false;
    if (typeof Image !== 'undefined') {
      const tileImg = new Image();
      tileImg.onload = () => { this.pathTileLoaded = true; };
      tileImg.onerror = () => { this.pathTileLoaded = false; };
      tileImg.src = (mapDef && mapDef.pathTileUrl) || 'data/path-tile.png';
      this.pathTileImg = tileImg;
    }

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
    ctx.save();
    const C = this.colors;
    const W = this.w * this.tile;
    const H = this.h * this.tile;
    const t = time || 0;
    const motif = this.motif || 'circuit';

    // --- PCB-style board background (chip on neon traces) ---------------
    const midX = W / 2;
    const midY = H / 2;
    const maxR = Math.max(W, H);

    // If a board texture image is available, use it as the primary
    // backdrop and lightly tint it; otherwise fall back to the
    // original gradient/vignette combo.
    const hasTexture = this.boardTexture && this.boardTextureLoaded &&
      this.boardTexture.naturalWidth && this.boardTexture.naturalHeight;
    if(hasTexture){
      const img = this.boardTexture;
      const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);

      // Soft vignette to keep focus toward the center of the board
      const vignette = ctx.createRadialGradient(
        midX, midY, maxR * 0.25,
        midX, midY, maxR * 0.85
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    } else {
      // Deep blue/teal gradient base
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, '#020713');
      bgGrad.addColorStop(0.45, '#041726');
      bgGrad.addColorStop(1, '#021721');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Soft vignette glow toward the center
      const vignette = ctx.createRadialGradient(
        midX, midY, maxR * 0.1,
        midX, midY, maxR * 0.75
      );
      vignette.addColorStop(0, 'rgba(0, 120, 180, 0.35)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    }

    // Overlay the gameplay grid as a simple lattice so buildable squares are
    // easy to read on top of the background. Theme: crisp, almost‑black
    // gridlines instead of blue neon.
    const gridPulse = 0.2 + 0.2*Math.sin((time||0)*1.8);
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.strokeStyle = '#000000';
    ctx.globalAlpha = 0.45 + gridPulse;
    for(let x=0;x<=this.w;x++){
      const px = x*this.tile + 0.5;
      ctx.beginPath();
      ctx.moveTo(px,0);
      ctx.lineTo(px,this.h*this.tile);
      ctx.stroke();
    }
    for(let y=0;y<=this.h;y++){
      const py = y*this.tile + 0.5;
      ctx.beginPath();
      ctx.moveTo(0,py);
      ctx.lineTo(this.w*this.tile,py);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // path(s) – electric blue tiles with glow, rendered as if they are
    // floating slightly above the board with a soft "void" shadow.
    const hasPathTile = this.pathTileImg && this.pathTileLoaded &&
      this.pathTileImg.naturalWidth && this.pathTileImg.naturalHeight;
    const drawCell = (gx,gy)=>{
      const x = gx*this.tile, y = gy*this.tile;
      const size = this.tile;
      // Subtle circular shadow under each tile so the path reads as a
      // separate layer above the board background.
      const cx = x + size/2;
      const cy = y + size/2;
      const shadowR = size * 0.55;
      const shadowGrad = ctx.createRadialGradient(
        cx, cy + size*0.06, shadowR*0.1,
        cx, cy + size*0.18, shadowR
      );
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0.7)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy + size*0.08, shadowR, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      if (hasPathTile) {
        ctx.drawImage(this.pathTileImg, x, y, size, size);
      } else {
        const cx2 = x + size/2;
        const cy2 = y + size/2;
        // Deep electric-blue tile with subtle vertical gradient
        const tileGrad = ctx.createLinearGradient(x, y, x, y + size);
        tileGrad.addColorStop(0, 'rgba(4, 52, 92, 0.98)');
        tileGrad.addColorStop(1, 'rgba(3, 20, 40, 0.98)');
        ctx.fillStyle = tileGrad;
        ctx.fillRect(x, y, size, size);
        // Neon cyan edge
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.9)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(x + 0.7, y + 0.7, size - 1.4, size - 1.4);
        // Soft inner glow so tiles pop off the board
        const glow = ctx.createRadialGradient(
          cx2, cy2, size * 0.08,
          cx2, cy2, size * 0.6
        );
        glow.addColorStop(0, 'rgba(210, 250, 255, 0.96)');
        glow.addColorStop(1, 'rgba(0, 185, 255, 0)');
        ctx.fillStyle = glow;
        ctx.globalAlpha = 0.95;
        ctx.fillRect(x, y, size, size);
        ctx.globalAlpha = 1;
      }
    };
    if(this.pathsCells){ for(const p of this.pathsCells){ for(const [gx,gy] of p) drawCell(gx,gy); } }
    else { for(const [gx,gy] of this.pathCells) drawCell(gx,gy); }
    ctx.restore();
  }
}
