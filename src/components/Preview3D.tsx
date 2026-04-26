import { useEffect, useRef } from "react";
import type { HouseProject } from "../domain/types";
import { mountHouseScene } from "../rendering/threeScene";

type Preview3DProps = {
  project: HouseProject;
};

export function Preview3D({ project }: Preview3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    try {
      const scene = mountHouseScene(host, project);
      return () => scene.dispose();
    } catch {
      const status = document.createElement("p");
      status.className = "preview-status";
      status.textContent = "WebGL preview unavailable in this environment.";
      host.replaceChildren(status);

      return () => host.replaceChildren();
    }
  }, [project]);

  return (
    <div className="preview-shell" aria-label="3D preview">
      <div ref={hostRef} className="three-host" aria-label="Three.js house preview" />
      <div className="preview-overlay" aria-hidden="true">
        <div className="preview-badge">
          <p className="preview-name">{project.name}</p>
          <p className="preview-hint">拖拽旋转 · 滚轮缩放</p>
        </div>
      </div>
    </div>
  );
}
