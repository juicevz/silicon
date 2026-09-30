import * as THREE from '../../frontend/node_modules/three/build/three.module.js';
import { RoomEnvironment } from '../../frontend/node_modules/three/examples/jsm/environments/RoomEnvironment.js';
import { createHardware } from '../../frontend/src/components/hardwareModels';

const host=document.getElementById('hardware')!;
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(540,330);renderer.setPixelRatio(1.5);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
host.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();
scene.environment=pmrem.fromScene(room,.03).texture;room.dispose();scene.environmentIntensity=1.7;
scene.add(new THREE.HemisphereLight(0xfffbff,0x3e3445,2.2));
const key=new THREE.DirectionalLight(0xffffff,3.8);key.position.set(-3,7,8);scene.add(key);
const fill=new THREE.DirectionalLight(0xe4d9ef,2.4);fill.position.set(5,4,-3);scene.add(fill);
const rim=new THREE.DirectionalLight(0xffe5ee,1.9);rim.position.set(-5,0,-2);scene.add(rim);
const camera=new THREE.OrthographicCamera(-4.6,4.6,2.81,-2.81,.1,60);camera.position.set(4,6,8);camera.lookAt(0,0,0);
const gpu=createHardware('h100');gpu.scale.setScalar(.98);scene.add(gpu);
const paths=Array.from({length:6},(_,i)=>document.getElementById('flow'+i) as unknown as SVGPathElement);
const pulses=Array.from({length:6},(_,i)=>document.getElementById('pulse'+i)!);
const TAU=Math.PI*2;
function frame(t:number){
  const phase=t/8*TAU;
  gpu.rotation.set(.03*Math.sin(phase),-.28+.15*Math.sin(phase),-.09+.04*Math.cos(phase));
  gpu.position.y=.08*Math.sin(phase);
  renderer.render(scene,camera);
  document.getElementById('gpu-shadow')!.style.opacity=String(.78-.11*Math.sin(phase));
  document.getElementById('reference')!.style.transform=`translateY(${Math.sin(phase+.5)*3}px) rotate(-7deg)`;
  for(let i=0;i<6;i++){
    const p=((t/2+(i<5?i*.14:0))%1+1)%1;
    const pt=paths[i].getPointAtLength(paths[i].getTotalLength()*p);
    pulses[i].setAttribute('cx',String(pt.x));pulses[i].setAttribute('cy',String(pt.y));
    pulses[i].setAttribute('opacity',String(Math.sin(Math.PI*p)*.95));
  }
  const result=3.8+2*Math.sin(phase-.35);
  const points=[];
  for(let i=0;i<=60;i++){
    const x=i/60*285;const u=i/60;
    const move=result*u+Math.sin(u*TAU*1.5)*.6*Math.sin(u*Math.PI);
    points.push([x,107-move*14]);
  }
  const d=points.map((p,i)=>(i?'L':'M')+p.map(n=>n.toFixed(2)).join(' ')).join(' ');
  document.getElementById('chartline')!.setAttribute('d',d);
  document.getElementById('chartarea')!.setAttribute('d',d+' L285 116 L0 116 Z');
  const last=points.at(-1)!;document.getElementById('chartdot')!.setAttribute('cx',String(last[0]));document.getElementById('chartdot')!.setAttribute('cy',String(last[1]));
  document.getElementById('payout')!.textContent=result.toFixed(1);
}
(window as any).renderFrame=frame;
await document.fonts.ready;frame(0);(window as any).mediaReady=true;
if(!location.search.includes('capture')){
  const start=performance.now();const loop=()=>{frame((performance.now()-start)/1000);requestAnimationFrame(loop)};requestAnimationFrame(loop);
}
