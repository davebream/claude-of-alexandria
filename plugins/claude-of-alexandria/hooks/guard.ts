// The only code the coa plugin runs: a guard that keeps coa agents off Haiku,
// which this project does not support (docs/adr/0002, 2026-09-30 amendment;
// docs/adr/0006). Everything else in coa is Markdown and a remote MCP server.
//
// It reads one environment variable and logs one line. It reads no files,
// makes no network requests and starts no processes.

const HAIKU = /haiku/i

export function register(on) {
  // An Agent-tool spawn can be moved to Sonnet. A workflow agent's model cannot
  // be changed from a hook, so a Haiku workflow override is refused instead.
  on('agent.spawn', { subagentType: /^coa:/ }, async ($, e, next) => {
    if (e.workflow) {
      const forced = await $.env.get('CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL')
      if (!HAIKU.test(String(forced ?? '')) && !HAIKU.test(String(e.model ?? ''))) return next(e)
      return {
        deny: 'coa workflow agents do not run on Haiku. Unset CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL or set it to sonnet or opus, then run the workflow again.',
      }
    }
    if (!HAIKU.test(String(e.model ?? ''))) return next(e)
    await $.ui.log(`${e.subagentType} asked for ${e.model}; coa agents run on Sonnet instead.`)
    return next({ ...e, model: 'sonnet' })
    // Fail open: a fault in this guard must never stop coa agents from starting.
  }).catch(async ($, e, next) => next(e))
}
