"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Providers with an OAuth client to configure. Add an entry here when a non-Google provider shows up. */
const PROVIDERS = [{ slug: "google", label: "Google" }];

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="integrations-shell">
      <nav className="integrations-panel">
        {PROVIDERS.map((p) => (
          <Link
            key={p.slug}
            href={`/integrations/${p.slug}`}
            className={`sidebar-link ${pathname === `/integrations/${p.slug}` ? "active" : ""}`}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <div className="integrations-content">{children}</div>
    </div>
  );
}
