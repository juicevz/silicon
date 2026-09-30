import { chromium } from '../../frontend/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const frames=path.join(here,'frames');await mkdir(frames,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-web-security']});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('file://'+here+'/animation.html?capture',{waitUntil:'load'});
await page.waitForFunction(()=>window.mediaReady===true,{timeout:60000});
const metrics=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,fonts:document.fonts.status}));
if(metrics.width!==1600||metrics.height!==900||errors.length)throw new Error(JSON.stringify({metrics,errors}));
await page.evaluate(()=>window.renderFrame(2));
await page.screenshot({path:path.join(here,'silicon-compute-preview.png')});
console.log(JSON.stringify({preview:true,metrics,errors}));
if(!process.argv.includes('--preview')){
  for(let i=0;i<200;i++){
    await page.evaluate(t=>window.renderFrame(t),i/25);
    await page.screenshot({path:path.join(frames,String(i).padStart(4,'0')+'.png')});
    if(i%25===0)console.log(`rendered ${i}/200 frames`);
  }
}
await browser.close();
