import type { HouseProject } from "../domain/types";

type Preview3DProps = {
  project: HouseProject;
};

export function Preview3D({ project }: Preview3DProps) {
  return (
    <section className="preview-shell" aria-label="3D preview">
      <div className="preview-header">
        <h2>3D 外观预览</h2>
        <p>{project.name}</p>
      </div>
      <div className="preview-stage" aria-label="3D preview stage">
        <div className="stage-house" aria-hidden="true">
          <div className="stage-roof" />
          <div className="stage-floor stage-floor-top" />
          <div className="stage-floor stage-floor-mid" />
          <div className="stage-floor stage-floor-base" />
        </div>
      </div>
    </section>
  );
}
