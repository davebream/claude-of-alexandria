import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";

const AGENT_FIELDS = new Set([
  "name",
  "description",
  "model",
  "effort",
  "maxTurns",
  "tools",
  "disallowedTools",
  "skills",
  "memory",
  "background",
  "isolation",
  "color",
  "initialPrompt",
  "experimental",
]);

const IGNORED_PLUGIN_AGENT_FIELDS = new Set([
  "hooks",
  "mcpServers",
  "permissionMode",
]);

const SKILL_FIELDS = new Set([
  "name",
  "description",
  "allowed-tools",
  "argument-hint",
  "disable-model-invocation",
  "user-invocable",
  "model",
  "effort",
  "context",
  "agent",
  "hooks",
  "paths",
  "shell",
  // COA deployment metadata, intentionally supported by policy.
  "version",
  "changed",
]);

const BUILTIN_TOOLS = new Set([
  "Agent",
  "AskUserQuestion",
  "Bash",
  "Edit",
  "Glob",
  "Grep",
  "NotebookEdit",
  "Read",
  "SendMessage",
  "Skill",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskOutput",
  "TaskStop",
  "TaskUpdate",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Workflow",
  "Write",
]);

const MCP_PREFIX =
  "mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__";

function slash(filePath) {
  return filePath.split(path.sep).join("/");
}

async function filesUnder(root, predicate = () => true) {
  try {
    const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name))
      .filter(predicate)
      .sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function parseFrontmatterText(text, filePath) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    throw new Error(`${filePath}: missing YAML frontmatter`);
  }

  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${filePath}: unterminated YAML frontmatter`);

  const document = parseDocument(match[1], { uniqueKeys: true });
  if (document.errors.length > 0) {
    const details = document.errors.map((error) =>
      error.code === "DUPLICATE_KEY" ? `duplicate key: ${error.message}` : error.message,
    );
    throw new Error(
      `${filePath}: ${details.join("; ")}`,
    );
  }

  const value = document.toJS();
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${filePath}: frontmatter must be a YAML mapping`);
  }
  return { frontmatter: value, body: text.slice(match[0].length) };
}

function addTypeError(errors, rel, field, expected, value) {
  errors.push(`${rel}: ${field} must be ${expected}; got ${typeof value}`);
}

function stringList(value) {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return Array.isArray(value) ? value : [];
}

function checkStringList(errors, rel, field, value) {
  if (
    typeof value !== "string" &&
    !(Array.isArray(value) && value.every((item) => typeof item === "string"))
  ) {
    addTypeError(errors, rel, field, "a string or string array", value);
  }
}

function validateCommonIdentity(errors, rel, kind, metadata, expectedName) {
  if (typeof metadata.name !== "string") {
    addTypeError(errors, rel, "name", "a string", metadata.name);
  } else if (metadata.name !== expectedName) {
    errors.push(
      `${rel}: ${kind} name ${JSON.stringify(metadata.name)} must match ${JSON.stringify(expectedName)}`,
    );
  }
  if (typeof metadata.description !== "string" || metadata.description.trim() === "") {
    errors.push(`${rel}: description must be a non-empty string`);
  }
}

function validateAgent(errors, rel, metadata, expectedName) {
  validateCommonIdentity(errors, rel, "agent", metadata, expectedName);
  for (const field of Object.keys(metadata)) {
    if (IGNORED_PLUGIN_AGENT_FIELDS.has(field)) {
      errors.push(
        `${rel}: ${field} is ignored for plugin-shipped agents and is forbidden by COA policy`,
      );
    } else if (!AGENT_FIELDS.has(field)) {
      errors.push(`${rel}: unsupported plugin-agent field ${JSON.stringify(field)}`);
    }
  }
  for (const field of ["tools", "disallowedTools", "skills"]) {
    if (field in metadata) checkStringList(errors, rel, field, metadata[field]);
  }
  if ("maxTurns" in metadata && !Number.isInteger(metadata.maxTurns)) {
    addTypeError(errors, rel, "maxTurns", "an integer", metadata.maxTurns);
  }
  if ("background" in metadata && typeof metadata.background !== "boolean") {
    addTypeError(errors, rel, "background", "a boolean", metadata.background);
  }
  if ("isolation" in metadata && metadata.isolation !== "worktree") {
    errors.push(`${rel}: isolation must be "worktree"`);
  }
  for (const field of ["model", "effort", "memory", "color", "initialPrompt"]) {
    if (field in metadata && typeof metadata[field] !== "string") {
      addTypeError(errors, rel, field, "a string", metadata[field]);
    }
  }
  if (
    "experimental" in metadata &&
    (!metadata.experimental ||
      Array.isArray(metadata.experimental) ||
      typeof metadata.experimental !== "object")
  ) {
    addTypeError(errors, rel, "experimental", "an object", metadata.experimental);
  }
}

