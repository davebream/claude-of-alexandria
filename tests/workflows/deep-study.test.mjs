import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

import { generateDeepStudyWorkflow } from "../../scripts/generate-deep-study-workflow.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = path.join(
  ROOT,
  "plugins/claude-of-alexandria/workflows/deep-study.js",
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const AGENTS_DIRECTORY = path.join(
  ROOT,
  "plugins/claude-of-alexandria/agents",
);

async function agentTools(name) {
  const source = await fs.readFile(path.join(AGENTS_DIRECTORY, `${name}.md`), "utf8");
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  assert.ok(frontmatter, `${name} must have frontmatter`);
  const tools = parse(frontmatter).tools;
  return Array.isArray(tools) ? tools : tools.split(",").map((tool) => tool.trim());
}

const request = {
  passage: "Philippians 2:5-11",
  researchQuestion: "How does the passage present Christ's humiliation and exaltation?",
  outputLanguage: "English",
  context: "Preparing an exegetical teaching outline.",
  constraints: ["Distinguish text evidence from interpretation."],
};

function fixtures(overrides = {}) {
  return {
    retrieval: {
      status: "complete",
      genre: "NT epistle",
      passageAnchors: ["Philippians 2:5-11"],
      evidence: [
        {
          id: "ev-1",
          kind: "morphology",
          passageAnchor: "Philippians 2:5-11",
          summary: "MCP morphology result",
          sourceTool: "query_morphology",
          datasetVersion: null,
        },
      ],
      toolOutcomes: [
        { tool: "query_morphology", status: "success", error: null },
      ],
      limitations: [],
    },
    boundary: {
      status: "complete",
      requestedPassage: "Philippians 2:5-11",
      recommendation: "retain",
      rationale: "The requested range is coherent.",
      evidenceIds: ["ev-1"],
    },
    discourse: {
      status: "complete",
      perspective: "discourse",
      claims: [
        {
          id: "claim-discourse-1",
          text: "The clauses form a humiliation-to-exaltation movement.",
          passageAnchors: ["Philippians 2:5-11"],
          evidenceIds: ["ev-1"],
        },
      ],
      limitations: [],
    },
    interpretation: {
      status: "complete",
      perspective: "interpretation",
      claims: [
        {
          id: "claim-interpretation-1",
          text: "The movement is Christological before it is exemplary.",
          passageAnchors: ["Philippians 2:5-11"],
          evidenceIds: ["ev-1"],
        },
      ],
      limitations: [],
    },
    verification: {
      status: "verified",
      findings: [
        {
          claimId: "claim-discourse-1",
          verdict: "supported",
          evidenceIds: ["ev-1"],
          explanation: "The claim is anchored in the retrieved evidence.",
        },
        {
          claimId: "claim-interpretation-1",
          verdict: "supported",
          evidenceIds: ["ev-1"],
          explanation: "The interpretation respects the passage movement.",
        },
      ],
      repairTargets: [],
      unresolvedClaims: [],
    },
    repair: {
      status: "complete",
      perspective: "repair",
      claims: [],
      limitations: [],
    },
    reverify: {
      status: "verified",
      findings: [],
      repairTargets: [],
      unresolvedClaims: [],
    },
    synthesis: {
      status: "complete",
      title: "Deep study: Philippians 2:5-11",
      requestedPassage: "Philippians 2:5-11",
      researchQuestion: request.researchQuestion,
      claimReferences: ["claim-discourse-1", "claim-interpretation-1"],
      evidenceReferences: ["ev-1"],
      unresolvedClaims: [],
      limitations: [],
      renderedReport: "# Deep study\n\nThe passage presents humiliation followed by exaltation.",
    },
    ...overrides,
  };
}

async function executeWorkflow(args, values) {
  const source = (await fs.readFile(WORKFLOW, "utf8")).replace(
    "export const meta =",
    "const meta =",
  );
  const labels = [];
  const options = [];
  const prompts = [];
  let active = 0;
  let maxActive = 0;
  const agent = async (prompt, callOptions) => {
    labels.push(callOptions.label);
    options.push(callOptions);
    prompts.push(prompt);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    const value = values[callOptions.label];
    if (value instanceof Error) throw value;
    return structuredClone(value);
  };
  const parallel = async (tasks) =>
    Promise.all(tasks.map((task) => (typeof task === "function" ? task() : task)));
  const phase = () => {};
  const log = () => {};
  const run = new AsyncFunction("agent", "parallel", "phase", "log", "args", source);
  const result = await run(agent, parallel, phase, log, args);
  return { result, labels, options, prompts, maxActive };
}

