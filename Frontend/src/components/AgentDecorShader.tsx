"use client";

import { clock, effect, frameLoop, init, surface, type Effect, type FrameLoopHandle, type Gpu, type Surface } from "vgpu";
import { Amphora, Archive, Armchair, BedDouble, CookingPot, GalleryVerticalEnd, LampCeiling, PanelsTopLeft, Table, TreePine, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AgentWorkflowProgress } from "@/interfaces/concierge";
import { agentDecorVisualState } from "@/utils/agentDecorShader";
import shaderSource from "./shaders/agent-decor.wgsl";

type Props = { progress: AgentWorkflowProgress };
type Runtime = { gpu: Gpu; surface: Surface; shader: Effect; loop: FrameLoopHandle };
const decorElements: Record<import("@/interfaces/catalog").CategoryId, LucideIcon> = {
  seating: Armchair,
  "tables-desks": Table,
  beds: BedDouble,
  storage: Archive,
  lighting: LampCeiling,
  "rugs-textiles": PanelsTopLeft,
  "kitchen-dining": CookingPot,
  outdoor: TreePine,
  "mirrors-wall-decor": GalleryVerticalEnd,
  accessories: Amphora,
};
const formingShapes = ["circle", "diamond", "spark", "arch"] as const;

export function AgentDecorShader({ progress }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useMemo(() => agentDecorVisualState(progress), [progress]);
  const stateRef = useRef(state);
  const [webGpuReady, setWebGpuReady] = useState(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.gpu || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let runtime: Runtime | null = null;

    const start = async () => {
      try {
        const gpu = await init({ powerPreference: "low-power", label: "catalogx-agent-decor" });
        if (cancelled) { gpu.dispose(); return; }
        const renderSurface = surface(gpu, canvas, { dpr: [1, 1.5], alphaMode: "premultiplied", clearColor: [0, 0, 0, 0], label: "agent-decor-surface" });
        const shader = effect(gpu, shaderSource, {
          label: "agent-decor-shader",
          set: { params: { time: 0, speed: stateRef.current.speed, intensity: stateRef.current.intensity, elementCount: stateRef.current.elementCount, phase: stateRef.current.phase === "searching" ? 1 : stateRef.current.phase === "retrying" ? 3 : 0, retry: stateRef.current.retry, width: renderSurface.size[0], height: renderSurface.size[1] } },
        });
        const loop = frameLoop(gpu, (frame) => {
          const current = stateRef.current;
          const phase = current.phase === "searching" ? 1 : current.phase === "retrying" ? 3 : current.phase === "reviewing" ? 2 : current.phase === "presenting" ? 4 : 0;
          shader.set({ params: { time: clock(gpu).time, speed: current.speed, intensity: current.intensity, elementCount: current.elementCount, phase, retry: current.retry, width: renderSurface.size[0], height: renderSurface.size[1] } });
          frame.pass(renderSurface, shader);
        }, { fps: 30 });
        runtime = { gpu, surface: renderSurface, shader, loop };
        setWebGpuReady(true);
      } catch {
        setWebGpuReady(false);
      }
    };

    void start();
    return () => {
      cancelled = true;
      setWebGpuReady(false);
      runtime?.loop.stop();
      runtime?.surface.dispose();
      runtime?.gpu.dispose();
    };
  }, []);

  return (
    <div className={`agent-decor-visual ${webGpuReady ? "is-gpu" : "is-fallback"}`} data-agent-visual-state={state.phase} aria-hidden="true">
      <canvas ref={canvasRef} className="agent-decor-canvas" />
      <div className="agent-decor-silhouettes">
        {state.categoryIds.length
          ? state.categoryIds.map((categoryId, index) => {
              const Element = decorElements[categoryId];
              return <span className="is-resolved" key={`${categoryId}-${index}`} data-category={categoryId} style={{ "--decor-delay": `${index * 120}ms` } as CSSProperties}><Element strokeWidth={1.65} /></span>;
            })
          : formingShapes.map((shape, index) => (
              <span className="is-forming" key={`forming-${shape}`} style={{ "--decor-delay": `${index * 120}ms` } as CSSProperties}>
                <i data-shape={shape} />
              </span>
            ))}
      </div>
      {!webGpuReady && <span className="agent-decor-fallback">Static composition</span>}
    </div>
  );
}
