import {chromium} from 'playwright-core';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.TEST_URL||'http://127.0.0.1:5173'}/?test=1`);
 await page.getByRole('button',{name:'엔진 시동'}).click();
 const snapshot=()=>page.evaluate(()=>__deadshift.snapshot());
 // Real input and normal enemy spawning for 22 seconds. No positions, HP or kills altered.
 await page.keyboard.down('w');const started=Date.now();let levels=0;
 while(Date.now()-started<22000){await page.waitForTimeout(200);const s=await snapshot();if(s.state==='levelup'){await page.locator('.card').first().click();if((await snapshot()).state==='equipment')await page.keyboard.press('Escape');levels++;await page.keyboard.up('w');await page.keyboard.down('w');}else assert.equal(s.state,'playing','natural road driving remains playable');}
 await page.keyboard.up('w');const road=await snapshot();
 assert.ok(Math.abs(road.car.y)>2700,'drives far beyond old boundary');assert.equal(road.metrics.obstacleDamage,0,'road is not an obstacle course');assert.ok(road.kills>0,'normal combat happens while driving');assert.ok(Math.abs(road.car.y-road.camera.y)>5&&Math.abs(road.car.y-road.camera.y)<180,'camera follows with smooth lookahead');
 console.log('Natural 22s road:',JSON.stringify({distance:Math.abs(road.car.y),hp:road.car.hp,kills:road.kills,levels,metrics:road.metrics,cameraLag:road.car.y-road.camera.y}));
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/expanded-world.png',fullPage:true});
 await page.evaluate(()=>__deadshift.setScenario('road'));await page.keyboard.down('w');await page.waitForTimeout(1200);const turnStart=await snapshot();await page.keyboard.down('d');await page.waitForTimeout(800);await page.keyboard.up('d');await page.keyboard.up('w');const turned=await snapshot();assert.ok(turned.car.angle>turnStart.car.angle+.4,'real steering input changes heading at speed');assert.ok(Math.abs(turned.car.x-turnStart.car.x)>20,'steering changes world path');
 // Controlled collision cases exercise actual game update/render paths with browser input.
 for(const [name,key] of [['light','brokenLight'],['medium','brokenMedium']]){
  await page.evaluate(n=>__deadshift.setScenario(n),name);const before=(await snapshot()).metrics[key];await page.keyboard.down('w');await page.waitForTimeout(650);await page.keyboard.up('w');const s=await snapshot();assert.ok(s.metrics[key]>before,`${name} breaks in game`);assert.ok(s.car.x>400,'car actually crosses destroyed prop');assert.ok(s.car.hp>90);
 }
 await page.evaluate(()=>__deadshift.setScenario('wall'));await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.up('w');const wall=await snapshot();assert.ok(wall.car.hp<95,'fast building impact damages car');assert.ok(wall.car.x<350,'fixed building stops car');
 await page.keyboard.down('s');await page.waitForTimeout(1600);await page.keyboard.up('s');assert.ok((await snapshot()).car.x<wall.car.x-20,'reverse escapes contact instead of sticking');
 assert.deepEqual(errors,[]);console.log('Driving browser PASS: long road, combat, camera, light and medium breakthrough, fixed crash, reverse recovery.');
}finally{await browser.close();}
