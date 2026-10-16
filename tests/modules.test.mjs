import test from 'node:test';
import assert from 'node:assert/strict';
import {createCar,applyUpgrade,collideObstacle,drive} from '../src/core.js';
import {MODULES,SLOT_DEFS,LIMITS,compileWeapon,commitRecipe,recipeCheck,angleDelta} from '../src/weapons.js';
import {createEnemy,weaponMounts,weaponShots,fireWeapons,collectSupplies,PICKUPS,stepHazards} from '../src/combat.js';
import {stepProjectiles} from '../src/projectiles.js';
import {resolveOverlaps,circleContact} from '../src/world.js';
const metrics=()=>({weaponDamage:{}});
function equip(car,id,changes){const draft=structuredClone(car.arsenal[id]);for(const mid of Object.values(changes))if(mid)car.moduleStock[mid]=10;Object.assign(draft.modules,changes);const r=commitRecipe(car,id,draft,{confirmed:true});assert.equal(r.ok,true,r.reason);return draft;}
function shot(car,id='roof',target={x:100,y:0}){return weaponShots(car,weaponMounts(car).find(m=>m.id===id),target)[0];}
const run=(car,bullets,enemies,duration=.6)=>{let events=[];const m=metrics();for(let t=0;t<duration;t+=1/120){const r=stepProjectiles(car,bullets,enemies,events,1/120,m);bullets=r.bullets;events=r.events;}return {bullets,events,metrics:m};};
test('independent recipes, stock consumption, explicit confirmation, capacity and stale draft guards',()=>{
 const c=createCar();applyUpgrade(c,'sidegun');applyUpgrade(c,'shotgun');equip(c,'roof',{ammo:'pierce',effect:'delay'});equip(c,'left',{pattern:'rapid',ammo:'ricochet',effect:'shock'});equip(c,'right',{pattern:'scatter',ammo:'split',effect:'slow'});
 assert.equal(compileWeapon(c,'roof').cost,80);assert.equal(compileWeapon(c,'left').cost,90);assert.equal(c.arsenal.front.modules.pattern,'scatter');assert.equal(c.arsenal.right.modules.ammo,'split');
 const old=structuredClone(c.arsenal.left),draft=structuredClone(old);draft.modules.ammo='pierce';c.moduleStock.pierce=1;
 assert.equal(recipeCheck(c,'left',draft).valid,false);assert.equal(commitRecipe(c,'left',draft,{confirmed:true}).ok,false);assert.deepEqual(c.arsenal.left,old);assert.equal(c.moduleStock.pierce,1);
 draft.modules.effect='none';assert.equal(commitRecipe(c,'left',draft).ok,false);assert.deepEqual(c.arsenal.left,old);assert.equal(commitRecipe(c,'left',draft,{confirmed:true}).ok,true);assert.equal(c.moduleStock.pierce,0);assert.equal(c.moduleStock.ricochet,9,'old component is destroyed, not refunded');assert.equal(commitRecipe(c,'left',draft,{confirmed:true}).ok,false,'stale revision cannot consume twice');
});
test('capacity and tuning vouchers are consumed only on committed validated changes',()=>{
 const c=createCar();c.moduleStock.rapid=1;c.moduleStock.pierce=1;c.moduleStock.shock=1;const d=structuredClone(c.arsenal.roof);d.modules={pattern:'rapid',ammo:'pierce',effect:'shock'};assert.equal(compileWeapon(c,'roof',d).cost,95);assert.equal(commitRecipe(c,'roof',d,{confirmed:true}).ok,false);
 applyUpgrade(c,'capacity');applyUpgrade(c,'tuning');d.capacity+=15;d.level++;assert.equal(commitRecipe(c,'roof',d).ok,false);assert.equal(c.capacityKits,1);assert.equal(commitRecipe(c,'roof',d,{confirmed:true}).ok,true);assert.equal(c.capacityKits,0);assert.equal(c.tuningPoints,0);assert.equal(compileWeapon(c,'roof').capacity,105);
});
test('all patterns originate at their muzzle and respect rotated directional slots',()=>{
 for(const pattern of ['single','rapid','scatter'])for(const rotation of [0,Math.PI/2,Math.PI,-Math.PI/3]){
  const c=createCar();applyUpgrade(c,'sidegun');applyUpgrade(c,'shotgun');c.angle=rotation;
  for(const id of Object.keys(SLOT_DEFS)){equip(c,id,{pattern});const mount=weaponMounts(c).find(m=>m.id===id),stats=compileWeapon(c,id),shots=weaponShots(c,mount,{x:-230,y:200});assert.equal(shots.length,stats.pellets);
   for(const b of shots){assert.equal(b.damage,stats.damage);assert.equal(b.x,b.muzzle.x);assert.equal(b.y,b.muzzle.y);if(id!=='roof')assert.ok(Math.abs(angleDelta(Math.atan2(b.vy,b.vx),rotation+SLOT_DEFS[id].direction))<=stats.arc/2+1e-9);}
  }
 }
 const c=createCar();applyUpgrade(c,'shotgun');c.angle=0;const fired=fireWeapons(c,[createEnemy('heavy',0,180)],1/120);assert.equal(fired.some(b=>b.source==='front'),false,'front shotgun cannot aim sideways');
});
test('piercing hits two unique targets exactly once; subsequent enemies remain safe',()=>{
 const c=createCar();c.angle=0;equip(c,'roof',{ammo:'pierce'});const e=[80,125,170].map(x=>createEnemy('heavy',x,0));const damage=compileWeapon(c,'roof').damage;run(c,[shot(c)],e);assert.equal(e[0].hp,155-damage);assert.equal(e[1].hp,155-damage);assert.equal(e[2].hp,155);
});
test('ricochet changes trajectory, honors hit history and relic bonus without loops',()=>{
 const c=createCar();c.angle=0;equip(c,'roof',{ammo:'ricochet'});const e=[[80,0],[130,80],[180,0],[220,80]].map(([x,y])=>createEnemy('heavy',x,y));run(c,[shot(c)],e,1.5);assert.equal(e.filter(e=>e.hp<155).length,3);applyUpgrade(c,'rebound');assert.equal(compileWeapon(c,'roof').bounces,3);
});
test('split generation is bounded, retains effects and cannot recursively multiply',()=>{
 const c=createCar();c.angle=0;equip(c,'roof',{ammo:'split',effect:'delay'});const e=[createEnemy('heavy',50,0)];const first=stepProjectiles(c,[shot(c)],e,[],.04,metrics());assert.equal(first.bullets.length,3);assert.ok(first.bullets.every(b=>b.generation===1&&b.children===0&&b.effect==='delay'));assert.ok(first.bullets.every(b=>b.damage===compileWeapon(c,'roof').damage*.45));
 const flood=stepProjectiles(c,Array.from({length:1000},()=>shot(c)),e,[],.04,metrics());assert.ok(flood.bullets.length<=LIMITS.projectiles);assert.ok(flood.events.length<=LIMITS.events);
});
test('pierce + delayed explosion triggers once per distinct hit and explosions cannot retrigger',()=>{
 const c=createCar();c.angle=0;equip(c,'roof',{ammo:'pierce',effect:'delay'});const e=[createEnemy('heavy',80,0),createEnemy('heavy',125,0)];const m=metrics();let b=[shot(c)],events=[];for(let i=0;i<80;i++){const out=stepProjectiles(c,b,e,events,1/120,m);b=out.bullets;events=out.events;}const expected=155-16-2*16*.6;assert.ok(Math.abs(e[0].hp-expected)<1e-8);assert.ok(Math.abs(e[1].hp-expected)<1e-8);assert.equal(events.length,0);
});
test('one slot slow makes another slot shock stronger; arc is a single nonrecursive effect',()=>{
 const c=createCar();c.angle=0;applyUpgrade(c,'sidegun');equip(c,'roof',{effect:'slow'});equip(c,'left',{effect:'shock'});const e=createEnemy('heavy',0,-100),next=createEnemy('heavy',60,-100);run(c,[shot(c,'roof',e)], [e],.15);assert.equal(e.slowTime,2);const before=e.hp;
 run(c,[shot(c,'left',e)],[e,next],.15);assert.ok(Math.abs(before-e.hp-16*1.25)<1e-8);assert.ok(Math.abs(next.hp-(155-16*.35))<1e-8);assert.ok(e.stun>=.2);
});
test('magnet never moves any supply; intentional contact still collects every type',()=>{
 const c=createCar();c.effects.magnet=12;c.hp=20;const items=Object.keys(PICKUPS).map(type=>({type,x:150,y:10,life:24}));for(let i=0;i<120;i++)collectSupplies(c,items,1/120);assert.ok(items.every(i=>i.x===150&&i.y===10));for(const info of Object.values(PICKUPS))assert.equal(info.magnetizable,false);c.x=150;c.y=10;assert.equal(collectSupplies(c,items,1/120).length,0);assert.equal(c.hp,48);
});
test('acid/VFX never resolve physical contacts; impossible multi-box overlap escapes to valid space',()=>{
 const c=createCar();const acid={type:'acid',x:0,y:0,r:65};assert.equal(collideObstacle(c,acid),null);assert.deepEqual(resolveOverlaps(c,[acid]),{moved:false,recovered:false});
 const solids=[{type:'fixed',x:-35,y:0,w:50,h:150},{type:'medium',x:35,y:0,w:50,h:150}];const result=resolveOverlaps(c,[...solids,acid]);assert.equal(result.recovered,true);assert.ok(solids.every(o=>!circleContact(c.x,c.y,22,o)));assert.ok(Math.hypot(c.x,c.y)<250);
});

