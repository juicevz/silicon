import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { LandingMotion } from "../landingMotion";
import { advanceSpring, SILICON_MOTION_RANGE, SILICON_MOTION_SPEED, type Spring } from "../siliconMotion";
import { HARDWARE, type HardwareId } from "./hardwareCatalog";
import { mountSiliconScene, type SceneHandle, type SceneKind, type SceneStatus } from "./siliconSceneRuntime";
import { SiliconPoster } from "./SiliconPoster";
export type { SceneHandle } from "./siliconSceneRuntime";


export default function SiliconScene({ kind, motion, paused, selected = "h100", ref }: {
  kind: SceneKind;
  motion: LandingMotion;
  paused: boolean;
  selected?: HardwareId;
  ref?: Ref<SceneHandle>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ paused, selected }); current.current = { paused, selected };
  const controller = useRef<ReturnType<typeof mountSiliconScene> | null>(null);
  const [status, setStatus] = useState<SceneStatus>("loading");
  useImperativeHandle(ref, () => ({ prepare(id) { controller.current?.prepare(id); } }), []);
  useEffect(() => {
    const el = host.current; if (!el) return;
    controller.current = mountSiliconScene(el,motion,{ kind,selected:current.current.selected,paused:() => current.current.paused,status:setStatus });
    return () => { controller.current?.dispose(); controller.current = null; };
  }, [kind,motion]);
  useEffect(() => { controller.current?.select(selected); }, [selected]);
  useEffect(() => {
    const element = host.current?.parentElement;
    const poster = element?.querySelector<HTMLElement>(".silicon-scene-poster");
    if (status !== "poster" || !element || !poster) return;
    const x: Spring = { value:0,velocity:0 }, y: Spring = { value:0,velocity:0 };
    let targetX = 0, targetY = 0, time = 0, visible = false, previous = "";
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || current.current.paused) return;
      const rect = element.getBoundingClientRect();
      targetX = (event.clientX-rect.left)/rect.width*2-1;
      targetY = (event.clientY-rect.top)/rect.height*2-1;
    };
    const leave = () => { targetX = targetY = 0; };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(element); element.addEventListener("pointermove",move); element.addEventListener("pointerleave",leave);
    const unsubscribe = motion.subscribe(frame => {
      if (!visible) return;
      if (frame.reduced) x.value = y.value = x.velocity = y.velocity = 0;
      else if (!current.current.paused) {
        advanceSpring(x,targetX,frame.delta); advanceSpring(y,targetY,frame.delta);
        time += frame.delta*SILICON_MOTION_SPEED;
      }
      const floating = kind === "objects" && !frame.reduced;
      const drift = floating ? Math.sin(time*.48)*8.5*SILICON_MOTION_RANGE : 0;
      const sway = floating ? Math.sin(time*.31)*3*SILICON_MOTION_RANGE : 0;
      const roll = floating ? Math.sin(time*.22)*.8 : 0;
      const transform = `perspective(1100px) translate3d(${(x.value*7*SILICON_MOTION_RANGE+sway).toFixed(3)}px,${(y.value*4*SILICON_MOTION_RANGE+drift).toFixed(3)}px,0) rotateX(${(-y.value*5*SILICON_MOTION_RANGE).toFixed(3)}deg) rotateY(${(x.value*7*SILICON_MOTION_RANGE).toFixed(3)}deg) rotateZ(${roll.toFixed(3)}deg)`;
      if (transform !== previous) { poster.style.transform = transform; previous = transform; }
    });
    return () => { unsubscribe(); observer.disconnect(); element.removeEventListener("pointermove",move); element.removeEventListener("pointerleave",leave); poster.style.removeProperty("transform"); };
  }, [status,kind,motion]);
  const label = kind === "objects" ? "Silicon wafer, crystal, chrome ring and chip in 3D" : `Interactive 3D ${HARDWARE.find(item => item.id === selected)?.description}`;
  return <div className="silicon-scene" data-kind={kind} data-renderer={status} role="img" aria-label={label}>
    <SiliconPoster kind={kind} selected={selected} />
    <div ref={host} className="silicon-canvas" />
  </div>;
}
