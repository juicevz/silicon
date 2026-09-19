import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import nvidiaMark from "../../public/assets/nvidia.svg?raw";

export const HARDWARE = [
  { id: "h100", name: "H100", description: "NVIDIA H100 PCIe accelerator" },
  { id: "a100", name: "A100", description: "NVIDIA A100 PCIe accelerator" },
  { id: "b200", name: "B200", description: "NVIDIA B200 Blackwell package" },
] as const;
export type HardwareId = typeof HARDWARE[number]["id"];

// Product-form studies based on NVIDIA's H100 PCIe brief, A100 and Blackwell
// product imagery. These are hand-built visualization meshes, not NVIDIA CAD.
export function createHardware(id: HardwareId, displayName: string = id.toUpperCase()) {
  const root = new THREE.Group();
  const metal = (color: number, roughness = 0.32, metalness = 0.86) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mats = {
    shell: metal(id === "h100" ? 0xa28b59 : 0x989fa5, 0.26),
    edge: metal(id === "h100" ? 0xd9c797 : 0xd5dbdf, 0.21),
    black: metal(0x171918, 0.45, 0.5),
    fin: metal(0x737c75, 0.39),
    pcb: metal(0x123d2b, 0.67, 0.1),
    gold: metal(0xc8ad60, 0.32),
    chip: metal(0x222722, 0.32, 0.55),
    die: metal(0x8a9d75, 0.16, 0.9),
    ceramic: metal(0x8a7356, 0.65, 0.25),
    solder: metal(0xb8c4c2, 0.25, 0.88),
    trace: metal(0x567443, 0.6, 0.38),
    memory: metal(0x4c5656, 0.32, 0.55),
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, bevel = 0) => {
    const geometry = bevel ? new RoundedBoxGeometry(w, h, d, 2, bevel) : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  const screw = (x: number, y: number, z: number, radius = 0.048) => {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.45, radius * 1.45, 0.007, 16), mats.black);
    seat.position.set(x, y - .008, z);
    root.add(seat);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * .9, 0.024, 16), mats.edge);
    mesh.position.set(x, y, z);
    root.add(mesh);
    box(radius * 1.3, 0.008, 0.012, x, y + 0.015, z, mats.black);
    box(0.012, 0.008, radius * 1.3, x, y + 0.015, z, mats.black);
  };
  const component = (x: number, y: number, z: number, wide = false) => {
    const width = wide ? .13 : .064;
    box(width, .035, .045, x, y, z, mats.ceramic);
    for (const side of [-1, 1]) box(.014, .038, .049, x + side * width / 2, y, z, mats.solder);
  };
  const via = (x: number, y: number, z: number) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(.024, .024, .002, 8), mats.gold);
    ring.position.set(x, y, z); root.add(ring);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .003, 8), mats.black);
    hole.position.set(x, y + .002, z); root.add(hole);
  };
  const texture = (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    draw(canvas.getContext("2d")!);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  };
  // Very fine brushed-metal grooves, kept in a shared texture rather than
  // thousands of extra triangles. Directional light catches the entire cover.
  const brushed = texture(1024, 512, (ctx) => {
    ctx.fillStyle = "#888888"; ctx.fillRect(0, 0, 1024, 512);
    for (let row = 0; row < 512; row++) {
      const shade = 98 + ((row * 37 + row * row * 13) % 61);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(0, row, 1024, 1);
    }
  });
  brushed.colorSpace = THREE.NoColorSpace;
  mats.shell.bumpMap = brushed;
  mats.shell.bumpScale = .012;
  mats.shell.roughnessMap = brushed;
  mats.edge.bumpMap = brushed;
  mats.edge.bumpScale = .003;
  const label = (text: string, width: number, depth: number, x: number, y: number, z: number, light = true) => {
    const map = texture(1024, 192, (ctx) => {
      ctx.fillStyle = light ? "#e6e3d4" : "#232720";
      ctx.font = "bold 100px Arial, sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const path = nvidiaMark.match(/ d="([^"]+)"/)?.[1];
      if (text.startsWith("NVIDIA") && path) {
        ctx.save(); ctx.translate(20, 50); ctx.scale(4, 4); ctx.fill(new Path2D(path)); ctx.restore();
        ctx.fillText(text, 145, 105);
      } else ctx.fillText(text, 24, 105);
    });
    const material = new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.6, metalness: 0.1, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    root.add(mesh);
  };
  if (id !== "b200") {
    // Full-length passive PCIe accelerator: broad metal shroud, exposed cooling
    // fins, back bracket and edge fingers. No consumer-card fans or video ports.
    box(6.1, 0.075, 2.48, 0, -0.13, 0, mats.pcb, 0.018);
    box(6.08, 0.075, 2.42, 0, -0.205, 0, mats.black, 0.018);
    box(5.92, 0.74, 2.26, 0, 0.25, 0, mats.black, 0.035);
    box(6.06, 0.06, 1.94, 0, 0.65, 0.19, mats.shell, 0.022);
    box(6.07, 0.075, 0.27, 0, 0.65, -1.15, mats.black, 0.018);
    box(6.04, 0.63, 0.045, 0, 0.30, 1.16, mats.shell, 0.015);
    box(6.08, 0.045, 0.055, 0, 0.64, 1.20, mats.edge, 0.012);
    box(6.08, 0.05, 0.05, 0, -0.01, 1.20, mats.edge, 0.008);
    // Folded metal lips and recessed panel channels catch a different highlight
    // from the broad cover. The narrow grooves keep the product silhouette intact.
    for (const z of [-.63, .92]) {
      box(5.86, .006, .027, 0, .684, z, mats.black);
      box(5.84, .012, .014, 0, .687, z + .027, mats.edge);
    }
    for (const x of [-2.80, 2.78]) {
      box(.18, .026, 1.39, x, .693, .16, mats.shell, .009);
      for (const z of [-.48, .77]) screw(x, .72, z, .035);
    }
    // Several thinner copper layers remain visible along the exposed PCB edge.
    for (let layer = 0; layer < 4; layer++)
      box(6.07, .006, 2.47, 0, -.16 + layer * .013, 0, layer % 2 ? mats.pcb : mats.trace);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 28; i++) {
      const x = -2.85 + i * .206;
      const z = -1.20 + row * 2.48;
      component(x, -.067, z, i % 5 === 0);
      if (i % 3 === 0) via(x + .078, -.087, z - .07);
      box(.008, .003, .13, x, -.088, z - .05, mats.trace);
    }
    // Stepped folded edges, corner seats and exposed PCB components add depth
    // at the silhouette while the main product form remains easy to read.
    for (const z of [-1.03, 1.035]) {
      box(5.98, .025, .045, 0, .681, z, mats.edge, .008);
      box(5.92, .012, .014, 0, .68, z - .042, mats.black);
    }
    for (let i = 0; i < 24; i++) {
      const x = -2.86 + i * .244;
      box(.074, .046, .05, x, -.063, 1.225, mats.chip, .006);
      box(.018, .032, .052, x - .045, -.069, 1.225, mats.edge);
      box(.018, .032, .052, x + .045, -.069, 1.225, mats.edge);
      box(.006, .002, .09, x, -.09, 1.30, mats.gold);
    }
    // Open, finely spaced heatsink fins running across the long edge.
    for (let i = 0; i < 103; i++) {
      const x = -2.98 + i * 0.058;
      box(0.025, 0.67, 0.55, x, 0.30, -0.75, mats.edge);
      box(.011, .024, .54, x, .648, -.75, mats.fin);
    }
    for (const x of [-2.42, -1.14, .14, 1.42, 2.70])
      box(.032, .016, .58, x, .664, -.75, mats.shell);
    // Slight panel seam and recessed fasteners keep surfaces readable in motion.
    box(0.012, 0.006, 1.91, -1.94, 0.683, 0.19, mats.fin);
    box(0.012, 0.006, 1.91, 2.29, 0.683, 0.19, mats.fin);
    for (const x of [-2.89, -1.96, 2.29, 2.88]) {
      screw(x, 0.688, 1.035, 0.042);
      screw(x, 0.697, -1.15, 0.032);
    }
    // Gold PCIe contact fingers with the keyed gap, on the exposed green PCB.
    for (const [start, count] of [[-2.02, 11], [-1.24, 42]]) {
      box(count * 0.064, 0.063, 0.32, start + count * 0.032, -0.135, 1.33, mats.pcb);
      for (let i = 0; i < count; i++)
        box(0.042, 0.01, 0.24, start + i * 0.064, -0.098, 1.39, mats.gold);
    }
    // Ventilated full-height bracket, built with real openings.
    const shape = new THREE.Shape();
    shape.moveTo(-1.32, -0.30); shape.lineTo(1.32, -0.30);
    shape.lineTo(1.32, 0.84); shape.lineTo(-1.32, 0.84); shape.closePath();
    for (let i = 0; i < 16; i++) {
      const x = -1.14 + i * 0.145;
      const hole = new THREE.Path();
      hole.moveTo(x, -0.1); hole.lineTo(x, 0.64);
      hole.lineTo(x + 0.083, 0.64); hole.lineTo(x + 0.083, -0.1); hole.closePath();
      shape.holes.push(hole);
    }
    const bracket = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false }), mats.black);
    bracket.rotation.y = Math.PI / 2; bracket.position.x = -3.13;
    root.add(bracket);
    box(0.35, 0.065, 0.22, -3.26, 0.79, -1.27, mats.black, 0.015);
    box(0.14, 0.065, 0.22, -3.11, -0.33, 1.25, mats.black, 0.01);
    box(0.24, 0.35, 0.72, 3.02, 0.23, -0.73, mats.black, 0.025);
    // Recessed auxiliary power socket with individual contacts and a latch.
    box(.25, .40, .88, 3.01, .22, -.69, mats.black, .018);
    box(.27, .08, .22, 3.01, .445, -.69, mats.chip, .012);
    for (let row = 0; row < 2; row++) for (let pin = 0; pin < 4; pin++) {
      box(.01, .10, .12, 3.143, .115 + row * .19, -.995 + pin * .19, mats.chip);
      box(.017, .037, .043, 3.154, .115 + row * .19, -.995 + pin * .19, mats.gold);
    }
    for (let i = 0; i < 28; i++)
      box(0.023, 0.59, 0.027, 3.02, 0.26, -0.33 + i * 0.051, mats.fin);
    for (const y of [.03, .57]) box(.035, .018, 1.68, 3.047, y, .42, mats.edge);
    for (let x = 0; x < 2; x++) for (let z = 0; z < 4; z++)
      box(0.022, 0.062, 0.068, 3.15, 0.13 + x * 0.14, -0.99 + z * 0.16, mats.fin);
    label(`NVIDIA ${displayName}`, 1.68, 0.27, 1.97, 0.694, -1.15);
    label(id.toUpperCase(), 0.46, 0.16, -2.64, 0.693, -1.15);
    // Product marking on the broad cover is a decal, not interface microcopy.
    label(`NVIDIA ${displayName}`, 2.10, 0.38, 0.20, 0.689, 0.23, false);
    const sticker = texture(512, 128, (ctx) => {
      ctx.fillStyle = "#bbbba8"; ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = "#323a34";
      for (let i = 0; i < 90; i++) ctx.fillRect(15 + i * 5.3, 13, (i * 13 % 3) + 1, 66);
      ctx.font = "18px monospace"; ctx.fillText(`${id.toUpperCase()}  /  PCIe ACCELERATOR`, 18, 109);
    });
    const stickerMesh = new THREE.Mesh(new THREE.PlaneGeometry(.65, .16), new THREE.MeshStandardMaterial({ map: sticker, roughness: .8 }));
    stickerMesh.rotation.x = -Math.PI / 2; stickerMesh.position.set(-2.35, .691, .59); root.add(stickerMesh);
    // Underside memory packages and solder pads are visible during pointer tilt.
    for (const x of [-2.2, -1.35, -.5, .35, 1.2, 2.05]) {
      box(.55, .044, .48, x, -.258, -.39, mats.memory, .012);
      for (let pin = 0; pin < 7; pin++) for (const z of [-.67, -.11])
        box(.023, .022, .061, x - .22 + pin * .073, -.244, z, mats.solder);
    }
  } else {
    // Blackwell's dual-die package has a square substrate, gold border and
    // eight HBM blocks, rather than an invented B200 PCIe graphics card.
    box(3.90, 0.12, 3.64, 0, 0.04, 0, mats.black, 0.025);
    box(3.83, 0.08, 3.57, 0, -0.07, 0, mats.pcb, 0.025);
    for (const x of [-1.86, 1.86]) box(0.13, 0.055, 3.62, x, 0.128, 0, mats.gold);
    for (const z of [-1.74, 1.74]) box(3.62, 0.055, 0.13, 0, 0.128, z, mats.gold);
    box(2.62, 0.085, 2.95, 0, 0.13, 0, mats.chip, 0.02);
    const diePattern = texture(1024, 1536, (ctx) => {
      ctx.fillStyle = "#708675"; ctx.fillRect(0, 0, 1024, 1536);
      for (let row = 0; row < 24; row++) for (let col = 0; col < 12; col++) {
        const x = 14 + col * 83, y = 14 + row * 63;
        ctx.fillStyle = ["#97a891", "#657972", "#b3ad87", "#536d65"][(row * 7 + col * 3) % 4];
        ctx.fillRect(x, y, 73, 53);
        ctx.fillStyle = "#c4c7a0";
        for (let trace = 0; trace < 9; trace++) ctx.fillRect(x + 4 + trace * 7, y + 4, 1, 43);
        ctx.strokeStyle = "#354e47"; ctx.strokeRect(x + 2, y + 2, 69, 49);
      }
      ctx.fillStyle = "#b0b991";
      for (const x of [246, 502, 758]) ctx.fillRect(x, 0, 8, 1536);
    });
    mats.die.map = diePattern;
    for (const x of [-0.60, 0.60]) {
      box(1.15, 0.045, 1.57, x, 0.199, 0, mats.die, 0.005);
      for (const z of [-1.20, 1.20]) for (const dx of [-0.28, 0.28]) {
        box(0.53, 0.058, 0.57, x + dx, 0.208, z, mats.memory, 0.006);
        box(.49, .006, .53, x + dx, .24, z, mats.shell, .004);
        for (let row = 0; row < 3; row++)
          box(.24, .003, .006, x + dx, .245, z - .05 + row * .045, mats.fin);
      }
    }
    for (const s of [-1, 1]) for (let i = 0; i < 32; i++) {
      box(0.12, 0.035, 0.055, s * 1.53, 0.132, -1.5 + i * 0.097, mats.gold);
      box(0.05, 0.055, 0.034, s * 1.68, 0.133, -1.5 + i * 0.097, mats.fin);
      box(0.19, 0.004, 0.008, s * 1.41, 0.105, -1.47 + i * 0.096, mats.fin);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 26; i++) {
      const x = -1.55 + i * .122;
      component(x, .15, side * 1.55);
      box(.009, .003, .19, x, .135, side * 1.40, mats.trace);
      if (i % 2 === 0) via(x, .141, side * 1.66);
    }
    for (let i = 0; i < 12; i++) {
      box(.005, .003, 1.44, -.043 + i * .0078, .227, 0, mats.gold);
    }
    for (const x of [-1.69, 1.69]) for (const z of [-1.57, 1.57]) screw(x, 0.15, z, 0.035);
    label(`NVIDIA ${displayName}`, 0.91, 0.13, 1.24, 0.164, 1.74, false);
  }
  // Consolidate static hardware by material. Product complexity should not
  // become hundreds of draw calls, including during a model transition.
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.children.slice().forEach((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material;
    if (material.transparent) return;
    object.updateMatrix();
    const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(object.matrix);
    batches.set(material, [...(batches.get(material) ?? []), geometry]);
    object.geometry.dispose(); root.remove(object);
  });
  batches.forEach((geometries, material) => {
    const merged = mergeGeometries(geometries);
    if (merged) root.add(new THREE.Mesh(merged, material));
    geometries.forEach((geometry) => geometry.dispose());
  });
  root.userData.hardwareId = id;
  return root;
}

export function disposeHardware(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach((material) => materials.add(material));
    }
  });
  materials.forEach((material) => {
    if (material instanceof THREE.MeshStandardMaterial) { material.map?.dispose(); material.bumpMap?.dispose(); material.roughnessMap?.dispose(); }
    material.dispose();
  });
}
