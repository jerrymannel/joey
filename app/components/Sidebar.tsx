"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
