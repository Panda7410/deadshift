import {SLOT_DEFS,compileWeapon,aimFor,withinArc} from './weapons.js';
import {clamp,length,hurt} from './core.js';
export const ENEMY_TYPES={
 normal:{hp:32,speed:48,r:12,mass:85,attack:7,color:'#7e8e64'},
 fast:{hp:26,speed:155,r:10,mass:60,attack:8,color:'#b19365'},
 heavy:{hp:155,speed:42,r:21,mass:650,attack:14,color:'#8a8170'},
 spitter:{hp:60,speed:60,r:14,mass:105,attack:6,color:'#86b5a0'}
};
export function threatAt(time){const tier=Math.floor(time/40);return {tier:1+tier,count:4+Math.min(8,tier*2),interval:Math.max(.65,2.5-time*.008),fast:time>=30,heavy:time>=55,spitter:time>=90,flank:time>=70};}
export function createEnemy(type,x,y){const p=ENEMY_TYPES[type];return {...p,type,x,y,maxHp:p.hp,vx:0,vy:0,stun:0,wobble:0,attackTimer:type==='spitter'?.8:0};}
export function chooseEnemyType(time,index,roll){
 if(time>=90&&(index===0||(time>=130&&index===7)))return 'spitter';
 if(time>=55&&(index===1||roll<.22))return 'heavy';
 if(time>=30&&(index===2||roll<.45))return 'fast';
 return 'normal';
}
export const PICKUPS={
 repair:{name:'수리 키트',glyph:'+',color:'#b8d39a',description:'내구도 +28',collection:'contact',magnetizable:false},
 magnet:{name:'자석',glyph:'M',color:'#a8d6dd',description:'12초간 경험치 흡수 확대 (보급품 제외)',collection:'contact',magnetizable:false},
 fuel:{name:'부스트 연료',glyph:'F',color:'#ebbd70',description:'8초간 출력·가속 강화',collection:'contact',magnetizable:false},
 shield:{name:'방어 보급품',glyph:'S',color:'#b6b5e0',description:'10초간 받는 피해 55% 감소',collection:'contact',magnetizable:false}
};
export function applyPickup(car,type){
 if(!PICKUPS[type])throw Error('Unknown pickup');
 if(type==='repair')car.hp=Math.min(car.maxHp,car.hp+28);
 else car.effects[type]=Math.max(car.effects[type]||0,{magnet:12,fuel:8,shield:10}[type]);
}
export function tickEffects(car,dt){for(const k of Object.keys(car.effects))car.effects[k]=Math.max(0,car.effects[k]-dt);car.markTime=Math.max(0,car.markTime-dt);car.combo=Math.max(0,car.combo-dt);car.powerShot=Math.max(0,car.powerShot-dt);}
export const SLOTS=SLOT_DEFS;
export function weaponMounts(car){return Object.keys(SLOT_DEFS).filter(id=>car.arsenal[id].enabled&&car.arsenal[id].modules.pattern).map(id=>{const recipe=car.arsenal[id];return {id,slot:id,level:recipe.level,kind:recipe.modules.pattern==='scatter'?'shotgun':'gun'};});}
export function muzzlePose(car,mount,aim){
 const p=SLOTS[mount.slot];if(!p)throw Error('Unknown mount slot');
 const x=car.x+p.x*Math.cos(car.angle)-p.y*Math.sin(car.angle),y=car.y+p.x*Math.sin(car.angle)+p.y*Math.cos(car.angle);
 const barrel=mount.kind==='shotgun'?25:26+mount.level*2;
 return {origin:{x,y},x:x+Math.cos(aim)*barrel,y:y+Math.sin(aim)*barrel,angle:aim,barrel};
}
export function weaponShots(car,mount,target){
 const stats=compileWeapon(car,mount.id);if(!stats.valid||!stats.active)return [];
 const aim=aimFor(car,mount.id,target,stats),pose=muzzlePose(car,mount,aim);
 return Array.from({length:stats.pellets},(_,i)=>{
  const angle=aim+(stats.pellets===1?0:(i/(stats.pellets-1)-.5)*stats.spread);
  return {x:pose.x,y:pose.y,vx:Math.cos(angle)*stats.speed,vy:Math.sin(angle)*stats.speed,life:stats.range/stats.speed,rangeLeft:stats.range,damage:stats.damage,source:mount.id,muzzle:{x:pose.x,y:pose.y},aim,hits:new Set(),pierce:stats.pierce,bounces:stats.bounces,children:stats.children,effect:stats.effect,generation:0};
 });
}
export function fireWeapons(car,enemies,dt){
 const shots=[];car.flashes=car.flashes.filter(f=>(f.life-=dt)>0);
 for(const m of weaponMounts(car)){
  const stats=compileWeapon(car,m.id);
  car.cooldowns[m.id]=Math.max(-dt,(car.cooldowns[m.id]||0)-dt);
  const pose=muzzlePose(car,m,car.angle+SLOTS[m.id].direction);let target,dist=stats.range;
  for(const e of enemies){if(e.hp<=0||!withinArc(car,m.id,e,stats))continue;const aim=aimFor(car,m.id,e,stats),muzzle=muzzlePose(car,m,aim),d=length(e.x-muzzle.x,e.y-muzzle.y);if(d<dist){target=e;dist=d;}}
  car.aims[m.id]=target?aimFor(car,m.id,target,stats):car.angle+SLOTS[m.id].direction;
  if(!target||car.cooldowns[m.id]>0)continue;
  const emitted=weaponShots(car,m,target);if(!emitted.length)continue;
  shots.push(...emitted);car.flashes.push({x:emitted[0].x,y:emitted[0].y,angle:emitted[0].aim,life:.065,source:m.id});
  car.cooldowns[m.id]+=stats.interval;
 }
 return shots;
}
export function collectSupplies(car,items,dt,onCollect=()=>{}){
 for(const item of items){item.life-=dt;const info=PICKUPS[item.type];if(!info)continue;
  // Supplies always require intentional physical contact. Only XP/resources are magnetized.
  if(length(item.x-car.x,item.y-car.y)<32){applyPickup(car,item.type);item.life=0;onCollect(item,info);}
 }
 return items.filter(i=>i.life>0).slice(-45);
}
export function onRam(car,impact){
 if(!impact.ramming||impact.closing<55)return;
 if(car.relics.dynamo){car.energy=Math.min(100,car.energy+impact.speedLoss*.9);if(car.energy>=24){car.energy%=24;for(const k of Object.keys(car.cooldowns))car.cooldowns[k]=0;car.powerShot=2;}}
 if(car.relics.chain&&impact.killed)car.combo=Math.min(3,car.combo+1.2);
}
export function onGunKill(car){if(car.relics.mark)car.markTime=3;}
export function hitHazard(car,amount){return hurt(car,amount);}
export function debrisFor(hit,count=12,random=Math.random){
 const angle=Math.atan2(hit.vy,hit.vx),speed=length(hit.vx,hit.vy),massFactor=Math.sqrt((hit.mass||1200)/1200);
 return Array.from({length:Math.min(count,32)},()=>{const a=angle+(random()-.5)*1.8,v=(30+random()*speed*.55)*massFactor;return {x:hit.x+(random()-.5)*15,y:hit.y+(random()-.5)*15,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:3+random()*2,size:2+random()*5,angle:random()*6,spin:(random()-.5)*10,color:hit.type==='light'?'#bb9b60':'#9ba8a2'};});
}

export function stepHazards(car,hazards,dt){
 let inside=false;
 for(const h of hazards){h.life-=dt;h.warmup-=dt;if(h.life>0&&h.warmup<=0&&length(car.x-h.x,car.y-h.y)<h.r)inside=true;}
 // Multiple acid circles may overlap visually, but their drag must not multiply.
 // Applying drag inside the per-circle loop could effectively immobilize a wedged car.
 let damage=0;if(inside){damage=hitHazard(car,6);const drag=Math.exp(-.8*dt);car.vx*=drag;car.vy*=drag;}
 car.inAcid=inside;
 return {hazards:hazards.filter(h=>h.life>0).slice(-128),damage};
}
