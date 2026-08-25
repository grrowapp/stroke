// 問いの往復。W1 の購読・回答の送信・AI の起動要求・待機を1つにまとめる。
// 質疑応答をさせたい画面は、セッション id を渡してこれを呼ぶだけでよい（design 決定1・決定2）。
//
// 状態は全て返り値として出し、外から渡す口は持たない（design 決定3）。
// 面（`AgentQuestionModal`）はここに依存せず、props と emit だけで繋がる。
import type { Answer, Question } from '#shared/stroke'

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

function messageOf(error: unknown): string {
  const e = error as HttpError | null
  const data = e?.data
  if (data && typeof data === 'object' && 'statusMessage' in data) {
    const m = (data as { statusMessage?: unknown }).statusMessage
    if (typeof m === 'string' && m) return m
  }
  return typeof e?.message === 'string' && e.message ? e.message : String(error)
}

/** 送れなかった理由。どう伝えるかは置く側が決めるが、何が起きたかの判別はここで済ませる。 */
export interface AgentQuestionError {
  title: string
  message: string
}

export interface AgentQuestionReturn {
  /** 今の1問。W1 から届く。届いていなければ null */
  question: Ref<Question | null>
  /** 次が返るのを待っているか */
  waiting: Ref<boolean>
  /** AI から応答が得られなかったか。巡回が起こし直すので待てば回復しうる */
  failed: Ref<boolean>
  /** リトライ上限に達した終端。自動では回復せず、再実行か削除をユーザーが選ぶ */
  errored: Ref<boolean>
  /** `errored` からの再実行。リトライ回数を戻して起動をキックする */
  retryFromError: () => Promise<void>
  /** `errored` からの削除 */
  discard: () => Promise<void>
  /** 送れなかったときの理由。送れていれば null */
  error: Ref<AgentQuestionError | null>
  /** ここまでに答えた数。総数は持たない */
  answered: Ref<number>
  /** 回答を送り、AI の起動まで要求する */
  send: (answer: Answer) => Promise<void>
}

export function useAgentQuestion(sessionId: MaybeRefOrGetter<string>): AgentQuestionReturn {
  const { question } = useQuestionChannel(sessionId)
  const waitingRetry = useWaitingRetry(sessionId)

  const answered = ref(0)
  const error = ref<AgentQuestionError | null>(null)

  const base = computed(() => `/api/${toValue(sessionId)}`)

  /** 今その回答を送った問い。決着したときに、まだ同じ問いを握っていないかを見るため。 */
  let asked: Question | null = null

  // 待機の決着は W1 の配信で付ける。次の1問が届いた瞬間に待機を終える（design 決定3）。
  // 再接続時も W1 が現在の1問を流すため、開き直しても同じ経路で決着する。
  watch(question, (next) => {
    if (next) waitingRetry.stopWaiting()
  })

  /**
   * 往復の決着。次の問いが来ないまま待機が明けたら、答え終わった問いを手放す。
   *
   * W1 は問いの配信しか持たない。取り下げは流れてこないので、答えた問いをいつまで
   * 抱えるかはこの機構が決める。ここで手放さないと、答え終わった問いを置いた側が
   * 「まだ答えを待っている」と読み続ける。
   *
   * 応答が得られなかったときは手放さない。同じ問いへ送り直す道が要る
   * （`specs/agent-question`「送れなかった回答は同じ問いのまま送り直せる」）。
   */
  watch(
    () => waitingRetry.waiting.value,
    (isWaiting, wasWaiting) => {
      if (!wasWaiting || isWaiting) return
      if (waitingRetry.failed.value || waitingRetry.errored.value) return
      if (question.value !== null && question.value === asked) question.value = null
      asked = null
    },
  )

  /**
   * 回答を送る。受理（U7）と起動（U13）は分かれているため、受理の成功応答の直後に
   * 起動を要求する（`specs/api/answer`）。
   *
   * 失敗しても throw しない。理由は `error` に、AI が応答を返さなかったことは `failed` に出る。
   * どちらの場合も問いは残るので、同じ問いにもう一度答えられる。
   */
  async function send(answer: Answer): Promise<void> {
    // 待機中は追加の送信を受け付けない。答えるべき問いが無いときも同じ。
    if (waitingRetry.waiting.value || question.value === null) return

    error.value = null
    asked = question.value
    try {
      await $fetch(`${base.value}/answer`, { method: 'POST', body: answer })
      answered.value += 1
    } catch (e) {
      error.value = { title: '答えを送れませんでした', message: messageOf(e) }
      return
    }

    try {
      await $fetch(`${base.value}/invoke-agent`)
      waitingRetry.startWaiting()
    } catch (e) {
      // 409 は「まだ前の応答を待っている」。他の起動失敗と区別して伝える。
      error.value = statusOf(e) === 409
        ? {
            title: 'まだ前の応答を待っています',
            message: 'AI が応答を返すまで、続けて送ることはできません。',
          }
        : { title: 'AI を起動できませんでした', message: messageOf(e) }
    }
  }

  return {
    question,
    waiting: waitingRetry.waiting,
    failed: waitingRetry.failed,
    errored: waitingRetry.errored,
    retryFromError: waitingRetry.retryFromError,
    discard: waitingRetry.discard,
    error,
    answered,
    send,
  }
}
