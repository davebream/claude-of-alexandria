import assert from "node:assert/strict";
import test from "node:test";

import SdkConsumerInstallProvider from "../../tests/promptfoo/providers/sdk-consumer-install.mjs";
import SdkDirectAgentProvider from "../../tests/promptfoo/providers/sdk-direct-agent.mjs";
import SdkProvider from "../../tests/promptfoo/providers/sdk-provider.mjs";
import SdkWithSkillProvider from "../../tests/promptfoo/providers/sdk-with-skill.mjs";

test("consumer install uses an external cwd and no injected repair prompt", () => {
  const provider = new SdkConsumerInstallProvider();
  const options = provider.buildOptions();

  assert.deepEqual(options.settingSources, []);
  assert.equal(options.systemPrompt, undefined);
  assert.equal(options.plugins.length, 1);
  assert.equal(options.plugins[0].path.startsWith("/"), true);
  assert.ok(options.allowedTools.includes("Workflow"));
  assert.ok(options.allowedTools.some((tool) => tool.endsWith("__*")));
});

test("direct-agent provider selects the real definition and verifies its model family", () => {
  const provider = new SdkDirectAgentProvider({
    config: { agent_name: "claude-of-alexandria:smoke-test" },
  });

  assert.equal(provider.buildOptions().agent, "claude-of-alexandria:smoke-test");
  assert.equal(provider.expectedModelFamily(), "haiku");

  const inherited = new SdkDirectAgentProvider({
    config: {
      agent_name: "claude-of-alexandria:deep-study-analysis",
      model: "claude-sonnet-5",
    },
  });
  assert.equal(inherited.expectedModelFamily(), "sonnet");
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