test("asks for clarification before launching an agent when input is incomplete", async () => {
  const run = await executeWorkflow({ passage: "Philippians 2:5-11" }, fixtures());

  assert.equal(run.labels.length, 0);
  assert.equal(run.result.status, "needs_clarification");
  assert.deepEqual(run.result.missingFields, [
    "researchQuestion",
    "outputLanguage",
    "context",
    "constraints",
  ]);
});

test("runs the fixed graph with at most two concurrent and eight total calls", async () => {
  const run = await executeWorkflow(request, fixtures());

  assert.deepEqual(run.labels, [
    "retrieval",
    "boundary",
    "discourse",
    "interpretation",
    "verification",
    "synthesis",
  ]);
  assert.ok(run.maxActive <= 2);
  assert.ok(run.labels.length <= 8);
  assert.ok(run.options.every((option) => option.schema));
  assert.deepEqual(
    run.options.map(({ label, agentType }) => [label, agentType]),
    [
      ["retrieval", "claude-of-alexandria:deep-study-retrieval"],
      ["boundary", "claude-of-alexandria:deep-study-analysis"],
      ["discourse", "claude-of-alexandria:deep-study-analysis"],
      ["interpretation", "claude-of-alexandria:deep-study-analysis"],
      ["verification", "claude-of-alexandria:deep-study-verification"],
      ["synthesis", "claude-of-alexandria:deep-study-synthesis"],
    ],
  );
  assert.equal(run.result.status, "complete");
});

test("leaf agent types enforce workflow tool boundaries", async () => {
  const retrievalTools = await agentTools("deep-study-retrieval");
  const verificationTools = await agentTools("deep-study-verification");
  const analysisTools = await agentTools("deep-study-analysis");
  const synthesisTools = await agentTools("deep-study-synthesis");
  const readOnlyMcpPrefix =
    "mcp__plugin_claude-of-alexandria_claude-of-alexandria-mcp__";

  assert.ok(retrievalTools.length > 0);
  assert.ok(verificationTools.length > 0);
  assert.ok(retrievalTools.every((tool) => tool.startsWith(readOnlyMcpPrefix)));
  assert.ok(verificationTools.every((tool) => tool.startsWith(readOnlyMcpPrefix)));
  assert.deepEqual(analysisTools, []);
  assert.deepEqual(synthesisTools, []);
  assert.ok(![...retrievalTools, ...verificationTools].includes("Agent"));
});

test("runs at most one repair and re-verification cycle", async () => {
  const values = fixtures({
    verification: {
      status: "needs_repair",
      findings: [],
      repairTargets: ["claim-interpretation-1"],
      unresolvedClaims: ["claim-interpretation-1"],
    },
  });
  const run = await executeWorkflow(request, values);

  assert.deepEqual(run.labels, [
    "retrieval",
    "boundary",
    "discourse",
    "interpretation",
    "verification",
    "repair",
    "reverify",
    "synthesis",
  ]);
  assert.equal(run.labels.filter((label) => label === "repair").length, 1);
  assert.equal(run.labels.length, 8);
});

test("preserves a stopped retrieval instead of treating null as empty evidence", async () => {
  const run = await executeWorkflow(request, fixtures({ retrieval: null }));

  assert.deepEqual(run.labels, ["retrieval"]);
  assert.equal(run.result.status, "incomplete");
  assert.equal(run.result.stageOutcomes.retrieval, "stopped_or_failed");
  assert.match(run.result.renderedReport, /stopped or failed/i);
});

test("reports an exhausted host budget as an incomplete launch failure", async () => {
  const run = await executeWorkflow(
    request,
    fixtures({ retrieval: new Error("workflow output-token budget exhausted") }),
  );

  assert.deepEqual(run.labels, ["retrieval"]);
  assert.equal(run.result.status, "incomplete");
  assert.match(run.result.validationErrors[0], /budget exhausted/i);
});

