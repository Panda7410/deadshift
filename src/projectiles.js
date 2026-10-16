import {LIMITS,MODULES} from './weapons.js';
import {onGunKill} from './combat.js';
function damage(car,e,amount,source,metrics){
 if(e.hp<=0)return;const dealt=Math.min(e.hp,amount);e.hp-=amount;
 metrics.weaponDamage[source]=(metrics.weaponDamage[source]||0)+dealt;
 if(e.hp<=0){e.cause='gun';onGunKill(car);}
}
function segmentHit(b,e,dx,dy){const denom=dx*dx+dy*dy,t=denom?Math.max(0,Math.min(1,((e.x-b.x)*dx+(e.y-b.y)*dy)/denom)):0;return Math.hypot(e.x-b.x-t*dx,e.y-b.y-t*dy)<e.r+4?t:null;}
export function stepProjectiles(car,bullets,enemies,events,dt,metrics){
 const live=[],children=[],impacts=[];
 for(const b of bullets.slice(0,LIMITS.projectiles)){
  if(b.life<=0||b.generation>LIMITS.generation)continue;
  b.hits??=new Set();const speed=Math.hypot(b.vx,b.vy),travel=Math.max(0,Math.min(dt,b.life,speed?b.rangeLeft/speed:0)),dx=b.vx*travel,dy=b.vy*travel;
  b.life-=dt;b.rangeLeft-=Math.hypot(dx,dy);
  const hits=enemies.filter(e=>e.hp>0&&!b.hits.has(e)).map(e=>({e,t:segmentHit(b,e,dx,dy)})).filter(h=>h.t!==null).sort((a,c)=>a.t-c.t);
  let redirected=false;
  for(const {e,t} of hits){
   if(e.hp<=0)continue;b.hits.add(e);if(impacts.length<32)impacts.push({x:e.x,y:e.y,color:b.effect==='shock'?'#c4d9ef':b.effect==='slow'?'#8fcbd8':'#bdc77f'});
   damage(car,e,b.damage*(b.effect==='shock'&&e.slowTime>0?MODULES.shock.slowBonus:1),b.source,metrics);
   if(b.effect==='slow'){e.slowTime=Math.max(e.slowTime||0,MODULES.slow.duration);e.slowFactor=MODULES.slow.factor;}
   if(b.effect==='shock'){
    e.stun=Math.max(e.stun||0,MODULES.shock.stun);
    const next=enemies.filter(n=>n!==e&&n.hp>0&&Math.hypot(n.x-e.x,n.y-e.y)<MODULES.shock.arcRange).sort((a,c)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(c.x-e.x,c.y-e.y))[0];
    if(next)damage(car,next,b.damage*MODULES.shock.arcMultiplier,b.source,metrics); // Secondary arcs never trigger effects.
   }
   if(b.effect==='delay'&&events.length<LIMITS.events)events.push({x:e.x,y:e.y,r:MODULES.delay.radius,wait:MODULES.delay.delay,life:.2,damage:b.damage*MODULES.delay.multiplier,source:b.source,triggered:false});
   if(b.children&&b.generation===0){
    const angle=Math.atan2(b.vy,b.vx),speed=Math.hypot(b.vx,b.vy);
    for(let i=0;i<Math.min(MODULES.split.children,b.children)&&children.length+live.length<LIMITS.projectiles;i++){
     const a=angle+(i-1)*MODULES.split.childSpread/2;children.push({...b,x:b.x+dx*t,y:b.y+dy*t,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,damage:b.damage*MODULES.split.childDamage,life:MODULES.split.childRange/speed,rangeLeft:MODULES.split.childRange,generation:1,children:0,pierce:0,bounces:0,hits:new Set(b.hits)});
    }
   }
   if(b.pierce>0){b.pierce--;continue;}
   if(b.bounces>0){
    const next=enemies.filter(n=>n.hp>0&&!b.hits.has(n)&&Math.hypot(n.x-e.x,n.y-e.y)<220).sort((a,c)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(c.x-e.x,c.y-e.y))[0];
    if(next){b.bounces--;const a=Math.atan2(next.y-e.y,next.x-e.x),speed=Math.hypot(b.vx,b.vy);b.x=e.x;b.y=e.y;b.vx=Math.cos(a)*speed;b.vy=Math.sin(a)*speed;b.life=Math.max(b.life,.4);b.rangeLeft=Math.max(b.rangeLeft,220);redirected=true;break;}
   }
   b.life=0;break;
  }
  if(!redirected){b.x+=dx;b.y+=dy;}
  if(b.life>0&&b.rangeLeft>0)live.push(b);
 }
 let budget=LIMITS.eventsPerTick;
 for(const e of events.slice(0,LIMITS.events)){
  e.wait-=dt;if(!e.triggered&&e.wait<=0&&budget-->0){for(const target of enemies)if(target.hp>0&&Math.hypot(target.x-e.x,target.y-e.y)<e.r)damage(car,target,e.damage,e.source,metrics);e.triggered=true;}
  if(e.triggered)e.life-=dt;
 }
 return {impacts,bullets:[...live,...children].slice(0,LIMITS.projectiles),events:events.filter(e=>e.life>0).slice(0,LIMITS.events)};
}
