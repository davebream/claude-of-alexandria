import { describe, expect, mock, test } from 'claude-code/testing'

import { PARALLEL_TEXT_SSE } from './fixtures'

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' }
const LOOKUP = 'mcp__plugin_coa_coa__bible_lookup'
const RESULT = JSON.stringify({ provenance: { datasets: [{ id: 'bible_bsb' }] }, verses: [] })
const PANE = (requestId: string) => ({
  component: 'Pane',
  surface: 'terminal',
  requestId,
  viewport: { columns: 160, rows: 40 },
  props: { title: requestId, isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
})

function stubSession(on, extra = {}) {
  const commands: string[] = []
  const toasts: string[] = []
  const logs: string[] = []
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', ($, e) => {
    commands.push(e.name)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', () => ({ ref: 1, result: RESULT, text: RESULT }))
  for (const [name, handler] of Object.entries(extra)) on(name, handler)
  return { commands, toasts, logs }
}

const complete = ($, agentId?: string) =>
  $.turn.complete({ turnId: 't1', answer: 'the answer', durationMs: 5, isAborted: false, reason: 'answer', usage: null, ...(agentId ? { agentId } : {}) })

describe('evidence ledger', () => {
  test('registers /evidence and /passage at session start', async ($, on) => {
    const world = stubSession(on)
    await $.session.start(SESSION)
    expect(world.commands).toEqual(['evidence', 'passage'])
  })

  test('adds a grounding line under the answer, counting subagent lookups', async ($, on) => {
    stubSession(on)
    await $.session.start(SESSION)
    await $.turn.start({ text: 'q', turnId: 't1' })
    await $.tool.call({ tool: LOOKUP, book: 'Romans', range: '8:1-4' })
    await $.tool.call({ tool: LOOKUP, book: 'Romans', range: '8:5-8', agentId: 'sub1' })
    await $.tool.call({ tool: 'Read', file_path: 'notes.md' })
    const done = await complete($)
    expect(done.text).toBe('Grounded in 2 lookups: bible_lookup ×2 · data: bible_bsb')
  })

  test('leaves the answer alone when no lookup ran, and for subagent turns', async ($, on) => {
    stubSession(on)
    await $.session.start(SESSION)
    await $.turn.start({ text: 'q', turnId: 't1' })
    expect((await complete($)).text).toBe('the answer')
    await $.tool.call({ tool: LOOKUP, book: 'Jude', range: '1:3' })
    expect((await complete($, 'sub1')).text).toBe('the answer')
  })

  test('returns the tool result unchanged', async ($, on) => {
    stubSession(on)
    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: LOOKUP, book: 'Jude', range: '1:3' })
    expect(result.result).toBe(RESULT)
  })

  test('/evidence opens a pane that lists the session lookups', async ($, on) => {
    stubSession(on, { 'ui.open': () => ({ value: { isPlaced: true } }) })
    await $.session.start(SESSION)
    await $.tool.call({ tool: LOOKUP, book: 'Jude', range: '1:3' })
    expect(await $.command.run({ command: 'evidence', args: '' })).toEqual({})
    const drawn = JSON.stringify(await $.ui.render(PANE('coa-evidence')))
    expect(drawn).toContain('bible_lookup')
    expect(drawn).toContain('Jude 1:3')
    expect(drawn).toContain('bible_bsb')
  })

  test('/evidence prints the list where no pane can be drawn', async ($, on) => {
    stubSession(on, { 'ui.open': () => ({ value: { isPlaced: false, reason: 'no screen' } }) })
    await $.session.start(SESSION)
    await $.tool.call({ tool: LOOKUP, book: 'Jude', range: '1:3' })
    const answer = await $.command.run({ command: 'evidence', args: '' })
    expect(answer.text).toContain('bible_lookup Jude 1:3')
  })
})

describe('ungrounded-answer warning', () => {
  test('flags a grounded skill that answered without lookups', async ($, on) => {
    stubSession(on, { 'skill.prompt': ($, e) => ({ text: e.text }) })
    await $.session.start(SESSION)
    await $.turn.start({ text: 'q', turnId: 't1' })
    await $.skill.prompt({ skill: 'coa:consult-biblical-scholar', text: 'skill body' })
    const done = await complete($)
    expect(done.text).toContain('coa:consult-biblical-scholar answered without any coa data lookups')
  })

  test('does not flag a grounded skill that looked things up', async ($, on) => {
    stubSession(on, { 'skill.prompt': ($, e) => ({ text: e.text }) })
    await $.session.start(SESSION)
    await $.turn.start({ text: 'q', turnId: 't1' })
    await $.skill.prompt({ skill: 'coa:exegetical-notes', text: 'skill body' })
    await $.tool.call({ tool: LOOKUP, book: 'John', range: '3:16' })
    const done = await complete($)
    expect(done.text).toBe('Grounded in 1 lookup: bible_lookup · data: bible_bsb')
  })

  test('passes the skill text through unchanged', async ($, on) => {
    stubSession(on, { 'skill.prompt': ($, e) => ({ text: e.text }) })
    const expanded = await $.skill.prompt({ skill: 'coa:exegetical-notes', text: 'skill body' })
    expect(expanded.text).toBe('skill body')
  })
})