function validateSkill(errors, rel, metadata, expectedName) {
  validateCommonIdentity(errors, rel, "skill", metadata, expectedName);
  for (const field of Object.keys(metadata)) {
    if (!SKILL_FIELDS.has(field)) {
      errors.push(`${rel}: unsupported skill field ${JSON.stringify(field)}`);
    }
  }
  if ("allowed-tools" in metadata) {
    checkStringList(errors, rel, "allowed-tools", metadata["allowed-tools"]);
  }
  if ("agent" in metadata && typeof metadata.agent !== "string") {
    addTypeError(errors, rel, "agent", "a string", metadata.agent);
  }
  if ("context" in metadata && metadata.context !== "fork") {
    errors.push(`${rel}: context must be "fork"`);
  }
  for (const field of ["disable-model-invocation", "user-invocable"]) {
    if (field in metadata && typeof metadata[field] !== "boolean") {
      addTypeError(errors, rel, field, "a boolean", metadata[field]);
    }
  }
  if ("version" in metadata && !/^\d+\.\d+\.\d+$/.test(metadata.version)) {
    errors.push(`${rel}: version must be semantic version X.Y.Z`);
  }
  if ("changed" in metadata && !/^\d{4}-\d{2}-\d{2}$/.test(metadata.changed)) {
    errors.push(`${rel}: changed must be an ISO date (YYYY-MM-DD)`);
  }
}

