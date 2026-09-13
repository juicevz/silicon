import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** Stylized, original SXM models. These are interactive illustrations, not CAD. */
export default function Gpu({
  model = "h100-sxm",
  large = false,
}: {
  model?: string;
  large?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "low-power",
      });
    } catch {
      el.classList.add("gpu-fallback");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.06);
    scene.environment = environment.texture;
    room.dispose();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(5.7, 6.9, 6.8);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xd9d6ff, 0x293027, 3));
    const key = new THREE.DirectionalLight(0xffffff, 5);
    key.position.set(-4, 8, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(
      model === "b200" ? 0x7bc49c : model === "a100-80" ? 0xc6ac66 : 0xac96e7,
      7,
    );
    rim.position.set(4, 3, -3);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xc6ac66, 2);
    fill.position.set(-4, 1, -2);
    scene.add(fill);
    const board = new THREE.Group();
    scene.add(board);
    const pcb = new THREE.MeshStandardMaterial({
      color: model === "a100-80" ? 0x25352b : 0x202426,
      metalness: 0.55,
      roughness: 0.48,
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x1e2025,
      metalness: 0.55,
      roughness: 0.38,
    });
    const silver = new THREE.MeshStandardMaterial({
      color: 0xa3a4a6,
      metalness: 0.82,
      roughness: 0.3,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xb4a16b,
      metalness: 0.8,
      roughness: 0.28,
    });
    const silicon = new THREE.MeshStandardMaterial({
      color:
        model === "b200" ? 0x4b7969 : model === "a100-80" ? 0x8a7c51 : 0x8475a5,
      metalness: 0.84,
      roughness: 0.2,
    });
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
    ) => {
      const geometry =
        w > 0.4 && d > 0.3
          ? new RoundedBoxGeometry(w, h, d, 2, Math.min(h / 3, 0.025))
          : new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(x, y, z);
      board.add(mesh);
      return mesh;
    };
    box(4.15, 0.12, 3.65, 0, 0, 0, pcb);
    box(2.45, 0.12, 2.15, 0, 0.13, 0, silver);
    box(2.2, 0.08, 1.9, 0, 0.22, 0, black);
    if (model === "b200") {
      box(0.74, 0.09, 1.1, -0.41, 0.31, 0, silicon);
      box(0.74, 0.09, 1.1, 0.41, 0.31, 0, silicon);
    } else box(1.25, 0.09, 1.12, 0, 0.31, 0, silicon);
    for (let i = 0; i < 4; i++)
      for (const s of [-1, 1]) {
        box(0.49, 0.15, 0.34, -1.05 + i * 0.7, 0.14, s * 1.41, black);
        box(0.26, 0.12, 0.5, s * 1.65, 0.15, -0.9 + i * 0.6, black);
      }
    for (let x = 0; x < 12; x++)
      for (const s of [-1, 1]) {
        box(0.065, 0.055, 0.11, -1.35 + x * 0.245, 0.09, s * 1.72, gold);
      }
    for (let x = 0; x < 52; x++)
      box(0.034, 0.016, 0.18, -1.68 + x * 0.065, 0.069, 1.735, gold);
    for (let i = 0; i < 11; i++)
      for (const s of [-1, 1]) {
        box(0.011, 0.004, 0.29, -1.4 + i * 0.27, 0.066, s * 1.05, gold);
      }
    for (const x of [-1.86, 1.86])
      for (const z of [-1.6, 1.6]) {
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 0.06, 24),
          gold,
        );
        bolt.position.set(x, 0.08, z);
        board.add(bolt);
        const hole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 0.07, 20),
          black,
        );
        hole.position.set(x, 0.09, z);
        board.add(hole);
      }
    for (let i = 0; i < 30; i++) {
      const x = -1.72 + (i % 3) * 0.115,
        z = -0.86 + Math.floor(i / 3) * 0.18;
      box(0.065, 0.06, 0.09, x, 0.11, z, i % 3 === 0 ? silver : black);
    }
    board.rotation.y = -0.18;
    let tx = 0,
      ty = -0.18,
      frame = 0,
      visible = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const render = () => {
      frame = 0;
      if (!visible || document.hidden) return;
      board.rotation.x += (tx - board.rotation.x) * 0.09;
      board.rotation.y += (ty - board.rotation.y) * 0.09;
      renderer.render(scene, camera);
      if (
        Math.abs(tx - board.rotation.x) + Math.abs(ty - board.rotation.y) >
        0.0005
      )
        frame = requestAnimationFrame(render);
    };
    const requestRender = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    const move = (event: PointerEvent) => {
      if (reduced.matches) return;
      const r = el.getBoundingClientRect();
      tx = ((event.clientY - r.top) / r.height - 0.5) * 0.33;
      ty = -0.18 + ((event.clientX - r.left) / r.width - 0.5) * 0.5;
      requestRender();
    };
    const reset = () => {
      tx = 0;
      ty = -0.18;
      requestRender();
    };
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.position
        .set(5.7, 6.9, 6.8)
        .multiplyScalar(w / h < 1.2 ? 1.15 : 0.96);
      camera.updateProjectionMatrix();
      requestRender();
    });
    resize.observe(el);
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) requestRender();
    });
    observer.observe(el);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", reset);
    document.addEventListener("visibilitychange", requestRender);
    requestRender();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", reset);
      document.removeEventListener("visibilitychange", requestRender);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      [pcb, black, silver, gold, silicon].forEach((m) => m.dispose());
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [model]);
  return (
    <div
      ref={host}
      className={`gpu-model ${large ? "gpu-large" : ""}`}
      role="img"
      aria-label={`Interactive ${model === "h100-sxm" ? "H100" : model === "a100-80" ? "A100" : "B200"} GPU illustration`}
    />
  );
}
