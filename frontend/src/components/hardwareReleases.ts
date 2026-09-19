import type { HardwareId } from "./hardwareCatalog";

// GPU model release years. Sources are manufacturer announcements/availability,
// separate from the continuously refreshed rental quotes in the market feed.
const a100 = "https://nvidianews.nvidia.com/news/nvidia-doubles-down-announces-a100-80gb-gpu-supercharging-worlds-most-powerful-gpu-for-ai-supercomputing";
export const HARDWARE_RELEASES: Record<HardwareId, { year: number; source: string }> = {
  h100: { year: 2022, source: "https://nvidianews.nvidia.com/news/nvidia-announces-hopper-architecture-the-next-generation-of-accelerated-computing" },
  a100: { year: 2020, source: a100 },
  "a100-40": { year: 2020, source: a100 },
  b200: { year: 2024, source: "https://investor.nvidia.com/news/press-release-details/2024/NVIDIA-Blackwell-Platform-Arrives-to-Power-a-New-Era-of-Computing/" },
  h200: { year: 2024, source: "https://blogs.nvidia.com/blog/hopper-h200-nvl/" },
  b300: { year: 2025, source: "https://nvidianews.nvidia.com/news/nvidia-blackwell-ultra-ai-factory-platform-paves-way-for-age-of-ai-reasoning" },
  l40s: { year: 2023, source: "https://nvidianews.nvidia.com/news/nvidia-global-data-center-system-manufacturers-to-supercharge-generative-ai-and-industrial-digitalization" },
  l40: { year: 2022, source: "https://nvidianews.nvidia.com/news/nvidia-announces-ovx-computing-systems-the-graphics-and-simulation-foundation-for-the-metaverse-powered-by-ada-lovelace-gpu" },
  l4: { year: 2023, source: "https://investor.nvidia.com/news/press-release-details/2023/NVIDIA-Launches-Inference-Platforms-for-Large-Language-Models-and-Generative-AI-Workloads/default.aspx" },
  a10: { year: 2021, source: "https://nvidianews.nvidia.com/news/nvidia-sets-ai-inference-records-introduces-a30-and-a10-gpus-for-enterprise-servers" },
  t4: { year: 2018, source: "https://nvidianews.nvidia.com/news/new-nvidia-data-center-inference-platform-to-fuel-next-wave-of-ai-powered-services" },
  "rtx-pro-6000": { year: 2025, source: "https://blogs.nvidia.com/blog/rtx-pro-6000-blackwell-server-edition/" },
  "rtx-6000-ada": { year: 2022, source: "https://nvidianews.nvidia.com/news/nvidias-new-ada-lovelace-rtx-gpu-arrives-for-designers-and-creators" },
  "rtx-a6000": { year: 2020, source: "https://www.nvidia.com/en-us/geforce/news/december-2020-nvidia-studio-driver/" },
  "rtx-5090": { year: 2025, source: "https://www.nvidia.com/en-us/geforce/news/rtx-5090-5080-out-now/" },
  "rtx-4090": { year: 2022, source: "https://www.nvidia.com/en-us/geforce/news/geforce-rtx-4090-out-now/" },
};
