import Link from "next/link";
import ThemeToggle from "./ThemeToggle.tsx";

export default function Topbar() {
  return (
    <header className="topbar">
      <Link href="/tasks" className="topbar-brand">
        Joey
      </Link>
      <ThemeToggle />
    </header>
  );
}
