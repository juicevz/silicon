import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createHardware as createAccelerator } from "./hardwareModels";
import { HARDWARE, type HardwareId } from "./hardwareCatalog";
export { HARDWARE, type HardwareId } from "./hardwareCatalog";
export { disposeHardware } from "./hardwareModels";

/** Product-form illustrations, including passive, compact, blower and GeForce
 * silhouettes. Shared accelerator detail is preserved for the server families. */
export function createHardware(id: HardwareId) {
  const spec = HARDWARE.find(value => value.id === id)!;
  if (!["blower", "dual-fan", "flow-through"].includes(spec.form)) {
    const base = spec.form === "package" ? "b200" : ["h100", "h200", "l40s", "l40", "rtx-pro-6000"].includes(id) ? "h100" : "a100";
    const root = createAccelerator(base, spec.name);
    if (spec.form === "compact") root.scale.set(.64, .65, .62);
    if (spec.form === "slim") root.scale.set(1, .55, .9);
    root.userData.hardwareId = id;
    return root;
  }
  const root = new THREE.Group();
  const metal = (color: number, roughness = .32) => new THREE.MeshStandardMaterial({ color, roughness, metalness: .85 });
  const dark = metal(0x1e2224, .43), edge = metal(0xb1b5af, .26), fin = metal(0x6c7677, .40);
  const shell = metal(id === "rtx-a6000" ? 0x828c82 : 0xa28d60, .30);
  const gold = metal(0xc8ad60), pcb = new THREE.MeshStandardMaterial({ color: 0x143c2b, roughness: .65 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, radius = 0) => {
    const mesh = new THREE.Mesh(radius ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const blower = spec.form === "blower";
  box(5.95, .1, 2.25, 0, -.28, 0, pcb, .025);
  box(6.10, .85, 2.42, 0, .16, 0, dark, .07);
  for (const z of [-1.17, 1.17]) box(6.08, .09, .13, 0, .63, z, edge, .025);
  for (const x of [-3, 3]) box(.12, .88, 2.4, x, .18, 0, edge, .025);
  for (let i = 0; i < 65; i++) box(.032, .68, 2.20, -2.87 + i * .089, .20, 0, fin);
  const fan = (at: number, radius: number) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .055, 8, 56), edge);
    ring.rotation.x = -Math.PI / 2; ring.position.set(at, .70, 0); root.add(ring);
    const well = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .025, 48), dark);
    well.position.set(at, .66, 0); root.add(well);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * .22, radius * .22, .065, 32), edge);
    hub.position.set(at, .73, 0); root.add(hub);
    for (let i = 0; i < (blower ? 25 : 11); i++) {
      const angle = i / (blower ? 25 : 11) * Math.PI * 2;
      const blade = box(radius * .70, .032, radius * .17, at + Math.cos(angle) * radius * .52, .716, Math.sin(angle) * radius * .52, dark, .035);
      blade.rotation.y = -angle + .38;
    }
  };
  const label = (x: number, text: string, width: number) => {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 192;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "600 87px Arial"; ctx.fillStyle = blower ? "#17201b" : "#deddd3"; ctx.textAlign = "center"; ctx.fillText(text, 512, 125);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: .5 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * .1875), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .731, .03); root.add(mesh);
  };
  if (blower) {
    box(3.94, .075, 2.28, -.87, .675, 0, shell, .045);
    fan(2.10, .81); label(-.8, spec.name, 2.95);
  } else {
    fan(-1.76, 1.03);
    if (spec.form === "dual-fan") fan(1.76, 1.03);
    else label(1.56, "GEFORCE RTX", 2.05);
    for (const angle of [-.55, .55]) { const cross = box(.10, .06, 2.75, 0, .71, 0, edge, .018); cross.rotation.y = angle; }
    for (let i = 0; i < 60; i++) box(.02, .59, .018, -2.86 + i * .097, .19, 1.216, fin);
  }
  for (let i = 0; i < 52; i++) if (i !== 12) box(.043, .012, .25, -1.97 + i * .063, -.19, 1.36, gold);
  box(.09, 1.05, 2.75, -3.15, .16, 0, edge, .025);
  for (let i = 0; i < 4; i++) box(.02, .16, .31, -3.206, .13, -.84 + i * .55, dark, .012);
  for (const x of [-2.84, 2.84]) for (const z of [-1.02, 1.02]) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(.042, .04, .025, 16), edge); screw.position.set(x, .71, z); root.add(screw);
    box(.05, .009, .009, x, .73, z, dark);
  }
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const mesh of root.children.slice()) {
    if (!(mesh instanceof THREE.Mesh) || (mesh.material as THREE.Material).transparent) continue;
    mesh.updateMatrix();
    const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix);
    const mat = mesh.material as THREE.Material;
    batches.set(mat, [...batches.get(mat) ?? [], g]); mesh.geometry.dispose(); root.remove(mesh);
  }
  for (const [mat, geometries] of batches) {
    const merged = mergeGeometries(geometries); if (merged) root.add(new THREE.Mesh(merged, mat));
    geometries.forEach(g => g.dispose());
  }
  root.userData.hardwareId = id;
  return root;
}
