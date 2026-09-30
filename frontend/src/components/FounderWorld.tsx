import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { LandingMotion } from "../landingMotion";

const waterVertex = `
  varying vec3 worldPosition;
  void main() {
    vec4 point = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      point = instanceMatrix * point;
    #endif
    vec4 world = modelMatrix * point;
    worldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const waterFragment = `
  uniform float time;
  uniform vec3 fogColor;
  uniform float depth;
  varying vec3 worldPosition;
  float wave(vec2 p) {
    return sin(p.x * 2.1 + p.y * 3.8 + time * .48) * .44
      + sin(p.x * 4.9 - p.y * 2.6 - time * .37) * .25
      + sin(p.x * 9.8 + p.y * 7.2 + time * .63) * .13;
  }
  void main() {
    vec2 p = worldPosition.xz;
    float dist = distance(cameraPosition, worldPosition);
    float fine = 1.0 - smoothstep(20.0, 100.0, dist);
    float ripple = wave(p * .7) + sin(p.x * 18.0 + p.y * 24.0 + time) * .09 * fine;
    vec3 ink = vec3(.095, .235, .365);
    vec3 pearl = vec3(.50, .70, .85);
    float reflection = smoothstep(-.7, .85, ripple);
    vec3 color = mix(ink, pearl, reflection * .77 + .16);
    float glint = pow(max(0.0, sin(p.x * 5.6 + p.y * 11.0 + ripple * 2.5)), 12.0);
    color += vec3(.20, .27, .31) * glint * .29 * fine;
    color *= depth;
    color = mix(color, fogColor, smoothstep(22.0, 135.0, dist));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Two instanced draws carry the checkerboard. Movement wraps by a complete pair of rows. */
export default function FounderWorld({ motion }: { motion: LandingMotion }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
    catch { el.dataset.renderer = "poster"; return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.25 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    el.append(renderer.domElement);
    const scene = new THREE.Scene();
    const fogColor = new THREE.Color("#adcae2");
    scene.fog = new THREE.Fog(fogColor, 24, 138);
    const camera = new THREE.PerspectiveCamera(52, 1, .1, 240);
    camera.position.set(0, 5.7, 11);
    camera.lookAt(0, -5.5, -47);

    const skyTexture = new THREE.TextureLoader().load("/assets/founder/checkerboard-world.png", () => { dirty = true; });
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: { picture: { value: skyTexture }, fogColor: { value: fogColor }, skyColor: { value: new THREE.Color("#8fb8dc") }, resolution: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `varying vec2 screenUV; void main() { screenUV = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
      fragmentShader: `uniform sampler2D picture; uniform vec3 fogColor; uniform vec3 skyColor; uniform vec2 resolution; varying vec2 screenUV;
        void main() {
          float aspect = resolution.x / resolution.y;
          float crop = min(1.0, aspect / 1.4);
          float skyY = .80 + (screenUV.y - .66) * 3.0 / aspect * crop;
          vec2 skyUV = vec2(.5 + (screenUV.x - .5) * crop, clamp(skyY, .78, 1.0));
          vec3 clouds = texture2D(picture, skyUV).rgb;
          vec3 base = mix(fogColor, skyColor, smoothstep(.65, 1.0, screenUV.y));
          float band = smoothstep(.79, .84, skyY) * (1.0 - smoothstep(.93, 1.0, skyY));
          vec3 color = mix(base, clouds, band * .92);
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    const skyGeometry = new THREE.PlaneGeometry(2, 2);
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

    const time = { value: 0 };
    const water = new THREE.ShaderMaterial({
      vertexShader: waterVertex, fragmentShader: waterFragment,
      uniforms: { time, fogColor: { value: fogColor }, depth: { value: 1 } },
    });
    const lowerWater = new THREE.ShaderMaterial({
      vertexShader: waterVertex, fragmentShader: waterFragment,
      uniforms: { time, fogColor: { value: fogColor }, depth: { value: .49 } },
    });
    const underside = new THREE.MeshBasicMaterial({ color: "#315979", fog: true });
    const width = 3.25, columns = 40, rows = 66;
    const count = columns * rows / 2;
    const boxGeometry = new THREE.BoxGeometry(width, 1.15, width);
    const tileGeometry = new THREE.PlaneGeometry(width - .025, width - .025);
    tileGeometry.rotateX(-Math.PI / 2);
    const blocks = new THREE.InstancedMesh(boxGeometry, underside, count);
    const tiles = new THREE.InstancedMesh(tileGeometry, water, count);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if ((row + column) % 2) continue;
        const x = (column - columns / 2) * width;
        const z = 23 - row * width;
        blocks.setMatrixAt(index, matrix.makeTranslation(x, -.575, z));
        tiles.setMatrixAt(index, matrix.makeTranslation(x, .006, z));
        index++;
      }
    }
    blocks.computeBoundingSphere(); tiles.computeBoundingSphere();
    const board = new THREE.Group(); board.add(blocks, tiles); scene.add(board);
    const bedGeometry = new THREE.PlaneGeometry(800, 800);
    bedGeometry.rotateX(-Math.PI / 2);
    const bed = new THREE.Mesh(bedGeometry, lowerWater); bed.position.y = -1.17; scene.add(bed);

    let visible = false, disposed = false, dirty = true, elapsed = 0, failed = false;
    let pointer = 0, blend = 0, lastFrame = 0;
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); skyMaterial.uniforms.resolution.value.set(w, h); dirty = true;
    };
    const sizes = new ResizeObserver(resize); sizes.observe(el); resize();
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; dirty = true; }, { rootMargin: "80px" });
    observer.observe(el);
    const contextLost = (event: Event) => { event.preventDefault(); failed = true; el.dataset.renderer = "poster"; };
    const contextRestored = () => { failed = false; dirty = true; };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    renderer.domElement.addEventListener("webglcontextrestored", contextRestored);
    const unsubscribe = motion.subscribe(frame => {
      if (disposed || failed || !visible || document.hidden) return;
      const moving = !frame.paused && !frame.reduced;
      if (!moving && !dirty) return;
      if (moving) elapsed += frame.delta;
      // Respect slower displays while retaining the shared, frame-rate-independent clock.
      if (!dirty && frame.time - lastFrame < 14) return;
      lastFrame = frame.time;
      if (moving) {
        const target = frame.pointerActive ? (frame.x / innerWidth - .5) * 2 : 0;
        pointer += (target - pointer) * (1 - Math.exp(-2.4 * frame.delta));
      }
      blend += ((moving ? pointer : 0) - blend) * .035;
      board.position.z = (elapsed * .94) % (width * 2);
      time.value = elapsed;
      camera.position.x = blend * .36;
      camera.lookAt(blend * .12, -5.5, -47);
      renderer.render(scene, camera);
      if (el.dataset.renderer !== "webgl") el.dataset.renderer = "webgl";
      dirty = false;
    });
    return () => {
      disposed = true; unsubscribe(); observer.disconnect(); sizes.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", contextRestored);
      [skyGeometry, boxGeometry, tileGeometry, bedGeometry].forEach(geometry => geometry.dispose());
      blocks.dispose(); tiles.dispose();
      [skyMaterial, water, lowerWater, underside].forEach(material => material.dispose());
      skyTexture.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [motion]);
  return <div ref={host} className="ambf-canvas" data-renderer="loading" />;
}
