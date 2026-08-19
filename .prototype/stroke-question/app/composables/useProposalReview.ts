// 画面2 のレビュー状態。各 variant はこれを使い、置き方だけ変える。
import type { HighlightColor } from '~/composables/useAnnotations'

export type ViewMode = 'preview' | 'annotate' | 'side-by-side'

export function useProposalReview() {
  const a = useAnnotations()

  const viewMode = ref<ViewMode>('annotate')

  // 本文へのコメント用モーダル
  const commentModalOpen = ref(false)
  const pending = ref<{ text: string; start: number; end: number } | null>(null)
  const editingId = ref<string | null>(null)

  // 全体コメント用モーダル
  const generalModalOpen = ref(false)
  const generalDraft = ref('')

  // 確認・警告
  const deleteId = ref<string | null>(null)
  const alertMessage = ref<string | null>(null)
  const approveOpen = ref(false)

  const editing = computed(() =>
    editingId.value ? a.comments.value.find((c) => c.id === editingId.value) ?? null : null,
  )

  function onSelect(p: { text: string; start: number; end: number }) {
    pending.value = p
    editingId.value = null
    commentModalOpen.value = true
  }

  function onClickMark(id: string) {
    const c = a.comments.value.find((x) => x.id === id)
    if (!c) return
    editingId.value = id
    pending.value = { text: c.selectedText ?? '', start: c.startOffset ?? 0, end: c.endOffset ?? 0 }
    commentModalOpen.value = true
  }

  function saveComment(body: string, color: HighlightColor) {
    if (editingId.value) {
      a.update(editingId.value, body, color)
    } else if (pending.value) {
      a.addSelection(body, pending.value.text, pending.value.start, pending.value.end, color)
    }
    pending.value = null
    editingId.value = null
  }

  function openGeneral() {
    generalDraft.value = ''
    generalModalOpen.value = true
  }

  function saveGeneral() {
    a.addGeneral(generalDraft.value)
    generalModalOpen.value = false
  }

  function confirmDelete() {
    if (deleteId.value) a.remove(deleteId.value)
    deleteId.value = null
  }

  // 差し戻し。コメント0件なら警告して止める（本家と同じ）
  function sendBack() {
    if (!a.comments.value.length) {
      alertMessage.value = 'コメントがありません。本文を選んでコメントを付けるか、全体へのコメントを足してから差し戻してください。'
      return false
    }
    return true
  }

  return {
    ...a,
    viewMode,
    commentModalOpen,
    pending,
    editingId,
    editing,
    generalModalOpen,
    generalDraft,
    deleteId,
    alertMessage,
    approveOpen,
    onSelect,
    onClickMark,
    saveComment,
    openGeneral,
    saveGeneral,
    confirmDelete,
    sendBack,
  }
}
