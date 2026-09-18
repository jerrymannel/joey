"use client";

import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule, themeQuartz, type ColDef } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

// Params are CSS var() references, not fixed colors, so this single theme already tracks the
// app's own light/dark toggle (ThemeToggle.tsx) without needing ag-grid's separate dark-mode API.
const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--card)",
  foregroundColor: "var(--foreground)",
  headerBackgroundColor: "var(--muted)",
  headerTextColor: "var(--muted-foreground)",
  borderColor: "var(--border)",
  rowHoverColor: "color-mix(in oklch, var(--foreground) 6%, transparent)",
  accentColor: "var(--primary)",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  headerFontSize: 12,
  wrapperBorderRadius: "var(--radius-lg)",
});

/** The standard listing UI for a CRUD resource — see AGENTS.md's "CRUD pattern" section. */
export default function DataGrid<T>({
  columnDefs,
  rowData,
  onRowClicked,
  height = 440,
}: {
  columnDefs: ColDef<T>[];
  rowData: T[];
  onRowClicked?: (row: T) => void;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <AgGridReact<T>
        theme={gridTheme}
        columnDefs={columnDefs}
        rowData={rowData}
        defaultColDef={{ resizable: true, sortable: true, flex: 1 }}
        onRowClicked={onRowClicked ? (e) => e.data && onRowClicked(e.data) : undefined}
        animateRows
      />
    </div>
  );
}
