# skills/

Agent skills. Every agent in every task run gets every skill here — like the tools, they're
always on (`listSkills()` in `src/engine/definitions.ts` passes each to pi's `--skill`).

Each immediate entry is one skill:

- a **folder** with a `SKILL.md` (the usual skill layout), or
- a loose **`.md`** file.

`README.md` and dotfiles are ignored. Add a skill by dropping it in here — it applies to the next run.
