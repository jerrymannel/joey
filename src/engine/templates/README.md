# Templates

The wording Joey sends to agents around a task's own instructions, read at run time by `templates.ts` (edit a file, the next
message uses it — no rebuild). Not the agents' own prompts: those are `prompts/*.md` at the repo root.
A trailing newline is dropped; `{{name}}` is replaced by the value the code passes.

| File | Used by (task-run.ts) | Placeholders |
| --- | --- | --- |
| `step.md` | every agent step's message | `{{instruction}}`, `{{runDir}}`, `{{taskDir}}`, `{{earlier}}`, `{{input}}` |
| `step-earlier.md` | the paths of earlier steps' outputs, inside `step.md` | `{{files}}` |
| `step-input.md` | the previous (or reviewed) step's output, inside `step.md` | `{{step}}`, `{{label}}`, `{{content}}` |
| `review.md` | appended to a review step's instruction | `{{target}}`, `{{step}}` |
| `review-feedback.md` | the reviewer's feedback, sent to the reviewed agent | `{{round}}`, `{{maxRounds}}`, `{{target}}`, `{{feedback}}` |
| `review-again.md` | the revised work, sent back to the reviewer | `{{round}}`, `{{maxRounds}}`, `{{target}}`, `{{content}}` |
| `verdict-reminder.md` | sent once to a reviewer that didn't call `task_review_verdict` | — |

The folder is `src/engine/templates` under where the app runs, or `TEMPLATES_DIR`.
