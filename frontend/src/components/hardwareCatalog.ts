// Shared visual metadata; the market list never imports Three.js.
export const HARDWARE = [
  { id: "h100", market: "h100-sxm", name: "H100", form: "passive", description: "NVIDIA H100 PCIe accelerator" },
  { id: "a100", market: "a100-80", name: "A100", form: "passive", description: "NVIDIA A100 PCIe accelerator" },
  { id: "b200", market: "b200", name: "B200", form: "package", description: "NVIDIA B200 Blackwell package" },
  { id: "h200", market: "h200", name: "H200", form: "passive", description: "NVIDIA H200 NVL accelerator" },
  { id: "b300", market: "b300", name: "B300", form: "package", description: "NVIDIA B300 Blackwell Ultra package" },
  { id: "l40s", market: "l40s", name: "L40S", form: "passive", description: "NVIDIA L40S accelerator" },
  { id: "l40", market: "l40", name: "L40", form: "passive", description: "NVIDIA L40 accelerator" },
  { id: "l4", market: "l4", name: "L4", form: "compact", description: "NVIDIA L4 compact accelerator" },
  { id: "a10", market: "a10", name: "A10", form: "slim", description: "NVIDIA A10 single-slot accelerator" },
  { id: "t4", market: "t4", name: "T4", form: "compact", description: "NVIDIA T4 compact accelerator" },
  { id: "rtx-pro-6000", market: "rtx-pro-6000", name: "RTX PRO 6000", form: "passive", description: "NVIDIA RTX PRO 6000 Blackwell Server Edition" },
  { id: "rtx-6000-ada", market: "rtx-6000-ada", name: "RTX 6000 Ada", form: "blower", description: "NVIDIA RTX 6000 Ada workstation GPU" },
  { id: "rtx-a6000", market: "rtx-a6000", name: "RTX A6000", form: "blower", description: "NVIDIA RTX A6000 workstation GPU" },
  { id: "rtx-5090", market: "rtx-5090", name: "RTX 5090", form: "dual-fan", description: "NVIDIA GeForce RTX 5090 graphics card" },
  { id: "rtx-4090", market: "rtx-4090", name: "RTX 4090", form: "flow-through", description: "NVIDIA GeForce RTX 4090 graphics card" },
  { id: "a100-40", market: "a100-40", name: "A100 40GB", form: "passive", description: "NVIDIA A100 40GB PCIe accelerator" },
] as const;
export type HardwareId = typeof HARDWARE[number]["id"];
export const hardwareForMarket = (market: string) => HARDWARE.find(value => value.market === market) ?? HARDWARE[0];
const renderName = (id: HardwareId) => id === "rtx-5090" || id === "rtx-4090" ? `${id}-v2` : id;
export const hardwarePoster = (id: HardwareId) => `/assets/hardware/catalog-${renderName(id)}.webp`;
export const hardwareThumbnail = (id: HardwareId) => `/assets/hardware/thumb-${renderName(id)}.webp`;
