// Decides when to flag an answer that a coa skill gave without any coa data
// lookups. Under "no need to look anything up" pressure, the skills answer from
// memory despite their MCP-first rule (docs/adr/0005, RED probe).

// Skills whose contract requires MCP evidence, directly or through their agents.
export const GROUNDED_SKILLS = [
  'coa:argument-flow',
  'coa:biblical-segmentation',
  'coa:consult-biblical-scholar',
  'coa:exegetical-notes',
  'coa:passage-glossary',
  'coa:pericope-delimitation',
]

// Skills that legitimately run without lookups.
export const EXEMPT_SKILLS = ['coa:smoke-test', 'coa:study-team']

export function groundingWarning(turn: { skills: readonly string[]; lookups: number; answer: string }): string | null {
  if (turn.lookups > 0) return null
  if (turn.answer.trim().endsWith('?')) return null
  const grounded = turn.skills.filter((skill) => GROUNDED_SKILLS.includes(skill))
  if (grounded.length === 0) return null
  return `⚠ ${grounded.join(', ')} answered without any coa data lookups. Treat the answer as unverified, or ask again and let it fetch the data.`
}
