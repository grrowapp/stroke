// 画面2（proposal 確認）の状態。表示の置き方はページが持ち、ここは状態と往復だけを持つ。
//
// セッションの持ち主は useFetch が返す1つの ref（source）だけ。
// 往復の結果もここへ書き戻し、写しを別に持たない。
import type {
  Annotation,
  Answer,
  ApproveResult,
  HighlightColor,
  Question,
  SessionView,
  StrokeResult,
} from '#shared/types'
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
 * 印が無い 409 は理由を決めつけない（名前の衝突・AI 実行中・phase 不整合を区別できないため）。
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

/** AI が提案した名前。まだ提案が無い局面では空。 */
function proposedName(view: SessionView | null): string {
  if (!view) return ''
  switch (view.phase) {
    case 'stroking':
      return ''
    case 'proposed':
      return view.projectName ?? ''
    case 'approved':
      return view.projectName
  }
}

/**
 * @param sessionId セッション uuid。URL に載っているものを使う。
 * @param session 唯一のセッション置き場。往復の結果もここへ書き戻す。
 * @param refresh 往復が終わったときにセッションを取り直す手。ストロークが増えるとパンくずも変わるため。
 */
export function useProposalReview(
  sessionId: MaybeRefOrGetter<string>,
  session: Ref<SessionView | null>,
  refresh?: () => Promise<void>,
) {
  const a = useAnnotations()

  /** このセッションの API。`/api/sessions/<uuid>` */
  const base = computed(() => `/api/sessions/${toValue(sessionId)}`)

  // --- セッションから導けるもの

  const phase = computed(() => session.value?.phase ?? null)

  const proposal = computed(() => {
    const v = session.value
    if (!v) return ''
    switch (v.phase) {
      case 'stroking':
        return ''
      case 'proposed':
      case 'approved':
        return v.proposal
    }
  })

  /** 差し戻しに対する AI の問い返し。null なら答えるものは無い。 */
  const followupQuestion = computed<Question | null>(() =>
    session.value?.phase === 'proposed' ? session.value.followupQuestion : null,
  )

  /** 点滅する知らせを出すか。問い返しが入っているかで決まる。 */
  const awaitingFollowup = computed(() => followupQuestion.value !== null)

  // --- プロジェクト名。ユーザーが書いたらそれが勝ち、セッションの更新で消さない。

  /** ユーザーが書いた名前。null なら未編集で、AI の提案をそのまま使う。 */
  const projectNameDraft = ref<string | null>(null)

  const projectName = computed<string>({
    get: () => projectNameDraft.value ?? proposedName(session.value),
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
  /** 衝突した名前。同じ名前のままでは承認を通さない。 */
  const conflictName = ref<string | null>(null)

  // 問い返し
  const followupOpen = ref(false)
  const followupWaiting = ref(false)
  const answered = ref(0)

  /** AI の応答待ち。待機中は追加送信させない。 */
  const busy = ref(false)

  /** 差し戻しの応答待ち。承認実行中の busy と区別し、これだけが待ち受け画面になる。 */
  const sendingBack = ref(false)

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

  function warn(title: string, message: string): void {
    alertTitle.value = title
    alertMessage.value = message
  }

  /** 往復の結果をセッションへ書き戻す。書き込み口はここと approve の2箇所だけ。 */
  function applyStrokeResult(result: StrokeResult): void {
    const current = session.value
    if (!current) return
    const keep = { sessionId: current.sessionId, strokes: current.strokes }

    switch (result.outcome) {
      case 'question':
        session.value = { ...keep, phase: 'stroking', question: result.question }
        return
      case 'followup':
        session.value = {
          ...keep,
          phase: 'proposed',
          proposal: result.proposal,
          projectName: proposedName(current) || undefined,
          followupQuestion: result.question,
        }
        return
      case 'proposal':
        session.value = {
          ...keep,
          phase: 'proposed',
          proposal: result.proposal,
          projectName: result.projectName ?? (proposedName(current) || undefined),
          followupQuestion: null,
        }
        return
    }
  }

  // --- コメントを積む

  function onSelect(p: PendingSelection): void {
    pending.value = p
    editingId.value = null
    commentModalOpen.value = true
  }

  /**
   * コメントを直す。本文上のハイライトからも、カードの「編集」からも来る。
   * 面は種別で分かれる（本文へのコメントは引用と色つき、全体へのコメントは本文だけ）。
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
    // 直しているなら本文を差し替える（type は変わらない）。そうでなければ新しく積む。
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
    if (busy.value) return
    // コメント0件はボタンを黙って無効にせず、止めて理由と付け方を出す。
    if (!a.comments.value.length) {
      warn(
        '差し戻せません',
        'コメントが1件もありません。注釈ビューで本文を選んでコメントを付けるか、「全体へのコメント」を足してから差し戻してください。',
      )
      return
    }
    busy.value = true
    sendingBack.value = true
    notice.value = null
    try {
      const result = await $fetch<StrokeResult>(`${base.value}/send-back`, {
        method: 'POST',
        body: a.buildPayload(),
      })
      a.clear()
      applyStrokeResult(result)

      switch (result.outcome) {
        case 'followup':
          answered.value = 0
          followupOpen.value = true
          return
        case 'proposal':
          notice.value = 'revised'
          await refresh?.()
          return
        case 'question':
          await refresh?.()
          return
      }
    } catch (error) {
      if (statusOf(error) === 409) {
        warn('まだ前の応答を待っています', 'AI が応答を返すまで、続けて送ることはできません。')
      } else {
        warn('差し戻せませんでした', messageOf(error))
      }
    } finally {
      busy.value = false
      sendingBack.value = false
    }
  }

  // --- 問い返し。1問1答を同じ面で繰り返す。総数は示さない。

  function openFollowup(): void {
    followupOpen.value = true
  }

  async function answerFollowup(answer: Answer): Promise<void> {
    if (followupWaiting.value) return
    followupWaiting.value = true
    try {
      const result = await $fetch<StrokeResult>(`${base.value}/answer`, {
        method: 'POST',
        body: { answer },
      })
      answered.value += 1
      applyStrokeResult(result)

      switch (result.outcome) {
        case 'followup':
          // 面は閉じず、次の問いが同じ面に出る。
          return
        case 'proposal':
          // 問いが尽きた。面を閉じ、出し直された proposal を見せる。
          followupOpen.value = false
          notice.value = 'revised'
          await refresh?.()
          return
        case 'question':
          followupOpen.value = false
          await refresh?.()
          return
      }
    } catch (error) {
      if (statusOf(error) === 409) {
        warn('まだ前の応答を待っています', 'AI が応答を返すまで、続けて送ることはできません。')
      } else {
        warn('答えを送れませんでした', messageOf(error))
      }
    } finally {
      followupWaiting.value = false
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
    const current = session.value
    if (!current || current.phase !== 'proposed') return

    const name = projectName.value.trim()
    busy.value = true
    try {
      await $fetch<ApproveResult>(`${base.value}/approve`, {
        method: 'POST',
        body: { projectName: name },
      })
      session.value = {
        sessionId: current.sessionId,
        strokes: current.strokes,
        phase: 'approved',
        proposal: current.proposal,
        projectName: name,
      }
      approveOpen.value = false
      notice.value = null
    } catch (error) {
      // サーバは 409 を3つの意味で返す（名前の衝突 / AI が実行中 / phase 不整合）。
      // 名前を変えるまで承認を止めるのは、衝突と分かったときだけにする。
      if (statusOf(error) === 409 && reasonOf(error) === 'name-conflict') {
        conflictName.value = name
      } else {
        warn('承認できませんでした', messageOf(error))
      }
    } finally {
      busy.value = false
    }
  }

  return {
    // 本文と局面
    phase,
    proposal,
    projectName,
    awaitingFollowup,
    followupQuestion,
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
    followupWaiting,
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
