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

/** セッションの局面。design.md 決定4: phase では POST の受理の動きを変えない。 */
export type Phase = 'stroking' | 'proposed' | 'approved'

/** `claude -p` の呼び出し実行状態（U2 の `invocation`）。 */
export type Invocation = 'running' | 'idle' | 'failed'

/** U2 `GET /api/:id` の出力。 */
export interface SessionStatus {
  phase: Phase
  invocation: Invocation
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
}
