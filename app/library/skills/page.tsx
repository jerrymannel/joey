"use client";

import FileLibrary from "../../components/FileLibrary.tsx";

export default function SkillsPage() {
  return (
    <FileLibrary
      title="Skills"
      folder="skills"
      endpoint="/api/library/skills"
      placeholder="web-browsing"
      intro={
        <>
          The skills in <code>skills/</code> — a folder with a <code>SKILL.md</code>, or a loose <code>.md</code> (New makes one of those). Every agent in every run gets every skill (pi&apos;s <code>--skill</code>) — like the tools.
        </>
      }
    />
  );
}
