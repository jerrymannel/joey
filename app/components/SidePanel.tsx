"use client";

import { useEffect } from "react";

/** Right-hand slide-over for small Create/View/Edit forms that don't warrant their own page — see AGENTS.md's "CRUD pattern" section. */
export default function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="side-panel-backdrop" onClick={onClose}>
      <aside className="side-panel" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="secondary" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
