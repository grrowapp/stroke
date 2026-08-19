// 画面とサーバで共有する型。CONTEXT.md の用語をそのまま使う。
//
// 方針: 局面ごとに存在するものが違うため、`phase` を判別子にしたユニオンで表す。
// 「stroking なのに proposal がある」のような組み合わせを型として作れないようにする。

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

/** 済んだストローク1つ。strokes.json に追記され、パンくずの粒になる。 */
export interface Stroke {
  question: Question
  answer: Answer
}

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

interface SessionBase {
  sessionId: string
  /** 済んだストローク。パンくずの道になる */
  strokes: Stroke[]
}

/** 画面が必要とするセッションの全体像。 */
export type SessionView =
  | (SessionBase & {
      phase: 'stroking'
      /** 今の問い */
      question: Question
    })
  | (SessionBase & {
      phase: 'proposed'
      /** 最新の proposal 本文 */
      proposal: string
      /** AI が提案した kebab-case のプロジェクト名。取れないことがある */
      projectName?: string
      /**
       * 差し戻しに対する AI の問い返し。答えを待っているなら入る。
       * 「点滅する知らせを出すか」はこれが null かどうかで決まる。
       */
      followupQuestion: Question | null
    })
  | (SessionBase & {
      phase: 'approved'
      proposal: string
      projectName: string
    })

/** 回答・差し戻しの結果。次の問いが来ることもあれば、proposal が返ることもある。 */
export type StrokeResult =
  /** まだストローク中。次の問いが来た */
  | { outcome: 'question'; phase: 'stroking'; question: Question }
  /** 差し戻しに対して AI が問い返してきた。proposal は前の版のまま */
  | { outcome: 'followup'; phase: 'proposed'; question: Question; proposal: string }
  /** proposal が出た（初回の把握完了、または出し直し） */
  | { outcome: 'proposal'; phase: 'proposed'; proposal: string; projectName?: string }

/** 承認の結果。 */
export interface ApproveResult {
  phase: 'approved'
}
