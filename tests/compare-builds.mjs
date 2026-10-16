import {chromium} from 'playwright-core';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(`${process.env.TEST_URL||'http://127.0.0.1:5173'}/?test=1`);
 const results=[];
 for(const seed of [7410,7411,7412])for(const build of ['none','ram','weapon','hybrid']){
  const r=await page.evaluate(({build,seed})=>__deadshift.simulate(build,210,seed),{build,seed});results.push({seed,...r});console.log(JSON.stringify({seed,build,time:r.time.toFixed(1),kills:r.kills,ram:r.metrics.ramKills,gun:r.metrics.gunKills,hp:r.hp.toFixed(0)}));
 }
 const summary=['none','ram','weapon','hybrid'].map(build=>{
  const rows=results.filter(r=>r.build===build),avg=fn=>rows.reduce((n,r)=>n+fn(r),0)/rows.length;
  return {build,survival:avg(r=>r.time),kills:avg(r=>r.kills),killsPerMinute:avg(r=>r.kills/r.time*60),speedKmh:avg(r=>r.meanSpeed*.36),lossPerRam:avg(r=>r.metrics.ramSpeedLoss/Math.max(1,r.metrics.ramHits)),enemyDamage:avg(r=>r.metrics.enemyDamage),hazardDamage:avg(r=>r.metrics.hazardDamage),obstacleDamage:avg(r=>r.metrics.obstacleDamage)};
 });
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/build-comparison.json',JSON.stringify({seeds:[7410,7411,7412],duration:210,method:'Actual fixed-step game update; straight W autopilot; predefined upgrade path on each level; baseline skips rewards. Not human survival balance. Same seeds, not identical encounters: movement and kills change procedural RNG consumption.',summary,results},null,2));console.table(summary);

}finally{await browser.close();}
