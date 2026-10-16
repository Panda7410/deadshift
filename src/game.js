import {SLOT_DEFS,MODULES,compileWeapon,LIMITS} from './weapons.js';
import {stepProjectiles} from './projectiles.js';
import {loadoutMenu,upgradePreview} from './loadout-ui.js';
import {focusMenu,menuKey} from './menu.js';
import {createEnemy,chooseEnemyType,threatAt,PICKUPS,tickEffects,weaponMounts,muzzlePose,fireWeapons,onRam,debrisFor,collectSupplies,stepHazards} from './combat.js';
import {createWorld,nearbyObstacles,isSolid,circleContact,followCamera,atExit,WORLD_HALF,BLOCK,ROAD_WIDTH,EXIT,districtAt,resolveOverlaps} from './world.js';
import {createCar,drive,ramEnemy,collideObstacle,upgradeChoices,length,clamp,upgrades,applyUpgrade,requiredXp,readRecord,saveRecord} from './core.js';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d'),overlay=$('overlay');
let W=900,H=600,dpr=1;
let items=[],debris=[],hazards=[],debug=false,pauseOrigin='playing',weaponEvents=[],equipmentUi=null;
const newMetrics=()=>({ramKills:0,gunKills:0,obstacleDamage:0,enemyDamage:0,hazardDamage:0,brokenLight:0,brokenMedium:0,ramSpeedLoss:0,ramHits:0,ramDamage:0,weaponDamage:{},killsByType:{},speedTotal:0,samples:0,pickups:0});
function resize(){const r=canvas.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=W*dpr;canvas.height=H*dpr;}
new ResizeObserver(resize).observe(canvas);
let state='menu',car=createCar(),enemies=[],bullets=[],particles=[],gems=[],trails=[],time=0,kills=0,xp=0,level=1,spawn=0,shake=0,choices=[],extraction=false,volume=.3,audio,noiseTime=0;
let record;try{record=readRecord(localStorage);}catch{record=readRecord({getItem:()=>null});}
const keys=new Set();
let world=createWorld(),camera={x:0,y:0},metrics=newMetrics();
const exitAction=document.createElement('button');exitAction.id='exitAction';exitAction.className='quiet exit-action';exitAction.hidden=true;exitAction.textContent='E / 탈출 여부 선택';canvas.parentElement.append(exitAction);exitAction.onclick=offerExtraction;
function tone(freq,duration=.08,kind='square',gain=.04){if(!audio||volume===0)return;const o=audio.createOscillator(),g=audio.createGain();o.type=kind;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*.3),audio.currentTime+duration);g.gain.setValueAtTime(gain*volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
function initAudio(){try{audio??=new AudioContext();audio.resume();}catch{}}
function show(html){keys.clear();overlay.classList.remove('workbench-mode');overlay.innerHTML=html;if(html)focusMenu(overlay);else document.activeElement?.blur();}
const diagnostics=document.createElement('pre');diagnostics.id='diagnostics';diagnostics.className='diagnostics';diagnostics.hidden=true;canvas.parentElement.append(diagnostics);
function menu(){state='menu';show(`<span class="eyebrow">A DEADSHIFT FIELD EXPERIMENT</span><h2>도로는 아직<br>끝나지 않았다.</h2><p>당신의 차량이 마지막 무기입니다.<br>좀비를 돌파하고, 장비를 강화하고, 넓은 도로에서 돌파하며 성장하세요.<br>180초 후 동쪽 검문소가 열립니다. 탈출 시점은 직접 선택합니다.</p><button class="primary" id="start">엔진 시동 →</button><button class="quiet" id="menuSettings">설정 / 조작 안내</button><p>WASD / 방향키로 운전 · 무기는 자동 발사<br>기록 ${record.runs}회 출격 · 최고 생존 ${Math.floor(record.best)}초</p>`);$('start').onclick=start;$('menuSettings').onclick=pause;}
function start(){initAudio();items=[];debris=[];hazards=[];weaponEvents=[];car=createCar();enemies=[];bullets=[];particles=[];gems=[];trails=[];time=0;kills=0;xp=0;level=1;spawn=.3;extraction=false;world=createWorld();camera={x:car.x,y:car.y};metrics=newMetrics();keys.clear();state='playing';show('');notify('W / ↑ 가속 · S / ↓ 제동 및 후진');}
function pause(){if(state!=='playing'&&state!=='menu')return;pauseOrigin=state;state='paused';keys.clear();show(`<span class="eyebrow">ENGINE IDLE</span><h2>잠시 정차</h2><p>WASD / 방향키: 운전 · Space: 핸드브레이크<br>메뉴: 방향키 / WASD 이동 · Enter / Space 선택<br>보상: 1 / 2 / 3 · 탈출: E · 진단: F3</p><label>음량 <input id="volume" type="range" min="0" max="1" step="0.05" value="${volume}"></label><button id="resume" class="primary">${pauseOrigin==='menu'?'메인 메뉴 →':'주행 계속 →'}</button><button id="restart" class="quiet">처음부터 다시</button><button id="loadout" class="quiet">장비 상세 / 무기 조합 (B)</button>`);$('volume').oninput=e=>volume=Number(e.target.value);$('resume').onclick=resume;$('restart').onclick=start;$('loadout').onclick=()=>openEquipment();}
function completeReward(){state='playing';show('');keys.clear();if(xp>=requiredXp(level)){xp-=requiredXp(level);level++;levelUp();}}
function openEquipment(back='paused',pendingModule=null,initialSlot='roof'){
 const origin=pauseOrigin;state='equipment';equipmentUi=loadoutMenu({car,root:overlay,show,initialSlot,pendingModule,onClose:()=>{equipmentUi=null;if(back==='playing')completeReward();else{state=origin;pause();}}});
}
function resume(){if(state==='paused'){if(pauseOrigin==='menu'){menu();return;}state='playing';show('');keys.clear();}}
$('settings').onclick=()=>{if(state==='playing'||state==='menu')pause();else if(state==='paused')resume();};
window.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();
 if(k==='b'&&(state==='playing'||state==='paused')){e.preventDefault();openEquipment(state==='playing'?'playing':'paused');return;}
 if(k==='f3'){e.preventDefault();debug=!debug;return;}
 if(state!=='playing'){
  if(k==='escape'){e.preventDefault();if(state==='equipment')equipmentUi?.back();else if(state==='paused')resume();else if(state==='extracting'){state='playing';show('');}else if(state==='dead'||state==='won')menu();return;}
  if(state==='levelup'&&['1','2','3'].includes(k)&&!e.repeat){e.preventDefault();choose(Number(k)-1);return;}
  menuKey(e,overlay);return;
 }
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
 if(e.repeat)return;
 if(k==='escape'){pause();return;}
 if(k==='e'&&extraction&&atExit(car)){offerExtraction();return;}
 keys.add(k);
});
window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());});
window.addEventListener('blur',()=>{keys.clear();if(state==='playing')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause();});
function notify(text){$('notice').textContent=text;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('notice').textContent='',4000);}
function burst(x,y,color,count=10){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=30+Math.random()*120;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.3+Math.random()*.4,color});}}
function offerExtraction(){
 if(state!=='playing'||!extraction||!atExit(car))return;
 state='extracting';keys.clear();exitAction.hidden=true;
 show(`<span class="eyebrow">EXTRACTION CHECKPOINT</span><h2>떠날 때를 정하세요.</h2><p>지금 탈출하거나, 더 많은 경험치를 위해 머무를 수 있습니다.<br>계속 파밍하면 위협은 계속 증가합니다.</p><button id="confirmExit" class="primary">지금 탈출 →</button><button id="keepFarming" class="quiet">계속 파밍하기</button>`);
 $('confirmExit').onclick=()=>finish(true);
 $('keepFarming').onclick=()=>{state='playing';show('');keys.clear();};
}
function spawnEnemy(){
 const moving=length(car.vx,car.vy)>35;
 const direction=moving?Math.atan2(car.vy,car.vx):car.angle;
 const threat=threatAt(time);
 const a=threat.flank&&Math.random()<.3?direction+(Math.random()<.5?-1:1)*1.25:Math.random()<.75?direction+(Math.random()-.5)*.65:Math.random()*Math.PI*2;
 const r=Math.max(W,H)*.55+180;
 let x=clamp(car.x+Math.cos(a)*r,-WORLD_HALF+100,WORLD_HALF-100),y=clamp(car.y+Math.sin(a)*r,-WORLD_HALF+100,WORLD_HALF-100);
 // Move blocked spawns onto the nearest connected road.
 if(isSolid(world,x,y,70)){if(Math.abs(x-Math.round(x/BLOCK)*BLOCK)<Math.abs(y-Math.round(y/BLOCK)*BLOCK))x=Math.round(x/BLOCK)*BLOCK;else y=Math.round(y/BLOCK)*BLOCK;}
 const count=threat.count;
 for(let i=0;i<count&&enemies.length<170;i++){
  const ex=x+(i%3-1)*40,ey=y+(Math.floor(i/3)-1)*40;
  if(isSolid(world,ex,ey,20))continue;
  enemies.push(createEnemy(chooseEnemyType(time,i,Math.random()),ex,ey));
 }
}
function levelUp(forcedChoices=null){state='levelup';keys.clear();choices=forcedChoices||upgradeChoices(car);show(`<span class="eyebrow">FIELD MODIFICATION / LV. ${level}</span><h2>더 강하게. 더 멀리.</h2><p>차량 강화는 즉시 적용됩니다. 모듈·튜닝·용량은 장착 화면에서 확인 후 적용하세요.</p><div class="cards">${choices.map((u,i)=>`<button class="card" data-choice="${i}"><span>0${i+1} / ${u.slot}</span><b>${u.name}</b><small>${u.description}</small><small class="upgrade-preview">${upgradePreview(car,u)}</small></button>`).join('')}</div>`);overlay.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>choose(Number(b.dataset.choice)));tone(660,.3,'sine');}
function choose(i){
 if(state!=='levelup'||!choices[i])return;const reward=choices[i];applyUpgrade(car,reward.id);notify(`${reward.name} 획득`);
 if(reward.id.startsWith('module_')||['tuning','capacity','sidegun','shotgun'].includes(reward.id))openEquipment('playing',reward.id.startsWith('module_')?reward.id.slice(7):null,reward.id==='shotgun'?'front':reward.id==='sidegun'?'left':'roof');
 else completeReward();
}
function finish(won){state=won?'won':'dead';record.runs++;record.best=Math.max(record.best,time);record.kills+=kills;let saved=false;try{saved=saveRecord(localStorage,record);}catch{}show(`<span class="eyebrow">${won?'EXTRACTION COMPLETE':'SIGNAL LOST'}</span><h2>${won?'잿빛 구역 탈출.':'엔진이 멈췄다.'}</h2><p>${won?'차량과 함께 검문선을 돌파했습니다.':'이번 주행은 여기까지입니다. 다음에는 더 멀리.'}<br>${Math.floor(time)}초 생존 · ${kills} 처치 · LV. ${level}<br>${saved?'최고 생존 기록 저장됨':'저장 불가 · 브라우저 저장소를 확인하세요'}</p><button id="again" class="primary">다시 출격 →</button><button id="home" class="quiet">메인 메뉴</button><p>Phase 1 완주 테스트 · 분기 맵과 영구 성장 차고는 후속 단계입니다.</p>`);$('again').onclick=start;$('home').onclick=menu;tone(won?880:90,.5,'sawtooth');}
function update(dt){
 time+=dt;tickEffects(car,dt);drive(car,{throttle:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),steer:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),brake:keys.has(' ')},dt);
 const speed=length(car.vx,car.vy);metrics.speedTotal+=speed;metrics.samples++;
 if(speed>40){trails.push({x:car.x,y:car.y,a:car.angle,life:2.2});if(trails.length>160)trails.shift();}
 const obstacles=nearbyObstacles(world,car.x,car.y,Math.max(W,H)+900);
 for(const o of obstacles){
  const hit=collideObstacle(car,o);if(!hit)continue;
  metrics.obstacleDamage+=hit.damage;
  if(hit.broken){metrics[o.type==='light'?'brokenLight':'brokenMedium']++;debris.push(...debrisFor(hit,o.type==='light'?14:24));if(Math.random()<.2)dropItem(o.x,o.y);burst(o.x,o.y,o.type==='light'?'#c7a96c':'#96a1a0',o.type==='light'?18:32);shake=Math.max(shake,o.type==='light'?2:5);tone(o.type==='light'?130:65,.14,'sawtooth',.06);}
  else if(hit.normalSpeed>70){shake=Math.max(shake,Math.min(7,hit.normalSpeed/45));burst(car.x,car.y,'#dbb46b',5);tone(70,.1,'square',.035);}
 }
 const resolution=resolveOverlaps(car,obstacles);if(resolution.recovered)notify('겹침 보정: 가까운 주행 가능 위치로 복구');
 followCamera(camera,car,dt);
 spawn-=dt;if(spawn<=0&&enemies.length<170){spawn=threatAt(time).interval;spawnEnemy();}
 const fired=fireWeapons(car,enemies,dt);bullets.push(...fired.slice(0,Math.max(0,LIMITS.projectiles-bullets.length)));if(fired.length)tone(170,.045,'square',.025);
 const projectileStep=stepProjectiles(car,bullets,enemies,weaponEvents,dt,metrics);bullets=projectileStep.bullets;weaponEvents=projectileStep.events;for(const impact of projectileStep.impacts)burst(impact.x,impact.y,impact.color,3);
 for(const e of enemies){
  if(e.hp<=0)continue;
  const dx=car.x-e.x,dy=car.y-e.y,d=length(dx,dy)||1;
  e.stun=Math.max(0,(e.stun||0)-dt);
  e.x+=(e.vx||0)*dt;e.y+=(e.vy||0)*dt;e.vx=(e.vx||0)*Math.exp(-5*dt);e.vy=(e.vy||0)*Math.exp(-5*dt);
  e.slowTime=Math.max(0,(e.slowTime||0)-dt);e.walkVx=0;e.walkVy=0;if(!e.stun){const advance=e.type==='spitter'&&d<360?-.3:1;e.walkVx=dx/d*e.speed*advance*(e.slowTime>0?(e.slowFactor||1):1);e.walkVy=dy/d*e.speed*advance*(e.slowTime>0?(e.slowFactor||1):1);e.x+=e.walkVx*dt;e.y+=e.walkVy*dt;}
  if(e.type==='spitter'){
   e.attackTimer-=dt;if(e.attackTimer<=0&&d<600){hazards.push({x:car.x+car.vx*.55,y:car.y+car.vy*.55,r:65,warmup:.85,life:5});e.attackTimer=3.4;}
  }
  for(const o of obstacles)if(o.type==='fixed'){const h=circleContact(e.x,e.y,e.r,o);if(h){e.x+=h.nx*(h.depth+.01);e.y+=h.ny*(h.depth+.01);}}
  e.wobble+=dt*6;
  if(length(car.x-e.x,car.y-e.y)<e.r+23&&!e.stun){
   const impact=ramEnemy(car,e);metrics.enemyDamage+=impact.selfDamage;metrics.ramHits++;metrics.ramSpeedLoss+=impact.speedLoss;metrics.ramDamage+=Math.min(impact.damage,Math.max(0,e.hp+impact.damage));onRam(car,impact);
   if(e.hp<=0)e.cause='ram';
   shake=Math.max(shake,Math.min(5,impact.closing/45));burst(e.x,e.y,'#b3ad69',impact.closing>55?14:5);
   if(impact.closing>55)tone(85,.12,'sawtooth',.09);
  }
 }
 for(const e of enemies)if(e.hp<=0){kills++;metrics.killsByType[e.type||'normal']=(metrics.killsByType[e.type||'normal']||0)+1;if(Math.random()<(['heavy','spitter'].includes(e.type)?.45:.055))dropItem(e.x,e.y);metrics[e.cause==='ram'?'ramKills':'gunKills']++;gems.push({kind:'xp',magnetizable:true,x:e.x,y:e.y,value:e.type==='heavy'?3:e.type==='spitter'?4:1});burst(e.x,e.y,'#a0a76a',18);}
 enemies=enemies.filter(e=>e.hp>0&&length(e.x-car.x,e.y-car.y)<1500);
 const hazardStep=stepHazards(car,hazards,dt);hazards=hazardStep.hazards;metrics.hazardDamage+=hazardStep.damage;
 items=collectSupplies(car,items,dt,(item,info)=>{metrics.pickups++;notify(`${info.name} · ${info.description}`);tone(720,.2,'sine',.12);burst(item.x,item.y,info.color,16);});
 for(const p of debris){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-2.5*dt);p.vy*=Math.exp(-2.5*dt);p.angle+=p.spin*dt;p.life-=dt;if(length(p.x-car.x,p.y-car.y)<26){p.vx+=car.vx*dt*2;p.vy+=car.vy*dt*2;}}debris=debris.filter(p=>p.life>0).slice(-240);
 for(const g of gems){const d=length(g.x-car.x,g.y-car.y);if(d<(car.effects.magnet>0?1000:175)){g.x+=(car.x-g.x)*dt*7;g.y+=(car.y-g.y)*dt*7;}if(d<30){xp+=g.value;g.taken=true;tone(480,.04,'sine',.02);}}
 gems=gems.filter(g=>!g.taken);if(gems.length>300)gems.splice(0,gems.length-300);
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0).slice(-500);
 trails.forEach(t=>t.life-=dt);trails=trails.filter(t=>t.life>0);shake=Math.max(0,shake-dt*25);
 if(car.hp<=0){car.hp=0;finish(false);return;}
 if(time>=180&&!extraction){extraction=true;notify('동쪽 420m 검문소 개방 · 도착 후 E로 탈출 선택');}
 if(xp>=requiredXp(level)){xp-=requiredXp(level);level++;levelUp();}
 noiseTime-=dt;if(noiseTime<=0&&speed>25){tone(35+speed*.14,.12,'sawtooth',.012);noiseTime=.12;}
}
function dropItem(x,y,type){items.push({x,y,type:type||Object.keys(PICKUPS)[Math.floor(Math.random()*4)],life:24});}
function render(){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#252d27';ctx.fillRect(0,0,W,H);
 ctx.save();ctx.translate(W/2-camera.x+(Math.random()-.5)*shake,H/2-camera.y+(Math.random()-.5)*shake);
 // Procedural terrain; world geometry is independent of the camera.
 const left=camera.x-W/2,top=camera.y-H/2;
 ctx.strokeStyle='#30392e';ctx.lineWidth=1;for(let x=Math.floor(left/100)*100;x<left+W;x+=100){ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+H);ctx.stroke();}for(let y=Math.floor(top/100)*100;y<top+H;y+=100){ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+W,y);ctx.stroke();}
 // Draw only visible road segments; the connected road network spans 96,000 units.
 ctx.fillStyle='#343a31';
 for(let x=Math.floor((left-ROAD_WIDTH)/BLOCK)*BLOCK;x<left+W+ROAD_WIDTH;x+=BLOCK)ctx.fillRect(x-ROAD_WIDTH/2,top,ROAD_WIDTH,H);
 for(let y=Math.floor((top-ROAD_WIDTH)/BLOCK)*BLOCK;y<top+H+ROAD_WIDTH;y+=BLOCK)ctx.fillRect(left,y-ROAD_WIDTH/2,W,ROAD_WIDTH);
 ctx.strokeStyle='#77744c';ctx.lineWidth=2;ctx.setLineDash([22,32]);ctx.beginPath();
 for(let x=Math.floor(left/BLOCK)*BLOCK;x<left+W;x+=BLOCK){ctx.moveTo(x,top);ctx.lineTo(x,top+H);}
 for(let y=Math.floor(top/BLOCK)*BLOCK;y<top+H;y+=BLOCK){ctx.moveTo(left,y);ctx.lineTo(left+W,y);}
 ctx.stroke();ctx.setLineDash([]);
 ctx.strokeStyle='#80764c';ctx.lineWidth=5;ctx.strokeRect(-WORLD_HALF,-WORLD_HALF,WORLD_HALF*2,WORLD_HALF*2);
 for(let gx=Math.floor(left/170)*170;gx<left+W;gx+=170)for(let gy=Math.floor(top/170)*170;gy<top+H;gy+=170){ctx.fillStyle='#596045';ctx.fillRect(gx+37,gy+73,3,2);}
 for(const t of trails){ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.a);ctx.globalAlpha=t.life*.12;ctx.fillStyle='#070b08';ctx.fillRect(-15,-15,25,4);ctx.fillRect(-15,11,25,4);ctx.restore();}
 if(extraction){ctx.fillStyle='#8fae4c33';ctx.fillRect(EXIT.x-EXIT.r,EXIT.y-EXIT.r,EXIT.r*2,EXIT.r*2);ctx.strokeStyle='#c9da8c';ctx.lineWidth=2;ctx.strokeRect(EXIT.x-EXIT.r,EXIT.y-EXIT.r,EXIT.r*2,EXIT.r*2);ctx.fillStyle='#d8e4b2';ctx.font='bold 15px monospace';ctx.fillText('E / EXTRACT',EXIT.x-55,EXIT.y);}
 for(const o of nearbyObstacles(world,camera.x,camera.y,Math.max(W,H)*.65+300)){
  if(Math.abs(o.x-camera.x)>W/2+o.w/2+30||Math.abs(o.y-camera.y)>H/2+o.h/2+30)continue;
  ctx.save();ctx.translate(o.x,o.y);
  ctx.fillStyle='#111a1499';ctx.fillRect(-o.w/2+8,-o.h/2+10,o.w,o.h);
  if(o.type==='fixed'){
   ctx.fillStyle='#3c483e';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.strokeStyle='#697362';ctx.lineWidth=3;ctx.strokeRect(-o.w/2+8,-o.h/2+8,o.w-16,o.h-16);
   ctx.fillStyle='#29362f';ctx.fillRect(-o.w/2+30,-o.h/2+35,o.w-60,55);ctx.fillRect(-o.w/2+30,o.h/2-80,o.w-60,45);
   ctx.fillStyle='#83917b';ctx.font='11px monospace';ctx.fillText('DEAD ZONE / CONCRETE',-o.w/2+25,5);
  }else if(o.type==='light'){
   ctx.fillStyle='#9a8052';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.strokeStyle='#cfb375';ctx.lineWidth=2;ctx.strokeRect(-o.w/2+2,-o.h/2+2,o.w-4,o.h-4);ctx.beginPath();ctx.moveTo(-o.w/2,-o.h/2);ctx.lineTo(o.w/2,o.h/2);ctx.moveTo(o.w/2,-o.h/2);ctx.lineTo(-o.w/2,o.h/2);ctx.stroke();
  }else{
   ctx.fillStyle='#727d79';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.fillStyle='#24332e';ctx.fillRect(-o.w/2+6,-o.h/2+12,o.w-12,o.h-30);ctx.strokeStyle='#d0b373';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-o.w/2,0);ctx.lineTo(o.w/2,0);ctx.stroke();
  }
  ctx.restore();
 }
 for(const h of hazards){ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,7);ctx.fillStyle=h.warmup>0?'#c9b17b22':'#8ebc8466';ctx.fill();ctx.strokeStyle=h.warmup>0?'#e3bc79':'#acd59b';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#b8d29a';ctx.font='10px system-ui';ctx.fillText(h.warmup>0?'산성 분사 예고':'산성 구역 · 감속',h.x-38,h.y-h.r-8);}
 for(const event of weaponEvents){ctx.beginPath();ctx.arc(event.x,event.y,event.triggered?event.r:8,0,7);ctx.strokeStyle=event.triggered?'#edba6d':'#d2bd87';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#e7be7a';ctx.font='9px system-ui';ctx.fillText(event.triggered?'폭발':'지연 점화',event.x-20,event.y-15);}
 for(const p of debris){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=Math.min(1,p.life);ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.55);ctx.restore();}
 for(const item of items){const info=PICKUPS[item.type];ctx.save();ctx.translate(item.x,item.y);ctx.fillStyle='#172018';ctx.strokeStyle=info.color;ctx.lineWidth=2;ctx.fillRect(-13,-13,26,26);ctx.strokeRect(-13,-13,26,26);ctx.fillStyle=info.color;ctx.font='bold 16px monospace';ctx.textAlign='center';ctx.fillText(info.glyph,0,6);ctx.font='9px system-ui';ctx.fillText(info.name,0,-20);ctx.restore();}
 for(const g of gems){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#c7cf80';ctx.shadowBlur=8;ctx.shadowColor='#bdcc72';ctx.fillRect(-3,-3,6,6);ctx.restore();}
 for(const e of enemies){ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.atan2(car.y-e.y,car.x-e.x));ctx.fillStyle='#0b120d66';ctx.beginPath();ctx.ellipse(3,5,e.r+3,e.r,0,0,7);ctx.fill();ctx.fillStyle=e.slowTime>0?'#91c2cb':e.color||'#7e8e64';ctx.fillRect(-e.r*.7,-e.r*.6,e.r*1.3,e.r*1.2);ctx.fillStyle='#b0b696';ctx.beginPath();ctx.arc(e.r*.5,0,e.r*.48,0,7);ctx.fill();ctx.strokeStyle='#7b8b60';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,-e.r*.6);ctx.lineTo(e.r+5,-e.r*.6+Math.sin(e.wobble)*4);ctx.moveTo(0,e.r*.6);ctx.lineTo(e.r+5,e.r*.6+Math.cos(e.wobble)*4);ctx.stroke();if(e.hp<e.maxHp){ctx.fillStyle='#bd9063';ctx.fillRect(-12,-e.r-8,24*e.hp/e.maxHp,2);}ctx.restore();}
 ctx.strokeStyle='#ffdc8a';ctx.lineWidth=2;for(const b of bullets){ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*.017,b.y-b.vy*.017);ctx.stroke();}
 drawCar();for(const f of car.flashes){ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.angle);ctx.fillStyle='#ffe8a2';ctx.beginPath();ctx.moveTo(-2,-4);ctx.lineTo(12,0);ctx.lineTo(-2,4);ctx.fill();ctx.restore();}for(const p of particles){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);}ctx.globalAlpha=1;ctx.restore();
 const vignette=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.2,W/2,H/2,Math.max(W,H)*.7);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#050e0988');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
 if(extraction&&state==='playing'){const a=Math.atan2(EXIT.y-car.y,EXIT.x-car.x);ctx.save();ctx.translate(W/2+Math.cos(a)*Math.min(160,W*.3),H/2+Math.sin(a)*Math.min(160,H*.3));ctx.rotate(a);ctx.fillStyle='#e5cb75';ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(-6,-7);ctx.lineTo(-6,7);ctx.fill();ctx.restore();}
 const diagnostics=document.getElementById('diagnostics');diagnostics.hidden=!debug;diagnostics.textContent=`평균 속도 ${(metrics.speedTotal/Math.max(1,metrics.samples)*.36).toFixed(1)}km/h · 충돌 손실 ${metrics.ramSpeedLoss.toFixed(0)} · 충각 ${metrics.ramDamage.toFixed(0)} · 무장 ${JSON.stringify(metrics.weaponDamage)}\n처치 ${JSON.stringify(metrics.killsByType)} · 피해 적 ${metrics.enemyDamage.toFixed(1)} / 장애물 ${metrics.obstacleDamage.toFixed(1)} / 산성 ${metrics.hazardDamage.toFixed(1)} · 에너지 ${car.energy.toFixed(0)}`;
 $('speed').textContent=String(Math.floor(length(car.vx,car.vy)*.36)).padStart(3,'0');$('health').style.width=`${car.hp/car.maxHp*100}%`;$('health').style.background=car.hp<30?'#d1855e':'#b6c58c';$('hpText').textContent=`${Math.ceil(car.hp)} / ${car.maxHp}`;$('timer').textContent=`${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;$('threat').textContent=`THREAT ${String(threatAt(time).tier).padStart(2,'0')}`;$('kills').textContent=`${kills} 처치`;$('xp').style.width=`${xp/requiredXp(level)*100}%`;$('xpText').textContent=`${xp} / ${requiredXp(level)} XP`;$('levelText').textContent=`LV. ${String(level).padStart(2,'0')}`;$('engineStat').textContent=`${Math.round(car.engine*100)}%`;$('massStat').textContent=`${car.mass.toLocaleString()} KG`;
 const loadout=Object.keys(SLOT_DEFS).filter(id=>car.arsenal[id].enabled).map(id=>{const w=compileWeapon(car,id);return `<div class="slot"><i>↗</i><div>${SLOT_DEFS[id].name} / ${w.name}<small>LV.${w.level} · ${w.cost}/${w.capacity} · ${MODULES[car.arsenal[id].modules.ammo]?.name}</small></div></div>`;}).join('')+`<div class="slot"><i>≋</i> 충각 ×${car.ram.toFixed(2)} / 장갑 ${car.armor}</div><div class="effects">${Object.keys(car.relics).map(id=>upgrades.find(u=>u.id===id)?.name).join(' · ')}<br>${Object.entries(car.effects).filter(([,v])=>v>0).map(([id,v])=>PICKUPS[id]?.name+' '+Math.ceil(v)+'s').join(' · ')}<br>${car.inAcid?'산성 감속 (중첩 없음) · ':''}B / ESC → 장비 상세·무기 조합</div>`;
 if($('equipment').innerHTML!==loadout)$('equipment').innerHTML=loadout;
 $('objective').textContent=extraction?`동쪽 검문소 ${Math.round(length(car.x-EXIT.x,car.y-EXIT.y)*.1)}m · E로 탈출 선택`:'180초 후 동쪽 검문소 개방 · 파밍 시간은 자유';
 exitAction.hidden=!(state==='playing'&&extraction&&atExit(car));
 $('district').innerHTML=`SECTOR ${Math.floor(car.x/BLOCK)}, ${Math.floor(car.y/BLOCK)} <b>${Math.abs(car.x-Math.round(car.x/BLOCK)*BLOCK)<ROAD_WIDTH/2||Math.abs(car.y-Math.round(car.y/BLOCK)*BLOCK)<ROAD_WIDTH/2?'외곽 순환도로':districtAt(car.x,car.y)}</b>`;
}
function drawCar(){ctx.save();ctx.translate(car.x,car.y);ctx.rotate(car.angle);ctx.fillStyle='#060e0b88';ctx.fillRect(-24,-14,55,36);ctx.fillStyle='#111712';for(const x of [-16,13])for(const y of [-19,13])ctx.fillRect(x,y,14,7);ctx.fillStyle=car.invincible>0?'#d7d5ab':'#819079';ctx.fillRect(-24,-15,51,30);ctx.fillStyle='#b9c0a1';ctx.fillRect(18,-15,12,30);ctx.fillStyle='#273d36';ctx.fillRect(7,-12,10,24);ctx.fillRect(-19,-11,8,22);ctx.fillStyle='#52644e';ctx.fillRect(-8,-12,13,24);ctx.fillStyle='#f2dca0';ctx.fillRect(26,-13,4,6);ctx.fillRect(26,7,4,6);ctx.fillStyle='#b65f47';ctx.fillRect(-25,-13,3,5);ctx.fillRect(-25,8,3,5);if(car.ram>1){ctx.fillStyle='#c6bc94';ctx.beginPath();ctx.moveTo(30,-20);ctx.lineTo(42,0);ctx.lineTo(30,20);ctx.fill();}if(car.armor){ctx.strokeStyle='#b5bba0';ctx.lineWidth=4;ctx.strokeRect(-18,-17,40,34);}ctx.restore();for(const mount of weaponMounts(car)){const angle=car.aims[mount.id]??(car.angle+SLOT_DEFS[mount.id].direction),pose=muzzlePose(car,mount,angle);ctx.save();ctx.translate(pose.origin.x,pose.origin.y);ctx.rotate(angle);ctx.fillStyle='#c2c8a7';ctx.fillRect(-7,-6,13,12);ctx.fillStyle='#e2cf96';ctx.fillRect(0,-2,pose.barrel,4);ctx.restore();}}

let last=performance.now(),accumulator=0;function frame(now){const elapsed=Math.min((now-last)/1000,.1);last=now;if(state==='playing'){accumulator+=elapsed;while(accumulator>=1/120&&state==='playing'){update(1/120);accumulator-=1/120;}}else accumulator=0;render();requestAnimationFrame(frame);}menu();requestAnimationFrame(frame);
// Explicit local test mode, absent in normal play. No gameplay shortcuts in production UI.
if(new URLSearchParams(location.search).get('test')==='1')Object.defineProperty(window,'__deadshift',{value:{snapshot:()=>({state,keys:[...keys],car:{...car},time,kills,xp,level,enemies:enemies.length,camera:{...camera},metrics:{...metrics},items:items.map(i=>({...i})),debris:debris.length,hazards:hazards.map(h=>({...h})),shots:bullets.map(b=>({...b,hits:b.hits?.size||0})),weaponEvents:weaponEvents.map(e=>({...e})),weaponStats:Object.keys(SLOT_DEFS).map(id=>compileWeapon(car,id)),enemiesData:enemies.map(e=>({...e})),threat:threatAt(time),worldHalf:WORLD_HALF,record:{...record}}),upgrade(id){applyUpgrade(car,id);},grantModule(id,count=1){car.moduleStock[id]=(car.moduleStock[id]||0)+count;},move(x,y,angle=car.angle){car.x=x;car.y=y;car.angle=angle;car.vx=0;car.vy=0;},setEnemies(data){enemies=data.map(e=>Object.assign(createEnemy(e.type||'normal',e.x,e.y),e));},advance(seconds){for(let i=0;i<seconds*120&&state==='playing';i++)update(1/120);},simulate(build,seconds=180,seed=7410){
 const originalRandom=Math.random,originalVolume=volume;
 let n=seed>>>0;Math.random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};volume=0;
 const paths={none:[],ram:['ram','engine','armor','chain','ram','engine','armor'],weapon:['gun','sidegun','engine','shotgun','gun','armor','mark'],hybrid:['gun','armor','ram','engine','dynamo','sidegun','mark']};
 if(!paths[build]){Math.random=originalRandom;volume=originalVolume;throw Error('Unknown build');}
 try{start();let awards=0;keys.add('w');for(let i=0;i<seconds*120&&state!=='dead';i++){
  if(state==='levelup'){let id=paths[build][awards%Math.max(1,paths[build].length)];if(id){if(car.relics[id])id='engine';applyUpgrade(car,id);}awards++;state='playing';show('');keys.add('w');}
  if(state==='playing')update(1/120);
 }
 return {build,time,level,kills,hp:car.hp,meanSpeed:metrics.speedTotal/Math.max(1,metrics.samples),metrics:structuredClone(metrics),upgrades:build==='none'?0:awards,alive:state!=='dead'};
 }finally{Math.random=originalRandom;volume=originalVolume;keys.clear();}
},setScenario(name){if(name==='collision'){enemies=[{x:car.x+10,y:car.y,hp:10,maxHp:10,speed:0,r:12,wobble:0}];car.vx=220;car.vy=0;}if(name==='level'){xp=requiredXp(level);}if(name==='moduleReward'){level++;levelUp(['module_pierce','engine','armor'].map(id=>upgrades.find(u=>u.id===id)));}if(name==='extract'){time=181;car.x=EXIT.x;car.y=EXIT.y;car.vx=0;car.vy=0;car.hp=100;}if(name==='death'){car.hp=0;}if(name==='hazard'){enemies=[];items=[];gems=[];car.vx=0;car.vy=0;car.hp=100;car.invincible=0;car.effects.shield=0;hazards=[{x:car.x,y:car.y,r:65,warmup:0,life:3}];}if(name==='magnetSupplies'){car.effects.magnet=12;for(const type of Object.keys(PICKUPS))dropItem(car.x+150,car.y+20,type);gems.push({x:car.x+150,y:car.y,value:1});}if(name==='stackedAcid'){car=createCar();enemies=[];items=[];gems=[];world=createWorld();hazards=Array.from({length:16},()=>({x:0,y:0,r:500,warmup:0,life:5}));}if(name==='overlap'){car.x=0;car.y=0;car.vx=0;car.vy=0;world=createWorld();world.cells.set('0:0',[{type:'fixed',x:-35,y:0,w:50,h:150},{type:'medium',x:35,y:0,w:50,h:150}]);hazards=[{x:0,y:0,r:65,warmup:0,life:5}];}if(name==='items'){car.hp=40;for(const type of Object.keys(PICKUPS))dropItem(car.x,car.y,type);}if(name==='late'){time=160;enemies=[createEnemy('spitter',car.x+500,car.y),createEnemy('heavy',car.x+130,car.y),createEnemy('fast',car.x-110,car.y)];enemies[0].attackTimer=.1;}if(name==='weapons'){applyUpgrade(car,'sidegun');applyUpgrade(car,'shotgun');enemies=[0,-Math.PI/2,Math.PI/2].map(offset=>createEnemy('heavy',car.x+Math.cos(car.angle+offset)*180,car.y+Math.sin(car.angle+offset)*180));}if(name==='light'||name==='medium'||name==='wall'){enemies=[];car.x=300;car.y=0;car.vx=220;car.vy=0;car.angle=0;car.hp=100;car.invincible=0;const type=name==='wall'?'fixed':name;world.cells.set('0:0',[{id:'test-obstacle',type,x:390,y:0,w:40,h:80,broken:false}]);}if(name==='road'){enemies=[];car=createCar();camera={x:0,y:0};}}}});
