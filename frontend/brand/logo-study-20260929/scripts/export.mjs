import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const concepts=JSON.parse(fs.readFileSync(path.join(root,'src/concepts.json')));
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const checks=[];
for(const concept of concepts){
 const masterPath=path.join(root,'public',concept.master);let source=fs.readFileSync(masterPath,'utf8');
 // Recalculate from source every time: generate.mjs must precede this command.
 await page.setContent(source.replace('<path','<path'));
 const bbox=await page.locator('svg').evaluate(svg=>{const b=svg.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});
 const pad=concept.id==='10'?19.5:0;
 const scale=320/Math.max(bbox.width+pad*2,bbox.height+pad*2);
 const tx=256-scale*(bbox.x+bbox.width/2),ty=256-scale*(bbox.y+bbox.height/2);
 for(const variant of ['master','ink','light']){
  const file=path.join(root,`public/marks/silicon-${concept.id}-${variant}.svg`);
  let svg=fs.readFileSync(file,'utf8');
  svg=svg.replace('</title>','</title><g transform="translate('+tx.toFixed(5)+' '+ty.toFixed(5)+') scale('+scale.toFixed(7)+')">').replace('</svg>','</g></svg>');
  fs.writeFileSync(file,svg);
  for(const size of variant==='master'?[2048,256,32,16]:[2048]){
   const result=await page.evaluate(async({svg,size})=>{const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,size,size);ctx.drawImage(img,0,0,size,size);const rgba=ctx.getImageData(0,0,size,size).data;let opaque=0,transparent=0,minX=size,minY=size,maxX=0,maxY=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const a=rgba[(y*size+x)*4+3];if(a){opaque++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}else transparent++;}return {png:canvas.toDataURL('image/png').split(',')[1],opaque,transparent,bounds:[minX,minY,maxX,maxY]};},{svg,size});
   fs.writeFileSync(path.join(root,`public/marks/silicon-${concept.id}-${variant}-${size}.png`),Buffer.from(result.png,'base64'));
   const check={id:concept.id,variant,size,opaque:result.opaque,transparent:result.transparent,bounds:result.bounds};checks.push(check);
   if(result.transparent===0||result.opaque===0||result.bounds[0]===0||result.bounds[1]===0||result.bounds[2]===size-1||result.bounds[3]===size-1)throw new Error('Transparency or margin check failed: '+JSON.stringify(check));
  }
 }
}
fs.writeFileSync(path.join(root,'public/export-checks.json'),JSON.stringify({date:'2026-09-29',masterArtboard:512,maximumSymbolExtent:320,checks},null,2));
await browser.close();console.log(`Exported ${checks.length} transparent PNGs. Alpha and margins passed for every file.`);