function validateToolDeclarations(errors, rel, metadata, registeredTools) {
  for (const field of ["tools", "allowed-tools"]) {
    if (!(field in metadata)) continue;
    for (const declaration of stringList(metadata[field])) {
      const tool = declaration.replace(/\(.*/, "");
      if (tool.startsWith("mcp__")) {
        if (!tool.startsWith(MCP_PREFIX)) {
          errors.push(`${rel}: MCP tool uses unsupported plugin prefix: ${tool}`);
          continue;
        }
        const registeredName = tool.slice(MCP_PREFIX.length);
        if (registeredTools && !registeredTools.has(registeredName)) {
          errors.push(`${rel}: MCP tool is not registered by the server: ${tool}`);
        }
      } else if (!BUILTIN_TOOLS.has(tool)) {
        errors.push(`${rel}: unknown built-in tool: ${tool}`);
      }
    }
  }
}

async function loadRegisteredTools(serverSourceDir) {
  if (!serverSourceDir) return null;
  const sources = await filesUnder(serverSourceDir, (file) => file.endsWith(".ts"));
  const names = new Set();
  const pattern = /(?:server\.registerTool|registerReadOnlyTool)\s*\(\s*(?:[^,()]+,\s*)?['"]([a-z_]+)['"]/g;
  for (const file of sources) {
    if (file.endsWith(".test.ts")) continue;
    const text = await fs.readFile(file, "utf8");
    for (const match of text.matchAll(pattern)) names.add(match[1]);
  }
  return names;
}

export async function inspectDefinitions(pluginDir, options = {}) {
  const errors = [];
  const agentsDir = path.join(pluginDir, "agents");
  const skillsDir = path.join(pluginDir, "skills");
  const allAgentFiles = await filesUnder(agentsDir);
  const discoveredAgentFiles = allAgentFiles.filter((file) => file.endsWith(".md"));
  for (const file of allAgentFiles.filter((candidate) => !candidate.endsWith(".md"))) {
    errors.push(
      `${slash(path.relative(pluginDir, file))}: agent definition is not discovered because plugin agents must be Markdown files`,
    );
  }

  const allSkillMarkdown = await filesUnder(skillsDir, (file) =>
    file.endsWith("SKILL.md"),
  );
  const discoveredSkillFiles = allSkillMarkdown.filter(
    (file) => path.basename(file) === "SKILL.md" && path.dirname(path.dirname(file)) === skillsDir,
  );
  for (const file of allSkillMarkdown.filter(
    (candidate) => !discoveredSkillFiles.includes(candidate),
  )) {
    errors.push(
      `${slash(path.relative(pluginDir, file))}: skill definition is not discovered from skills/<name>/SKILL.md`,
    );
  }

  const registeredTools = await loadRegisteredTools(options.serverSourceDir);
  const agentNames = new Set();
  const skillNames = new Set();
  const parsed = [];

  for (const file of discoveredAgentFiles) {
    const rel = slash(path.relative(pluginDir, file));
    try {
      const definition = parseFrontmatterText(await fs.readFile(file, "utf8"), rel);
      const expectedName = path.basename(file, ".md");
      const scopedName = slash(path.relative(agentsDir, file))
        .replace(/\.md$/, "")
        .replaceAll("/", ":");
      validateAgent(errors, rel, definition.frontmatter, expectedName);
      validateToolDeclarations(errors, rel, definition.frontmatter, registeredTools);
      if (agentNames.has(scopedName)) errors.push(`${rel}: duplicate agent identity ${scopedName}`);
      agentNames.add(scopedName);
      parsed.push({ kind: "agent", rel, ...definition });
    } catch (error) {
      errors.push(error.message);
    }
  }

  for (const file of discoveredSkillFiles) {
    const rel = slash(path.relative(pluginDir, file));
    try {
      const definition = parseFrontmatterText(await fs.readFile(file, "utf8"), rel);
      const expectedName = path.basename(path.dirname(file));
      validateSkill(errors, rel, definition.frontmatter, expectedName);
      validateToolDeclarations(errors, rel, definition.frontmatter, registeredTools);
      if (skillNames.has(expectedName)) errors.push(`${rel}: duplicate skill identity ${expectedName}`);
      skillNames.add(expectedName);
      parsed.push({ kind: "skill", rel, ...definition });
    } catch (error) {
      errors.push(error.message);
    }
  }

  const pluginName = options.pluginName ?? path.basename(pluginDir);
  for (const definition of parsed) {
    for (const match of definition.body.matchAll(/subagent_type\s*:\s*["']([^"']+)["']/g)) {
      const [namespace, ...nameParts] = match[1].split(":");
      const name = nameParts.join(":");
      if (namespace === pluginName && !agentNames.has(name)) {
        errors.push(`${definition.rel}: referenced agent ${match[1]} does not exist`);
      }
    }
    const preloaded = stringList(definition.frontmatter.skills);
    for (const name of preloaded) {
      const localName = name.startsWith(`${pluginName}:`)
        ? name.slice(pluginName.length + 1)
        : name;
      if (!skillNames.has(localName)) {
        errors.push(`${definition.rel}: preloaded skill ${name} does not exist`);
      }
    }
    const nativeAgent = definition.frontmatter.agent;
    if (typeof nativeAgent === "string" && nativeAgent.startsWith(`${pluginName}:`)) {
      const localName = nativeAgent.slice(pluginName.length + 1);
      if (!agentNames.has(localName)) {
        errors.push(`${definition.rel}: native agent ${nativeAgent} does not exist`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    inventory: {
      agents: [...agentNames].sort(),
      skills: [...skillNames].sort(),
    },
  };
}

export async function inspectWorkflows(pluginDir, options = {}) {
  const errors = [];
  const workflowsDir = path.join(pluginDir, "workflows");
  const allWorkflowFiles = await filesUnder(
    workflowsDir,
    (file) => file.endsWith(".js"),
  );
  const discoveredFiles = allWorkflowFiles.filter(
    (file) => path.dirname(file) === workflowsDir,
  );

  for (const file of allWorkflowFiles.filter(
    (candidate) => !discoveredFiles.includes(candidate),
  )) {
    errors.push(
      `${slash(path.relative(pluginDir, file))}: workflow is not discovered from the top-level workflows directory`,
    );
  }

  const workflows = [];
  for (const file of discoveredFiles) {
    const rel = slash(path.relative(pluginDir, file));
    const expectedName = path.basename(file, ".js");
    const source = await fs.readFile(file, "utf8");
    const metaMatch = source.match(
      /^(?:(?:\s*\/\/[^\n]*(?:\n|$))|(?:\s*\/\*[\s\S]*?\*\/))*\s*export\s+const\s+meta\s*=\s*\{([\s\S]*?)\};/,
    );

    if (!metaMatch) {
      errors.push(`${rel}: export const meta must be the first statement and a literal object`);
      continue;
    }

    const metaBody = metaMatch[1];
    const name = metaBody.match(/\bname\s*:\s*["']([^"']+)["']/)?.[1];
    const description = metaBody.match(/\bdescription\s*:\s*["']([^"']+)["']/)?.[1];
    if (name !== expectedName) {
      errors.push(
        `${rel}: meta name ${JSON.stringify(name)} must match workflow filename ${JSON.stringify(expectedName)}`,
      );
    }
    if (!description) errors.push(`${rel}: meta description must be a non-empty literal string`);

    if (/^\s*import\b/m.test(source) || /\bimport\s*\(/.test(source)) {
      errors.push(`${rel}: module loading is not supported in standalone workflows`);
    }

    const phaseListBody = metaBody.match(/\bphases\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    const declaredPhases = new Set(
      [...phaseListBody.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]),
    );
    for (const match of source.matchAll(/\bphase\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!declaredPhases.has(match[1])) {
        errors.push(`${rel}: phase ${JSON.stringify(match[1])} is not listed in meta.phases`);
      }
    }
    const pluginName = options.pluginName ?? path.basename(pluginDir);
    for (const match of source.matchAll(/\bagentType\s*:\s*["']([^"']+)["']/g)) {
      const [namespace, ...nameParts] = match[1].split(":");
      const localName = nameParts.join(":");
      if (
        namespace === pluginName &&
        options.agentNames &&
        !options.agentNames.has(localName)
      ) {
        errors.push(`${rel}: workflow agent type ${match[1]} does not exist`);
      }
    }
    workflows.push(expectedName);
  }

  return {
    ok: errors.length === 0,
    errors,
    inventory: { workflows: workflows.sort() },
  };
}

export function runNativeValidation(pluginDir, options = {}) {
  const claudeBin = options.claudeBin ?? process.env.CLAUDE_BIN ?? "claude";
  try {
    const output = execFileSync(
      claudeBin,
      ["plugin", "validate", "--strict", "--json", pluginDir],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const report = JSON.parse(output);
    if (!report.success) {
      return { ok: false, error: "native strict validation reported failure", report };
    }
    return { ok: true, report };
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    return { ok: false, error: `native strict validation failed: ${detail}` };
  }
}
