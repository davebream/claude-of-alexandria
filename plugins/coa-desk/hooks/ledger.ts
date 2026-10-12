// Records the coa lookups made in a session, including the ones subagents
// make, and summarises the current turn.

export type LedgerEntry = {
  tool: string
  target: string
  datasetIds: readonly string[]
  isError: boolean
  agentId?: string
}

export type Ledger = {
  startTurn(): void
  record(entry: LedgerEntry): void
  noteSkill(skill: string): void
  turnSkills(): readonly string[]
  turnLookups(): number
  turnSummary(): string | null
  sessionEntries(): readonly LedgerEntry[]
  reset(): void
}

export function createLedger(): Ledger {
  let session: LedgerEntry[] = []
  let turn: LedgerEntry[] = []
  let skills: string[] = []
  return {
    startTurn() {
      turn = []
      skills = []
    },
    noteSkill(skill) {
      if (!skills.includes(skill)) skills.push(skill)
    },
    turnSkills() {
      return skills
    },
    turnLookups() {
      return turn.filter((entry) => !entry.isError).length
    },
    record(entry) {
      session.push(entry)
      turn.push(entry)
    },
    turnSummary() {
      const ok = turn.filter((entry) => !entry.isError)
      const failed = turn.length - ok.length
      if (ok.length === 0) return null
      const counts = new Map<string, number>()
      for (const entry of ok) counts.set(entry.tool, (counts.get(entry.tool) ?? 0) + 1)
      const tools = [...counts].map(([tool, count]) => (count > 1 ? `${tool} ×${count}` : tool)).join(', ')
      const datasets = [...new Set(ok.flatMap((entry) => entry.datasetIds))]
      const parts = [`Grounded in ${ok.length} lookup${ok.length === 1 ? '' : 's'}: ${tools}`]
      if (datasets.length > 0) parts.push(`data: ${datasets.join(', ')}`)
      if (failed > 0) parts.push(`${failed} failed lookup${failed === 1 ? '' : 's'}`)
      return parts.join(' · ')
    },
    sessionEntries() {
      return session
    },
    reset() {
      session = []
      turn = []
      skills = []
    },
  }
}
