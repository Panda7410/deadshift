// One keyboard focus model for all overlays. Gameplay never receives overlay keys.
export function focusMenu(container){
 const controls=[...container.querySelectorAll('button,input')];
 controls.forEach(el=>el.addEventListener('focus',()=>{controls.forEach(c=>c.classList.toggle('selected',c===el));}));
 (container.querySelector('.primary,.card')||controls[0])?.focus({preventScroll:true});
}
export function menuKey(event,container){
 const controls=[...container.querySelectorAll('button,input')];if(!controls.length)return false;
 const k=event.key.toLowerCase(),active=document.activeElement,index=Math.max(0,controls.indexOf(active));
 if(active?.matches('input[type="range"]')&&['arrowleft','arrowright','a','d'].includes(k)){
  event.preventDefault();active.value=String(Math.max(0,Math.min(1,Number(active.value)+(['d','arrowright'].includes(k)?.05:-.05))));active.dispatchEvent(new Event('input',{bubbles:true}));return true;
 }
 if(['arrowright','arrowdown','d','s','arrowleft','arrowup','a','w'].includes(k)){
  event.preventDefault();const delta=['arrowright','arrowdown','d','s'].includes(k)?1:-1;controls[(index+delta+controls.length)%controls.length].focus({preventScroll:true});return true;
 }
 if(k==='enter'||k===' '){event.preventDefault();if(!event.repeat)controls[index].click();return true;}
 return false;
}
