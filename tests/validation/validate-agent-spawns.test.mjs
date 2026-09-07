import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VALIDATOR = path.join(ROOT, "scripts/validate-agent-spawns.sh");

async function validate(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "coa-spawns-"));
  for (const [relativePath, body] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }
  try {
    return { ...(await execFileAsync("bash", [VALIDATOR, "--plugin-dir", root])), exitCode: 0 };
  } catch (error) {
    return { stdout: error.stdout, stderr: error.stderr, exitCode: error.code };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("accepts synchronous context wrappers and named team spawns", async () => {
  const result = await validate({
    "skills/wrapper/SKILL.md": `\`\`\`yaml
subagent_type: "claude-of-alexandria:worker"
run_in_background: false
\`\`\`
`,
    "skills/study-team/SKILL.md": `\`\`\`yaml
subagent_type: "general-purpose"
name: "text-structure"
\`\`\`
`,
  });

  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /context wrapper/i);
  assert.match(result.stdout, /team teammate/i);
});

test("rejects asynchronous context wrappers", async () => {
  const result = await validate({
    "skills/wrapper/SKILL.md": `\`\`\`yaml
subagent_type: "claude-of-alexandria:worker"
\`\`\`
`,
  });

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stdout, /missing 'run_in_background: false'/);
});

test("rejects named spawns outside team mode", async () => {
  const result = await validate({
    "skills/wrapper/SKILL.md": `\`\`\`yaml
subagent_type: "claude-of-alexandria:worker"
run_in_background: false
name: "worker"
\`\`\`
`,
  });

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stdout, /named spawn is only permitted/i);
});

test("rejects unnamed or unaddressable study-team spawns", async () => {
  const result = await validate({
    "skills/study-team/SKILL.md": `\`\`\`yaml
subagent_type: "general-purpose"
\`\`\`
`,
  });

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stdout, /requires 'name:'/i);
});

test("rejects the ignored team_name input at the supported baseline", async () => {
  const result = await validate({
    "skills/study-team/SKILL.md": `\`\`\`yaml
subagent_type: "general-purpose"
name: "textual-evidence"
team_name: "ignored"
\`\`\`
`,
  });

  assert.notEqual(result.exitCode, 0);
  assert.match(result.stdout, /'team_name:' is ignored/i);
});
