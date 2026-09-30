import assert from "node:assert/strict";
import test from "node:test";

import SdkConsumerInstallProvider from "../../tests/promptfoo/providers/sdk-consumer-install.mjs";
import SdkDirectAgentProvider from "../../tests/promptfoo/providers/sdk-direct-agent.mjs";
import SdkProvider from "../../tests/promptfoo/providers/sdk-provider.mjs";
import SdkWithSkillProvider from "../../tests/promptfoo/providers/sdk-with-skill.mjs";
import SdkBareProvider from "../../tests/promptfoo/providers/sdk-bare.mjs";
import SdkGraderProvider from "../../tests/promptfoo/providers/sdk-grader.mjs";

test("consumer install uses an external cwd and no injected repair prompt", () => {
  const provider = new SdkConsumerInstallProvider();
  const options = provider.buildOptions();

  assert.deepEqual(options.settingSources, []);
  assert.deepEqual(options.systemPrompt, { type: "preset", preset: "claude_code" });
  assert.equal(options.plugins.length, 1);
  assert.equal(options.plugins[0].path.startsWith("/"), true);
  assert.ok(options.allowedTools.includes("Workflow"));
  assert.ok(options.allowedTools.some((tool) => tool.endsWith("__*")));
  assert.equal(options.strictMcpConfig, true);
  assert.deepEqual(options.mcpServers, {
    "plugin_claude-of-alexandria_claude-of-alexandria-mcp": {
      type: "http", url: "https://coa.davebream.com/mcp",
    },
  });
});

test("direct-agent provider selects the real definition and verifies its model family", () => {
  const provider = new SdkDirectAgentProvider({
    config: { agent_name: "claude-of-alexandria:smoke-test" },
  });

  assert.equal(provider.buildOptions().agent, "claude-of-alexandria:smoke-test");
  assert.equal(provider.expectedModelFamily(), "sonnet");

  const inherited = new SdkDirectAgentProvider({
    config: {
      agent_name: "claude-of-alexandria:deep-study-analysis",
      model: "claude-sonnet-5",
    },
  });
  assert.equal(inherited.expectedModelFamily(), "sonnet");
});

test("RED defaults to Sonnet and retains explicit Opus", () => {
  assert.equal(new SdkBareProvider().buildOptions().model, "sonnet");
  assert.equal(new SdkBareProvider({ config: { model: "" } }).buildOptions().model, "sonnet");
  assert.equal(new SdkBareProvider({ config: { model: "opus" } }).buildOptions().model, "opus");
});

test("evaluation child processes route background Haiku work to default Sonnet", () => {
  const before = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
  const env = new SdkBareProvider().buildEnv();
  assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, "sonnet");
  assert.equal(process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, before);
});

test("every eval provider refuses Haiku before loading the SDK", async () => {
  for (const Provider of [SdkBareProvider, SdkGraderProvider, SdkWithSkillProvider, SdkConsumerInstallProvider, SdkDirectAgentProvider]) {
    for (const model of ["haiku", "claude-haiku-4-5", "Haiku"]) {
      const provider = new Provider({ config: { model, agent_name: "claude-of-alexandria:smoke-test" } });
      provider._loadSdk = async () => { throw new Error("SDK must not load"); };
      const result = await provider.callApi("prompt");
      assert.match(result.error, /haiku.*not permitted/i);
    }
  }
});

test("a hardcoded Haiku provider default is refused before SDK loading", async () => {
  class UnsafeProvider extends SdkProvider {
    buildOptions() { return { model: "claude-haiku-4-5" }; }
  }
  const provider = new UnsafeProvider();
  provider._loadSdk = async () => { throw new Error("SDK must not load"); };
  const result = await provider.callApi("prompt");
  assert.match(result.error, /haiku.*not permitted/i);
});

test("Haiku in a child trace fails even when Sonnet also ran", async () => {
  const provider = new SdkBareProvider();
  provider._sdk = { query: async () => (async function* () {
    yield { type: "assistant", message: { model: "claude-sonnet-5", content: [] } };
    yield { type: "system", subtype: "task_started", model: "claude-haiku-4-5" };
    yield { type: "result", subtype: "success", result: "done", usage: {} };
  })() };
  const result = await provider.callApi("prompt");
  assert.match(result.error, /haiku.*not permitted/i);
  assert.ok(result.metadata.effectiveModels.includes("claude-haiku-4-5"));
});

test("Haiku reported only in modelUsage cannot hide behind a Sonnet parent", async () => {
  const provider = new SdkBareProvider();
  provider._sdk = { query: async () => (async function* () {
    yield { type: "result", subtype: "success", result: "done", usage: {},
      modelUsage: { "claude-sonnet-5": {}, "claude-haiku-4-5": {} } };
  })() };
  const result = await provider.callApi("prompt");
  assert.match(result.error, /haiku.*not permitted/i);
});

