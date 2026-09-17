"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "../lib/api.ts";
import type { Task } from "../lib/types.ts";

export default function Sidebar() {
  const pathname = usePathname();
  const [tasks, setTasks] = useState<Task[] | null>(null);

  useEffect(() => {
    api.get<Task[]>("/api/tasks").then(setTasks).catch(() => setTasks([]));
  }, [pathname]);

  return (
    <nav className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-heading">Tasks</div>
        <Link href="/tasks" className={`sidebar-link ${pathname === "/tasks" ? "active" : ""}`}>
          + New task
        </Link>
        {tasks === null && <div className="sidebar-empty">Loading…</div>}
        {tasks?.length === 0 && <div className="sidebar-empty">No tasks yet</div>}
        {tasks?.map((task) => (
          <Link
            key={task.id}
            href={`/tasks/${task.id}`}
            className={`sidebar-link ${pathname === `/tasks/${task.id}` ? "active" : ""}`}
          >
            {task.name}
          </Link>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-heading">Automations</div>
        <Link href="/youtube" className={`sidebar-link ${pathname === "/youtube" ? "active" : ""}`}>
          YouTube
        </Link>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-heading">Settings</div>
        <Link href="/gmail" className={`sidebar-link ${pathname === "/gmail" ? "active" : ""}`}>
          Gmail
        </Link>
        <Link href="/integrations" className={`sidebar-link ${pathname.startsWith("/integrations") ? "active" : ""}`}>
          Integrations
        </Link>
      </div>
    </nav>
  );
}
