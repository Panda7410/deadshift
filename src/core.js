export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const length=(x,y)=>Math.hypot(x,y);
export function createCar(){return {x:0,y:0,vx:0,vy:0,angle:-Math.PI/2,hp:100,maxHp:100,mass:1200,engine:1,armor:0,ram:1,gun:1,gunTimer:0,invincible:0};}
export function drive(car,input,dt){
 const fx=Math.cos(car.angle),fy=Math.sin(car.angle);
 let forward=car.vx*fx+car.vy*fy,side=-car.vx*fy+car.vy*fx;
 const power=car.engine*1200/car.mass;
 if(input.throttle>0)forward+=240*power*dt;
 if(input.throttle<0)forward-=(forward>8?410:155*power)*dt;
 const speed=length(car.vx,car.vy);
 car.angle+=input.steer*2.25*clamp(Math.abs(forward)/65,0,1)*(forward<0?-1:1)*(input.brake?1.3:1)*dt/(1+speed/650);
 side*=Math.exp(-(input.brake?1.4:7)*dt);
 forward*=Math.exp(-(input.brake?1.5:.35)*dt);
 forward=clamp(forward,-115,370*power**.3);
 car.vx=Math.cos(car.angle)*forward-Math.sin(car.angle)*side;
 car.vy=Math.sin(car.angle)*forward+Math.cos(car.angle)*side;
 car.x=clamp(car.x+car.vx*dt,-1450,1450);car.y=clamp(car.y+car.vy*dt,-1450,1450);
 if(Math.abs(car.x)>=1450)car.vx*=-.4;if(Math.abs(car.y)>=1450)car.vy*=-.4;
 car.invincible=Math.max(0,car.invincible-dt);
}
export function ramEnemy(car,enemy){
 const dx=enemy.x-car.x,dy=enemy.y-car.y,d=length(dx,dy)||1;
 const speed=length(car.vx,car.vy);
 const impact=clamp(speed/80,.15,5)*car.ram*(car.mass/1200);
 enemy.hp-=impact*23;enemy.x+=dx/d*25;enemy.y+=dy/d*25;
 car.vx*=.84;car.vy*=.84;
 const damage=speed>95?2:9;
 if(car.invincible<=0){car.hp=Math.max(0,car.hp+0-Math.max(1,damage-car.armor));car.invincible=.45;}
 return {damage:impact*23,speed};
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
