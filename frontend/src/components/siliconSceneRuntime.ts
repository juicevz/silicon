import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { LandingMotion } from "../landingMotion";
import { advanceSpring, SILICON_MOTION_RANGE, SILICON_MOTION_SPEED, type Spring } from "../siliconMotion";
import { createHardware, disposeHardware, type HardwareId } from "./catalogHardwareModels";
import { createSiliconObjects } from "./siliconObjects";

export type SceneKind = "objects" | "gpu";
export type SceneStatus = "loading" | "webgl" | "poster";
export type SceneHandle = { prepare: (id: HardwareId) => void };
type Options = {
  kind: SceneKind;
  selected: HardwareId;
  paused: () => boolean;
  status: (status: SceneStatus) => void;
};

export function mountSiliconScene(el: HTMLDivElement, motion: LandingMotion, options: Options) {
  let renderer: THREE.WebGLRenderer;
  const fallback = { prepare: (_id: HardwareId) => {}, select: (_id: HardwareId) => {}, dispose: () => {} };
  try { renderer = new THREE.WebGLRenderer({ alpha:true,antialias:true,powerPreference:"high-performance" }); }
  catch { options.status("poster"); return fallback; }
  const gl = renderer.getContext(), debug = gl.getExtension("WEBGL_debug_renderer_info");
  const device = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "";
  if (/swiftshader|llvmpipe|softpipe|software rasterizer/i.test(device)) {
    renderer.dispose(); options.status("poster"); return fallback;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.25 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute("aria-hidden", "true");
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .03, .1, 100, { size:128 }); room.dispose();
  scene.environment = environment.texture; scene.environmentIntensity = 1.6;
  scene.add(new THREE.HemisphereLight(0xf2f7ff,0x354456,2));
  const key = new THREE.DirectionalLight(0xffffff,4); key.position.set(-4,7,6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xc7bbff,4); rim.position.set(4,2,-1); scene.add(rim);
  const warm = new THREE.DirectionalLight(0xffb787,1.9); warm.position.set(-3,-2,3); scene.add(warm);
  const camera = new THREE.OrthographicCamera(-3,3,3,-3,.1,100);
  const isGpu = options.kind === "gpu";
  camera.position.set(...(isGpu ? [4.5,5.6,8] : [0,0,12]) as [number,number,number]); camera.lookAt(0,0,0);
  const stage = new THREE.Group(); scene.add(stage);
  const objects = isGpu ? null : createSiliconObjects(stage);
  let gpu = isGpu ? createHardware(options.selected) : null;
  if (gpu) stage.add(gpu);
  const cache = new Map<HardwareId, THREE.Group>();
  if (gpu) cache.set(options.selected, gpu);
  const pending = new Map<HardwareId, Promise<THREE.Group>>();
  let disposed = false, failed = false, visible = false, initialized = false, starting = false, dirty = true;
  let displayed = options.selected, requested = options.selected, requestId = 0;
  let elapsed = 0, previousReduced = false;
  let blend = document.documentElement.dataset.siliconTheme === "dark" ? 1 : 0, themeTarget = blend;
  let targetX = 0, targetY = 0;
  const x: Spring = { value:0,velocity:0 }, y: Spring = { value:0,velocity:0 };
  const light = new THREE.Color(0xc7bbff), dark = new THREE.Color(0x91bfff);
  let swap: { mesh:THREE.Group; id:HardwareId; elapsed:number; changed:boolean; fromOpacity:number } | null = null;
  const shade = () => {
    renderer.toneMappingExposure = 1.22 + .28*blend;
    rim.color.copy(light).lerp(dark,blend); objects?.shade(blend);
  };
  shade();
  el.dataset.displayed = displayed;

  const size = () => {
    const width = el.clientWidth, height = el.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width,height,false);
    // Leave room for the full bracket at every pointer angle, including wide desktop frames.
    const aspect = width/height, span = isGpu ? Math.max(7.1,7.7/aspect) : Math.max(5,5.25/aspect);
    camera.left = -span*aspect/2; camera.right = span*aspect/2;
    camera.top = span/2; camera.bottom = -span/2; camera.updateProjectionMatrix(); dirty = true;
  };
  const initialize = async () => {
    if (starting || initialized || disposed || failed) return;
    starting = true;
    try {
      size(); await renderer.compileAsync(scene,camera);
      if (!disposed) { initialized = true; dirty = true; options.status("webgl"); }
    } catch { if (!disposed) { failed = true; options.status("poster"); } }
  };
  const resize = new ResizeObserver(size); resize.observe(el);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) { dirty = true; void initialize(); }
  }, { rootMargin:"100px" }); visibility.observe(el);
  const theme = new MutationObserver(() => {
    themeTarget = document.documentElement.dataset.siliconTheme === "dark" ? 1 : 0;
    if (!visible) { blend = themeTarget; shade(); }
    dirty = true;
  }); theme.observe(document.documentElement, { attributes:true,attributeFilter:["data-silicon-theme"] });
  const move = (event: PointerEvent) => {
    if (event.pointerType === "touch" || options.paused()) return;
    const rect = el.getBoundingClientRect();
    targetX = (event.clientX-rect.left)/rect.width*2-1;
    targetY = (event.clientY-rect.top)/rect.height*2-1;
  };
  const leave = () => { targetX = targetY = 0; };
  el.addEventListener("pointermove",move); el.addEventListener("pointerleave",leave);
  const lost = (event: Event) => { event.preventDefault(); failed = true; options.status("poster"); };
  const restored = () => { failed = false; dirty = true; options.status("webgl"); };
  renderer.domElement.addEventListener("webglcontextlost",lost);
  renderer.domElement.addEventListener("webglcontextrestored",restored);

  const prepare = (id: HardwareId): Promise<THREE.Group> => {
    const existing = cache.get(id); if (existing) return Promise.resolve(existing);
    const compiling = pending.get(id); if (compiling) return compiling;
    const mesh = createHardware(id);
    const task = renderer.compileAsync(mesh,camera,scene).then(() => {
      if (disposed) { disposeHardware(mesh); throw new Error("Scene unmounted"); }
      cache.set(id,mesh); return mesh;
    }, error => { disposeHardware(mesh); throw error; }).finally(() => pending.delete(id));
    pending.set(id,task); return task;
  };
  const select = async (id: HardwareId) => {
    if (!isGpu || disposed) return;
    requested = id; const request = ++requestId;
    if (displayed === id && !swap) return;
    try {
      const next = await prepare(id);
      if (disposed || request !== requestId) return;
      swap = { mesh:next,id,elapsed:0,changed:false,fromOpacity:Number(renderer.domElement.style.opacity || 1) };
      dirty = true;
    } catch { if (!disposed && request === requestId) { failed = true; options.status("poster"); } }
  };
  const unsubscribe = motion.subscribe(frame => {
    if (disposed || !visible || !initialized || failed) return;
    const oldX = x.value, oldY = y.value;
    if (frame.reduced !== previousReduced) { previousReduced = frame.reduced; dirty = true; }
    if (frame.reduced) { x.value = y.value = x.velocity = y.velocity = 0; }
    else if (!options.paused()) {
      advanceSpring(x,targetX,frame.delta); advanceSpring(y,targetY,frame.delta);
      elapsed += frame.delta*SILICON_MOTION_SPEED;
    }
    if (Math.abs(blend-themeTarget) > .0001) {
      blend += (themeTarget-blend)*(frame.reduced ? 1 : 1-Math.exp(-8*frame.delta)); shade(); dirty = true;
    }
    let arrival = 1;
    if (swap && gpu) {
      swap.elapsed += frame.delta;
      const out = .14/SILICON_MOTION_SPEED, inside = .34/SILICON_MOTION_SPEED;
      if (swap.elapsed < out && !frame.reduced) renderer.domElement.style.opacity = String(swap.fromOpacity*(1-(swap.elapsed/out)**2));
      else {
        if (!swap.changed) {
          stage.remove(gpu); gpu = swap.mesh; stage.add(gpu); swap.changed = true;
          displayed = swap.id; el.dataset.displayed = displayed;
        }
        const progress = frame.reduced ? 1 : Math.min(1,(swap.elapsed-out)/inside);
        arrival = 1-(1-progress)**3; renderer.domElement.style.opacity = String(arrival);
        if (progress >= 1) swap = null;
      }
      dirty = true;
    }
    if (isGpu) {
      stage.scale.setScalar(.97+.03*arrival); stage.position.y = -.12*(1-arrival);
      stage.rotation.set(.18+y.value*.09*SILICON_MOTION_RANGE,-.32+x.value*.17*SILICON_MOTION_RANGE,-.09);
    } else {
      stage.rotation.set(y.value*.055*SILICON_MOTION_RANGE,x.value*.1*SILICON_MOTION_RANGE,0);
      const time = frame.reduced ? 0 : elapsed;
      objects?.pieces.forEach(({mesh,position,rotation,phase}) => {
        mesh.position.x = position.x + Math.sin(time*.31+phase)*.03*SILICON_MOTION_RANGE;
        mesh.position.y = position.y + Math.sin(time*.48+phase)*.085*SILICON_MOTION_RANGE;
        mesh.position.z = position.z + Math.sin(time*.24+phase)*.025*SILICON_MOTION_RANGE;
        mesh.rotation.x = rotation.x + Math.sin(time*.26+phase)*.05*SILICON_MOTION_RANGE;
        mesh.rotation.y = rotation.y + Math.sin(time*.29+phase)*.09*SILICON_MOTION_RANGE;
        mesh.rotation.z = rotation.z + Math.sin(time*.22+phase)*.018*SILICON_MOTION_RANGE;
      });
    }
    if (dirty || (!isGpu && !frame.reduced && !options.paused()) || Math.abs(oldX-x.value)+Math.abs(oldY-y.value) > .000001) {
      renderer.render(scene,camera); dirty = false;
    }
  });
  return {
    prepare(id: HardwareId) { if (isGpu && !disposed && !failed) void prepare(id).catch(() => {}); },
    select(id: HardwareId) { if (id !== requested) void select(id); },
    dispose() {
      disposed = true; unsubscribe(); resize.disconnect(); visibility.disconnect(); theme.disconnect();
      el.removeEventListener("pointermove",move); el.removeEventListener("pointerleave",leave);
      renderer.domElement.removeEventListener("webglcontextlost",lost);
      renderer.domElement.removeEventListener("webglcontextrestored",restored);
      cache.forEach(mesh => disposeHardware(mesh)); if (objects) disposeHardware(stage);
      environment.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