test("successful zero-MCP behavior is not retried", async () => {
  const original = SdkProvider.prototype.callApi;
  let calls = 0;
  SdkProvider.prototype.callApi = async () => {
    calls += 1;
    return {
      output: "behavioral result",
      cost: 1,
      tokenUsage: { prompt: 2, completion: 3, total: 5 },
      metadata: { toolResults: [] },
    };
  };
  try {
    const result = await new SdkWithSkillProvider().callApi("prompt");
    assert.equal(calls, 1);
    assert.equal(result.metadata.attempts.length, 1);
  } finally {
    SdkProvider.prototype.callApi = original;
  }
});

test("one positive infrastructure retry retains both attempts and usage", async () => {
  const original = SdkProvider.prototype.callApi;
  let calls = 0;
  SdkProvider.prototype.callApi = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        error: "MCP server connection failed",
        cost: 1,
        tokenUsage: { prompt: 2, completion: 3, total: 5 },
        metadata: { toolResults: [] },
      };
    }
    return {
      output: "recovered",
      cost: 4,
      tokenUsage: { prompt: 5, completion: 6, total: 11 },
      metadata: { toolResults: [] },
    };
  };
  try {
    const result = await new SdkWithSkillProvider().callApi("prompt");
    assert.equal(calls, 2);
    assert.equal(result.metadata.attempts.length, 2);
    assert.equal(result.cost, 5);
    assert.deepEqual(result.tokenUsage, { prompt: 7, completion: 9, total: 16 });
  } finally {
    SdkProvider.prototype.callApi = original;
  }
});

test("provider trace retains tool IDs, parents, errors, lifecycle, models, and usage", async () => {
  class TraceProvider extends SdkProvider {
    buildOptions() {
      return { model: "requested-model" };
    }
  }
  const provider = new TraceProvider({ config: { working_dir: "/tmp" } });
  const messages = [
    {
      type: "assistant",
      parent_tool_use_id: "parent-1",
      message: {
        model: "effective-parent-model",
        content: [{ type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "/tmp/x" } }],
      },
    },
    {
      type: "user",
      parent_tool_use_id: "parent-1",
      message: {
        content: [{ type: "tool_result", tool_use_id: "tool-1", content: "failed", is_error: true }],
      },
    },
    { type: "system", subtype: "task_started", model: "effective-child-model" },
    {
      type: "result",
      subtype: "success",
      result: "done",
      structured_output: { ok: true },
      usage: { input_tokens: 2, output_tokens: 3 },
      total_cost_usd: 0.5,
    },
  ];
  provider._sdk = {
    query: async () => (async function* () {
      for (const message of messages) yield message;
    })(),
  };

  const result = await provider.callApi("prompt");

  assert.deepEqual(result.metadata.toolCalls[0], {
    id: "tool-1",
    name: "Read",
    input: { file_path: "/tmp/x" },
    parentToolUseId: "parent-1",
  });
  assert.equal(result.metadata.toolResults[0].isError, true);
  assert.equal(result.metadata.childLifecycle.length, 1);
  assert.deepEqual(result.metadata.structuredOutput, { ok: true });
  assert.deepEqual(result.metadata.effectiveModels.sort(), [
    "effective-child-model",
    "effective-parent-model",
  ]);
  assert.deepEqual(result.metadata.usage, { input_tokens: 2, output_tokens: 3 });
});

test("provider propagates a signal that was already aborted", async () => {
  class AbortProvider extends SdkProvider {
    buildOptions() {
      return { model: "requested-model" };
    }
  }
  const provider = new AbortProvider({ config: { working_dir: "/tmp" } });
  provider._sdk = {
    query: async ({ options }) => {
      assert.equal(options.abortController.signal.aborted, true);
      const error = new Error("already aborted");
      error.name = "AbortError";
      throw error;
    },
  };
  const abortController = new AbortController();
  abortController.abort("test cancellation");

  const response = await provider.callApi("prompt", {}, {
    abortSignal: abortController.signal,
  });

  assert.equal(response.error, "SDK call aborted");
});

test("workflow evaluation keeps input open and waits past launch acknowledgements", async () => {
  const provider = new SdkConsumerInstallProvider({ config: { wait_for_background: true } });
  provider._sdk = { query: async ({ prompt }) => {
    assert.equal(typeof prompt[Symbol.asyncIterator], "function");
    const input = prompt[Symbol.asyncIterator]();
    assert.equal((await input.next()).value.message.content, "run workflow");
    return (async function* () {
      yield { type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "wf1" }] };
      yield { type: "result", subtype: "success", result: "launched", usage: {} };
      yield { type: "system", subtype: "background_tasks_changed", tasks: [] };
      yield { type: "system", subtype: "task_notification", task_id: "wf1", status: "completed" };
      yield { type: "result", subtype: "success", result: "final report", usage: {} };
    })();
  } };
  const result = await provider.callApi("run workflow");
  assert.equal(result.output, "final report");
  assert.ok(result.metadata.childLifecycle.some((event) => event.status === "completed"));
});
