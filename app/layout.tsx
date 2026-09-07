import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Herdr Control Panel",
  description: "Configure and run orchestrator/worker Pi agents via Herdr.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