test('48 pattern/ammo/effect recipes remain executable within expanded capacity and bounded population',()=>{
 const groups=layer=>Object.entries(MODULES).filter(([,m])=>m.layer===layer).map(([id])=>id);let count=0;
 for(const pattern of groups('pattern'))for(const ammo of groups('ammo'))for(const effect of groups('effect')){
  const c=createCar();c.angle=0;c.arsenal.roof.capacity=105;c.arsenal.roof.modules={pattern,ammo,effect};const stats=compileWeapon(c,'roof');assert.equal(stats.valid,true);const enemies=[80,120,160].map(x=>Object.assign(createEnemy('heavy',x,0),{hp:5000}));const m=weaponMounts(c)[0];const out=run(c,weaponShots(c,m,enemies[0]),enemies,1.1);assert.ok(out.bullets.length<=LIMITS.projectiles);assert.ok(out.events.length<=LIMITS.events);assert.ok(enemies.every(e=>Number.isFinite(e.hp)));assert.ok(enemies.some(e=>e.hp<5000));count++;
 }
 assert.equal(count,48);
});

test('reported cadence preserves fractional ticks and projectiles stop at the compiled range',()=>{
 const c=createCar();c.angle=0;equip(c,'roof',{pattern:'rapid'});const enemy=createEnemy('heavy',100,0),stats=compileWeapon(c,'roof');let shots=0;for(let i=0;i<1200;i++)shots+=fireWeapons(c,[enemy],1/120).length;assert.ok(Math.abs(shots-10/stats.interval)<=1);
 const bullet=shot(c),far=createEnemy('heavy',bullet.x+stats.range+26,0);run(c,[bullet],[far],2);assert.equal(far.hp,155);
});

test('overlapping acid areas apply drag once and cannot multiply into an immobilizing field',()=>{
 const a=createCar(),b=createCar(),make=()=>({x:0,y:0,r:500,warmup:0,life:5});let one=[make()],many=Array.from({length:16},make);const input={throttle:1,steer:0,brake:false};
 for(let i=0;i<120;i++){drive(a,input,1/120);drive(b,input,1/120);one=stepHazards(a,one,1/120).hazards;many=stepHazards(b,many,1/120).hazards;}
 assert.ok(Math.hypot(b.vx,b.vy)>55);assert.ok(Math.abs(a.vy-b.vy)<1e-9);assert.equal(a.hp,b.hp);assert.equal(many.length,16,'circles are preserved, only duplicate drag is removed');
});
