// 差し戻しのコメント。design.md 決定9（spec-workflow-mcp の approvals に倣う）。
// 注釈はレンダリング後の HTML ではなく proposal の生テキストに対して付け、
// 位置は文字オフセット（startOffset / endOffset）と引用文字列で持つ。
import type { Annotation, HighlightColor, SendBackPayload, SendBackRecord } from '#shared/stroke'

/** 色を選ばずに書き始めたときの色。 */
export const defaultHighlightColor: HighlightColor = {
  name: 'yellow',
  bg: 'rgba(255, 235, 59, 0.35)',
  border: '#FBC02D',
}

/** モーダルで選ばせるハイライト色。5色。 */
export const highlightColors: HighlightColor[] = [
  defaultHighlightColor,
  { name: 'green', bg: 'rgba(76, 175, 80, 0.30)', border: '#388E3C' },
  { name: 'blue', bg: 'rgba(33, 150, 243, 0.28)', border: '#1976D2' },
  { name: 'pink', bg: 'rgba(233, 30, 99, 0.25)', border: '#C2185B' },
  { name: 'orange', bg: 'rgba(255, 152, 0, 0.30)', border: '#F57C00' },
]

/** response / nextSteps に載せる引用は先頭50文字程度に切る。comments には全文を残す。 */
function shortQuote(text: string): string {
  return text.length > 50 ? `${text.slice(0, 50)}…` : text
}

export function useAnnotations() {
  const comments = ref<Annotation[]>([])

  function newId(): string {
    return `comment_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  function addSelection(
    comment: string,
    selectedText: string,
    startOffset: number,
    endOffset: number,
    highlightColor: HighlightColor,
  ): void {
    if (!comment.trim()) return
    comments.value.push({
      id: newId(),
      type: 'selection',
      comment: comment.trim(),
      timestamp: new Date().toISOString(),
      selectedText,
      startOffset,
      endOffset,
      highlightColor,
    })
  }

  function addGeneral(comment: string): void {
    if (!comment.trim()) return
    comments.value.push({
      id: newId(),
      type: 'general',
      comment: comment.trim(),
      timestamp: new Date().toISOString(),
    })
  }

  function update(id: string, comment: string, color?: HighlightColor): void {
    const body = comment.trim()
    if (!body) return
    const timestamp = new Date().toISOString()
    comments.value = comments.value.map((c): Annotation => {
      if (c.id !== id) return c
      switch (c.type) {
        case 'general':
          return { ...c, comment: body, timestamp }
        case 'selection':
          return { ...c, comment: body, highlightColor: color ?? c.highlightColor, timestamp }
      }
    })
  }

  function remove(id: string): void {
    comments.value = comments.value.filter((c) => c.id !== id)
  }

  function clear(): void {
    comments.value = []
  }

  // --- AI への渡し方。1本のテキストに畳まず4層で渡す（design.md 決定9）。

  /** response — 人間可読の要約 */
  const summary = computed(() => {
    const general: string[] = []
    const selection: string[] = []
    for (const c of comments.value) {
      switch (c.type) {
        case 'general':
          general.push(c.comment)
          break
        case 'selection':
          selection.push(`「${shortQuote(c.selectedText)}」: ${c.comment}`)
          break
      }
    }

    let out = `差し戻し（コメント ${comments.value.length} 件）\n\n`
    if (general.length) {
      out += '全体へのコメント:\n'
      general.forEach((line, i) => {
        out += `${i + 1}. ${line}\n`
      })
      out += '\n'
    }
    if (selection.length) {
      out += '本文へのコメント:\n'
      selection.forEach((line, i) => {
        out += `${i + 1}. ${line}\n`
      })
    }
    return out
  })

  /**
   * nextSteps — 手続き。
   * 書いてよいのは「差し戻された」「プロジェクトは作られていない」「出し直す先」までとし、
   * どう直すか（全文書き直す / 一部だけ直す 等）は書かない（spec: 対応方法を渡さない）。
   */
  const nextSteps = computed(() => {
    const steps = [
      '差し戻された。プロジェクトは作られていない。',
      'proposal.md を出し直す。',
    ]
    if (comments.value.length) {
      steps.push(`${comments.value.length} 件のコメント:`)
      comments.value.forEach((c, i) => {
        switch (c.type) {
          case 'general':
            steps.push(`  コメント ${i + 1}（全体）: ${c.comment}`)
            break
          case 'selection':
            steps.push(`  コメント ${i + 1}「${shortQuote(c.selectedText)}」: ${c.comment}`)
            break
        }
      })
    }
    return steps
  })

  /**
   * 4層の差し戻しを組む。時刻を含むため computed にせず、送る瞬間に組む。
   * comments には引用の全文が入る（切らない）。
   */
  function buildPayload(): SendBackPayload {
    const snapshot: Annotation[] = comments.value.map((c) => ({ ...c }))
    const record: SendBackRecord = {
      decision: 'sent-back',
      comments: snapshot,
      summary: summary.value,
      timestamp: new Date().toISOString(),
    }
    return {
      response: summary.value,
      comments: snapshot,
      annotations: JSON.stringify(record, null, 2),
      nextSteps: nextSteps.value,
    }
  }

  return {
    comments,
    addSelection,
    addGeneral,
    update,
    remove,
    clear,
    summary,
    nextSteps,
    buildPayload,
  }
}
