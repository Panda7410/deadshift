import {WORLD_HALF,CAR_RADIUS,circleContact} from './world.js';
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const length=(x,y)=>Math.hypot(x,y);
export function createCar(){return {x:0,y:0,vx:0,vy:0,angle:-Math.PI/2,hp:100,maxHp:100,mass:1200,engine:1,armor:0,ram:1,gun:1,gunTimer:0,invincible:0};}
export function drive(car,input,dt){
 const fx=Math.cos(car.angle),fy=Math.sin(car.angle),massRatio=car.mass/1200;
 let forward=car.vx*fx+car.vy*fy,side=-car.vx*fy+car.vy*fx;
 const power=car.engine/massRatio;
 if(input.throttle>0)forward+=145*power*dt;
 if(input.throttle<0)forward-=(forward>4?260/Math.sqrt(massRatio):105*power)*dt;
 const speed=length(car.vx,car.vy);
 // Responsive at walking speed, less steering authority and lateral grip at speed.
 car.angle+=input.steer*2.35*clamp(Math.abs(forward)/28,0,1)*(forward<0?-1:1)*(input.brake?1.28:1)*dt/(1+speed/235)/Math.sqrt(massRatio);
 side*=Math.exp(-(input.brake?1.1:Math.max(2.6,8-speed/65))/Math.sqrt(massRatio)*dt);
 forward*=Math.exp(-(input.brake?1.8/Math.sqrt(massRatio):.26)*dt);
 forward=clamp(forward,-85,240*power**.42);
 car.vx=Math.cos(car.angle)*forward-Math.sin(car.angle)*side;
 car.vy=Math.sin(car.angle)*forward+Math.cos(car.angle)*side;
 car.x=clamp(car.x+car.vx*dt,-WORLD_HALF,WORLD_HALF);car.y=clamp(car.y+car.vy*dt,-WORLD_HALF,WORLD_HALF);
 // Remote world edge stops the outward component, never bounces repeatedly.
 if(Math.abs(car.x)>=WORLD_HALF&&car.vx*Math.sign(car.x)>0)car.vx=0;
 if(Math.abs(car.y)>=WORLD_HALF&&car.vy*Math.sign(car.y)>0)car.vy=0;
 car.invincible=Math.max(0,car.invincible-dt);
}
function hurt(car,damage){
 if(car.invincible>0||damage<=0)return 0;
 const dealt=Math.max(0,damage-car.armor);car.hp=Math.max(0,car.hp-dealt);if(dealt>0)car.invincible=.45;return dealt;
}
export function collideObstacle(car,o,radius=CAR_RADIUS){
 if(o.broken)return null;
 const hit=circleContact(car.x,car.y,radius,o);if(!hit)return null;
 const {nx,ny,depth}=hit;
 const normalSpeed=Math.max(0,-car.vx*nx-car.vy*ny),speed=length(car.vx,car.vy);
 const facing=Math.max(0,-Math.cos(car.angle)*nx-Math.sin(car.angle)*ny);
 const impact=normalSpeed*Math.sqrt(car.mass/1200)*(1+(car.ram-1)*1.6*facing);
 const threshold=o.type==='light'?48:165;
 const broken=o.type!=='fixed'&&impact>=threshold;
 let damage=0;
 if(broken){
  o.broken=true;const retain=o.type==='light'?.95:.76;car.vx*=retain;car.vy*=retain;
  // Soft objects are safe to plough through; heavy wrecks retain a small impact cost.
  if(o.type==='medium')damage=hurt(car,Math.max(0,(normalSpeed-155)*.025));
 }else{
  car.x+=nx*(depth+.02);car.y+=ny*(depth+.02);
  // Remove incoming normal velocity, preserve tangential slide. No pinball impulse.
  if(normalSpeed>0){car.vx+=nx*normalSpeed;car.vy+=ny*normalSpeed;}
  const safe=o.type==='fixed'?90:o.type==='medium'?105:140;
  const severity=o.type==='fixed'?.0012:.00045;
  damage=hurt(car,Math.max(0,normalSpeed-safe)**2*severity*(.65+.35*facing));
 }
 return {broken,normalSpeed,speed,damage,type:o.type,x:o.x,y:o.y};
}
export function ramEnemy(car,enemy){
 const dx=enemy.x-car.x,dy=enemy.y-car.y,d=length(dx,dy)||1,nx=dx/d,ny=dy/d;
 const speed=length(car.vx,car.vy),closing=Math.max(0,car.vx*nx+car.vy*ny);
 const facing=Math.max(0,Math.cos(car.angle)*nx+Math.sin(car.angle)*ny);
 const damage=Math.max(3,closing*.72)*car.ram*Math.sqrt(car.mass/1200)*(.8+.4*facing);
 enemy.hp-=damage;
 const knockback=24+closing*.27;enemy.x+=nx*knockback;enemy.y+=ny*knockback;
 enemy.stun=.28;
 // Speed and a heavy bumper carry the car through a group; stationary contact remains dangerous.
 const retain=closing>45?clamp(.975+(car.ram-1)*.018+(car.mass-1200)/60000,.975,.997):.96;
 car.vx*=retain;car.vy*=retain;
 const selfDamage=closing>55?0:6;
 const dealt=hurt(car,selfDamage);
 return {damage,speed,closing,selfDamage:dealt};
}
export const upgrades=[
 {id:'ram',name:'강화 충각',slot:'FRONT / 범퍼',description:'충돌 피해 +45%. 전면에 강철 쐐기를 장착합니다.',apply:c=>{c.ram+=.45;c.mass+=100;}},
 {id:'gun',name:'지붕 기관총',slot:'ROOF / 무장',description:'자동 조준 화력 +1단계. 발사 속도와 피해가 증가합니다.',apply:c=>{c.gun++;c.mass+=40;}},
 {id:'engine',name:'고출력 엔진',slot:'ENGINE / 동력',description:'엔진 출력 +25%. 가속력과 최고 속도가 증가합니다.',apply:c=>{c.engine+=.25;}},
 {id:'armor',name:'복합 장갑',slot:'BODY / 방호',description:'피격 피해 -2. 최대 내구도 +20, 내구도 30 회복.',apply:c=>{c.armor+=2;c.mass+=120;c.maxHp+=20;c.hp=Math.min(c.maxHp,c.hp+30);}},
 {id:'repair',name:'긴급 정비',slot:'SERVICE / 수리',description:'내구도 45 회복. 가벼운 차체를 유지합니다.',apply:c=>{c.hp=Math.min(c.maxHp,c.hp+45);}}
];
export function applyUpgrade(car,id){const u=upgrades.find(u=>u.id===id);if(!u)throw new Error('Unknown upgrade');u.apply(car);}
export const requiredXp=level=>8+(level-1)*5;
export function readRecord(storage){try {const d=JSON.parse(storage.getItem('deadshift.save'));if(d?.version===1)return {version:1,runs:Math.max(0,Number(d.runs)||0),best:Math.max(0,Number(d.best)||0),kills:Math.max(0,Number(d.kills)||0)};}catch{}return {version:1,runs:0,best:0,kills:0};}
export function saveRecord(storage,record){try{storage.setItem('deadshift.save',JSON.stringify(record));return true;}catch{return false;}}
