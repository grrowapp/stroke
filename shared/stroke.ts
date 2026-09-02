// 画面とサーバで共有する型。CONTEXT.md の用語をそのまま使う。
//
// 集約応答（旧 SessionView / StrokeResult / ApproveResult）は持たない。画面は
// WS 受信（W1 / W2）と GET（U2 / U3）を組み合わせて表示を組み立てる（design.md）。

/** ハイライトの色。5色から選ぶ（design.md 決定10）。 */
export type HighlightColorName = 'yellow' | 'green' | 'blue' | 'pink' | 'orange'

export interface HighlightColor {
  name: HighlightColorName
  bg: string
  border: string
}

/**
 * 問いの選択肢。決定を代行するためではなく、決定を下すユーザーへ材料を渡すためのもの。
 * 推奨は多くとも1つ。根拠は画面に出さないため持たない。
 */
export interface QuestionOption {
  /** 選択肢の見出し。1〜5語（形式の規定は文言のみ・design.md 決定2） */
  label: string
  /** それを選ぶと何がどうなるか */
  description: string
  recommended?: boolean
}

/**
 * AI が返すストロークの問い。1回の応答に1つ。推奨は多くとも1つ。
 * 画面はこの順（話題タグ → 詳細説明 → 問い本文 → 選択肢）で出す。
 */
export interface Question {
  /** 話題タグ。その問いが何についてのものか */
  header: string
  /** 詳細説明。確定済みの前提と、調べて分かった事実 */
  detail: string
  /** 問い本文 */
  question: string
  options: QuestionOption[]
}

/** ユーザーの回答。選択肢を選ぶか、自由入力で書くか。 */
export type Answer =
  | { kind: 'option'; value: string }
  | { kind: 'free'; value: string }

/**
 * 済んだストローク1つ。strokes.json に追記され、パンくずの粒になる。
 *
 * `proposal: false` は問いと回答のペア行（ストロークの問いも問い返しも同じ形）。
 * `proposal: true` は proposal の初提出を示すマーカー行で、question / answer は持たない。
 */
export type Stroke =
  | { proposal: false; question: Question; answer: Answer }
  | { proposal: true; question: null; answer: null }

/**
 * 差し戻しのコメント。本文の一部に紐づく selection と、全体への general の2種。
 * selection は引用・位置・色を必ず持つ。
 */
export type Annotation =
  | {
      id: string
      type: 'general'
      comment: string
      timestamp: string
    }
  | {
      id: string
      type: 'selection'
      comment: string
      timestamp: string
      /** 引用した文字列（全文） */
      selectedText: string
      /** 生テキストにおける位置 */
      startOffset: number
      endOffset: number
      highlightColor: HighlightColor
    }

/** `SendBackPayload.annotations` に JSON 化して載せる記録。 */
export interface SendBackRecord {
  decision: 'sent-back'
  comments: Annotation[]
  summary: string
  timestamp: string
}

/**
 * 差し戻しとして AI に渡すもの。1つに畳まず4層で渡す。
 * spec-workflow-mcp の approvals と同じ組み立て（design.md 決定10）。
 */
export interface SendBackPayload {
  /** 人間可読の要約 */
  response: string
  /** 構造化配列。箇所と指摘の対応を保つ */
  comments: Annotation[]
  /** `SendBackRecord` を JSON 化したもの */
  annotations: string
  /** 手続き。どう直すかは書かない */
  nextSteps: string[]
}

/**
 * セッションの局面の値。**値の集合はここ1つ。** zod・一覧の読み・型はすべてここから導く
 * （openspec/changes/add-activated-phase design D1）。イコール比較の連鎖をどこにも書かない。
 *
 * `stroking → proposed → approved → activated` の順で一方向に進む。
 * - `approved` — 承認で昇格したが、steering がまだ承認依頼を出していない（生成中）
 * - `activated` — steering が承認依頼を出した。完成の記録（U15）だけが書く
 */
export const PHASES = ['stroking', 'proposed', 'approved', 'activated'] as const

/** セッションの局面。design.md 決定4: phase では POST の受理の動きを変えない。 */
export type Phase = (typeof PHASES)[number]

export function isPhase(value: unknown): value is Phase {
  return (PHASES as readonly unknown[]).includes(value)
}

/**
 * 昇格済みか（もうプロジェクトか）。`approved` と `activated` の両方。
 *
 * 読みを含まない純関数である。「どの局面を許すか」は各 endpoint が自分の literal で
 * 持ち（openspec/specs/api/project/delete「局面の判定はこの endpoint が持つ」）、
 * ここはその判定を代行しない。
 */
export function isPromotedPhase(phase: Phase): phase is 'approved' | 'activated' {
  return phase === 'approved' || phase === 'activated'
}

/**
 * 実行の記録（U2 の `invocation`）。
 *
 * - `running` — 実行中
 * - `idle` — 平常
 * - `failed` — 失敗。巡回が拾って起こし直す（openspec/specs/portal/batch）
 * - `error` — リトライ上限に達した**終端**。システムは自動では何もせず、ユーザーの
 *   再実行（回数リセット）か削除だけが回復手段になる
 *
 * 書き込みは A8（`POST /api/strokes/:id/submission`）経由で invokeAi だけが行う
 * （openspec/specs/agent/invocation）。
 */
export type Invocation = 'running' | 'idle' | 'failed' | 'error'

/** U2 `GET /api/:id` の出力。 */
export interface SessionStatus {
  phase: Phase
  invocation: Invocation
  /**
   * 対象のディレクトリのパス。画面はこれを cwd として U13 に渡す。
   * **endpoint に導出させない**（design.md D5）。
   */
  path: string
}

/** W2 `/api/:id/ws/proposal` の配信1件分。A7 の入力と対になる。 */
export interface ProposalMessage {
  proposal: string
  projectName: string | null
}

/**
 * U12 `GET /api/sessions` の1件分。`updatedAt` は `state.json` の mtime（ISO 8601）。
 * `state.json` が読めないセッションは phase を `unknown` として載せる。
 */
export interface SessionSummary {
  id: string
  phase: Phase | 'unknown'
  updatedAt: string
  /**
   * 対象のディレクトリのパス。
   *
   * 起動をキックする側（画面・巡回・承認処理）は、これを cwd として U13 に渡す。
   * **endpoint に導出させない**（design.md D5）——昇格の前後で id の意味が uuid から
   * プロジェクト名へ変わるため、導出側が分岐を持つことになる。
   */
  path: string
  /** 実行の記録。巡回はこれが `failed` の件だけを拾う */
  invocation: Invocation
}
