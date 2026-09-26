"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "../lib/api.ts";
import type { TaskSummary } from "../lib/types.ts";

const LIBRARY = [
  { href: "/library/scripts", label: "Scripts" },
  { href: "/library/prompts", label: "Prompts" },
  { href: "/library/skills", label: "Skills" },
  { href: "/library/tools", label: "Tools" },
  { href: "/library/mcp", label: "MCP servers" },
];

const SETTINGS = [
  { href: "/settings/general", label: "General" },
  { href: "/integrations", label: "Integrations" },
  { href: "/settings/ssh", label: "SSH" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);

  useEffect(() => {
    api.get<TaskSummary[]>("/api/tasks").then(setTasks).catch(() => setTasks([]));
  }, [pathname]);

  const link = (href: string, label: string, active = pathname.startsWith(href)) => (
    <Link key={href} href={href} className={`sidebar-link ${active ? "active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <nav className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-heading">Tasks</div>
        {link("/tasks", "All tasks", pathname === "/tasks")}
        {tasks === null && <div className="sidebar-empty">Loading…</div>}
        {tasks?.length === 0 && <div className="sidebar-empty">No tasks yet</div>}
        {tasks?.map((t) => link(`/tasks/${t.slug}`, t.name, pathname === `/tasks/${t.slug}`))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-heading">Runs</div>
        {link("/runs", "All runs")}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-heading">Library</div>
        {LIBRARY.map((l) => link(l.href, l.label))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-heading">Settings</div>
        {SETTINGS.map((l) => link(l.href, l.label))}
      </div>
    </nav>
  );
}
