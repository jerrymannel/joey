import { Suspense, type ReactNode } from "react";
import { Open_Sans } from "next/font/google";
import Topbar from "./components/Topbar.tsx";
import Sidebar from "./components/Sidebar.tsx";
import "./globals.css";

// Georgia/Menlo aren't Google Fonts — next/font can't load them, so --font-serif/--font-mono
// fall back to the plain system-font stacks already declared in globals.css.
const fontSans = Open_Sans({ subsets: ["latin"], variable: "--font-sans" });

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
    <html lang="en" className={fontSans.variable} suppressHydrationWarning>
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
