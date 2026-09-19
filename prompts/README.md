# Prompts

The text Joey adds around a task's own prompt, read from here at run time (edit a file, the next run uses it — no rebuild).
These are files, not the Configurations → Prompts resource (that one is the task's own prompt, in the database).
A trailing newline is dropped; `{{name}}` is replaced by the value the code passes.

| File | Used by | Placeholders |
| --- | --- | --- |
| `mailbox-instruction.md` | appended to every pi run's prompt (harness.ts) | — |
| `tools.md` | prepended when a task has tools enabled (harness.ts) | `{{tools}}` |
| `inbox.md` | heading above the mail handed to a run (mailbox.ts `formatInbox`) | `{{count}}`, `{{noun}}` |
| `sender-prompt.md` | appended to a chain's first mail (mailbox.ts `sendMail`) | `{{body}}`, `{{prompt}}` |

The folder is `./prompts` under where the app runs, or `PROMPTS_DIR` (pi's tools run elsewhere, so the app passes it).
