import { useEffect, useRef, useState } from "react";
import type { HouseProject } from "../domain/types";
import {
  DEFAULT_LIGHTING,
  mountHouseScene,
  type CameraMode,
  type LightingParams,
  type MountedScene,
} from "../rendering/threeScene";

type Preview3DProps = {
  project: HouseProject;
};

type LightingSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
};

function LightingSlider({ label, value, min, max, step, format, onChange }: LightingSliderProps) {
  return (
    <label className="lighting-slider">
      <span className="lighting-slider-label">{label}</span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="lighting-slider-value">{format(value)}</span>
    </label>
  );
}

export function Preview3D({ project }: Preview3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MountedScene | null>(null);
  const projectRef = useRef(project);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [activeStoreyId, setActiveStoreyId] = useState<string>(() => project.storeys[0]?.id ?? "1f");
  const [mountFailed, setMountFailed] = useState(false);
  const [lighting, setLightingState] = useState<LightingParams>(DEFAULT_LIGHTING);
  const [lightingPanelOpen, setLightingPanelOpen] = useState(false);

  // Keep the ref pointing at the latest project so callbacks see fresh storeys.
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    try {
      sceneRef.current = mountHouseScene(host, project, {
        onWalkExit: () => setCameraMode("orbit"),
        onDigitKey: (digit) => {
          const storey = projectRef.current.storeys[digit - 1];
          if (storey) setActiveStoreyId(storey.id);
        },
        onCameraMove: (cameraY) => {
          const storeys = projectRef.current.storeys;
          const feetY = cameraY - 1.6;
          // Pick the highest storey whose elevation <= feetY (closest floor below feet).
          const grounded = [...storeys]
            .sort((a, b) => b.elevation - a.elevation)
            .find((s) => s.elevation <= feetY + 0.01);
          if (grounded) setActiveStoreyId((current) => current === grounded.id ? current : grounded.id);
        },
      });
      setMountFailed(false);
      return () => {
        sceneRef.current?.dispose();
        sceneRef.current = null;
      };
    } catch {
      setMountFailed(true);
      const status = document.createElement("p");
      status.className = "preview-status";
      status.textContent = "WebGL preview unavailable in this environment.";
      host.replaceChildren(status);
      return () => host.replaceChildren();
    }
  }, [project]);

  useEffect(() => {
    sceneRef.current?.setCameraMode(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    if (cameraMode === "walk") {
      sceneRef.current?.setActiveStorey(activeStoreyId);
    }
  }, [cameraMode, activeStoreyId]);

  useEffect(() => {
    sceneRef.current?.setLighting(lighting);
  }, [lighting]);

  const updateLighting = <K extends keyof LightingParams>(key: K, value: LightingParams[K]) => {
    setLightingState((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="preview-shell" aria-label="3D preview">
      <div ref={hostRef} className="three-host" aria-label="Three.js house preview" />

      <div className="preview-mode-toggle" role="group" aria-label="相机模式" aria-hidden={mountFailed}>
        <button
          type="button"
          aria-pressed={cameraMode === "orbit"}
          onClick={() => setCameraMode("orbit")}
        >
          环视
        </button>
        <button
          type="button"
          aria-pressed={cameraMode === "walk"}
          onClick={() => setCameraMode("walk")}
        >
          漫游
        </button>
      </div>

      <div className="lighting-controls" aria-hidden={mountFailed}>
        {lightingPanelOpen && (
          <div className="lighting-panel" role="group" aria-label="光照调整">
            <LightingSlider
              label="曝光"
              value={lighting.exposure}
              min={0.4}
              max={2}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => updateLighting("exposure", v)}
            />
            <LightingSlider
              label="环境光"
              value={lighting.hemiIntensity}
              min={0}
              max={1.5}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => updateLighting("hemiIntensity", v)}
            />
            <LightingSlider
              label="主光强度"
              value={lighting.keyIntensity}
              min={0}
              max={6}
              step={0.1}
              format={(v) => v.toFixed(1)}
              onChange={(v) => updateLighting("keyIntensity", v)}
            />
            <LightingSlider
              label="补光强度"
              value={lighting.fillIntensity}
              min={0}
              max={2}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => updateLighting("fillIntensity", v)}
            />
            <LightingSlider
              label="日照方位"
              value={lighting.sunAzimuthDeg}
              min={0}
              max={360}
              step={5}
              format={(v) => `${Math.round(v)}°`}
              onChange={(v) => updateLighting("sunAzimuthDeg", v)}
            />
            <LightingSlider
              label="日照高度"
              value={lighting.sunAltitudeDeg}
              min={5}
              max={89}
              step={1}
              format={(v) => `${Math.round(v)}°`}
              onChange={(v) => updateLighting("sunAltitudeDeg", v)}
            />
            <button
              type="button"
              className="lighting-reset"
              onClick={() => setLightingState(DEFAULT_LIGHTING)}
            >
              重置默认
            </button>
          </div>
        )}
        <button
          type="button"
          className="lighting-toggle"
          aria-label="光照"
          aria-expanded={lightingPanelOpen}
          onClick={() => setLightingPanelOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
          </svg>
        </button>
      </div>

      {cameraMode === "orbit" && (
        <div className="preview-overlay" aria-hidden="true">
          <div className="preview-badge">
            <p className="preview-name">{project.name}</p>
            <p className="preview-hint">拖拽旋转 · 滚轮缩放</p>
          </div>
        </div>
      )}

      {cameraMode === "walk" && (
        <>
          <div className="walk-crosshair" aria-hidden="true" />
          <div className="walk-hud">
            <div className="walk-floor-buttons" role="group" aria-label="楼层切换">
              {project.storeys.map((storey) => (
                <button
                  key={storey.id}
                  type="button"
                  className={storey.id === activeStoreyId ? "is-active" : ""}
                  onClick={() => setActiveStoreyId(storey.id)}
                >
                  {storey.label}
                </button>
              ))}
            </div>
            <p className="walk-hint">Esc 退出 · WASD 移动 · 鼠标看 · 1/2/3 切楼层</p>
          </div>
        </>
      )}
    </div>
  );
}
