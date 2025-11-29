import { GRID_W, GRID_H, TILE_SIZE, COLORS } from './config.js';
import { worldFromGrid } from './utils.js';

// Helper to punch out a flat background color (e.g. solid black) from
// the path tile sprite by sampling image corners and treating pixels
// close to that color as transparent.
function punchOutPathTileBackground(img){
  if(typeof document === 'undefined') return img;
  try{
    const off = document.createElement('canvas');
    off.width = img.width;
    off.height = img.height;
    const c = off.getContext('2d');
    if(!c) return img;
    c.drawImage(img, 0, 0);
    const id = c.getImageData(0, 0, off.width, off.height);
    const data = id.data;
    let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
    const samplePixel = (x,y)=>{
      if(x<0 || y<0 || x>=off.width || y>=off.height) return;
      const idx = (y*off.width + x)*4;
      const a = data[idx+3];
      if(a===0) return;
      bgR += data[idx];
      bgG += data[idx+1];
      bgB += data[idx+2];
      bgCount++;
    };
    samplePixel(0,0);
    samplePixel(off.width-1,0);
    samplePixel(0,off.height-1);
    samplePixel(off.width-1,off.height-1);
    if(bgCount>0){
      bgR /= bgCount;
      bgG /= bgCount;
      bgB /= bgCount;
    }
    const bgSampled = bgCount>0;
    const bgThreshSq = 20*20;
    for(let i=0;i<data.length;i+=4){
      const r = data[i], g = data[i+1], b = data[i+2];
      const a = data[i+3];
      let alpha = a;
      if(a>0 && bgSampled){
        const dr = r-bgR, dg = g-bgG, db = b-bgB;
        const distSq = dr*dr + dg*dg + db*db;
        if(distSq <= bgThreshSq){
          alpha = 0;
        }
      }
      data[i+3] = alpha;
    }
    c.putImageData(id, 0, 0);
    return off;
  }catch(e){
    return img;
  }
}

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
    this.noBuild = new Set();
    this.baseGrid = null;

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
    if(typeof Image !== 'undefined'){
      const tileImg = new Image();
      tileImg.onload = ()=>{
        this.pathTileLoaded = true;
        // Use the path tile art as-is (opaque) so the track has a solid
        // backing; no background punch-out.
        this.pathTileImg = tileImg;
      };
      tileImg.onerror = ()=>{
        this.pathTileLoaded = false;
        this.pathTileImg = null;
      };
      tileImg.src = (mapDef && mapDef.pathTileUrl) || 'data/path-tile.png';
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

    // Base world position (reactor) + grid coords
    if(mapDef && Array.isArray(mapDef.base) && mapDef.base.length>=2){
      const [bx,by] = mapDef.base;
      const b = worldFromGrid(bx,by,this.tile);
      this.base = { x:b.x, y:b.y };
      this.baseGrid = { gx:bx, gy:by };
      // Prevent building on base tile
      this.pathSet.add(`${bx},${by}`);
    } else {
      let bx = null, by = null;
      if(this.pathsCells && this.pathsCells.length){
        const path0 = this.pathsCells[0];
        if(path0 && path0.length){
          const [gx,gy] = path0[path0.length-1];
          bx = gx; by = gy;
        }
      } else if(this.pathCells && this.pathCells.length){
        const [gx,gy] = this.pathCells[this.pathCells.length-1];
        bx = gx; by = gy;
      }
      if(bx!=null && by!=null){
        const b = worldFromGrid(bx,by,this.tile);
        this.base = { x:b.x, y:b.y };
        this.baseGrid = { gx:bx, gy:by };
      } else if(Array.isArray(this.waypoints) && this.waypoints.length){
        if(Array.isArray(this.waypoints[0])){
          const last = this.waypoints[0][this.waypoints[0].length-1]; this.base = { x:last.x, y:last.y };
        } else {
          const last = this.waypoints[this.waypoints.length-1]; this.base = { x:last.x, y:last.y };
        }
      }
    }

    // No-build zones: outermost edge of the map and cells immediately
    // around the reactor so towers don't crowd the chamber walls/core.
    const markNoBuild = (gx,gy)=>{
      if(gx<0 || gy<0 || gx>=this.w || gy>=this.h) return;
      this.noBuild.add(`${gx},${gy}`);
    };
    // Outer border
    for(let gx=0; gx<this.w; gx++){
      markNoBuild(gx,0);
      markNoBuild(gx,this.h-1);
    }
    for(let gy=0; gy<this.h; gy++){
      markNoBuild(0,gy);
      markNoBuild(this.w-1,gy);
    }
    // Ring around reactor/base (8 neighbors plus center)
    if(this.baseGrid){
      const { gx:bx, gy:by } = this.baseGrid;
      for(let dx=-1; dx<=1; dx++){
        for(let dy=-1; dy<=1; dy++){
          markNoBuild(bx+dx, by+dy);
        }
      }
    }
  }

  inBounds(gx,gy){ return gx>=0 && gx<this.w && gy>=0 && gy<this.h; }
  isPath(gx,gy){ return this.pathSet.has(`${gx},${gy}`); }
  isOccupied(gx,gy){ return this.occupied.has(`${gx},${gy}`); }
  canPlace(gx,gy){
    return this.inBounds(gx,gy) &&
      !this.isPath(gx,gy) &&
      !this.isOccupied(gx,gy) &&
      !(this.noBuild && this.noBuild.has(`${gx},${gy}`));
  }
  occupy(gx,gy){ this.occupied.add(`${gx},${gy}`); }
  release(gx,gy){ this.occupied.delete(`${gx},${gy}`); }

  draw(ctx, time=0, opts={}){
    ctx.save();
    const C = this.colors;
    const W = this.w * this.tile;
    const H = this.h * this.tile;
    const t = time || 0;
    const motif = this.motif || 'circuit';
    const showGrid = opts && opts.showGrid !== false;
    const showPath = opts && opts.showPath !== false;
    const showRails = opts && opts.showRails !== false;
    const pathRevealCount = (opts && typeof opts.pathRevealCount === 'number' && opts.pathRevealCount >= 0)
      ? Math.floor(opts.pathRevealCount)
      : null;

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
    // easy to read on top of the background. Use a dark red base with a
    // subtle animated highlight so the placement area feels alive without
    // becoming distracting. Lines are still restricted to non‑path tiles.
    if(showGrid){
      const gridPulse = 0.25 + 0.25*Math.sin((time||0)*1.8);
      ctx.lineWidth = 2;
      // Softer shadow so the grid reads as a faint glow rather than a hard line.
      ctx.shadowColor = 'rgba(120,0,0,0.7)';
      ctx.shadowBlur = 8;
      const gridCol = '#5c161b'; // slightly brighter maroon/red
      const gridHighlightCol = '#ff5a6b'; // bright HP-ish red for inner shimmer
      ctx.strokeStyle = gridCol;
      // Heavier transparency so the board texture dominates and the grid
      // feels like a subtle glow above it.
      ctx.globalAlpha = 0.2 + gridPulse*0.12;
      const isBlockedForGrid = (gx,gy)=>{
        const key = `${gx},${gy}`;
        if(this.pathSet && this.pathSet.has(key)) return true;
        if(this.noBuild && this.noBuild.has(key)) return true;
        return false;
      };
      const inset = 0.6;
      for(let gx=0; gx<this.w; gx++){
        for(let gy=0; gy<this.h; gy++){
          if(isBlockedForGrid(gx,gy)) continue;
          const x = gx*this.tile;
          const y = gy*this.tile;
          const size = this.tile;
          // Base cell outline
          ctx.beginPath();
          ctx.rect(x+inset, y+inset, size-2*inset, size-2*inset);
          ctx.stroke();
          // Animated inner highlight: slight red shimmer that pulses over time.
          const innerInset = inset + 1.4;
          const phase = (time||0)*2.4 + (gx+gy)*0.35;
          const innerPulse = 0.25 + 0.35*(Math.sin(phase)*0.5 + 0.5);
          ctx.save();
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = gridHighlightCol;
          // Very transparent inner shimmer so it reads as a soft glow
          // pulsing inside the main outline.
          ctx.globalAlpha = 0.06 + innerPulse*0.22;
          ctx.beginPath();
          ctx.rect(x+innerInset, y+innerInset, size-2*innerInset, size-2*innerInset);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // path(s) – electric blue tiles with glow, rendered as if they are
    // floating slightly above the board with a soft "void" shadow.
    if(showPath){
      const tileImg = this.pathTileImg;
      const hasPathTile = tileImg && this.pathTileLoaded &&
        ((tileImg.naturalWidth || tileImg.width) && (tileImg.naturalHeight || tileImg.height));
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

        if(hasPathTile){
          ctx.drawImage(tileImg, x, y, size, size);
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
      if(pathRevealCount != null){
        let remaining = pathRevealCount;
        if(this.pathsCells && Array.isArray(this.pathsCells)){
          outer: for(const p of this.pathsCells){
            if(!Array.isArray(p)) continue;
            for(const [gx,gy] of p){
              if(remaining <= 0) break outer;
              drawCell(gx,gy);
              remaining--;
            }
          }
        } else if(this.pathCells && Array.isArray(this.pathCells)){
          const n = Math.min(remaining, this.pathCells.length);
          for(let i=0;i<n;i++){
            const [gx,gy] = this.pathCells[i];
            drawCell(gx,gy);
          }
        }
      } else {
        if(this.pathsCells){ for(const p of this.pathsCells){ for(const [gx,gy] of p) drawCell(gx,gy); } }
        else { for(const [gx,gy] of this.pathCells) drawCell(gx,gy); }
      }
    }

    // Steel rail outline hugging the outside edges of the path so the
    // route reads as a raised track above the floor. We draw only on
    // boundaries between path and non‑path cells so rails don't double
    // up inside the path, and we skip the open entrance/exit sides.
    if(showRails && showPath && pathRevealCount == null){
      const railSegments = [];
      const addSegment = (x1,y1,x2,y2)=>{ railSegments.push({ x1,y1,x2,y2 }); };
      const skipEdges = new Set();
      const markOpenEnds = (path)=>{
        if(!Array.isArray(path) || path.length < 2) return;
        // Entrance: direction from first to second cell; open side is opposite.
        const [gx0,gy0] = path[0];
        const [gx1,gy1] = path[1];
        const dx0 = gx1 - gx0;
        const dy0 = gy1 - gy0;
        if(dx0 === 1 && dy0 === 0) skipEdges.add(`${gx0},${gy0},left`);
        else if(dx0 === -1 && dy0 === 0) skipEdges.add(`${gx0},${gy0},right`);
        else if(dy0 === 1 && dx0 === 0) skipEdges.add(`${gx0},${gy0},up`);
        else if(dy0 === -1 && dx0 === 0) skipEdges.add(`${gx0},${gy0},down`);
        // Exit: direction from penultimate to last cell; open side is forward.
        const lastIdx = path.length - 1;
        const [gxn,gyn] = path[lastIdx];
        const [gxp,gyp] = path[lastIdx-1];
        const dx1 = gxn - gxp;
        const dy1 = gyn - gyp;
        if(dx1 === 1 && dy1 === 0) skipEdges.add(`${gxn},${gyn},right`);
        else if(dx1 === -1 && dy1 === 0) skipEdges.add(`${gxn},${gyn},left`);
        else if(dy1 === 1 && dx1 === 0) skipEdges.add(`${gxn},${gyn},down`);
        else if(dy1 === -1 && dx1 === 0) skipEdges.add(`${gxn},${gyn},up`);
      };
      if(this.pathsCells){
        for(const p of this.pathsCells) markOpenEnds(p);
      } else if(this.pathCells){
        markOpenEnds(this.pathCells);
      }
      const isPathCell = (gx,gy)=> this.pathSet.has(`${gx},${gy}`);
      const addRailsForCell = (gx,gy)=>{
        const x = gx*this.tile;
        const y = gy*this.tile;
        const size = this.tile;
        const inset = 1.0;
        const leftX = x + inset;
        const rightX = x + size - inset;
        const topY = y + inset;
        const bottomY = y + size - inset;
        // Top edge
        if(!isPathCell(gx, gy-1) && !skipEdges.has(`${gx},${gy},up`)){
          addSegment(leftX, topY, rightX, topY);
        }
        // Bottom edge
        if(!isPathCell(gx, gy+1) && !skipEdges.has(`${gx},${gy},down`)){
          addSegment(leftX, bottomY, rightX, bottomY);
        }
        // Left edge
        if(!isPathCell(gx-1, gy) && !skipEdges.has(`${gx},${gy},left`)){
          addSegment(leftX, topY, leftX, bottomY);
        }
        // Right edge
        if(!isPathCell(gx+1, gy) && !skipEdges.has(`${gx},${gy},right`)){
          addSegment(rightX, topY, rightX, bottomY);
        }
      };
      if(this.pathsCells){
        for(const p of this.pathsCells){
          for(const [gx,gy] of p) addRailsForCell(gx,gy);
        }
      } else {
        for(const [gx,gy] of this.pathCells) addRailsForCell(gx,gy);
      }
      if(railSegments.length){
        ctx.save();
        ctx.lineCap = 'round';
        // Base steel rail
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = 'rgba(40, 52, 70, 0.95)';
        ctx.lineWidth = 3;
        for(const s of railSegments){
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
        }
        // Inner highlight so rails catch the light and stand off the floor.
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(210, 224, 238, 0.9)';
        ctx.lineWidth = 1.4;
        for(const s of railSegments){
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
