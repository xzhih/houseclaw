import { useEffect, useRef, useState } from "react";
import type { HouseProject } from "../domain/types";
import { mountHouseScene, type CameraMode, type MountedScene } from "../rendering/threeScene";

type Preview3DProps = {
  project: HouseProject;
};

export function Preview3D({ project }: Preview3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MountedScene | null>(null);
  const projectRef = useRef(project);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [activeStoreyId, setActiveStoreyId] = useState<string>(() => project.storeys[0]?.id ?? "1f");
  const [mountFailed, setMountFailed] = useState(false);

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

  return (
    <div className="preview-shell" aria-label="3D preview">
      <div ref={hostRef} className="three-host" aria-label="Three.js house preview" />

      <div className="preview-mode-toggle" aria-hidden={mountFailed}>
        <button
          type="button"
          className={cameraMode === "orbit" ? "is-active" : ""}
          onClick={() => setCameraMode("orbit")}
        >
          环视
        </button>
        <button
          type="button"
          className={cameraMode === "walk" ? "is-active" : ""}
          onClick={() => setCameraMode("walk")}
        >
          漫游
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
