// 画面2(proposal 確認)の状態。表示の置き方はページが持ち、ここは状態と往復だけを持つ。
//
// 集約応答は無い。proposal と名前候補は W2、followup の問いは W1 から届き、strokes は
// 決着ごとに U3 を読み直す(design.md: 画面は WS 受信と GET を組み合わせて組み立てる)。
import type {
  Annotation,
  Answer,
  HighlightColor,
  Phase,
  ProposalMessage,
  SessionStatus,
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

  // W2 `/ws/proposal` を購読する。届くのは proposal と名前候補で、最後の1件で上書きされる。
  const proposalMessage = useSessionChannel<ProposalMessage>(sessionId, 'proposal')

  // 問いの往復は1つの機構が持つ。W1 の購読も回答の送信もこの中にあり、この画面は
  // 開く引き金と、差し戻しとの兼ね合いだけを見る（design 決定2）。
  const agentQuestion = useAgentQuestion(sessionId)
  const followupQuestion = agentQuestion.question

  // 差し戻しの待機。問い返しの待機は agentQuestion 側にあり、両者は同時に立たない
  // （差し戻しの待ち受け中は知らせ帯が出ないため、回答を送る経路が無い・design Risks）。
  const waitingRetry = useWaitingRetry(sessionId)

  /** 差し戻しを送って決着を待っている間だけ立つ。問い返しの待機は agentQuestion 側。 */
  const pendingAction = ref<'send-back' | null>(null)

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

  // 問い返し。開く引き金だけがこの画面のもので、往復は agentQuestion が持つ。
  const followupOpen = ref(false)
  const answered = agentQuestion.answered

  /** 差し戻し送信〜決着までの全面待ち受け。 */
  const sendingBack = computed(() => pendingAction.value === 'send-back' && waitingRetry.waiting.value)
  /** followup 回答の送信〜決着までの、モーダル内の待ち受け。 */
  const followupWaiting = agentQuestion.waiting
  /** 承認ボタンの busy。差し戻し中は承認もできない。 */
  const busy = computed(() => sendingBack.value || approveBusy.value)

  /** proposal が更新されたら知らせる。初回の読み込み(null → 値)は「出し直し」に数えない。 */
  watch(proposalMessage, (next, prev) => {
    if (prev !== null && next !== null) notice.value = 'revised'
  })

  /** 差し戻しの決着(待機の終わり)。strokes を読み直す。 */
  watch(
    () => waitingRetry.waiting.value,
    async (isWaiting, wasWaiting) => {
      if (!wasWaiting || isWaiting) return
      pendingAction.value = null

      await reloadStrokes()

      if (waitingRetry.failed.value) {
        warn('AI からの応答が得られませんでした', 'もう一度差し戻してください。')
      }
    },
  )

  /** 問い返しの決着。次の問いが来なければ面を閉じる。 */
  watch(
    () => agentQuestion.waiting.value,
    async (isWaiting, wasWaiting) => {
      if (!wasWaiting || isWaiting) return

      await reloadStrokes()

      // 失敗は面の側で追う(待機が下りるだけで問いは変わらないので、面は開いたまま
      // 同じ問いを送り直せる)。
      if (agentQuestion.failed.value) return

      if (!awaitingFollowup.value) {
        // 新しい問い返しは来なかった(= proposal が出し直された)。面を閉じる。
        followupOpen.value = false
      }
    },
  )

  /** 送れなかったときの理由を、この画面の知らせ方(確認モーダル)で出す。 */
  watch(agentQuestion.error, (reason) => {
    if (reason) warn(reason.title, reason.message)
  })

  async function reloadStrokes(): Promise<void> {
    const data = await $fetch<{ strokes: Stroke[] }>(`${base.value}/strokes`)
    strokes.value = data.strokes
  }

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
    // (design.md 決定6)。busy(409)は invoke-agent 側が返すが、それは走っているという
    // 事実であって失敗ではない。`requestRun` が待機へ倒す
    const run = await waitingRetry.requestRun()
    if (!run.ok) {
      pendingAction.value = null
      warn('AI を起動できませんでした', messageOf(run.error))
    }
  }

  // --- 問い返し。1問1答を同じ面で繰り返す。総数は示さない。

  function openFollowup(): void {
    followupOpen.value = true
  }

  /** 回答の送信・起動要求・待機は agentQuestion が持つ。ここは中継するだけ。 */
  async function answerFollowup(answer: Answer): Promise<void> {
    await agentQuestion.send(answer)
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

  /**
   * 昇格に失敗した対象の名前。null なら何も出ていない。
   *
   * 改名はシステムの動作で、ユーザーの決定ではない。だから**決定をやり直させない**——
   * 確定した名前は判断としてサーバに記録されており、「やり直す」は昇格の段だけを再試行する。
   */
  const promotionFailed = ref<string | null>(null)
  /** 知らせる面に出している間の名前。引いたらモーダルへ渡す */
  const promotionNotice = ref<string | null>(null)

  /** 知らせる面が引いた。続けて選ばせるモーダルを出す（specs/project/generation） */
  function promotionNoticeDone(): void {
    promotionFailed.value = promotionNotice.value
    promotionNotice.value = null
  }

  /**
   * やり直す — 昇格（U14）だけをもう一度要求する。承認の判断は記録されたままなので下し直さず、
   * ユーザーに名前を聞き直さない（specs/api/session/promote「昇格だけをやり直す」）。
   */
  async function retryPromotion(): Promise<void> {
    const name = promotionFailed.value ?? projectName.value.trim()
    promotionFailed.value = null
    if (busy.value) return
    approveBusy.value = true
    try {
      await promote(name)
    } finally {
      approveBusy.value = false
    }
  }

  /**
   * 破棄する — セッションを消して一覧へ戻る。まだプロジェクトになっていない。
   *
   * 判断が記録されていても U11 は受理する（判断は phase を動かさないので `proposed` のまま）。
   * 判断だけを戻す `DELETE .../approve` とは別の道で、ここでは判断を取り消してから消す形にしない
   * ——破棄はセッションごと消すことである。
   */
  async function discardSession(): Promise<void> {
    promotionFailed.value = null
    try {
      await $fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    } catch (error) {
      warn('破棄できませんでした', messageOf(error))
      return
    }
    await navigateTo('/projects')
  }

  /**
   * 承認 — **U10（判断）→ U14（昇格）→ U13（起動）**の3段を順に叩く。受理と起動が分かれて
   * いるのは差し戻し（`sendBack`）と同じ作法で、承認だけがそこから外れていた。
   *
   * 承認モーダルで確定した後は昇格へ自動で続け、今の体験（承認 → 一覧へ戻る）を変えない。
   * 判断と昇格が別の呼び出しになったことで、間に取り消し（`DELETE .../approve`）を挟める形は
   * API として在る。面のどこに出すかは後続に委ねる。
   */
  async function approve(): Promise<void> {
    if (busy.value || approveBlocked.value) return
    if (phase.value !== 'proposed') return

    const name = projectName.value.trim()
    approveBusy.value = true
    try {
      // 段1: 判断を記録する。**残っている判断があれば取り下げてから下す**——重ねて判断を
      // 下すことは受理されず（specs/api/session/approve）、承認と昇格の間で画面が落ちた
      // セッションを開き直したときに残っている判断は、いま確定した名前で置き換える。
      // 判断が無ければ取り下げは何も変えない
      try {
        await $fetch(`${base.value}/approve`, { method: 'DELETE' })
        await $fetch(`${base.value}/approve`, { method: 'POST', body: { projectName: name } })
      } catch (error) {
        // サーバは 409 を3つの意味で返す(名前の衝突 / AI が実行中 / phase 不整合)。
        // 名前を変えるまで承認を止めるのは、衝突と分かったときだけにする。
        // 400（名前に使えない文字）と 409 の残り（phase 不整合・実行中）は判断そのものが
        // 成立しないので、器に載せず「別の名前で再度承認できる」状態に留める
        if (statusOf(error) === 409 && reasonOf(error) === 'name-conflict') {
          conflictName.value = name
        } else {
          warn('承認できませんでした', messageOf(error))
        }
        return
      }

      // 段2・段3。判断の失敗と昇格の失敗は器が違うので、ここで分けている
      await promote(name)
    } finally {
      approveBusy.value = false
    }
  }

  /**
   * 段2: 昇格（U14）を要求し、成功したら段3: 起動（U13）を要求して一覧へ戻る。
   *
   * 名前は送らない。昇格はサーバに記録された判断の名前で行われる（specs/api/session/promote）。
   * `name` は失敗の器に出すためだけに持つ。
   */
  async function promote(name: string): Promise<void> {
    try {
      await $fetch(`${base.value}/promote`, { method: 'POST' })
    } catch (error) {
      const status = statusOf(error)

      if (status === 409 && reasonOf(error) === 'name-conflict') {
        // 判断の後に同じ名前が保存先に現れた。同じ判断のままでは昇格できないので、判断を
        // 取り下げて別の名前を確定させる（specs/project/generation「判断を取り下げて別の
        // 名前で改めて承認できる」）
        await $fetch(`${base.value}/approve`, { method: 'DELETE' }).catch(() => undefined)
        conflictName.value = name
      } else if (status === 500) {
        // **昇格の実行が失敗した**（改名の I/O・`phase` の書き込み）。判断は記録されたまま
        // 残っているので、決着と同じ器で次を選ばせる（specs/project/generation）。この時点では
        // プロジェクトが無く phase は `proposed` なので、破棄はセッション側、やり直すは昇格だけの
        // 再要求になる
        promotionNotice.value = name
      } else {
        warn('プロジェクトを作れませんでした', messageOf(error))
      }
      return
    }

    phase.value = 'approved'
    approveOpen.value = false
    notice.value = null

    // 段3: steering を起こす（ADR 0011: 承認の次の工程は自動で始まる。ユーザーは待たない）。
    // 対象の id は昇格後のディレクトリ名（= プロジェクト名）で、cwd は U2 が返す path を
    // そのまま添える（endpoint に導出させない・design.md D5）。
    //
    // 届かなくても昇格は巻き戻らない。昇格の受け口が `invocation` を `failed` にしてあるので、
    // 起動の段だけが巡回のやり直しの対象として残る（specs/api/session/promote）。409 は
    // 巡回が先に起こした busy で、これも失敗ではない。だからここでは知らせない
    await kickSteering(name)

    // モーダルごと閉じて一覧へ戻る
    await navigateTo('/projects')
  }

  /** 段3の実体。失敗は起動の段に留め、昇格の結果にも画面の流れにも影響させない。 */
  async function kickSteering(name: string): Promise<void> {
    const target = `/api/strokes/${encodeURIComponent(name)}`
    try {
      const status = await $fetch<SessionStatus>(target)
      await $fetch(`${target}/invoke-agent`, { query: { cwd: status.path } })
    } catch (error) {
      console.warn(`steering の起動要求が届かなかった（巡回が拾う）: ${name}`, error)
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
    promotionFailed,
    promotionNotice,
    promotionNoticeDone,
    retryPromotion,
    discardSession,
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
