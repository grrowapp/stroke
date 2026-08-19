// 差し戻しのコメント。spec-workflow-mcp の approvals に倣う。
// 注釈は生の Markdown に対して付け、オフセットで位置を持つ。
export type HighlightColor = { bg: string; border: string; name: string }

export const highlightColors: HighlightColor[] = [
  { name: 'yellow', bg: 'rgba(255, 235, 59, 0.35)', border: '#FBC02D' },
  { name: 'green', bg: 'rgba(76, 175, 80, 0.30)', border: '#388E3C' },
  { name: 'blue', bg: 'rgba(33, 150, 243, 0.28)', border: '#1976D2' },
  { name: 'pink', bg: 'rgba(233, 30, 99, 0.25)', border: '#C2185B' },
  { name: 'orange', bg: 'rgba(255, 152, 0, 0.30)', border: '#F57C00' },
]

export type Annotation = {
  id: string
  type: 'general' | 'selection'
  comment: string
  timestamp: string
  selectedText?: string
  startOffset?: number
  endOffset?: number
  highlightColor?: HighlightColor
}

export function useAnnotations() {
  const comments = ref<Annotation[]>([])

  function newId() {
    return `comment_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  function addSelection(comment: string, selectedText: string, startOffset: number, endOffset: number, color: HighlightColor) {
    if (!comment.trim()) return
    comments.value.push({
      id: newId(),
      type: 'selection',
      comment: comment.trim(),
      timestamp: new Date().toISOString(),
      selectedText,
      startOffset,
      endOffset,
      highlightColor: color,
    })
  }

  function addGeneral(comment: string) {
    if (!comment.trim()) return
    comments.value.push({
      id: newId(),
      type: 'general',
      comment: comment.trim(),
      timestamp: new Date().toISOString(),
    })
  }

  function update(id: string, comment: string, color?: HighlightColor) {
    comments.value = comments.value.map((c) =>
      c.id === id
        ? { ...c, comment: comment.trim(), highlightColor: color ?? c.highlightColor, timestamp: new Date().toISOString() }
        : c,
    )
  }

  function remove(id: string) {
    comments.value = comments.value.filter((c) => c.id !== id)
  }

  // --- AI への渡し方。1本のテキストに畳まず4層で渡す（spec-workflow-mcp と同じ）。

  // 1. response — 人間可読の要約
  const summary = computed(() => {
    const g = comments.value.filter((c) => c.type === 'general')
    const s = comments.value.filter((c) => c.type === 'selection')
    let out = `差し戻し（コメント ${comments.value.length} 件）\n\n`
    if (g.length) {
      out += '全体へのコメント:\n'
      g.forEach((c, i) => { out += `${i + 1}. ${c.comment}\n` })
      out += '\n'
    }
    if (s.length) {
      out += '本文へのコメント:\n'
      s.forEach((c, i) => {
        const q = c.selectedText ?? ''
        out += `${i + 1}. 「${q.slice(0, 50)}${q.length > 50 ? '…' : ''}」: ${c.comment}\n`
      })
    }
    return out
  })

  // 2. annotations — JSON 文字列
  const annotations = computed(() =>
    JSON.stringify(
      {
        decision: 'sent-back',
        comments: comments.value,
        summary: summary.value,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  )

  // 3. nextSteps — 手続き。どう直すかは書かない
  const nextSteps = computed(() => {
    const steps = [
      '差し戻された。プロジェクトは作られていない。',
      'proposal.md を更新して出し直す。',
    ]
    if (comments.value.length) {
      steps.push(`${comments.value.length} 件のコメント:`)
      comments.value.forEach((c, i) => {
        steps.push(
          c.type === 'selection' && c.selectedText
            ? `  コメント ${i + 1}「${c.selectedText.slice(0, 50)}${c.selectedText.length > 50 ? '…' : ''}」: ${c.comment}`
            : `  コメント ${i + 1}（全体）: ${c.comment}`,
        )
      })
    }
    return steps
  })

  const payload = computed(() => ({
    response: summary.value,
    annotations: annotations.value,
    comments: comments.value,
    nextSteps: nextSteps.value,
  }))

  return { comments, addSelection, addGeneral, update, remove, summary, annotations, nextSteps, payload }
}
