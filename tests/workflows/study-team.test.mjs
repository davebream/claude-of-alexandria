import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SKILL = path.join(
  ROOT,
  "plugins/claude-of-alexandria/skills/study-team/SKILL.md",
);

test("study-team is an explicit, in-process-only mode with no subagent fallback", async () => {
  const source = await fs.readFile(SKILL, "utf8");

  assert.match(source, /^name: study-team$/m);
  assert.match(source, /CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1/);
  assert.match(source, /--teammate-mode in-process/);
  assert.match(source, /do not (?:change|edit|enable).*settings/i);
  assert.match(source, /do not fall back to (?:ordinary )?subagents/i);
  assert.match(source, /complete.*\/deep-study.*first/is);
});

test("study-team defines three bounded perspectives and an ordered handoff", async () => {
  const source = await fs.readFile(SKILL, "utf8");

  for (const role of ["textual-evidence", "interpretation", "critique"]) {
    assert.match(source, new RegExp(`name: "${role}"`));
  }
  assert.match(source, /exactly three teammates/i);
  assert.match(source, /may not spawn/i);
  assert.match(source, /SendMessage/);
  assert.doesNotMatch(source, /TeamCreate|TeamDelete|team_name/);
  assert.match(source, /wait.*three.*deliverables.*before.*synthes/is);
});

test("study-team uses dedicated leaf agent definitions", async () => {
  for (const role of ["textual-evidence", "interpretation", "critique"]) {
    const agentName = `study-team-${role}`;
    const source = await fs.readFile(
      path.join(ROOT, `plugins/claude-of-alexandria/agents/${agentName}.md`),
      "utf8",
    );

    assert.match(source, new RegExp(`^name: ${agentName}$`, "m"));
    assert.doesNotMatch(source, /^tools:.*\bAgent\b/m);
    assert.match(source, /may not spawn/i);
    assert.match(source, /PERSPECTIVE:/);
  }
});
