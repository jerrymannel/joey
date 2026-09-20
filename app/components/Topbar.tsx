import Link from "next/link";
import ThemeToggle from "./ThemeToggle.tsx";

export default function Topbar() {
  return (
    <header className="topbar">
      <Link href="/tasks" className="topbar-brand">
        <img src="/icon.svg" alt="" />
        Joey
      </Link>
      <ThemeToggle />
    </header>
  );
}
