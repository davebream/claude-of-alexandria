import { describe, expect, mock, test } from 'claude-code/testing'

function stubLog(on) {
  const logs: string[] = []
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  return logs
}

const spawnEvent = (extra = {}) => ({ prompt: 'p', description: 'd', background: false, fork: false, ...extra })

describe('model policy guard', () => {
  test('moves a coa agent asked to run on Haiku to Sonnet', async ($, on) => {
    const logs = stubLog(on)
    const spawned: any[] = []
    on('agent.spawn', ($, e) => {
      spawned.push(e)
      return { model: e.model ?? 'sonnet', agentId: 'a1' }
    })
    const result = await $.agent.spawn(spawnEvent({ subagentType: 'coa:data-retriever', model: 'haiku' }))
    expect(spawned[0].model).toBe('sonnet')
    expect(result.model).toBe('sonnet')
    expect(logs.join('\n')).toContain('Sonnet')
  })

  test('refuses a coa workflow agent when the workflow model override names Haiku', async ($, on) => {
    mock.env(on, { CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL: 'claude-haiku-5-5' })
    on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a1' }))
    const result = await $.agent.spawn(
      spawnEvent({ subagentType: 'coa:deep-study-retrieval', workflow: { runId: 'wf_1', agentIndex: 1 } }),
    )
    expect(result.deny).toContain('CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL')
  })

  test('lets other agents, Sonnet spawns and Sonnet workflows through untouched', async ($, on) => {
    mock.env(on, { CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL: 'sonnet' })
    const spawned: any[] = []
    on('agent.spawn', ($, e) => {
      spawned.push(e)
      return { model: e.model ?? 'sonnet', agentId: 'a1' }
    })
    await $.agent.spawn(spawnEvent({ subagentType: 'Explore', model: 'haiku' }))
    await $.agent.spawn(spawnEvent({ subagentType: 'coa:data-retriever', model: 'opus' }))
    await $.agent.spawn(
      spawnEvent({ subagentType: 'coa:deep-study-retrieval', workflow: { runId: 'wf_1', agentIndex: 1 } }),
    )
    expect(spawned.map((e) => e.model)).toEqual(['haiku', 'opus', undefined])
  })
})
