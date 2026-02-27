/**
 * Tool call assertion helpers for Claude Agent SDK promptfoo tests.
 *
 * IMPORTANT: metadata.toolCalls does NOT exist in the Agent SDK provider.
 * metadata is always undefined. Tool call detection uses raw.num_turns instead.
 *
 * raw.num_turns > 1 means the agent made at least one tool call.
 * (1 turn = response only, 2+ turns = at least one tool call round)
 *
 * Usage in promptfoo YAML:
 *   - type: javascript
 *     value: |
 *       const { hadToolCalls } = require('../../assertions/tool-calls');
 *       return hadToolCalls(context);
 */

function getRaw(context) {
  try {
    return JSON.parse(context.providerResponse?.raw || '{}');
  } catch {
    return {};
  }
}

/** Did the agent make any tool calls? (num_turns > 1) */
function hadToolCalls(context) {
  return (getRaw(context).num_turns || 0) > 1;
}

/** Did the agent take at least N turns? (proxy for N-1 tool call rounds) */
function hadAtLeastNTurns(n, context) {
  return (getRaw(context).num_turns || 0) >= n;
}

/** Number of turns taken. */
function getNumTurns(context) {
  return getRaw(context).num_turns || 0;
}

/** Total cost in USD. */
function getCostUSD(context) {
  return getRaw(context).total_cost_usd || 0;
}

module.exports = { hadToolCalls, hadAtLeastNTurns, getNumTurns, getCostUSD };
