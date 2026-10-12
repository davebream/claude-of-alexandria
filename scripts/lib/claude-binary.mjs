import fs from "node:fs/promises";
import path from "node:path";

// The Claude Code CLI pinned in package.json, so every gate runs the same build.
export function bundledClaudePath(root) {
  const arch = process.arch === "x64" ? "x64" : "arm64";
  const suffix = process.platform === "win32" ? ".exe" : "";
  return path.join(
    root,
    "node_modules",
    "@anthropic-ai",
    `claude-code-${process.platform}-${arch}`,
    `claude${suffix}`,
  );
}

export async function claudeBinary(root) {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  try {
    await fs.access(bundledClaudePath(root));
    return bundledClaudePath(root);
  } catch {
    return "claude";
  }
}
