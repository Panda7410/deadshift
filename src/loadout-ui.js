import {SLOT_DEFS,MODULES,LAYERS,FALLBACK,compileWeapon,moduleCost,recipeCheck,commitRecipe,statText,comparisonText} from './weapons.js';
import {applyUpgrade,upgrades} from './core.js';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const labels={pattern:'발사 방식',ammo:'탄환 특성',effect:'부가 효과'};
export function upgradePreview(car,u){
 const next=structuredClone(car);applyUpgrade(next,u.id);
 if(u.id.startsWith('module_')){const id=u.id.slice(7);return `보유 ${car.moduleStock[id]||0} → ${next.moduleStock[id]} · 비용 ${moduleCost(car,id)} · 장착은 별도 확인`;}
 if(u.id==='tuning')return `튜닝권 ${car.tuningPoints} → ${next.tuningPoints} · 선택 슬롯 레벨 강화 시 모든 수치 미리보기`;
 if(u.id==='capacity')return `확장권 ${car.capacityKits} → ${next.capacityKits} · 선택 슬롯 용량 +15 (별도 확인)`;
 const changed=Object.keys(SLOT_DEFS).filter(id=>['damage','interval','range','pellets','pierce','bounces','cost','capacity'].some(k=>compileWeapon(car,id)[k]!==compileWeapon(next,id)[k]));
 if(changed.length)return changed.map(id=>`${SLOT_DEFS[id].name}: ${comparisonText(compileWeapon(car,id),compileWeapon(next,id))}`).join('<br>');
 return `출력 ${(car.engine*100).toFixed(0)} → ${(next.engine*100).toFixed(0)}% · 중량 ${car.mass} → ${next.mass}kg · 충각 ${car.ram.toFixed(2)} → ${next.ram.toFixed(2)} · 장갑 ${car.armor} → ${next.armor} · HP ${Math.ceil(car.hp)}/${car.maxHp} → ${Math.ceil(next.hp)}/${next.maxHp}${u.unique?' · '+u.description:''}`;
}
function statsHtml(car,id,recipe){const s=compileWeapon(car,id,recipe);return `<div class="weapon-stats" data-weapon="${id}" data-stat-damage="${s.damage}" data-stat-rate="${s.rate}" data-stat-range="${s.range}"><b>${SLOT_DEFS[id].name} / ${s.name} ${recipe.enabled?'':'(잠김)'}</b><p>${statText(s)}</p><p>발사각 ${(s.arc*180/Math.PI).toFixed(0)}° · 초당 탄환 ${(s.rate*s.pellets).toFixed(2)}발 · ${LAYERS.map(k=>MODULES[recipe.modules[k]]?.name||'비움').join(' + ')}</p><small>${s.effects.join(' · ')}<br>시너지: ${s.synergy}</small></div>`;}
export function loadoutMenu({car,root,show,onClose,initialSlot='roof',pendingModule=null}){
 let id=initialSlot,draft=structuredClone(car.arsenal[id]),message='',confirming=false;
 if(pendingModule)draft.modules[MODULES[pendingModule].layer]=pendingModule;
 function render(){
  confirming=false;const old=car.arsenal[id],before=compileWeapon(car,id),after=recipeCheck(car,id,draft),dirty=JSON.stringify({...draft,revision:0})!==JSON.stringify({...old,revision:0});
  show(`<div class="bench-content"><span class="eyebrow">MODULAR ARMORY / 전투 일시 정지</span><h2>당신만의 기괴한 머신.</h2><p>${pendingModule?'획득: '+MODULES[pendingModule].name+' · ':''}장착 전 미리보기입니다. 확인 전 기존 장비는 바뀌지 않습니다.</p><div class="slot-tabs">${Object.keys(SLOT_DEFS).map(slot=>`<button class="quiet ${slot===id?'active':''}" data-slot="${slot}" aria-pressed="${slot===id}">${SLOT_DEFS[slot].name} ${car.arsenal[slot].enabled?'':'/ 잠김'}</button>`).join('')}</div>
  <div class="bench-grid"><section><h3>${SLOT_DEFS[id].name} 무기 조합</h3><p id="capacityText" class="capacity ${after.valid?'':'invalid'}">조합 용량 ${after.cost} / ${after.capacity} · LV.${draft.level}</p>${LAYERS.map(layer=>`<div class="module-layer"><h4>${labels[layer]}</h4><div>${Object.entries(MODULES).filter(([,m])=>m.layer===layer).map(([mid,m])=>{const available=['normal','none'].includes(mid)||mid===old.modules[layer]||(car.moduleStock[mid]||0)>0;return `<button class="module-option ${draft.modules[layer]===mid?'active':''}" data-module="${mid}" ${available&&old.enabled?'':'disabled'}><b>${m.name} <span>${moduleCost(car,mid)}</span></b><small>${m.description}</small><small>${mid===old.modules[layer]?'장착 중': ['normal','none'].includes(mid)?'기본 / 무료':`보유 ${car.moduleStock[mid]||0}`}</small></button>`;}).join('')}<button class="quiet" data-remove="${layer}" ${old.enabled?'':'disabled'}>이 계층 비우기</button></div></div>`).join('')}</section>
  <section><h3>변경 전 → 변경 후</h3><p id="recipeComparison">${comparisonText(before,after)}</p>${statsHtml(car,id,draft)}<p class="invalid" id="recipeErrors">${after.errors.map(esc).join('<br>')}</p><p>현재 모듈: ${LAYERS.map(k=>`${MODULES[draft.modules[k]]?.name||'비움'} (${after.costs[k]})`).join(' + ')}</p><p>교체·제거한 기존 모듈은 소멸합니다. 취소 시 보유 모듈과 장비는 유지됩니다.</p><div class="bench-actions"><button id="tuneSlot" class="quiet" ${old.enabled&&draft.level<20&&draft.level-old.level<car.tuningPoints?'':'disabled'}>무기 레벨 +1 / 튜닝권 ${car.tuningPoints-(draft.level-old.level)}</button><button id="expandSlot" class="quiet" ${old.enabled&&draft.capacity<300&&(draft.capacity-old.capacity)/15<car.capacityKits?'':'disabled'}>용량 +15 / 확장권 ${car.capacityKits-(draft.capacity-old.capacity)/15}</button><button id="prepareCraft" class="primary" ${after.valid&&dirty?'':'disabled'}>변경 확인으로 →</button><button id="resetDraft" class="quiet">미리보기 취소</button><button id="closeLoadout" class="quiet">돌아가기 / ESC</button></div><p role="status">${esc(message)}</p></section></div>
  <details open><summary>현재 장착된 모든 무기 / 차량 정보</summary>${Object.keys(SLOT_DEFS).map(slot=>statsHtml(car,slot,car.arsenal[slot])).join('')}<p>엔진 슬롯 / 출력 Lv.${1+Math.round((car.engine-1)/.35)}: 기본 ${(car.engine*100).toFixed(0)}%, 버프 포함 ${(car.engine*(car.effects.fuel>0?1.4:1)*(car.combo>0?1.18:1)*100).toFixed(0)}% · 중량 ${car.mass}kg · 전방 범퍼 Lv.${1+Math.round((car.ram-1)/.3)} / 충각 ×${car.ram.toFixed(2)} · 차체 장갑 Lv.${car.armor/2} / 방어 ${car.armor} · 내구도 ${Math.ceil(car.hp)}/${car.maxHp}<br>유물: ${Object.keys(car.relics).map(id=>upgrades.find(u=>u.id===id)?.name||id).join(' · ')||'없음'} · 강화탄 ${car.powerShot.toFixed(1)}초 · 충각 표식 ${car.markTime.toFixed(1)}초<br>표시 수치는 반올림하며 계산은 원본 수치를 사용합니다. 연사 수는 발사 회수, 초당 탄환은 산탄 수를 포함합니다.</p></details></div>`);
  root.classList.add('workbench-mode');
  root.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{id=b.dataset.slot;draft=structuredClone(car.arsenal[id]);message='미적용 미리보기만 취소했습니다.';render();});
  root.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>{const mid=b.dataset.module;draft.modules[MODULES[mid].layer]=mid;render();root.querySelector(`[data-module="${mid}"]`)?.focus();});
  root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{draft.modules[b.dataset.remove]=FALLBACK[b.dataset.remove];render();});
  root.querySelector('#tuneSlot').onclick=()=>{draft.level++;render();};root.querySelector('#expandSlot').onclick=()=>{draft.capacity+=15;render();};
  root.querySelector('#resetDraft').onclick=()=>{draft=structuredClone(car.arsenal[id]);message='기존 무기를 유지했습니다.';render();};
  root.querySelector('#closeLoadout').onclick=onClose;root.querySelector('#prepareCraft').onclick=confirm;
 }
 function confirm(){
  const stats=recipeCheck(car,id,draft);if(!stats.valid){message=stats.errors.join(' · ');render();return;}
  confirming=true;const destroyed=LAYERS.filter(k=>car.arsenal[id].modules[k]!==draft.modules[k]).map(k=>MODULES[car.arsenal[id].modules[k]]?.name).filter(Boolean);
  show(`<span class="eyebrow">CONFIRM MODIFICATION</span><h2>이 조합을 적용할까요?</h2><p>${SLOT_DEFS[id].name}: ${comparisonText(compileWeapon(car,id),stats)}</p><p>소멸: ${destroyed.join(' · ')||'없음'}<br>새 모듈·튜닝권·확장권은 적용할 때만 소비됩니다.</p><button id="confirmCraft" class="primary">확인하고 적용</button><button id="cancelCraft" class="quiet">취소 / ESC</button>`);
  root.querySelector('#cancelCraft').onclick=render;
  root.querySelector('#confirmCraft').onclick=()=>{const result=commitRecipe(car,id,draft,{confirmed:true,revision:draft.revision});message=result.ok?'장착 완료. 기존 모듈은 반환되지 않습니다.':result.reason;draft=structuredClone(car.arsenal[id]);render();};
 }
 render();return {back(){if(confirming)render();else onClose();}};
}