describe('/passage', () => {
  test('fetches parallel text from the server and draws it in a pane', async ($, on) => {
    const requests: any[] = []
    stubSession(on, {
      'http.fetch': ($, e) => {
        requests.push(e)
        return { value: { status: 200, ok: true, headers: {}, text: PARALLEL_TEXT_SSE } }
      },
      'ui.open': () => ({ value: { isPlaced: true } }),
    })
    await $.session.start(SESSION)
    expect(await $.command.run({ command: 'passage', args: 'Rom 8:1-2 bsb,kjv' })).toEqual({})
    expect(requests.length).toBe(1)
    expect(requests[0].url).toBe('https://coa.davebream.com/mcp')
    expect(JSON.parse(requests[0].init.body).params).toEqual({
      name: 'parallel_text',
      arguments: { book: 'Romans', range: '8:1-2', translations: ['BSB', 'KJV'], page_size: 200 },
    })
    const drawn = JSON.stringify(await $.ui.render(PANE('coa-passage')))
    expect(drawn).toContain('Romans 8:1-2')
    expect(drawn).toContain('KJV')
  })

  test('explains a bad reference in a toast and sends nothing', async ($, on) => {
    let fetched = 0
    const world = stubSession(on, {
      'http.fetch': () => {
        fetched += 1
        return { value: { status: 200, ok: true, headers: {}, text: '' } }
      },
    })
    await $.session.start(SESSION)
    expect(await $.command.run({ command: 'passage', args: 'Hezekiah 3:1' })).toEqual({})
    expect(fetched).toBe(0)
    expect(world.toasts.join('\n')).toContain('Unknown book')
  })

  test('reports a server failure in a toast', async ($, on) => {
    const world = stubSession(on, {
      'http.fetch': () => ({ value: { status: 503, ok: false, headers: {}, text: 'unavailable' } }),
    })
    await $.session.start(SESSION)
    expect(await $.command.run({ command: 'passage', args: 'Rom 8:1' })).toEqual({})
    expect(world.toasts.join('\n')).toContain('503')
  })

  test('prints the passage where no pane can be drawn', async ($, on) => {
    stubSession(on, {
      'http.fetch': () => ({ value: { status: 200, ok: true, headers: {}, text: PARALLEL_TEXT_SSE } }),
      'ui.open': () => ({ value: { isPlaced: false, reason: 'no screen' } }),
    })
    await $.session.start(SESSION)
    const answer = await $.command.run({ command: 'passage', args: 'Rom 8:1-2' })
    expect(answer.text).toContain('Romans 8:1-2')
  })
})

describe('book autocomplete', () => {
  test('suggests book names for an abbreviation', async ($, on) => {
    stubSession(on, { 'prompt.autocomplete': () => ({ suggestions: [] }) })
    const answer = await $.prompt.autocomplete({ token: 'rom' })
    expect(answer.suggestions.map((row) => row.text)).toEqual(['Romans'])
  })
})

describe('model policy guard', () => {
  test('moves a coa agent asked to run on Haiku to Sonnet', async ($, on) => {
    const spawned: any[] = []
    const world = stubSession(on, {
      'agent.spawn': ($, e) => {
        spawned.push(e)
        return { model: e.model ?? 'sonnet', agentId: 'a1' }
      },
    })
    const result = await $.agent.spawn({ subagentType: 'coa:data-retriever', model: 'haiku', prompt: 'p', description: 'd', background: false, fork: false })
    expect(spawned[0].model).toBe('sonnet')
    expect(result.model).toBe('sonnet')
    expect(world.logs.join('\n')).toContain('Sonnet')
  })

  test('refuses a coa workflow agent when the workflow model override names Haiku', async ($, on) => {
    mock.env(on, { CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL: 'haiku' })
    stubSession(on, { 'agent.spawn': () => ({ model: 'sonnet', agentId: 'a1' }) })
    const result = await $.agent.spawn({ subagentType: 'coa:deep-study-retrieval', prompt: 'p', description: 'retrieval', background: false, fork: false, workflow: { runId: 'wf_1', agentIndex: 1 } })
    expect(result.deny).toContain('CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL')
  })

  test('lets other agents and Sonnet workflows through untouched', async ($, on) => {
    mock.env(on, {})
    const spawned: any[] = []
    stubSession(on, {
      'agent.spawn': ($, e) => {
        spawned.push(e)
        return { model: e.model ?? 'sonnet', agentId: 'a1' }
      },
    })
    await $.agent.spawn({ subagentType: 'Explore', model: 'haiku', prompt: 'p', description: 'd', background: false, fork: false })
    await $.agent.spawn({ subagentType: 'coa:deep-study-retrieval', prompt: 'p', description: 'd', background: false, fork: false, workflow: { runId: 'wf_1', agentIndex: 1 } })
    expect(spawned.map((e) => e.model)).toEqual(['haiku', undefined])
  })
})
