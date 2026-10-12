// Renders a parallel_text payload as Markdown for the passage pane.

type Verse = { chapter: number; verse: number; translations: Record<string, string> }
type Dataset = { id: string; title?: string }

export function renderPassage(payload: any): string {
  const verses: Verse[] = Array.isArray(payload?.verses) ? payload.verses : []
  const lines = [`## ${payload?.book ?? ''} ${payload?.range ?? ''}`.trim(), '']
  for (const verse of verses) {
    lines.push(`**${verse.chapter}:${verse.verse}**`)
    for (const [translation, text] of Object.entries(verse.translations ?? {})) {
      lines.push(`- ${translation}: ${text}`)
    }
    lines.push('')
  }
  if (Array.isArray(payload?.missing_verses) && payload.missing_verses.length > 0) {
    lines.push(`Missing in some translations: ${payload.missing_verses.join(', ')}`, '')
  }
  if (payload?.versification_note) lines.push(`_${payload.versification_note}_`, '')
  const datasets: Dataset[] = Array.isArray(payload?.provenance?.datasets) ? payload.provenance.datasets : []
  if (datasets.length > 0) {
    lines.push(`Sources: ${datasets.map((dataset) => dataset.title ?? dataset.id).join('; ')}`)
  }
  return lines.join('\n').trimEnd()
}
