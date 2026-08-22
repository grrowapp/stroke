// 画面2(proposal 確認)の状態。表示の置き方はページが持ち、ここは状態と往復だけを持つ。
//
// 集約応答は無い。proposal と名前候補は W2、followup の問いは W1 から届き、strokes は
// 決着ごとに U3 を読み直す(design.md: 画面は WS 受信と GET を組み合わせて組み立てる)。
import type {
  Annotation,
  Answer,
  HighlightColor,
  Phase,
  Stroke,
} from '#shared/stroke'
import { useAnnotations } from '~/composables/useAnnotations'

/** 本文の見せ方。注釈を付けられるのは生テキストの面だけ。 */
export type ViewMode = 'preview' | 'annotate' | 'side-by-side'

/** 差し戻しのあと、この画面で何が起きたか。 */
export type ReviewNotice = 'revised' | null

interface PendingSelection {
  text: string
  start: number
  end: number
}

/** $fetch が投げるエラー。ofetch の FetchError に statusCode / data が乗る。 */
interface HttpError {
  statusCode?: unknown
  data?: unknown
  message?: unknown
}

function statusOf(error: unknown): number | undefined {
  const code = (error as HttpError | null)?.statusCode
  return typeof code === 'number' ? code : undefined
}

/**
 * 409 の理由。サーバが `createError({ data: { reason } })` で載せたものを読む。
 * 印が無い 409 は理由を決めつけない(名前の衝突・AI 実行中・phase 不整合を区別できないため)。
 */
function reasonOf(error: unknown): string | undefined {
  const body = (error as HttpError | null)?.data
  if (!body || typeof body !== 'object' || !('data' in body)) return undefined
  const payload = (body as { data?: unknown }).data
  if (!payload || typeof payload !== 'object' || !('reason' in payload)) return undefined
  const reason = (payload as { reason?: unknown }).reason
  return typeof reason === 'string' ? reason : undefined
}

function messageOf(error: unknown): string {
  const e = error as HttpError | null
  const data = e?.data
  if (data && typeof data === 'object' && 'statusMessage' in data) {
    const m = (data as { statusMessage?: unknown }).statusMessage
    if (typeof m === 'string' && m) return m
  }
  return typeof e?.message === 'string' && e.message ? e.message : String(error)
}

/**
 * @param sessionId セッション uuid。URL に載っているものを使う。
 * @param initial リロード時に U2 / U3 で読んだ初期値。
 */
