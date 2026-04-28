import { type ChangeEvent, useEffect, useRef, useState } from "react";

export type BrandProjectEntry = {
  id: string;
  name: string;
};

type BrandMenuProps = {
  projects: readonly BrandProjectEntry[];
  activeId: string;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function BrandMenu({
  projects,
  activeId,
  onSwitch,
  onNew,
  onDelete,
  onExport,
  onImport,
}: BrandMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = projects.find((entry) => entry.id === activeId);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleSwitch = (id: string) => {
    onSwitch(id);
    setOpen(false);
  };
  const handleDelete = (event: React.MouseEvent, entry: BrandProjectEntry) => {
    event.stopPropagation();
    if (window.confirm(`删除项目"${entry.name}"？该操作无法撤销。`)) {
      onDelete(entry.id);
    }
  };
  const handleNew = () => {
    onNew();
    setOpen(false);
  };
  const handleExport = () => {
    onExport();
    setOpen(false);
  };
  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    onImport(event);
    setOpen(false);
  };

  return (
    <div className="brand-menu" ref={containerRef}>
      <button
        type="button"
        className="brand-menu-trigger"
        aria-label="HouseClaw"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">{active?.name ?? "HouseClaw"}</span>
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="brand-menu-chevron"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="brand-menu-panel" role="menu" aria-label="项目菜单">
          <div className="brand-menu-section-label">项目</div>
          <ul className="brand-menu-list">
            {projects.map((entry) => {
              const isActive = entry.id === activeId;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-pressed={isActive}
                    className={`brand-menu-row${isActive ? " is-active" : ""}`}
                    onClick={() => handleSwitch(entry.id)}
                  >
                    <span className="brand-menu-row-check" aria-hidden="true">
                      {isActive ? "•" : ""}
                    </span>
                    <span className="brand-menu-row-name">{entry.name}</span>
                    {projects.length > 1 ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`删除项目 ${entry.name}`}
                        className="brand-menu-row-delete"
                        onClick={(event) => handleDelete(event, entry)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleDelete(event as unknown as React.MouseEvent, entry);
                          }
                        }}
                      >
                        ✕
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="brand-menu-divider" />

          <button
            type="button"
            className="brand-menu-action"
            onClick={handleNew}
          >
            新建项目
          </button>
          <label className="brand-menu-action brand-menu-import">
            导入 JSON
            <input
              aria-label="导入 JSON"
              type="file"
              accept="application/json"
              onChange={handleImport}
            />
          </label>
          <button
            type="button"
            className="brand-menu-action"
            onClick={handleExport}
          >
            导出 JSON
          </button>
        </div>
      ) : null}
    </div>
  );
}
