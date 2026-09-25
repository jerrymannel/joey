import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Points JOEY_HERDR_BIN at a stand-in for the `herdr` CLI, so tests can run the commands Joey routes through herdr (whisper, ssh, harnesses) without opening
 * real tabs. `pane run` executes the typed command with `sh -c` in the background, its output kept in `<dir>/pane`; `wait-output` looks for the sentinel
 * there (in the tab's `--cwd`; or answers herdr's timeout error once `--timeout` ms are up); `tab close` kills the command. Every call is appended to `<dir>/calls`.
 * `agent start` remembers the agent's `--session-dir`; `agent prompt <name> <text>` runs `node $JOEY_FAKE_AGENT <name> <text> <session dir>`, which
 * stands in for pi by appending the turn (user message, assistant reply) to a session JSONL there, and reports the turn `done`.
 */
export function installFakeHerdr(dir: string): { calls: string } {
  const script = join(dir, "fake-herdr.sh");
  writeFileSync(
    script,
    `#!/bin/sh
S="$JOEY_FAKE_HERDR_DIR"
echo "$*" >> "$S/calls"
case "$1 $2" in
  "tab create") shift 2; while [ $# -gt 0 ]; do [ "$1" = "--cwd" ] && echo "$2" > "$S/cwd"; shift; done; echo '{"result":{"tab":{"tab_id":"t1"},"root_pane":{"pane_id":"p1"}}}' ;;
  "pane run") : > "$S/pane"; cd "$(cat "$S/cwd")"; sh -c "$4" > "$S/pane" 2>&1 < /dev/null & echo $! > "$S/pid"; echo '{"result":{}}' ;;
  "pane wait-output")
    shift 3
    while [ $# -gt 0 ]; do case "$1" in --regex) re=$(printf '%s' "$2" | sed 's/\\\\d/[0-9]/g') ;; --timeout) ms="$2" ;; esac; shift; done
    i=0
    while [ $((i * 50)) -lt "$ms" ]; do
      line=$(grep -E "$re" "$S/pane" | head -1)
      if [ -n "$line" ]; then printf '{"result":{"matched_line":"%s"}}\\n' "$line"; exit 0; fi
      sleep 0.05; i=$((i + 1))
    done
    echo '{"error":{"code":"timeout","message":"timed out waiting for output match"}}'; exit 1 ;;
  "tab close") [ -f "$S/pid" ] && kill "$(cat "$S/pid")" 2>/dev/null; echo '{"result":{"type":"ok"}}' ;;
  "agent start") name="$3"; shift 3; while [ $# -gt 0 ]; do [ "$1" = "--session-dir" ] && echo "$2" > "$S/agent-$name"; shift; done; echo '{"result":{"agent":{"agent_status":"idle"}}}' ;;
  "agent prompt") node "$JOEY_FAKE_AGENT" "$3" "$4" "$(cat "$S/agent-$3")" >> "$S/agent-log" 2>&1 || { echo '{"error":{"message":"fake agent failed"}}'; exit 1; }; echo '{"result":{"agent":{"agent_status":"done"}}}' ;;
esac
`,
  );
  chmodSync(script, 0o755);
  process.env.JOEY_HERDR_BIN = script;
  process.env.JOEY_FAKE_HERDR_DIR = dir;
  return { calls: join(dir, "calls") };
}

