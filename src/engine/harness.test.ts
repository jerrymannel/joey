import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "./task-board.ts";
import { installFakeHerdr } from "../test-support/fake-herdr.ts";

async function freshHarness() {
  const dir = mkdtempSync(join(tmpdir(), "joey-harness-test-"));
  process.env.DATA_DB_PATH = join(dir, "data.db");
  process.env.LOGS_DB_PATH = join(dir, "logs.db");
  const harness = await import(`./harness.ts?t=${Date.now()}-${Math.random()}`);
  const tools = await import(`./tools.ts?t=${Date.now()}-${Math.random()}`);
  return { harness, tools, dir };
}

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    name: "task",
    folderPath: "/tmp",
    promptId: "",
    prompt: "do the thing",
    harness: "pi",
    cliParams: "",
    model: "",
    schedule: null,
    service: "gmail",
    toolIds: [],
    searchQuery: "",
    extensions: "",
    transcribe: false,
    playlistId: "",
    account: "",
    thinkingLevel: "",
    trustFolder: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

test("describeCommand passes the prompt through unchanged with no tools enabled", async () => {
  const { harness, dir } = await freshHarness();
  const command = harness.describeCommand(baseTask({}));
  assert.match(command, /"do the thing/); // pi appends the mailbox instruction
  assert.doesNotMatch(command, /Available tools/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("describeCommand prepends enabled tools' names/descriptions to the prompt", async () => {
  const { harness, tools, dir } = await freshHarness();
  const gmailTool = tools.listTools("gmail")[0];
  const command = harness.describeCommand(baseTask({ toolIds: [gmailTool.id] }));
  assert.match(command, /Available tools:/);
  assert.ok(command.includes(gmailTool.name));

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("mailbox tools are always on: never listed under \"Available tools\" (the mailbox block covers them), even if a task stored one", async () => {
  const { harness, tools, dir } = await freshHarness();
  const mailboxTool = tools.listTools("mailbox")[0];
  const command = harness.describeCommand(baseTask({ toolIds: [mailboxTool.id] }));
  assert.doesNotMatch(command, /Available tools/);
  assert.match(command, /mailbox_send_result/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("describeCommand adds --thinking and --approve for pi only", async () => {
  const { harness, dir } = await freshHarness();

  const piCommand = harness.describeCommand(baseTask({ harness: "pi", thinkingLevel: "high", trustFolder: true }));
  assert.match(piCommand, /--thinking high/);
  assert.match(piCommand, /--approve/);

  const claudeCommand = harness.describeCommand(
    baseTask({ harness: "claude", thinkingLevel: "high", trustFolder: true }),
  );
  assert.doesNotMatch(claudeCommand, /--thinking/);
  assert.doesNotMatch(claudeCommand, /--approve/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("describeRun previews the full herdr tab create/run/close sequence for pi, not just the pi command", async () => {
  const { harness, dir } = await freshHarness();

  const { cwd, commands } = harness.describeRun(baseTask({ harness: "pi" }));
  const full = commands.join("\n");
  assert.equal(cwd, "/tmp");
  assert.match(full, /herdr tab create --cwd \/tmp/);
  assert.match(full, /herdr pane run <pane-id>/);
  assert.match(full, /'do the thing/);
  assert.match(full, /herdr pane wait-output <pane-id>/);
  assert.match(full, /herdr tab close <tab-id>/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("describeRun previews the same herdr tab sequence for non-pi harnesses, with the stdout/stderr capture", async () => {
  const { harness, dir } = await freshHarness();

  const { cwd, commands } = harness.describeRun(baseTask({ harness: "claude", model: "m1" }));
  const full = commands.join("\n");
  assert.equal(cwd, "/tmp");
  assert.match(full, /herdr tab create --cwd \/tmp .*--label claude:t1/);
  assert.match(full, /herdr pane run <pane-id> .*bash -c .*set -o pipefail; MODEL=.*m1.*claude.*--model.*m1.*tee.*stdout-file/);
  assert.match(full, /herdr pane wait-output <pane-id>/);
  assert.match(full, /herdr tab close <tab-id>/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("a non-pi harness runs in a herdr tab: its stdout is filed as the result, stderr reaches the run log, and a failing exit fails the run", async () => {
  const { harness, dir } = await freshHarness();
  process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");
  const { saveResultsFolder } = await import("./settings.ts");
  const { createRun, getRun } = await import("./run-log.ts");
  const { calls } = installFakeHerdr(dir);
  saveResultsFolder(join(dir, "results"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "claude"), '#!/bin/sh\necho "answer: $MODEL"\necho oops >&2\n');
  writeFileSync(join(bin, "agy"), "#!/bin/sh\nexit 2\n");
  for (const name of ["claude", "agy"]) chmodSync(join(bin, name), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    const run = createRun("t1");
    await harness.runHarness(baseTask({ harness: "claude", model: "m1", folderPath: dir }), run.id);
    assert.match(getRun(run.id)!.output, /answer: m1/);
    assert.match(getRun(run.id)!.output, /oops/);
    assert.match(readFileSync(join(dir, "results", readdirSync(join(dir, "results"))[0]), "utf8"), /answer: m1/);
    assert.match(readFileSync(calls, "utf8"), /tab create --cwd .* --label claude:t1/);

    await assert.rejects(harness.runHarness(baseTask({ harness: "agy", folderPath: dir }), createRun("t1").id), /agy exited with code 2/);
  } finally {
    process.env.PATH = path;
  }

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("a pi run writes its prompt to a temp file in the task's own working directory and reads it back via $(cat ...), instead of typing it inline — cleaned up afterwards", async () => {
  const { harness, dir } = await freshHarness();
  const home = mkdtempSync(join(tmpdir(), "joey-home-"));
  process.env.HOME = home;
  process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");
  const { saveResultsFolder } = await import("./settings.ts");
  const { createRun } = await import("./run-log.ts");
  const { calls } = installFakeHerdr(dir);
  saveResultsFolder(join(dir, "results"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  // echoes its -p value to a file, so the test can confirm the real prompt (quotes, parens and all) reached pi
  writeFileSync(join(bin, "pi"), '#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = "-p" ] && { echo "$2" > "$JOEY_FAKE_HERDR_DIR/prompt-seen"; exit 0; }; shift; done\n');
  chmodSync(join(bin, "pi"), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    const run = createRun("t1");
    const prompt = "line one\nGmail account's labels\na (paren) and a `backtick`\nline three";
    await harness.runHarness(baseTask({ harness: "pi", folderPath: dir, prompt }), run.id);
    assert.match(readFileSync(join(dir, "prompt-seen"), "utf8"), /line one[\s\S]*line three/);
    assert.match(readFileSync(calls, "utf8"), /\$\(cat.*\.joey-prompt-.*\.txt/); // wrapped in bash -c now (for the --mode json tee below), so the quoting around it is escaped rather than literal
    assert.equal(existsSync(join(dir, `.joey-prompt-${run.id}.txt`)), false); // cleaned up after the run
  } finally {
    process.env.PATH = path;
  }

  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("formatPiTranscript renders a pi --mode json stream's final agent_end into a readable transcript, and falls back to the raw stream when there's no agent_end", async () => {
  const piHerdr = await import(`./pi-herdr.ts?t=${Date.now()}-${Math.random()}`);
  const events = [
    { type: "session", version: 3, id: "s1" },
    { type: "agent_start" },
    {
      type: "agent_end",
      messages: [
        { role: "user", content: "do the thing" },
        { role: "assistant", content: [{ type: "text", text: "on it" }, { type: "toolCall", name: "whisper_transcribe_audio", arguments: { file: "a.mp3" } }] },
        { role: "toolResult", toolName: "whisper_transcribe_audio", isError: false, content: [{ type: "text", text: "hello world" }] },
        { role: "toolResult", toolName: "mailbox_send_result", isError: true, content: [{ type: "text", text: "boom" }] },
      ],
    },
  ];
  const transcript = piHerdr.formatPiTranscript(events.map((e) => JSON.stringify(e)).join("\n") + "\nnot json\n");
  assert.doesNotMatch(transcript, /do the thing/); // the user turn is just the prompt, already logged as the command
  assert.match(transcript, /on it/);
  assert.match(transcript, /→ whisper_transcribe_audio\(\{"file":"a\.mp3"\}\)/);
  assert.match(transcript, /✓ whisper_transcribe_audio: hello world/);
  assert.match(transcript, /✗ mailbox_send_result: boom/);

  assert.equal(piHerdr.formatPiTranscript("not json\nstill not json\n"), "not json\nstill not json\n");
});

test("a pi run's --mode json stdout is captured and its parsed transcript lands in the run log; a non-zero exit still captures it and fails the run", async () => {
  const { harness, dir } = await freshHarness();
  const home = mkdtempSync(join(tmpdir(), "joey-home-"));
  process.env.HOME = home;
  process.env.SETTINGS_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");
  const { saveResultsFolder } = await import("./settings.ts");
  const { createRun, getRun } = await import("./run-log.ts");
  installFakeHerdr(dir);
  saveResultsFolder(join(dir, "results"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "pi"),
    [
      "#!/bin/sh",
      'echo \'{"type":"agent_start"}\'',
      'echo \'{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"all done"}]}]}\'',
      'exit "${FAKE_PI_EXIT:-0}"',
      "",
    ].join("\n"),
  );
  chmodSync(join(bin, "pi"), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  try {
    const ok = createRun("t1");
    await harness.runHarness(baseTask({ harness: "pi", folderPath: dir }), ok.id);
    assert.match(getRun(ok.id)!.output, /all done/);

    process.env.FAKE_PI_EXIT = "1";
    const failed = createRun("t1");
    await assert.rejects(harness.runHarness(baseTask({ harness: "pi", folderPath: dir }), failed.id), /pi exited with code 1/);
    assert.match(getRun(failed.id)!.output, /all done/); // captured even though the run failed
  } finally {
    process.env.PATH = path;
    delete process.env.FAKE_PI_EXIT;
  }

  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("a pi run of a custom-endpoint model passes provider/id and registers the provider in pi's models.json, keeping other providers", async () => {
  const { harness, dir } = await freshHarness();
  const home = mkdtempSync(join(tmpdir(), "joey-home-"));
  process.env.HOME = home;
  const models = await import(`./models.ts?t=${Date.now()}-${Math.random()}`);
  const piHerdr = await import(`./pi-herdr.ts?t=${Date.now()}-${Math.random()}`);
  const custom = models.createModel({ name: "Gemma", value: "gemma-26B", endpoint: "http://127.0.0.1:8080/v1" });

  const modelArg = (task: Task) => {
    const a: string[] = harness.buildArgs(task);
    return a[a.indexOf("--model") + 1];
  };
  assert.equal(modelArg(baseTask({ harness: "pi", model: "gemma-26B" })), `joey-${custom.id}/gemma-26B`);
  // standard models and non-pi harnesses keep the raw value
  assert.equal(modelArg(baseTask({ harness: "pi", model: "claude-sonnet-5" })), "claude-sonnet-5");
  assert.equal(modelArg(baseTask({ harness: "claude", model: "gemma-26B" })), "gemma-26B");

  // pi gets the repo's .mcp.json (for pi-mcp-adapter, e.g. chrome-devtools) via an absolute path, same reasoning as --extension; other harnesses don't
  const piArgs = harness.buildArgs(baseTask({ harness: "pi" }));
  assert.match(piArgs[piArgs.indexOf("--mcp-config") + 1], /\.mcp\.json$/);
  assert.equal(harness.buildArgs(baseTask({ harness: "claude" })).includes("--mcp-config"), false);

  const file = join(home, ".pi/agent/models.json");
  mkdirSync(join(home, ".pi/agent"), { recursive: true });
  writeFileSync(file, JSON.stringify({ providers: { mine: { baseUrl: "x" }, "joey-stale": {} } }));
  piHerdr.syncPiCustomModels();
  const { providers } = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(providers.mine, { baseUrl: "x" });
  assert.equal(providers["joey-stale"], undefined);
  assert.equal(providers[`joey-${custom.id}`].baseUrl, "http://127.0.0.1:8080/v1");
  assert.equal(providers[`joey-${custom.id}`].api, "openai-completions");
  assert.deepEqual(providers[`joey-${custom.id}`].models.map((m: any) => m.id), ["gemma-26B"]);

  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});

test("a pi run's prompt ends with the mailbox tools instruction, its command carries RUN_ID/TASK_ID/RESULTS_DIR (MAIL_HOPS only once mail was delivered) and tees its --mode json output; other harnesses get neither", async () => {
  const { harness, tools, dir } = await freshHarness();

  const pi = harness.describeRun(baseTask({ harness: "pi" })).commands.join("\n");
  // every mailbox tool in the catalog is named in the instruction, has its own pi-tools file, and is registered by index.ts
  const mailboxTools = tools.listTools("mailbox").map((t: { name: string }) => t.name);
  assert.equal(mailboxTools.length, 5);
  const index = readFileSync("pi-tools/index.ts", "utf8");
  for (const tool of mailboxTools) {
    assert.match(pi, new RegExp(tool));
    assert.match(index, new RegExp(`"\\./${tool}\\.ts"`));
    assert.match(readFileSync(`pi-tools/${tool}.ts`, "utf8"), new RegExp(`name: "${tool}"`));
  }
  assert.match(pi, /not the Gmail tools \(gmail_search_emails, gmail_read_email\)/);
  assert.match(pi, /Answering in chat without calling it means the task failed/);
  assert.match(pi, /RUN_ID='<run-id>'/);
  assert.match(pi, /TASK_ID='t1'/);
  assert.match(pi, /RESULTS_DIR=/);
  assert.doesNotMatch(pi, /MAIL_HOPS/);
  assert.match(pi, /--mode/);
  assert.match(pi, /json/);
  assert.match(pi, /tee/);
  assert.doesNotMatch(harness.describeCommand(baseTask({ harness: "claude" })), /mailbox_/);

  rmSync(dir, { recursive: true, force: true });
  delete process.env.DATA_DB_PATH;
  delete process.env.LOGS_DB_PATH;
});
