import { Suspense, type ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import Topbar from "./components/Topbar.tsx";
import Sidebar from "./components/Sidebar.tsx";
import "./globals.css";

// Georgia isn't a Google Font — next/font can't load it, so --font-serif falls back to the
// plain system-font stack already declared in globals.css.
const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "Joey",
  description: "Configure and run scheduled agent tasks.",
};

const THEME_INIT = `
try {
  var t = localStorage.getItem("theme");
  if (t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.classList.add("dark");
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body suppressHydrationWarning>
        <Topbar />
        <div className="app-shell">
          <Suspense>
            <Sidebar />
          </Suspense>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