export function useProposalReview(
  sessionId: MaybeRefOrGetter<string>,
  initial: { phase: Phase, strokes: Stroke[] },
) {
  const a = useAnnotations()

  /** このセッションの API。`/api/<uuid>` */
  const base = computed(() => `/api/strokes/${toValue(sessionId)}`)

  const phase = ref<Phase>(initial.phase)
  const strokes = ref<Stroke[]>(initial.strokes)

  const { message: proposalMessage } = useProposalChannel(sessionId)
  const { question: followupQuestion } = useQuestionChannel(sessionId)
  const waitingRetry = useWaitingRetry(sessionId)

  /** 今どちらの送信の決着を待っているか。settle 時にどちらの後始末をするか決める。 */
  const pendingAction = ref<'send-back' | 'followup' | null>(null)

  const proposal = computed(() => proposalMessage.value?.proposal ?? '')

  /** 点滅する知らせを出すか。answer 待ちの followup が来ているかで決まる。 */
  const awaitingFollowup = computed(
    () => phase.value === 'proposed' && followupQuestion.value !== null,
  )

  // --- プロジェクト名。ユーザーが書いたらそれが勝ち、proposal 更新で消さない。

  const projectNameDraft = ref<string | null>(null)

  const projectName = computed<string>({
    get: () => projectNameDraft.value ?? proposalMessage.value?.projectName ?? '',
    set: (v) => {
      projectNameDraft.value = v
    },
  })

  const viewMode = ref<ViewMode>('annotate')
  const notice = ref<ReviewNotice>(null)

  // 本文へのコメント用モーダル
  const commentModalOpen = ref(false)
  const pending = ref<PendingSelection | null>(null)
  const editingId = ref<string | null>(null)

  // 全体コメント用モーダル
  const generalModalOpen = ref(false)
  const generalDraft = ref('')

  // 確認・警告
  const deleteId = ref<string | null>(null)
  const alertTitle = ref('')
  const alertMessage = ref<string | null>(null)
  const approveOpen = ref(false)
  const approveBusy = ref(false)
  /** 衝突した名前。同じ名前のままでは承認を通さない。 */
  const conflictName = ref<string | null>(null)

  // 問い返し
  const followupOpen = ref(false)
  const answered = ref(0)

  /** 差し戻し送信〜決着までの全面待ち受け。 */
  const sendingBack = computed(() => pendingAction.value === 'send-back' && waitingRetry.waiting.value)
  /** followup 回答の送信〜決着までの、モーダル内の待ち受け。 */
  const followupWaiting = computed(() => pendingAction.value === 'followup' && waitingRetry.waiting.value)
  /** 承認ボタンの busy。差し戻し中は承認もできない。 */
  const busy = computed(() => sendingBack.value || approveBusy.value)

  /** proposal が更新されたら知らせる。初回の読み込み(null → 値)は「出し直し」に数えない。 */
  watch(proposalMessage, (next, prev) => {
    if (prev !== null && next !== null) notice.value = 'revised'
  })

  /** 送信の決着(待機の終わり)。strokes を読み直し、followup なら modal の続きを決める。 */
  watch(
    () => waitingRetry.waiting.value,
    async (isWaiting, wasWaiting) => {
      if (!wasWaiting || isWaiting) return
      const action = pendingAction.value
      pendingAction.value = null

      const data = await $fetch<{ strokes: Stroke[] }>(`${base.value}/strokes`)
      strokes.value = data.strokes

      if (waitingRetry.failed.value) {
        if (action !== 'followup') {
          warn('AI からの応答が得られませんでした', 'もう一度差し戻してください。')
        }
        // followup の失敗は modal 側で追う(followupWaiting が false に戻るだけで、
        // 問いは変わらないので modal は開いたまま同じ問いを再送できる)。
        return
      }

      if (action === 'followup' && !awaitingFollowup.value) {
        // 新しい followup は来なかった(= proposal が出し直された)。modal を閉じる。
        followupOpen.value = false
      }
    },
  )

  function warn(title: string, message: string): void {
    alertTitle.value = title
    alertMessage.value = message
  }

  /** 編集中のコメント。種別ごとに面が違うので、それぞれの面が自分の分だけを見る。 */
  function editingOf(type: Annotation['type']) {
    const id = editingId.value
    if (!id) return null
    const c = a.comments.value.find((x) => x.id === id)
    if (!c || c.type !== type) return null
    return c
  }

  /** 本文へのコメントの編集対象。引用と色を出す面が使う */
  const editing = computed(() => {
    const c = editingOf('selection')
    if (!c) return null
    switch (c.type) {
      case 'general':
        return null
      case 'selection':
        return c
    }
  })

  /** 全体へのコメントの編集対象。引用も色も無い面が使う */
  const editingGeneral = computed(() => editingOf('general'))

  // --- コメントを積む

  function onSelect(p: PendingSelection): void {
    pending.value = p
    editingId.value = null
    commentModalOpen.value = true
  }

  /**
   * コメントを直す。本文上のハイライトからも、カードの「編集」からも来る。
   * 面は種別で分かれる(本文へのコメントは引用と色つき、全体へのコメントは本文だけ)。
   */
  function editComment(id: string): void {
    const c = a.comments.value.find((x) => x.id === id)
    if (!c) return
    editingId.value = id
    switch (c.type) {
      case 'general':
        generalDraft.value = c.comment
        generalModalOpen.value = true
        return
      case 'selection':
        pending.value = { text: c.selectedText, start: c.startOffset, end: c.endOffset }
        commentModalOpen.value = true
        return
    }
  }

  function saveComment(body: string, color: HighlightColor): void {
    if (editingId.value) {
      a.update(editingId.value, body, color)
    } else if (pending.value) {
      a.addSelection(body, pending.value.text, pending.value.start, pending.value.end, color)
    }
    pending.value = null
    editingId.value = null
  }

  function openGeneral(): void {
    editingId.value = null
    generalDraft.value = ''
    generalModalOpen.value = true
  }

  function closeGeneral(): void {
    editingId.value = null
    generalModalOpen.value = false
  }

  function saveGeneral(): void {
    if (editingId.value) {
      a.update(editingId.value, generalDraft.value)
    } else {
      a.addGeneral(generalDraft.value)
    }
    editingId.value = null
    generalModalOpen.value = false
  }

  function confirmDelete(): void {
    if (deleteId.value) a.remove(deleteId.value)
    deleteId.value = null
  }

  // --- 差し戻し

  async function sendBack(): Promise<void> {
    if (waitingRetry.waiting.value) return
    if (!a.comments.value.length) {
      warn(
        '差し戻せません',
        'コメントが1件もありません。注釈ビューで本文を選んでコメントを付けるか、「全体へのコメント」を足してから差し戻してください。',
      )
      return
    }
    pendingAction.value = 'send-back'
    try {
      await $fetch(`${base.value}/send-back`, { method: 'POST', body: a.buildPayload() })
      a.clear()
    } catch (error) {
      pendingAction.value = null
      warn('差し戻せませんでした', messageOf(error))
      return
    }
    // 受理と起動は分かれている(specs/api/send-back)。成功応答の直後に起動を要求する
    // (design.md 決定6)。busy(409)は invoke-agent 側が返す。
    try {
      await $fetch(`${base.value}/invoke-agent`)
      waitingRetry.startWaiting()
    } catch (error) {
      pendingAction.value = null
      if (statusOf(error) === 409) {
        warn('まだ前の応答を待っています', 'AI が応答を返すまで、続けて送ることはできません。')
      } else {
        warn('AI を起動できませんでした', messageOf(error))
      }
    }
  }

  // --- 問い返し。1問1答を同じ面で繰り返す。総数は示さない。

  function openFollowup(): void {
    followupOpen.value = true
  }

  async function answerFollowup(answer: Answer): Promise<void> {
    const asked = followupQuestion.value
    if (waitingRetry.waiting.value || !asked) return
    pendingAction.value = 'followup'
    try {
      await $fetch(`${base.value}/answer`, { method: 'POST', body: answer })
      answered.value += 1
    } catch (error) {
      pendingAction.value = null
      warn('答えを送れませんでした', messageOf(error))
      return
    }
    // 受理と起動は分かれている(specs/api/answer)。成功応答の直後に起動を要求する
    // (design.md 決定6)。busy(409)は invoke-agent 側が返す。
    try {
      await $fetch(`${base.value}/invoke-agent`)
      waitingRetry.startWaiting()
    } catch (error) {
      pendingAction.value = null
      if (statusOf(error) === 409) {
        warn('まだ前の応答を待っています', 'AI が応答を返すまで、続けて送ることはできません。')
      } else {
        warn('AI を起動できませんでした', messageOf(error))
      }
    }
  }

  // --- 承認

  function openApprove(): void {
    conflictName.value = null
    approveOpen.value = true
  }

  /** 衝突した名前のままでは承認を通さない。 */
  const approveBlocked = computed(
    () => !projectName.value.trim() || projectName.value.trim() === conflictName.value,
  )

  async function approve(): Promise<void> {
    if (busy.value || approveBlocked.value) return
    if (phase.value !== 'proposed') return

    const name = projectName.value.trim()
    approveBusy.value = true
    try {
      await $fetch(`${base.value}/approve`, { method: 'POST', body: { projectName: name } })
      phase.value = 'approved'
      approveOpen.value = false
      notice.value = null
    } catch (error) {
      // サーバは 409 を3つの意味で返す(名前の衝突 / AI が実行中 / phase 不整合)。
      // 名前を変えるまで承認を止めるのは、衝突と分かったときだけにする。
      if (statusOf(error) === 409 && reasonOf(error) === 'name-conflict') {
        conflictName.value = name
      } else {
        warn('承認できませんでした', messageOf(error))
      }
    } finally {
      approveBusy.value = false
    }
  }

  return {
    // 本文と局面
    phase,
    strokes,
    proposal,
    projectName,
    awaitingFollowup,
    followupQuestion,
    followupWaiting,
    // コメント
    comments: a.comments,
    // 表示
    viewMode,
    notice,
    busy,
    sendingBack,
    // モーダル
    commentModalOpen,
    pending,
    editingId,
    editing,
    editingGeneral,
    generalModalOpen,
    generalDraft,
    deleteId,
    alertTitle,
    alertMessage,
    approveOpen,
    conflictName,
    approveBlocked,
    // 問い返し
    followupOpen,
    answered,
    // 操作
    onSelect,
    editComment,
    saveComment,
    openGeneral,
    closeGeneral,
    saveGeneral,
    confirmDelete,
    sendBack,
    openFollowup,
    answerFollowup,
    openApprove,
    approve,
  }
}
