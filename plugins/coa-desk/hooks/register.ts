// coa-desk: an opt-in companion to the coa plugin. Nothing here is required for
// the coa skills to work; see docs/adr/0005-companion-mods-plugin.md.
//
// - A line under each answer names the coa lookups that grounded it, or warns
//   when a coa skill answered without any.
// - /evidence lists the session's lookups; /passage <ref> shows parallel text.
// - Book names autocomplete in the prompt.
// The guard that keeps coa agents off Haiku lives in coa itself (docs/adr/0006).

import { BOOKS } from './books'
import { groundingWarning } from './grounding'
import { createLedger } from './ledger'
import { MCP_HEADERS, MCP_URL, parseRpcResponse, rpcBody } from './mcp'
import { renderPassage } from './passage'
import { datasetIdsOf } from './provenance'
import { parseReference, suggestBooks, USAGE } from './reference'

const COA_TOOL = /^mcp__plugin_coa_coa__/
const EVIDENCE_PANE = 'coa-evidence'
const PASSAGE_PANE = 'coa-passage'

const ledger = createLedger()
let passageMarkdown = ''

function targetOf(e: Record<string, unknown>): string {
  if (typeof e.book === 'string') {
    return typeof e.range === 'string' ? `${e.book} ${e.range}` : e.book
  }
  const first = Object.entries(e).find(
    ([key, value]) => !['tool', 'tool_use_id', 'agentId'].includes(key) && typeof value === 'string',
  )
  return first ? String(first[1]) : ''
}

function evidenceMarkdown(): string {
  const entries = ledger.sessionEntries()
  if (entries.length === 0) return 'No coa lookups yet in this session.'
  return entries
    .map((entry) => {
      const where = entry.target ? ` ${entry.target}` : ''
      const data = entry.datasetIds.length > 0 ? ` (${entry.datasetIds.join(', ')})` : ''
      const failed = entry.isError ? ' [failed]' : ''
      const who = entry.agentId ? ' [subagent]' : ''
      return `- ${entry.tool}${where}${data}${failed}${who}`
    })
    .join('\n')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'evidence', description: 'List the coa data lookups made in this session', immediate: true })
      await $.command.register({ name: 'passage', description: 'Show a Bible passage in parallel translations', argumentHint: '<book> <chapter:verse> [BSB,KJV,…]', immediate: true })
    } catch (error) {
      await $.ui.log(`coa-desk could not add its commands: ${String(error)}`)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    ledger.reset()
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    ledger.startTurn()
    return next(e)
  })

  on('skill.prompt', { skill: /^coa:/ }, async ($, e, next) => {
    ledger.noteSkill(e.skill)
    return next(e)
  })

  on('tool.call', { tool: /^mcp__plugin_coa_coa__/ }, async ($, e, next) => {
    const result = await next(e)
    ledger.record({
      tool: String(e.tool).replace(COA_TOOL, ''),
      target: targetOf(e),
      datasetIds: datasetIdsOf(result),
      isError: Boolean(result?.isError || result?.deny),
      agentId: e.agentId,
    })
    $.ui.invalidate('ui.render')
    return result
    // Observe only: if recording fails, the tool result still reaches Claude.
  }).catch(async ($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const summary =
      ledger.turnSummary() ??
      groundingWarning({ skills: ledger.turnSkills(), lookups: ledger.turnLookups(), answer: String(e.answer ?? '') })
    if (!summary) return result
    const earlier = result?.text && result.text !== e.answer ? `${result.text}\n` : ''
    return { ...result, text: `${earlier}${summary}` }
  })

  on('command.run', { command: 'evidence' }, async ($) => {
    const opened = await $.ui.open({ id: EVIDENCE_PANE, title: 'coa evidence', closeOnEscape: true })
    if (opened?.isPlaced) return {}
    return { text: evidenceMarkdown() }
  })

  on('command.run', { command: 'passage' }, async ($, e) => {
    const reference = parseReference(e.args ?? '', BOOKS)
    if ('error' in reference) {
      await $.ui.toast(reference.error)
      return {}
    }
    const args: Record<string, unknown> = { book: reference.book, range: reference.range, page_size: 200 }
    if (reference.translations.length > 0) args.translations = reference.translations
    let response
    try {
      response = await $.http.fetch(MCP_URL, { method: 'POST', headers: MCP_HEADERS, body: rpcBody('parallel_text', args) })
    } catch (error) {
      await $.ui.toast(`Could not reach the coa server: ${String(error)}`)
      return {}
    }
    if (!response.ok) {
      await $.ui.toast(`The coa server answered ${response.status}. ${USAGE}`)
      return {}
    }
    const parsed = parseRpcResponse(response.text)
    if (parsed.isError) {
      await $.ui.toast(parsed.message)
      return {}
    }
    passageMarkdown = renderPassage(parsed.payload)
    const opened = await $.ui.open({ id: PASSAGE_PANE, title: `${reference.book} ${reference.range}`, closeOnEscape: true })
    $.ui.invalidate('ui.render')
    if (opened?.isPlaced) return {}
    return { text: passageMarkdown }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== EVIDENCE_PANE && e.requestId !== PASSAGE_PANE) return next(e)
    const { Markdown } = $.ui.resolve(e)
    const text = e.requestId === EVIDENCE_PANE ? evidenceMarkdown() : passageMarkdown
    return Markdown({ key: e.requestId, text })
  })

  on('prompt.autocomplete', async ($, e, next) => {
    const suggestions = suggestBooks(String(e.token ?? ''), BOOKS)
    if (suggestions.length === 0) return next(e)
    return { suggestions }
  })
}
