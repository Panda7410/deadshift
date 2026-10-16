import test from 'node:test';
import assert from 'node:assert/strict';
import {createCar,drive,ramEnemy,applyUpgrade,hurt,upgradeChoices,length,collideObstacle} from '../src/core.js';
import {createEnemy,threatAt,chooseEnemyType,applyPickup,tickEffects,weaponMounts,muzzlePose,weaponShots,fireWeapons,onRam,onGunKill,debrisFor} from '../src/combat.js';
import {cellObstacles,circleContact} from '../src/world.js';
const input={throttle:1,steer:0,brake:false};
test('starter is slower; engine provides headroom and inertia is not clamped on brake',()=>{
 const base=createCar(),engine=createCar();applyUpgrade(engine,'engine');for(let i=0;i<600;i++){drive(base,input,1/120);drive(engine,input,1/120);}assert.ok(length(base.vx,base.vy)<172);assert.ok(length(engine.vx,engine.vy)>200);
 const heavy=createCar();heavy.mass=2400;heavy.vy=-220;drive(heavy,{throttle:0,steer:0,brake:false},1/120);assert.ok(Math.abs(heavy.vy)>215,'mass cap must not magically erase overspeed');
});
test('momentum accumulates across crowds and one bumper cannot erase heavy resistance',()=>{
 const c=createCar();c.angle=0;c.vx=160;const first=ramEnemy(c,createEnemy('normal',20,0));assert.ok(first.killed);assert.ok(c.vx>145,'single ordinary zombie stays satisfying');
 for(let i=0;i<10;i++)ramEnemy(c,createEnemy('normal',20,0));assert.ok(c.vx<85,'dense pack drains momentum');
 const base=createCar(),ram=createCar();for(const v of [base,ram]){v.angle=0;v.vx=140;}applyUpgrade(ram,'ram');
 const a=ramEnemy(base,createEnemy('heavy',20,0)),b=ramEnemy(ram,createEnemy('heavy',20,0));assert.ok(b.damage>a.damage);assert.ok(ram.vx>base.vx);assert.ok(b.speedLoss>30);assert.equal(b.killed,false);
 const slow=createCar();slow.angle=0;slow.vx=20;const low=ramEnemy(slow,createEnemy('heavy',20,0));assert.ok(low.damage<10);assert.ok(slow.hp<100);
});
test('muzzle, bullet and flash share rotating slot geometry for every weapon',()=>{
 const c=createCar();c.x=120;c.y=-30;applyUpgrade(c,'sidegun');applyUpgrade(c,'shotgun');
 for(const rotation of [0,Math.PI/2,Math.PI,-Math.PI/3]){c.angle=rotation;for(const m of weaponMounts(c)){const target={x:300,y:210},shots=weaponShots(c,m,target),pose=muzzlePose(c,m,shots[0].aim);for(const shot of shots){assert.equal(shot.x,pose.x);assert.equal(shot.y,pose.y);assert.ok(length(shot.x-c.x,shot.y-c.y)>5);}assert.ok(Math.abs(length(pose.x-pose.origin.x,pose.y-pose.origin.y)-pose.barrel)<1e-9);}}
 c.angle=0;c.cooldowns={};const shots=fireWeapons(c,[createEnemy('heavy',300,-30),createEnemy('heavy',120,-210),createEnemy('heavy',120,150)],1/120);assert.equal(shots.length,8);for(const f of c.flashes){const shot=shots.find(s=>s.source===f.source);assert.equal(f.x,shot.x);assert.equal(f.y,shot.y);}
});
test('pickups heal, expand collection, boost propulsion, mitigate damage and expire',()=>{
 const c=createCar();c.hp=20;applyPickup(c,'repair');assert.equal(c.hp,48);applyPickup(c,'magnet');assert.equal(c.effects.magnet,12);applyPickup(c,'fuel');const base=createCar();for(let i=0;i<120;i++){drive(c,input,1/120);drive(base,input,1/120);}assert.ok(length(c.vx,c.vy)>length(base.vx,base.vy));applyPickup(c,'shield');c.invincible=0;assert.equal(hurt(c,20),9);tickEffects(c,13);assert.equal(c.effects.magnet,0);assert.equal(c.effects.shield,0);assert.equal(c.effects.fuel,0);
});
test('relics connect momentum, reload, acceleration and gun kills; unique rewards are filtered',()=>{
 const c=createCar();applyUpgrade(c,'dynamo');applyUpgrade(c,'chain');applyUpgrade(c,'mark');c.cooldowns.roof=.7;
 onRam(c,{ramming:true,closing:100,speedLoss:30,killed:true});assert.equal(c.cooldowns.roof,0);assert.ok(c.powerShot>0&&c.combo>0);onGunKill(c);assert.ok(c.markTime>0);
 const plain=createCar(),marked=createCar();applyUpgrade(marked,'mark');onGunKill(marked);for(const v of [plain,marked]){v.vx=120;v.angle=0;}assert.ok(ramEnemy(marked,createEnemy('heavy',20,0)).damage>ramEnemy(plain,createEnemy('heavy',20,0)).damage);
 for(let i=0;i<30;i++)assert.ok(upgradeChoices(c).every(u=>!['mark','chain','dynamo'].includes(u.id)));
});
test('threat adds density, pursuit, resistant front lines and ranged denial without global HP scaling',()=>{
 const early=threatAt(0),late=threatAt(160);assert.ok(late.count>early.count&&late.interval<early.interval);assert.ok(late.fast&&late.heavy&&late.spitter&&late.flank);assert.equal(early.spitter,false);assert.equal(chooseEnemyType(160,0,.9),'spitter');assert.equal(chooseEnemyType(160,1,.9),'heavy');assert.equal(chooseEnemyType(160,2,.9),'fast');assert.ok(createEnemy('heavy',0,0).mass>createEnemy('normal',0,0).mass*5);
});
test('themed clusters stay off open center lanes and all props can be bypassed',()=>{
 const seen=new Set();for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++){const props=cellObstacles(x,y);seen.add(props.filter(o=>o.type==='light').length);for(const p of props){for(let d=0;d<1600;d+=40){assert.equal(circleContact(x*1600,y*1600+d,60,p),null);assert.equal(circleContact(x*1600+d,y*1600,60,p),null);}}}assert.ok(seen.size>=3);
});
test('debris inherits impact direction; heavier objects drain more momentum',()=>{
 const pieces=debrisFor({x:0,y:0,vx:180,vy:0,type:'light',mass:1200},14,()=>.5);assert.equal(pieces.length,14);assert.ok(pieces.every(p=>p.vx>0&&Math.abs(p.vy)<1&&p.life>2));
 const a=createCar(),b=createCar();a.vx=b.vx=150;a.angle=b.angle=0;const make=mass=>({type:'light',x:40,y:0,w:40,h:40,mass});collideObstacle(a,make(50));collideObstacle(b,make(200));assert.ok(a.vx>b.vx);
});

test('enemy approach velocity affects impact, while a stationary car cannot farm charging enemies safely',()=>{const a=createCar(),b=createCar();a.angle=b.angle=0;a.vx=b.vx=100;const idle=createEnemy('normal',20,0),charging=createEnemy('normal',20,0);charging.walkVx=-48;assert.ok(ramEnemy(b,charging).damage>ramEnemy(a,idle).damage);const stopped=createCar();stopped.angle=0;const fast=createEnemy('fast',20,0);fast.walkVx=-155;const hit=ramEnemy(stopped,fast);assert.ok(hit.damage<26);assert.ok(stopped.hp<100);assert.equal(hit.ramming,false);});