test("stops dependent analysis when essential evidence is unavailable", async () => {
  const values = fixtures();
  values.retrieval.status = "unavailable";
  values.retrieval.toolOutcomes[0] = {
    tool: "query_morphology",
    status: "failed",
    error: "MCP transport failed",
  };
  const run = await executeWorkflow(request, values);

  assert.deepEqual(run.labels, ["retrieval"]);
  assert.equal(run.result.status, "incomplete");
  assert.match(run.result.renderedReport, /essential evidence is unavailable/i);
});

test("downgrades a schema-valid synthesis with unknown references", async () => {
  const values = fixtures();
  values.synthesis.evidenceReferences = ["fabricated-evidence-id"];
  const run = await executeWorkflow(request, values);

  assert.equal(run.result.status, "incomplete");
  assert.match(run.result.renderedReport, /reference validation failed/i);
  assert.deepEqual(run.result.validationErrors, [
    "Unknown evidence reference: fabricated-evidence-id",
  ]);
});

test("preserves cancellation during analysis fan-out", async () => {
  const run = await executeWorkflow(request, fixtures({ discourse: null }));

  assert.deepEqual(run.labels, ["retrieval", "boundary", "discourse", "interpretation"]);
  assert.equal(run.result.status, "incomplete");
  assert.equal(run.result.stageOutcomes.analysis, "stopped_or_failed");
});

test("stops after the single permitted repair fails", async () => {
  const values = fixtures({
    verification: {
      status: "needs_repair",
      findings: [],
      repairTargets: ["claim-interpretation-1"],
      unresolvedClaims: ["claim-interpretation-1"],
    },
    repair: { status: "failed", perspective: "repair", claims: [], limitations: [] },
  });
  const run = await executeWorkflow(request, values);

  assert.deepEqual(run.labels, [
    "retrieval",
    "boundary",
    "discourse",
    "interpretation",
    "verification",
    "repair",
  ]);
  assert.equal(run.result.status, "incomplete");
});

test("does not promote unresolved verification to complete", async () => {
  const values = fixtures({
    verification: {
      status: "incomplete",
      findings: [],
      repairTargets: [],
      unresolvedClaims: ["claim-interpretation-1"],
    },
  });
  values.synthesis.status = "complete";
  values.synthesis.unresolvedClaims = ["claim-interpretation-1"];
  const run = await executeWorkflow(request, values);

  assert.equal(run.result.status, "incomplete");
  assert.match(run.result.renderedReport, /verification did not finish/i);
});

test("keeps agent prompts stable for replay and changes the suffix input explicitly", async () => {
  const first = await executeWorkflow(request, fixtures());
  const replay = await executeWorkflow(request, fixtures());
  const changedRequest = {
    ...request,
    researchQuestion: "What ethical force does the passage give this movement?",
  };
  const changed = await executeWorkflow(changedRequest, fixtures());
  const fresh = await executeWorkflow({ ...request, fresh: true }, fixtures());

  assert.deepEqual(replay.prompts, first.prompts);
  assert.notEqual(changed.prompts[0], first.prompts[0]);
  assert.notEqual(fresh.prompts[0], first.prompts[0]);
});

test("an unfinished prefix can restart without being mistaken for empty evidence", async () => {
  const stopped = await executeWorkflow(request, fixtures({ retrieval: null }));
  const restarted = await executeWorkflow(request, fixtures());

  assert.deepEqual(stopped.labels, ["retrieval"]);
  assert.equal(stopped.result.status, "incomplete");
  assert.deepEqual(restarted.labels, [
    "retrieval",
    "boundary",
    "discourse",
    "interpretation",
    "verification",
    "synthesis",
  ]);
  assert.equal(restarted.result.status, "complete");
});

test("committed standalone workflow matches the generated artifact", async () => {
  const committed = await fs.readFile(WORKFLOW, "utf8");
  assert.equal(committed, await generateDeepStudyWorkflow());
  assert.doesNotMatch(committed, /^\s*import\b/m);
});
