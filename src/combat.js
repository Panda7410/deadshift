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
 repair:{name:'수리 키트',glyph:'+',color:'#b8d39a',description:'내구도 +28'},
 magnet:{name:'자석',glyph:'M',color:'#a8d6dd',description:'12초간 획득 범위 확대'},
 fuel:{name:'부스트 연료',glyph:'F',color:'#ebbd70',description:'8초간 출력·가속 강화'},
 shield:{name:'방어 보급품',glyph:'S',color:'#b6b5e0',description:'10초간 받는 피해 55% 감소'}
};
export function applyPickup(car,type){
 if(!PICKUPS[type])throw Error('Unknown pickup');
 if(type==='repair')car.hp=Math.min(car.maxHp,car.hp+28);
 else car.effects[type]=Math.max(car.effects[type]||0,{magnet:12,fuel:8,shield:10}[type]);
}
export function tickEffects(car,dt){for(const k of Object.keys(car.effects))car.effects[k]=Math.max(0,car.effects[k]-dt);car.markTime=Math.max(0,car.markTime-dt);car.combo=Math.max(0,car.combo-dt);car.powerShot=Math.max(0,car.powerShot-dt);}
export const SLOTS={roof:{x:0,y:0},left:{x:-3,y:-20},right:{x:-3,y:20},front:{x:25,y:0}};
export function weaponMounts(car){
 const mounts=[{id:'roof',slot:'roof',level:car.gun,kind:'gun'}];
 if(car.sidegun)for(const slot of ['left','right'])mounts.push({id:slot,slot,level:car.sidegun,kind:'gun'});
 if(car.shotgun)mounts.push({id:'front',slot:'front',level:car.shotgun,kind:'shotgun'});
 return mounts;
}
export function muzzlePose(car,mount,aim){
 const p=SLOTS[mount.slot];if(!p)throw Error('Unknown mount slot');
 const x=car.x+p.x*Math.cos(car.angle)-p.y*Math.sin(car.angle),y=car.y+p.x*Math.sin(car.angle)+p.y*Math.cos(car.angle);
 const barrel=mount.kind==='shotgun'?25:26+mount.level*2;
 return {origin:{x,y},x:x+Math.cos(aim)*barrel,y:y+Math.sin(aim)*barrel,angle:aim,barrel};
}
export function weaponShots(car,mount,target){
 const p=SLOTS[mount.slot],ox=car.x+p.x*Math.cos(car.angle)-p.y*Math.sin(car.angle),oy=car.y+p.x*Math.sin(car.angle)+p.y*Math.cos(car.angle);
 const aim=Math.atan2(target.y-oy,target.x-ox),pose=muzzlePose(car,mount,aim),pellets=mount.kind==='shotgun'?5:1;
 return Array.from({length:pellets},(_,i)=>{
  const angle=aim+(i-(pellets-1)/2)*.11,speed=mount.kind==='shotgun'?590:680;
  return {x:pose.x,y:pose.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:mount.kind==='shotgun'?.48:.75,damage:(mount.kind==='shotgun'?9+mount.level*3:11+mount.level*5)*(car.powerShot>0?1.18:1),source:mount.id,muzzle:{x:pose.x,y:pose.y},aim};
 });
}
export function fireWeapons(car,enemies,dt){
 const shots=[];car.flashes=car.flashes.filter(f=>(f.life-=dt)>0);
 for(const m of weaponMounts(car)){
  car.cooldowns[m.id]=Math.max(0,(car.cooldowns[m.id]||0)-dt);
  const pose=muzzlePose(car,m,car.angle);let target,dist=m.kind==='shotgun'?270:440;
  for(const e of enemies){if(e.hp<=0)continue;const d=length(e.x-pose.origin.x,e.y-pose.origin.y);if(d<dist){target=e;dist=d;}}
  if(!target)continue;
  const emitted=weaponShots(car,m,target);car.aims[m.id]=emitted[0].aim;
  if(car.cooldowns[m.id]>0)continue;
  shots.push(...emitted);car.flashes.push({x:emitted[0].x,y:emitted[0].y,angle:emitted[0].aim,life:.065,source:m.id});
  car.cooldowns[m.id]=(m.kind==='shotgun'?1.1:.72)/Math.sqrt(m.level);
 }
 return shots;
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
