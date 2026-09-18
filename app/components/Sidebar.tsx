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
    api.get<Task[]>("/api/tasks?service=generic").then(setTasks).catch(() => setTasks([]));
  }, [pathname]);

  return (
    <nav className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-heading">Tasks</div>
        <Link href="/tasks" className={`sidebar-link ${pathname === "/tasks" ? "active" : ""}`}>
          All tasks
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
        <Link
          href="/automations/gmail"
          className={`sidebar-link ${pathname.startsWith("/automations/gmail") ? "active" : ""}`}
        >
          Gmail
        </Link>
        <Link
          href="/automations/youtube"
          className={`sidebar-link ${pathname.startsWith("/automations/youtube") ? "active" : ""}`}
        >
          YouTube
        </Link>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-heading">Configurations</div>
        <Link
          href="/configurations/models"
          className={`sidebar-link ${pathname === "/configurations/models" ? "active" : ""}`}
        >
          Models
        </Link>
        <Link
          href="/configurations/prompts"
          className={`sidebar-link ${pathname === "/configurations/prompts" ? "active" : ""}`}
        >
          Prompts
        </Link>
        <Link
          href="/configurations/tools"
          className={`sidebar-link ${pathname === "/configurations/tools" ? "active" : ""}`}
        >
          Tools
        </Link>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-heading">Settings</div>
        <Link
          href="/settings/general"
          className={`sidebar-link ${pathname === "/settings/general" ? "active" : ""}`}
        >
          General
        </Link>
        <Link href="/integrations" className={`sidebar-link ${pathname.startsWith("/integrations") ? "active" : ""}`}>
          Integrations
        </Link>
      </div>
    </nav>
  );
}
