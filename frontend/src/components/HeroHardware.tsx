import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { LandingMotion } from "../landingMotion";
import { hardwareTarget, type HardwareBounds } from "../hardwareMotion";
import { createHardware, disposeHardware, HARDWARE, type HardwareId } from "./catalogHardwareModels";

type Spring = { value: number; velocity: number };
import { hardwarePoster as posterUrl, hardwareThumbnail } from "./hardwareCatalog";
import frameBounds from "./hardwareFrameBounds.json";
import { HardwareCallout } from "./HardwareCallout";
/** Exact critically damped spring. Its response does not depend on refresh rate. */
function advance(spring: Spring, target: number, dt: number) {
  const frequency = 24;
  const displacement = spring.value - target;
  const impulse = spring.velocity + frequency * displacement;
  const decay = Math.exp(-frequency * dt);
  spring.value = target + (displacement + impulse * dt) * decay;
  spring.velocity = (spring.velocity - frequency * impulse * dt) * decay;
}

export default function HeroHardware({ motion }: { motion: LandingMotion }) {
  const host = useRef<HTMLDivElement>(null);
  const poster = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<HardwareId>("h100");
  const [visited, setVisited] = useState<Set<HardwareId>>(() => new Set(["h100"]));
  const requested = useRef<HardwareId>("h100");
  const choose = (id: HardwareId) => {
    requested.current = id;
    const image = new Image(); image.src = posterUrl(id);
    void image.decode().then(() => {
      if (requested.current !== id) return;
      setVisited(current => current.has(id) ? current : new Set([...current].slice(-1).concat(id)));
      setSelected(id);
    }).catch(() => { /* Keep the complete current card if the next asset fails. */ });
  };
  const selection = useRef<HardwareId>("h100");
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { selection.current = selected; }, [selected]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setFallback(true);
      setReady(true);
      return;
    }
    const gl = renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const device = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "";
    if (/swiftshader|llvmpipe|softpipe|software rasterizer/i.test(device)) {
      // Software WebGL blocks the main thread on every PBR frame. Reuse the
      // same pre-rendered meshes as compositor layers, keeping input responsive.
      renderer.dispose();
      setFallback(true);
      setReady(true);
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.13;
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.5 : 1.75));
    renderer.domElement.setAttribute("aria-hidden", "true");
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 128 });
    room.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = 1.15;
    const camera = new THREE.OrthographicCamera(-4.5, 4.5, 3, -3, 0.1, 50);
    camera.position.set(6.7, 7.1, 9.4);
    camera.lookAt(0, 0.05, 0);
    scene.add(new THREE.HemisphereLight(0xfff9ef, 0x263b42, 1.5));
    const key = new THREE.DirectionalLight(0xfff2dd, 4.2);
    key.position.set(-5, 9, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xd8eaff, 3.8);
    rim.position.set(3, 4, -5); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 1.0);
    fill.position.set(5, 2, 4); scene.add(fill);
    const stage = new THREE.Group();
    scene.add(stage);
    const models = [selection.current].map((id) => {
      const mesh = createHardware(id);
      mesh.visible = false;
      stage.add(mesh);
      return { id, mesh };
    });
    const prepared = new Set<HardwareId>([selection.current]);
    const preparing = new Set<HardwareId>();
    let disposed = false, visible = true, dirty = true, initialized = false, contextLost = false;
    let heroTop = 88, heroHeight = 650, dark = false;
    let previousScroll = -1, previousX = -1, previousY = -1;
    let displayed: HardwareId = selection.current;
    let transitionStart = -1;
    let changingTo: HardwareId = displayed;
    let transitionOpacity = 1;
    const x: Spring = { value: 0, velocity: 0 };
    const y: Spring = { value: 0, velocity: 0 };
    const cardBounds = new Map<HardwareId, HardwareBounds>();
    const measureCards = () => {
      const rect = el.getBoundingClientRect();
      const rotation = stage.rotation.clone(), position = stage.position.clone(), scale = stage.scale.clone();
      stage.rotation.set(.025, -.32, -.04); stage.position.set(0, -.04, 0); stage.scale.setScalar(1);
      stage.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      for (const { id, mesh } of models) {
        const box = new THREE.Box3().setFromObject(mesh);
        const projected = [];
        for (const a of [box.min.x, box.max.x]) for (const b of [box.min.y, box.max.y]) for (const c of [box.min.z, box.max.z]) {
          projected.push(new THREE.Vector3(a, b, c).project(camera));
        }
        const left = Math.min(...projected.map(p => p.x)), right = Math.max(...projected.map(p => p.x));
        const top = Math.max(...projected.map(p => p.y)), bottom = Math.min(...projected.map(p => p.y));
        cardBounds.set(id, { left: rect.left + (left + 1) / 2 * rect.width, top: rect.top + scrollY + (1 - top) / 2 * rect.height, width: (right - left) / 2 * rect.width, height: (top - bottom) / 2 * rect.height });
      }
      stage.rotation.copy(rotation); stage.position.copy(position); stage.scale.copy(scale);
    };
    const theme = () => {
      dark = document.documentElement.dataset.siliconTheme === "dark";
      renderer.toneMappingExposure = dark ? 1.26 : 1.13;
      scene.environmentIntensity = dark ? 1.35 : 1.15;
      dirty = true;
    };
    const themeObserver = new MutationObserver(theme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-silicon-theme"] });
    theme();
    const size = () => {
      const width = el.clientWidth, height = el.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const span = Math.max(5.1, 7.5 / aspect);
      camera.left = -span * aspect / 2; camera.right = span * aspect / 2;
      camera.top = span / 2; camera.bottom = -span / 2;
      camera.updateProjectionMatrix();
      measureCards();
      const section = el.closest<HTMLElement>(".compute-hero");
      if (section) {
        // Only layout changes need a measurement; no forced layout on pointer input.
        heroTop = section.getBoundingClientRect().top + window.scrollY;
        heroHeight = section.offsetHeight;
      }
      dirty = true;
    };
    const resize = new ResizeObserver(size);
    resize.observe(el);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) dirty = true;
    }, { rootMargin: "80px" });
    observer.observe(el);
    const lost = (event: Event) => { event.preventDefault(); contextLost = true; setFallback(true); };
    const restored = () => { contextLost = false; setFallback(false); dirty = true; };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    renderer.domElement.addEventListener("webglcontextrestored", restored);

    // Static previews are already available. Compile once, then draw the card;
    // avoid three extra renders and synchronous image encoding during page load.
    const initialize = async () => {
      stage.rotation.set(0.025, -0.32, -0.04);
      try {
        models.forEach(({ mesh }) => { mesh.visible = true; });
        await renderer.compileAsync(scene, camera);
        if (disposed) return;
        models.forEach(({ mesh }) => { mesh.visible = false; });
        models.forEach(({ id, mesh }) => { mesh.visible = id === displayed; });
        renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.5 : 1.75));
        size();
        stage.position.y = -.04;
        renderer.render(scene, camera);
        initialized = true;
        setReady(true);
      } catch {
        if (!disposed) { setFallback(true); setReady(true); }
      }
    };
    const prepare = async (id: HardwareId) => {
      if (prepared.has(id) || preparing.has(id)) return;
      preparing.add(id);
      const mesh = createHardware(id);
      // Compile only the requested model, in the same lighting environment.
      // Keep the previous card visible until the incoming model is ready.
      try {
        await renderer.compileAsync(mesh, camera, scene);
        if (disposed) { disposeHardware(mesh); return; }
        mesh.visible = false; stage.add(mesh); models.push({ id, mesh });
        prepared.add(id); measureCards(); dirty = true;
      } catch { disposeHardware(mesh); if (!disposed) setFallback(true); }
      finally { preparing.delete(id); }
    };
    const unsubscribe = motion.subscribe((frame) => {
      if (!visible || !initialized || disposed || contextLost) return;
      const target = hardwareTarget(frame, cardBounds.get(selection.current) ?? { left: 0, top: 0, width: 0, height: 0 });
      el.dataset.pointerActive = String(target.active);
      const targetX = target.x;
      const targetY = target.y;
      if (frame.reduced) { x.value = y.value = x.velocity = y.velocity = 0; }
      else { advance(x, targetX, frame.delta); advance(y, targetY, frame.delta); }
      const progress = frame.reduced ? 0 : THREE.MathUtils.clamp((frame.scroll - heroTop + 88) / Math.max(heroHeight, 600), 0, 1);
      if (!prepared.has(selection.current)) void prepare(selection.current);
      if (selection.current !== changingTo && prepared.has(selection.current)) {
        changingTo = selection.current;
        transitionOpacity = Number(renderer.domElement.style.opacity || 1);
        transitionStart = frame.time;
      }
      const transition = transitionStart < 0 || frame.reduced ? 1 : Math.min(1, (frame.time - transitionStart) / 400);
      if (transition >= 0.22 && displayed !== changingTo) {
        displayed = changingTo;
        models.forEach(({ id, mesh }) => { mesh.visible = id === displayed; });
        dirty = true;
      }
      // Fade the single canvas, not hundreds of overlapping metal surfaces.
      // This avoids transparency artifacts and material recompilation on switch.
      const entering = Math.max(0, (transition - .22) / .78);
      const arrive = 1 - Math.pow(1 - entering, 3);
      const opacity = transition < .22 ? transitionOpacity * (1 - transition / .22) : arrive;
      renderer.domElement.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      stage.rotation.set(0.025 + y.value * 0.14 + progress * 0.09, -0.32 + x.value * 0.22 + progress * 0.28 + (1 - arrive) * .035, -0.04 + x.value * 0.025);
      stage.position.set(x.value * 0.075, -0.04 - progress * 0.22 - (1 - arrive) * .09, 0);
      stage.scale.setScalar((1 - progress * 0.055) * (.975 + arrive * .025));
      if (dirty || transition < 1 || Math.abs(previousX - x.value) + Math.abs(previousY - y.value) + Math.abs(previousScroll - progress) > 0.00001) {
        renderer.render(scene, camera);
        previousX = x.value; previousY = y.value; previousScroll = progress; dirty = false;
      }
    });
    void initialize();
    return () => {
      disposed = true;
      unsubscribe(); resize.disconnect(); observer.disconnect(); themeObserver.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.removeEventListener("webglcontextrestored", restored);
      models.forEach(({ mesh }) => disposeHardware(mesh));
      environment.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [motion]);
  useEffect(() => {
    const el = poster.current;
    if (!fallback || !el) return;
    const landing = el.closest<HTMLElement>(".landing");
    if (landing) landing.dataset.renderTier = "lite";
    const x: Spring = { value: 0, velocity: 0 }, y: Spring = { value: 0, velocity: 0 };
    let top = 88, height = 650;
    let bounds: HardwareBounds = { left: 0, top: 0, width: 0, height: 0 };
    let measuredId = selection.current;
    let previousTransform = "";
    const measure = () => {
      const section = el.closest<HTMLElement>(".compute-hero");
      if (section) { top = section.getBoundingClientRect().top + scrollY; height = section.offsetHeight; }
      const rect = host.current?.getBoundingClientRect();
      if (rect) {
        const imageWidth = Math.min(rect.width, rect.height * 640 / 400), imageHeight = imageWidth * 440 / 640;
        const visible = frameBounds[selection.current];
        bounds = { left: rect.left + (rect.width - imageWidth) / 2 + imageWidth * visible.left, top: rect.top + scrollY + (rect.height - imageHeight) / 2 + imageHeight * visible.top, width: imageWidth * visible.width, height: imageHeight * visible.height };
      }
    };
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    const unsubscribe = motion.subscribe((frame) => {
      const progress = frame.reduced ? 0 : THREE.MathUtils.clamp((frame.scroll - top + 88) / Math.max(height, 600), 0, 1);
      if (measuredId !== selection.current) { measuredId = selection.current; measure(); }
      const target = hardwareTarget(frame, bounds);
      el.dataset.pointerActive = String(target.active);
      if (frame.reduced) x.value = y.value = x.velocity = y.velocity = 0;
      else { advance(x, target.x, frame.delta); advance(y, target.y, frame.delta); }
      const transform = `perspective(1000px) translate3d(${(x.value * 7).toFixed(3)}px,${(y.value * 4 - progress * 16).toFixed(3)}px,0) rotateX(${(-y.value * 5 + progress * 4).toFixed(3)}deg) rotateY(${(x.value * 7 + progress * 7).toFixed(3)}deg) scale(${(1 - progress * .055).toFixed(4)})`;
      if (transform !== previousTransform) { el.style.transform = transform; previousTransform = transform; }
    });
    return () => {
      unsubscribe(); resize.disconnect();
      if (landing) delete landing.dataset.renderTier;
    };
  }, [fallback, motion]);
  const hardware = HARDWARE.find(({ id }) => id === selected)!;
  return (
    <div className={`hardware-showcase ${ready ? "hardware-ready" : ""} ${fallback ? "hardware-fallback" : ""}`} data-renderer={fallback ? "poster" : "webgl"}>
      <div ref={host} className="hero-hardware-canvas" role="img" aria-hidden={fallback || undefined} aria-label={`Interactive 3D ${hardware.description}`} />
      <div ref={poster} className={`hardware-poster ${ready && !fallback ? "hardware-poster-loaded" : ""}`} role="img" aria-hidden={!fallback && ready || undefined} aria-label={hardware.description}>
        {HARDWARE.filter(({ id }) => visited.has(id)).map(({ id }) => <img key={id} className={id === selected ? "active" : ""} src={posterUrl(id)} alt="" aria-hidden="true" width="1600" height="1100" />)}
      </div>
      <div className="hardware-glow" aria-hidden="true" />
      <div className="hardware-shadow" aria-hidden="true" />
      <HardwareCallout hardware={hardware} />
      <div className="hardware-previews hardware-catalog-previews" aria-label="Hardware model" data-lenis-prevent>
        {HARDWARE.map(({ id, name, description }) => (
          <button key={id} type="button" aria-label={name} aria-pressed={selected === id} onClick={() => choose(id)} onPointerEnter={(event) => { if (event.pointerType === "mouse") choose(id); }} onFocus={() => choose(id)}>
            <img src={hardwareThumbnail(id)} alt="" aria-hidden="true" title={description} width="160" height="110" loading="lazy" decoding="async" />
            <span>{name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
