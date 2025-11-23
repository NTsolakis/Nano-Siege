export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist2 = (x1,y1,x2,y2) => {
  const dx = x2-x1, dy = y2-y1; return dx*dx+dy*dy;
};
export const lerp = (a,b,t) => a+(b-a)*t;
export const now = () => performance.now();

export function worldFromGrid(gx, gy, tileSize){
  return { x: gx*tileSize + tileSize/2, y: gy*tileSize + tileSize/2 };
}

export function randRange(a,b){ return a + Math.random()*(b-a); }

