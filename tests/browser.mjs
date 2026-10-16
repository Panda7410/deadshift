import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
 await page.goto(`${process.env.TEST_URL||'http://127.0.0.1:5173'}/?test=1`);await page.getByRole('button',{name:'엔진 시동'}).click();
 await page.keyboard.down('w');await page.waitForTimeout(1100);await page.keyboard.up('w');
 let s=await page.evaluate(()=>__deadshift.snapshot());assert.ok(s.car.y<-30,'keyboard changes world position');assert.ok(Math.hypot(s.car.vx,s.car.vy)>65);
 await page.keyboard.press('Escape');const t=(await page.evaluate(()=>__deadshift.snapshot())).time;await page.waitForTimeout(250);assert.equal((await page.evaluate(()=>__deadshift.snapshot())).time,t);
 await page.getByRole('button',{name:'주행 계속'}).click();await page.evaluate(()=>__deadshift.setScenario('collision'));await page.waitForTimeout(100);assert.ok((await page.evaluate(()=>__deadshift.snapshot())).kills>=1,'ram kill recorded');
 await page.evaluate(()=>__deadshift.setScenario('level'));await page.waitForFunction(()=>__deadshift.snapshot().state==='levelup');assert.equal(await page.locator('.card').count(),3);await page.locator('.card').first().click();if((await page.evaluate(()=>__deadshift.snapshot())).state==='equipment')await page.keyboard.press('Escape');assert.equal((await page.evaluate(()=>__deadshift.snapshot())).state,'playing');
 await page.evaluate(()=>__deadshift.setScenario('death'));await page.waitForFunction(()=>__deadshift.snapshot().state==='dead');assert.equal((await page.evaluate(()=>__deadshift.snapshot())).record.runs,1);
 await page.reload();assert.equal((await page.evaluate(()=>__deadshift.snapshot())).record.runs,1);await page.getByRole('button',{name:'엔진 시동'}).click();await page.evaluate(()=>__deadshift.setScenario('extract'));await page.waitForTimeout(300);assert.equal((await page.evaluate(()=>__deadshift.snapshot())).state,'playing','arrival does not auto-extract');await page.keyboard.press('e');await page.getByRole('button',{name:'계속 파밍하기'}).click();assert.equal((await page.evaluate(()=>__deadshift.snapshot())).state,'playing');await page.keyboard.press('e');await page.getByRole('button',{name:'지금 탈출'}).click();await page.waitForFunction(()=>__deadshift.snapshot().state==='won');assert.ok(await page.getByRole('heading',{name:'잿빛 구역 탈출.'}).isVisible());
 await page.getByRole('button',{name:'다시 출격'}).click();await page.waitForTimeout(900);await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/phase1-desktop.png',fullPage:true});
 await page.setViewportSize({width:800,height:1000});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);console.log('Browser PASS: input, pause, ram kill, level-up, death, saved reload, extraction, restart, responsive layout; no JS or HTTP errors.');
}finally{await browser.close();}
