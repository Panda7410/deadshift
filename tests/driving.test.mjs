import test from 'node:test';
import assert from 'node:assert/strict';
import {createCar,drive,collideObstacle,ramEnemy,applyUpgrade,length} from '../src/core.js';
import {createWorld,nearbyObstacles,cellObstacles,circleContact,isSolid,followCamera,atExit,BLOCK,WORLD_HALF,EXIT} from '../src/world.js';
const throttle={throttle:1,steer:0,brake:false};
const obstacle=(type,x=40,y=0,w=40,h=100)=>({type,x,y,w,h,broken:false});
const impact=(type,vx,vy=0,y=0)=>{const c=createCar();Object.assign(c,{x:0,y,vx,vy,angle:0});const o=obstacle(type);return {c,o,result:collideObstacle(c,o)};};
test('light obstacles break safely and retain speed; low speed pushes out without damage',()=>{
 const {c,o,result}=impact('light',100);assert.equal(o.broken,true);assert.equal(result.damage,0);assert.ok(c.vx>90&&c.vx<98);
 const low=impact('light',20);assert.equal(low.o.broken,false);assert.equal(low.c.hp,100);assert.ok(!circleContact(low.c.x,low.c.y,22,low.o));
});
test('medium wreck needs speed, mass or ram; light objects are not concrete',()=>{
 assert.equal(impact('medium',120).o.broken,false);assert.equal(impact('medium',200).o.broken,true);
 const c=createCar();c.angle=0;c.vx=120;applyUpgrade(c,'ram');assert.equal(collideObstacle(c,obstacle('medium')).broken,true);
 const heavy=createCar();Object.assign(heavy,{angle:0,vx:120,mass:2400});assert.equal(collideObstacle(heavy,obstacle('medium')).broken,true);
 assert.equal(impact('fixed',240).o.broken,false);
});
test('wall damage uses normal speed: gentle touch, tangential graze, head-on',()=>{
 const slow=impact('fixed',45);assert.equal(slow.c.hp,100);
 const scrape=impact('fixed',20,239);assert.equal(scrape.c.hp,100);assert.equal(scrape.c.vy,239,'preserves slide');
 const head=impact('fixed',240);assert.ok(head.c.hp<80);assert.equal(head.c.vx,0);assert.ok(!circleContact(head.c.x,head.c.y,22,head.o));
 const oblique=impact('fixed',140,195);assert.ok(oblique.result.damage<head.result.damage);
});
test('center overlap resolves to a face; repeated contact cannot trap or bounce car',()=>{
 const c=createCar(),o=obstacle('fixed',0,0,200,200);collideObstacle(c,o);assert.ok(Number.isFinite(c.x+c.y));assert.ok(!circleContact(c.x,c.y,22,o));
 c.vx=0;c.vy=-50;for(let i=0;i<120;i++){drive(c,{throttle:0,steer:0,brake:false},1/120);collideObstacle(c,o);}
 assert.ok(Number.isFinite(c.x+c.y));assert.ok(!circleContact(c.x,c.y,22,o));assert.ok(c.hp>90);
});
test('braking and steering are affected by mass; slower low-speed steering stays responsive',()=>{
 const light=createCar(),heavy=createCar();heavy.mass=2400;light.vy=heavy.vy=-180;
 for(let i=0;i<60;i++){drive(light,{throttle:-1,steer:0,brake:false},1/120);drive(heavy,{throttle:-1,steer:0,brake:false},1/120);}
 assert.ok(length(light.vx,light.vy)<length(heavy.vx,heavy.vy));
 const a=createCar(),b=createCar();a.vy=b.vy=-60;b.mass=2400;const angle=a.angle;
 for(let i=0;i<30;i++){drive(a,{throttle:0,steer:1,brake:false},1/120);drive(b,{throttle:0,steer:1,brake:false},1/120);}
 assert.ok(a.angle-angle>.3);assert.ok(a.angle>b.angle);
});
test('driving a road for 120 seconds has no building impacts or nearby arena boundary',()=>{
 const world=createWorld(),c=createCar();let hits=0;
 for(let i=0;i<120*120;i++){drive(c,throttle,1/120);for(const o of nearbyObstacles(world,c.x,c.y,90)){if(collideObstacle(c,o))hits++;}}
 assert.ok(Math.abs(c.y)>19500);assert.ok(Math.abs(c.y)<WORLD_HALF-10000);assert.equal(hits,0);assert.equal(c.hp,100);console.log(`120s road: ${Math.abs(c.y).toFixed(0)} units, ${hits} obstacle impacts, ${c.hp} HP`);
});
test('all drivable district cells connect to the road network; road centerlines stay clear',()=>{
 const world=createWorld();
 for(let cy=-2;cy<=2;cy++)for(let cx=-2;cx<=2;cx++){
  const buildings=cellObstacles(cx,cy).filter(o=>o.type==='fixed'),n=40,step=BLOCK/n,free=new Set();
  for(let j=0;j<n;j++)for(let i=0;i<n;i++)if(!buildings.some(o=>circleContact(cx*BLOCK+i*step+step/2,cy*BLOCK+j*step+step/2,24,o)))free.add(`${i},${j}`);
  const queue=[[0,0]],seen=new Set(['0,0']);
  for(let q=0;q<queue.length;q++){const [i,j]=queue[q];for(const [ni,nj] of [[i+1,j],[i-1,j],[i,j+1],[i,j-1]]){const key=`${ni},${nj}`;if(free.has(key)&&!seen.has(key)){seen.add(key);queue.push([ni,nj]);}}}
  assert.equal(seen.size,free.size,`district ${cx},${cy}: no isolated free pocket`);
 }
 for(let d=-10000;d<=10000;d+=40){assert.equal(isSolid(world,0,d,60),false);assert.equal(isSolid(world,d,0,60),false);}
});
test('camera follows gradually with lookahead and converges after a stop',()=>{
 const camera={x:0,y:0},c={x:3000,y:-1000,vx:240,vy:0};followCamera(camera,c,1/60);assert.ok(camera.x>0&&camera.x<500);assert.ok(camera.y<0&&camera.y>-200);
 c.vx=0;for(let i=0;i<120;i++)followCamera(camera,c,1/60);assert.ok(Math.abs(camera.x-c.x)<1);assert.ok(Math.abs(camera.y-c.y)<1);
});
test('engine upgrade gives a useful speed advantage over long roads and faster exit approach',()=>{
 function trip(upgraded){const c=createCar();c.angle=0;if(upgraded)applyUpgrade(c,'engine');let t=0;while(c.x<EXIT.x&&t<40){drive(c,throttle,1/120);t+=1/120;}return {c,t};}
 const base=trip(false),engine=trip(true);assert.ok(base.t>25&&base.t<30);assert.ok(engine.t<base.t-1);assert.ok(engine.c.vx>base.c.vx);assert.ok(atExit(base.c));console.log(`Exit 4200 units: base ${base.t.toFixed(2)}s, engine ${engine.t.toFixed(2)}s (gate unlocks at 180s)`);
});
test('a zombie pack rewards ramming with kills, cumulative speed loss without stopping after one hit',()=>{
 const c=createCar();c.angle=0;c.vx=150;let dead=0;for(let i=0;i<6;i++){const z={x:c.x+15,y:c.y,hp:32};ramEnemy(c,z);if(z.hp<=0)dead++;}
 assert.equal(dead,6);assert.ok(c.vx>85&&c.vx<110);assert.equal(c.hp,100);
});
