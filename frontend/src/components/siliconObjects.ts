import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";

function waferTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
  for (const [stop, color] of [[0,"#ccd5ee"],[.27,"#4d72a6"],[.5,"#bca6c6"],[.72,"#658e9f"],[1,"#d8c7af"]] as const) gradient.addColorStop(stop, color);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 1024);
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
    ctx.strokeStyle = "rgba(22,44,66,.7)"; ctx.lineWidth = 2; ctx.strokeRect(a*64+2,b*64+2,60,60);
    ctx.strokeStyle = "rgba(219,238,255,.6)"; ctx.lineWidth = 1; ctx.strokeRect(a*64+7,b*64+7,50,50);
    ctx.fillStyle = "rgba(47,76,99,.2)"; ctx.fillRect(a*64+15,b*64+14,33,25);
    ctx.fillStyle = "rgba(231,239,247,.22)";
    for (let i = 0; i < 4; i++) ctx.fillRect(a*64+15,b*64+43+i*3,33,1);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSiliconObjects(stage: THREE.Group) {
  const materials = {
    chrome: new THREE.MeshPhysicalMaterial({ color:0xe2d8f4,metalness:1,roughness:.13,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.5 }),
    crystal: new THREE.MeshPhysicalMaterial({ color:0x97aacf,metalness:.96,roughness:.17,clearcoat:1,iridescence:.8,iridescenceIOR:1.3 }),
    wafer: new THREE.MeshPhysicalMaterial({ map:waferTexture(),metalness:.78,roughness:.25,clearcoat:1,iridescence:.55,iridescenceIOR:1.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color:0xb8a6e2,metalness:.2,roughness:.12,clearcoat:1,transparent:true,opacity:.68,side:THREE.DoubleSide,iridescence:.5 }),
    dark: new THREE.MeshStandardMaterial({ color:0x30444b,metalness:.7,roughness:.3 }),
    copper: new THREE.MeshStandardMaterial({ color:0xc89462,metalness:.9,roughness:.23 }),
    orange: new THREE.MeshStandardMaterial({ color:0xee7c44,emissive:0xc04c12,emissiveIntensity:.3,metalness:.6,roughness:.25 }),
  };
  const wafer = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(1.36,1.36,.075,96),[materials.chrome,materials.wafer,materials.chrome]);
  disk.rotation.x = Math.PI/2; wafer.add(disk);
  const notch = new THREE.Mesh(new THREE.BoxGeometry(.11,.13,.09),materials.dark);
  notch.position.set(0,-1.33,.02); wafer.add(notch);
  wafer.rotation.set(-.25,-.43,-.24); wafer.position.set(-.35,.3,0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02,.08,16,96),materials.chrome);
  ring.rotation.set(.55,-.62,-.32); ring.position.set(1.52,.54,-.48);
  const points = [[-.8,-.5,-.2],[-.5,.9,.1],[.1,1.05,-.2],[.7,.7,0],[.6,-.4,.35],[.05,-.85,.3],[-.5,-.7,.25],[-.3,.5,.65],[.35,.25,.75],[.65,-.2,-.3],[.1,-.7,-.55],[-.4,.6,-.55]].map(([x,y,z]) => new THREE.Vector3(x,y,z));
  const shard = new THREE.Mesh(new ConvexGeometry(points),materials.crystal);
  shard.position.set(-1.62,-1.06,.28); shard.scale.setScalar(.57); shard.rotation.set(.2,.7,-.25);
  const chip = new THREE.Group();
  chip.add(new THREE.Mesh(new RoundedBoxGeometry(1.23,.17,1.18,3,.045),materials.dark));
  const frame = new THREE.Mesh(new RoundedBoxGeometry(1.1,.08,1.05,3,.035),materials.copper);
  frame.position.y = .11; chip.add(frame);
  const die = new THREE.Mesh(new RoundedBoxGeometry(.8,.06,.8,3,.018),materials.wafer);
  die.position.y = .18; chip.add(die);
  for (let i = 0; i < 12; i++) for (const side of [-1,1]) {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(.035,.025,.15),materials.copper);
    pin.position.set((i-5.5)*.087,-.015,side*.64); chip.add(pin);
    const second = pin.clone(); second.rotation.y = Math.PI/2;
    second.position.set(side*.67,-.015,(i-5.5)*.085); chip.add(second);
  }
  chip.rotation.set(.55,.28,.24); chip.position.set(1.3,-1.27,.55); chip.scale.setScalar(.75);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.19,32,24),materials.chrome);
  ball.position.set(-1.7,1.65,.2);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(.095,24,16),materials.orange);
  bead.position.set(1.8,-.35,1);
  const glass = new THREE.Mesh(new THREE.TorusGeometry(.38,.065,12,64),materials.glass);
  glass.position.set(.25,-1.8,-.1); glass.rotation.set(.8,.2,.1);
  const pieces = [wafer,ring,shard,chip,ball,bead,glass].map((mesh,index) => {
    stage.add(mesh);
    return { mesh, position:mesh.position.clone(), rotation:mesh.rotation.clone(), phase:index*.8 };
  });
  const colors = [
    [materials.chrome,0xe2d8f4,0xc5d3e0], [materials.crystal,0x97aacf,0x536977],
    [materials.glass,0xb8a6e2,0x99c2d5], [materials.dark,0x30444b,0x232e34],
  ] as const;
  const palettes = colors.map(([material,light,dark]) => ({ material,light:new THREE.Color(light),dark:new THREE.Color(dark) }));
  return { pieces, shade(blend: number) {
    palettes.forEach(({material,light,dark}) => material.color.copy(light).lerp(dark,blend));
    materials.crystal.iridescence = .8 - .48*blend;
  } };
}
