// Pure, data-driven weapon recipes. Rendering, projectiles and UI share this compiler.
export const SLOT_DEFS={
 roof:{name:'상단',x:0,y:0,direction:0,arc:Math.PI*2},
 front:{name:'전방',x:25,y:0,direction:0,arc:70*Math.PI/180},
 left:{name:'좌측',x:-3,y:-20,direction:-Math.PI/2,arc:130*Math.PI/180},
 right:{name:'우측',x:-3,y:20,direction:Math.PI/2,arc:130*Math.PI/180}
};
export const MODULES={
 single:{name:'직선 단발',layer:'pattern',cost:30,damage:16,interval:.72,range:440,speed:680,pellets:1,spread:0,description:'정밀한 단발. 높은 발당 피해와 긴 사거리.'},
 rapid:{name:'고속 연사',layer:'pattern',cost:40,damage:8,interval:.22,range:360,speed:720,pellets:1,spread:0,description:'낮은 발당 피해, 빠른 상태 이상 부여. 높은 용량 비용.'},
 scatter:{name:'산탄',layer:'pattern',cost:35,damage:12,interval:1.1,range:270,speed:590,pellets:5,spread:.44,description:'근접 5발. 멀거나 작은 적에는 탄환이 빗나갈 수 있음.'},
 normal:{name:'일반탄',layer:'ammo',cost:0,description:'추가 특성 없음. 용량을 다른 계층에 사용.'},
 pierce:{name:'관통탄',layer:'ammo',cost:40,pierce:1,description:'각 탄환이 서로 다른 적 2명까지 명중.'},
 ricochet:{name:'도탄탄',layer:'ammo',cost:35,bounces:2,description:'명중 후 220 이내의 아직 맞지 않은 적으로 최대 2회 튕김.'},
 split:{name:'분열탄',layer:'ammo',cost:35,children:3,childDamage:.45,childRange:180,childSpread:.9,description:'첫 명중 후 45% 피해의 자탄 3개. 자탄 사거리 180. 자탄은 재분열하지 않음.'},
 none:{name:'효과 없음',layer:'effect',cost:0,description:'특수 효과 없음.'},
 delay:{name:'지연 폭발',layer:'effect',cost:10,delay:.3,radius:65,multiplier:.6,description:'명중 0.3초 뒤 반경 65에 탄환 피해의 60%. 폭발은 재발동 없음.'},
 shock:{name:'감전',layer:'effect',cost:15,stun:.2,arcRange:110,arcMultiplier:.35,slowBonus:1.25,description:'0.2초 경직 + 110 이내 다른 적 1명에 35% 전기 피해. 감속된 표적에는 직격 +25%.'},
 slow:{name:'감속',layer:'effect',cost:10,duration:2,factor:.6,description:'2초간 이동 속도 40% 감소. 다른 무기의 감전과 연계.'}
};
export const LAYERS=['pattern','ammo','effect'];
export const FALLBACK={pattern:null,ammo:'normal',effect:'none'};
export const LIMITS={projectiles:512,events:64,eventsPerTick:48,generation:1};
export function createArsenal(){return Object.fromEntries(Object.keys(SLOT_DEFS).map(id=>[id,{enabled:id==='roof',level:1,capacity:90,revision:0,modules:{pattern:id==='roof'?'single':null,ammo:'normal',effect:'none'}}]));}
export function moduleCost(car,id){const m=MODULES[id];return Math.max(0,(m?.cost||0)-(m?.layer==='effect'&&car.relics?.engineer?5:0));}
export function compileWeapon(car,id,recipe=car.arsenal[id]){
 const def=SLOT_DEFS[id];if(!def||!recipe)throw Error('Unknown slot');
 const modules=recipe.modules,p=MODULES[modules.pattern],a=MODULES[modules.ammo],e=MODULES[modules.effect];
 const errors=[];
 for(const layer of LAYERS)if(modules[layer]!==null&&MODULES[modules[layer]]?.layer!==layer)errors.push(`잘못된 ${layer} 모듈`);
 if(!Number.isInteger(recipe.level)||recipe.level<1||recipe.level>20)errors.push('무기 레벨 범위 1~20');
 if(!Number.isInteger(recipe.capacity)||recipe.capacity<0||recipe.capacity>300)errors.push('기본 용량 범위 0~300');
 const costs=Object.fromEntries(LAYERS.map(k=>[k,moduleCost(car,modules[k])]));
 const cost=Object.values(costs).reduce((n,c)=>n+c,0),capacity=recipe.capacity+(car.relics?.engineer?15:0);
 if(cost>capacity)errors.push(`용량 초과 ${cost} / ${capacity}: 다른 계층 제거 또는 용량 확장 필요`);
 const level=recipe.level,damage=(p?.damage||0)*(1+(level-1)*.22)*(car.powerShot>0?1.18:1),interval=(p?.interval||1)/Math.sqrt(level);
 const effects=[e?.description||''];if(modules.effect==='delay')effects.push(`폭발 피해 ${(damage*e.multiplier).toFixed(2)} / 지연 ${e.delay}초 / 반경 ${e.radius}`);if(modules.effect==='shock')effects.push(`전기 피해 ${(damage*e.arcMultiplier).toFixed(2)} / 감속 대상 ${(damage*e.slowBonus).toFixed(2)}`);if(modules.ammo==='split')effects.push(`자탄 3개 × ${(damage*a.childDamage).toFixed(2)} / 사거리 ${a.childRange}`);if(car.powerShot>0)effects.push('충격 발전기 강화탄 +18%');if(car.relics?.rebound&&modules.ammo==='ricochet')effects.push('반사 프리즘: 도탄 +1');
 return {id,name:p?.name||'미장착',slot:def.name,level,cost,costs,capacity,valid:!errors.length,errors,active:recipe.enabled&&!!p,damage,interval,rate:p?1/interval:0,pellets:p?.pellets||0,spread:p?.spread||0,range:p?.range||0,speed:p?.speed||0,pierce:a?.pierce||0,bounces:(a?.bounces||0)+(a?.bounces&&car.relics?.rebound?1:0),children:a?.children||0,effect:modules.effect,ammo:modules.ammo,arc:def.arc,effects,synergy:[modules.effect==='shock'?'감속 표적에 직격 +25% (조건부)':modules.effect==='slow'?'다른 슬롯의 감전과 연계 가능':'',car.relics?.dynamo?'충격 발전기: 충돌 에너지 → 모든 슬롯 재장전':'',car.relics?.mark?'사냥꾼 회로: 무장 처치 → 충각 강화':'',car.relics?.engineer?'모듈 공학자: 용량 +15 / 효과 비용 -5':''].filter(Boolean).join(' · ')||'없음'};
}
export function recipeCheck(car,id,draft){
 const old=car.arsenal[id],stats=compileWeapon(car,id,draft),errors=[...stats.errors];
 if(!old.enabled||!draft.enabled)errors.push('먼저 슬롯 해금 필요');
 for(const layer of LAYERS){const next=draft.modules[layer];if(next!==old.modules[layer]&&next&& !['normal','none'].includes(next)&&!(car.moduleStock[next]>0))errors.push(`${MODULES[next]?.name||next} 보유 수량 없음`);}
 if(draft.level<old.level||draft.capacity<old.capacity)errors.push('강화 수치 감소 불가');
 if(draft.level-old.level>car.tuningPoints)errors.push('튜닝권 부족');
 if((draft.capacity-old.capacity)%15!==0||(draft.capacity-old.capacity)/15>car.capacityKits)errors.push('용량 확장권 부족');
 return {...stats,errors,valid:!errors.length};
}
export function commitRecipe(car,id,draft,{confirmed=false,revision=draft?.revision}={}){
 const stats=recipeCheck(car,id,draft);if(!confirmed)return {ok:false,reason:'변경 확인 필요'};
 if(revision!==car.arsenal[id].revision)return {ok:false,reason:'슬롯이 변경되었습니다. 다시 미리보기하세요.'};
 if(!stats.valid)return {ok:false,reason:stats.errors.join(' · ')};
 const old=car.arsenal[id];for(const layer of LAYERS){const next=draft.modules[layer];if(next!==old.modules[layer]&&next&&!['normal','none'].includes(next))car.moduleStock[next]--;}
 car.tuningPoints-=draft.level-old.level;car.capacityKits-=(draft.capacity-old.capacity)/15;
 car.arsenal[id]=structuredClone({...draft,revision:old.revision+1});
 if(id==='roof')car.gun=draft.level;
 car.cooldowns[id]=0;return {ok:true};
}
export function unlockSlot(car,id,pattern='single'){
 const slot=car.arsenal[id];if(!slot.enabled){slot.enabled=true;slot.modules.pattern=pattern;}else slot.level=Math.min(20,slot.level+1);slot.revision++;
}
export function angleDelta(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
export function aimFor(car,id,target,stats=compileWeapon(car,id)){
 const slot=SLOT_DEFS[id],ox=car.x+slot.x*Math.cos(car.angle)-slot.y*Math.sin(car.angle),oy=car.y+slot.x*Math.sin(car.angle)+slot.y*Math.cos(car.angle);
 const desired=Math.atan2(target.y-oy,target.x-ox),center=car.angle+slot.direction;
 const half=Math.max(0,slot.arc/2-stats.spread/2);
 return slot.arc>=Math.PI*2?desired:center+Math.max(-half,Math.min(half,angleDelta(desired,center)));
}
export function withinArc(car,id,target,stats=compileWeapon(car,id)){
 const slot=SLOT_DEFS[id],ox=car.x+slot.x*Math.cos(car.angle)-slot.y*Math.sin(car.angle),oy=car.y+slot.x*Math.sin(car.angle)+slot.y*Math.cos(car.angle);return slot.arc>=Math.PI*2||Math.abs(angleDelta(Math.atan2(target.y-oy,target.x-ox),car.angle+slot.direction))<=Math.max(0,slot.arc/2-stats.spread/2);
}
export function statText(s){return `LV.${s.level} · 탄환 피해 ${s.damage.toFixed(2)} · 초당 ${s.rate.toFixed(2)}회 / 간격 ${s.interval.toFixed(3)}초 · 사거리 ${s.range} · 관통 ${s.pierce} · 도탄 ${s.bounces} · ${s.pellets}발 / 확산 ${(s.spread*180/Math.PI).toFixed(1)}°`;}
export function comparisonText(a,b){return `피해 ${a.damage.toFixed(2)} → ${b.damage.toFixed(2)} · 간격 ${a.interval.toFixed(3)} → ${b.interval.toFixed(3)}초 · 사거리 ${a.range} → ${b.range} · 탄환 ${a.pellets} → ${b.pellets} · 관통 ${a.pierce} → ${b.pierce} · 도탄 ${a.bounces} → ${b.bounces} · 용량 ${a.cost}/${a.capacity} → ${b.cost}/${b.capacity}`;}
