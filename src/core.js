import {createArsenal,unlockSlot,MODULES} from './weapons.js';
import {WORLD_HALF,CAR_RADIUS,circleContact,PHYSICAL_TYPES} from './world.js';
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const length=(x,y)=>Math.hypot(x,y);
export function createCar(){return {arsenal:createArsenal(),moduleStock:{single:1},tuningPoints:0,capacityKits:0,x:0,y:0,vx:0,vy:0,angle:-Math.PI/2,hp:100,maxHp:100,mass:1200,engine:1,armor:0,ram:1,gun:1,gunTimer:0,invincible:0,sidegun:0,shotgun:0,cooldowns:{},aims:{},flashes:[],effects:{magnet:0,fuel:0,shield:0},relics:{},energy:0,combo:0,powerShot:0,markTime:0};}
export function drive(car,input,dt){
 const fx=Math.cos(car.angle),fy=Math.sin(car.angle),massRatio=car.mass/1200;
 let forward=car.vx*fx+car.vy*fy,side=-car.vx*fy+car.vy*fx;
 const power=car.engine/massRatio*(car.effects.fuel>0?1.4:1)*(car.combo>0?1.18:1);
 const topSpeed=170*power**.65;
 if(input.throttle>0&&forward<topSpeed)forward=Math.min(topSpeed,forward+105*power*dt);
 if(input.throttle<0)forward-=(forward>4?260/Math.sqrt(massRatio):105*power)*dt;
 const speed=length(car.vx,car.vy);
 // Responsive at walking speed, less steering authority and lateral grip at speed.
 car.angle+=input.steer*2.35*clamp(Math.abs(forward)/28,0,1)*(forward<0?-1:1)*(input.brake?1.28:1)*dt/(1+speed/235)/Math.sqrt(massRatio);
 side*=Math.exp(-(input.brake?1.1:Math.max(2.6,8-speed/65))/Math.sqrt(massRatio)*dt);
 forward*=Math.exp(-(input.brake?1.8/Math.sqrt(massRatio):.26)*dt);
 forward=Math.max(-85,forward);
 car.vx=Math.cos(car.angle)*forward-Math.sin(car.angle)*side;
 car.vy=Math.sin(car.angle)*forward+Math.cos(car.angle)*side;
 car.x=clamp(car.x+car.vx*dt,-WORLD_HALF,WORLD_HALF);car.y=clamp(car.y+car.vy*dt,-WORLD_HALF,WORLD_HALF);
 // Remote world edge stops the outward component, never bounces repeatedly.
 if(Math.abs(car.x)>=WORLD_HALF&&car.vx*Math.sign(car.x)>0)car.vx=0;
 if(Math.abs(car.y)>=WORLD_HALF&&car.vy*Math.sign(car.y)>0)car.vy=0;
 car.invincible=Math.max(0,car.invincible-dt);
}
export function hurt(car,damage){
 if(car.invincible>0||damage<=0)return 0;
 const dealt=Math.max(0,damage*(car.effects.shield>0?.45:1)-car.armor);car.hp=Math.max(0,car.hp-dealt);if(dealt>0)car.invincible=.45;return dealt;
}
export function collideObstacle(car,o,radius=CAR_RADIUS){
 if(o.broken||!PHYSICAL_TYPES.has(o.type))return null;
 const hit=circleContact(car.x,car.y,radius,o);if(!hit)return null;
 const {nx,ny,depth}=hit;
 const normalSpeed=Math.max(0,-car.vx*nx-car.vy*ny),speed=length(car.vx,car.vy);
 const facing=Math.max(0,-Math.cos(car.angle)*nx-Math.sin(car.angle)*ny);
 const impact=normalSpeed*Math.sqrt(car.mass/1200)*(1+(car.ram-1)*1.6*facing);
 const threshold=o.type==='light'?48:165;
 const broken=o.type!=='fixed'&&impact>=threshold;
 let damage=0;
 if(broken){
  o.broken=true;const objectMass=o.mass||(o.type==='light'?65:290);const loss=clamp(objectMass/(car.mass+objectMass)*(.9+Math.max(0,normalSpeed-80)/400),.035,.34);car.vx*=1-loss;car.vy*=1-loss;
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
 return {broken,normalSpeed,speed,damage,type:o.type,x:o.x,y:o.y,vx:car.vx,vy:car.vy,mass:car.mass};
}
export function ramEnemy(car,enemy){
 const dx=enemy.x-car.x,dy=enemy.y-car.y,d=length(dx,dy)||1,nx=dx/d,ny=dy/d;
 const speed=length(car.vx,car.vy),closing=Math.max(0,car.vx*nx+car.vy*ny-(enemy.vx||0)*nx-(enemy.vy||0)*ny-(enemy.walkVx||0)*nx-(enemy.walkVy||0)*ny);
 const facing=Math.max(0,Math.cos(car.angle)*nx+Math.sin(car.angle)*ny),enemyMass=enemy.mass||(enemy.heavy?650:85);
 const markBonus=car.relics.mark&&car.markTime>0?1.3:1;
 const damage=Math.max(1,closing*.4)*(.2+.8*clamp(speed/85,0,1))*car.ram*Math.sqrt(car.mass/1200)*(.65+.55*facing)/(1+enemyMass/400)*markBonus;
 enemy.hp-=damage;
 // Exchange normal momentum. A bumper reduces coupling, but never cancels enemy mass.
 const coupling=1.15/(1+(car.ram-1)*.5*facing);
 const impulse=closing*enemyMass/(car.mass+enemyMass)*coupling;
 car.vx-=nx*impulse;car.vy-=ny*impulse;
 enemy.vx=(enemy.vx||0)+nx*closing*car.mass/(car.mass+enemyMass)*.65;
 enemy.vy=(enemy.vy||0)+ny*closing*car.mass/(car.mass+enemyMass)*.65;
 enemy.x+=nx*10;enemy.y+=ny*10;enemy.stun=.2;
 const selfDamage=closing>65&&speed>65&&facing>.35&&enemyMass<200?0:(enemy.attack||7)*(closing>100?.4:1);
 const dealt=hurt(car,selfDamage);
 return {damage,speed,closing,selfDamage:dealt,ramming:speed>55&&facing>.35,speedLoss:Math.max(0,speed-length(car.vx,car.vy)),killed:enemy.hp<=0};
}
export const upgrades=[
 {id:'ram',name:'강화 충각',slot:'FRONT / 범퍼',description:'충돌 피해 +30%, 중량 +100kg. 중량형 저항은 여전히 남습니다.',apply:c=>{c.ram+=.3;c.mass+=100;}},
 {id:'gun',name:'지붕 기관총',slot:'ROOF / 무장',description:'자동 조준 화력 +1단계. 발사 속도와 피해가 증가합니다.',apply:c=>{c.gun++;c.arsenal.roof.level=Math.min(20,c.arsenal.roof.level+1);c.arsenal.roof.revision++;c.mass+=40;}},
 {id:'engine',name:'고출력 엔진',slot:'ENGINE / 동력',description:'출력 +35%. 가속과 최고 속도가 함께 증가합니다.',apply:c=>{c.engine+=.35;}},
 {id:'armor',name:'복합 장갑',slot:'BODY / 방호',description:'피격 피해 -2. 최대 내구도 +20, 내구도 30 회복.',apply:c=>{c.armor+=2;c.mass+=120;c.maxHp+=20;c.hp=Math.min(c.maxHp,c.hp+30);}},
 {id:'sidegun',name:'좌우 무기 슬롯 해금',slot:'EQUIPMENT / 좌·우',description:'좌우에 독립 조합 슬롯 해금. 빈 슬롯에 기본 단발 장착. 기존 조합은 유지됩니다.',apply:c=>{c.sidegun++;unlockSlot(c,'left');unlockSlot(c,'right');c.mass+=100;}},
 {id:'shotgun',name:'전방 무기 슬롯 해금',slot:'EQUIPMENT / 전방',description:'전방 조합 슬롯 해금. 빈 슬롯에 산탄 장착. 기존 조합은 유지됩니다.',apply:c=>{c.shotgun++;unlockSlot(c,'front','scatter');c.mass+=80;}},
 {id:'dynamo',name:'충격 발전기',slot:'RELIC / 혼합',unique:true,description:'충돌로 잃은 운동량을 축적. 에너지 24마다 무장 재장전·2초 탄환 +18%.',apply:c=>{c.relics.dynamo=true;}},
 {id:'chain',name:'연쇄 점화기',slot:'RELIC / 충각',unique:true,description:'고속 충돌 처치 시 잠깐 출력 +18%. 연속 처치로 최대 3초 유지.',apply:c=>{c.relics.chain=true;}},
 {id:'mark',name:'사냥꾼 회로',slot:'RELIC / 연계',unique:true,description:'무장 처치 후 3초 충각 피해 +30%. 화력으로 길을 열고 돌파합니다.',apply:c=>{c.relics.mark=true;}},
 {id:'tuning',name:'무기 튜닝권',slot:'WEAPON / 강화',description:'조합 화면에서 원하는 슬롯 무기를 1레벨 강화. 수치 확인 후 적용.',apply:c=>{c.tuningPoints++;}},
 {id:'capacity',name:'슬롯 용량 확장권',slot:'WEAPON / 용량',description:'조합 화면에서 선택 슬롯의 기본 용량 +15. 확인 전에는 변경되지 않습니다.',apply:c=>{c.capacityKits++;}},
 {id:'engineer',name:'모듈 공학자',slot:'RELIC / 조합',unique:true,description:'모든 슬롯 용량 +15, 부가 효과 모듈 비용 -5.',apply:c=>{c.relics.engineer=true;}},
 {id:'rebound',name:'반사 프리즘',slot:'RELIC / 도탄',unique:true,description:'모든 슬롯의 도탄 횟수 +1. 관통·분열에는 영향 없음.',apply:c=>{c.relics.rebound=true;}},
 {id:'repair',name:'긴급 정비',slot:'SERVICE / 수리',description:'내구도 45 회복. 가벼운 차체를 유지합니다.',apply:c=>{c.hp=Math.min(c.maxHp,c.hp+45);}}
,...Object.entries(MODULES).filter(([id])=>!['normal','none'].includes(id)).map(([id,m])=>({id:`module_${id}`,name:`모듈: ${m.name}`,slot:`MODULE / ${m.layer} · 비용 ${m.cost}`,description:m.description,apply:c=>{c.moduleStock[id]=(c.moduleStock[id]||0)+1;}}))
];
export function applyUpgrade(car,id){const u=upgrades.find(u=>u.id===id);if(!u)throw new Error('Unknown upgrade');u.apply(car);}
export function upgradeChoices(car,random=Math.random){const pool=upgrades.filter(u=>u.id!=='gun'&&!(u.id==='sidegun'&&car.arsenal.left.enabled&&car.arsenal.right.enabled)&&!(u.id==='shotgun'&&car.arsenal.front.enabled)&&(!u.unique||!car.relics[u.id]));for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,3);}
export const requiredXp=level=>8+(level-1)*5;
export function readRecord(storage){try {const d=JSON.parse(storage.getItem('deadshift.save'));if(d?.version===1)return {version:1,runs:Math.max(0,Number(d.runs)||0),best:Math.max(0,Number(d.best)||0),kills:Math.max(0,Number(d.kills)||0)};}catch{}return {version:1,runs:0,best:0,kills:0};}
export function saveRecord(storage,record){try{storage.setItem('deadshift.save',JSON.stringify(record));return true;}catch{return false;}}
