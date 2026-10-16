// World units are independent of viewport pixels. Roads form a connected grid.
export const WORLD_HALF=48000;
export const BLOCK=1600;
export const ROAD_WIDTH=440;
export const EXIT={x:4200,y:0,r:125};
export const CAR_RADIUS=22;
const seed=(x,y)=>Math.abs(((x*73856093)^(y*19349663))>>>0);
export function createWorld(){return {cells:new Map()};}
export function districtAt(x,y){const n=seed(Math.floor(x/BLOCK),Math.floor(y/BLOCK))%3;return ['검문소 / 바리케이드','물류 구역 / 창고','사고 구간 / 폐차'][n];}
export function cellObstacles(cx,cy){
 const x=cx*BLOCK,y=cy*BLOCK,n=seed(cx,cy),plaza=n%3===0;
 const list=[];
 const add=(id,type,ox,oy,w,h)=>list.push({id:`${cx}:${cy}:${id}`,type,x:x+ox,y:y+oy,w,h,mass:type==='light'?w*h*.065:type==='medium'?w*h*.065:Infinity,broken:false});
 // Buildings enclose districts, while 440-unit roads and central courtyards stay open.
 for(const [i,bx,by] of [[0,500,500],[1,1100,500],[2,500,1100],[3,1100,1100]]){
  if(plaza&&(i===1||i===2))continue;
  add(`building${i}`,'fixed',bx,by,330,310);
 }
 // Themed, bypassable clusters. A wide center lane remains clear in every district.
 if(n%3===0){
  for(let i=0;i<3;i++)add(`checkpoint${i}`,'medium',135,650+i*110,90,36);
  for(let i=0;i<2;i++)add(`supply${i}`,'light',125+i*50,1010,32,32);
 }else if(n%3===1){
  for(let row=0;row<2;row++)for(let col=0;col<3;col++)add(`cargo${row}${col}`,'light',740+col*52,760+row*52,42,42);
  add('container','medium',800,950,120,50);
  add('roadcargo','light',120,750,38,38);
 }else{
  add('wreck0','medium',125,650,50,95);add('wreck1','medium',145,860,50,95);
  for(let i=0;i<3;i++)add(`scrap${i}`,'light',100+i*40,1040+i*45,30,30);
 }
 return list;
}
export function nearbyObstacles(world,x,y,radius=1000){
 const out=[];
 for(let cy=Math.floor((y-radius)/BLOCK);cy<=Math.floor((y+radius)/BLOCK);cy++)for(let cx=Math.floor((x-radius)/BLOCK);cx<=Math.floor((x+radius)/BLOCK);cx++){
  if(Math.abs(cx*BLOCK)>WORLD_HALF+BLOCK||Math.abs(cy*BLOCK)>WORLD_HALF+BLOCK)continue;
  const key=`${cx}:${cy}`;
  if(!world.cells.has(key))world.cells.set(key,cellObstacles(cx,cy));
  for(const o of world.cells.get(key))if(!o.broken&&Math.abs(o.x-x)<radius+o.w/2&&Math.abs(o.y-y)<radius+o.h/2)out.push(o);
 }
 return out;
}
export function circleContact(x,y,r,o){
 const dx=x-o.x,dy=y-o.y,hx=o.w/2,hy=o.h/2;
 const qx=Math.max(-hx,Math.min(hx,dx)),qy=Math.max(-hy,Math.min(hy,dy));
 const sx=dx-qx,sy=dy-qy,d=Math.hypot(sx,sy);
 if(d>=r)return null;
 if(d>0)return {nx:sx/d,ny:sy/d,depth:r-d};
 // A center already inside a box exits by its nearest face (including exact center).
 const px=hx-Math.abs(dx),py=hy-Math.abs(dy);
 return px<py?{nx:dx>=0?1:-1,ny:0,depth:px+r}:{nx:0,ny:dy>=0?1:-1,depth:py+r};
}
export function isSolid(world,x,y,r=16){return nearbyObstacles(world,x,y,400).some(o=>o.type==='fixed'&&circleContact(x,y,r,o));}
export function followCamera(camera,car,dt){
 const tx=car.x+car.vx*.34,ty=car.y+car.vy*.34;
 const t=1-Math.exp(-5*dt);
 camera.x+=(tx-camera.x)*t;camera.y+=(ty-camera.y)*t;
}
export function atExit(car){return Math.hypot(car.x-EXIT.x,car.y-EXIT.y)<EXIT.r;}

export const PHYSICAL_TYPES=new Set(['fixed','light','medium']);
export function resolveOverlaps(car,obstacles,radius=CAR_RADIUS){
 const solids=obstacles.filter(o=>!o.broken&&PHYSICAL_TYPES.has(o.type));
 const contacts=()=>solids.map(o=>circleContact(car.x,car.y,radius,o)).filter(Boolean);
 let moved=false;
 for(let pass=0;pass<8;pass++){
  let count=0;for(const o of solids){const h=circleContact(car.x,car.y,radius,o);if(!h)continue;count++;moved=true;car.x+=h.nx*(h.depth+.02);car.y+=h.ny*(h.depth+.02);const incoming=car.vx*h.nx+car.vy*h.ny;if(incoming<0){car.vx-=incoming*h.nx;car.vy-=incoming*h.ny;}}
  if(!count)return {moved,recovered:false};
 }
 if(!contacts().length)return {moved,recovered:false};
 // Only unresolved physical overlaps trigger recovery, never hazard/VFX areas.
 const x=car.x,y=car.y;
 for(let r=8;r<=240;r+=8)for(let i=0;i<48;i++){
  const a=i*Math.PI/24,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
  if(Math.abs(px)>WORLD_HALF||Math.abs(py)>WORLD_HALF)continue;
  if(solids.every(o=>!circleContact(px,py,radius+1,o))){car.x=px;car.y=py;car.vx=0;car.vy=0;return {moved:true,recovered:true};}
 }
 return {moved,recovered:false,unresolved:true};
}
