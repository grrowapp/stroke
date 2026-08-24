import { readClaudeConfig } from './claude-config'

/**
 * AI へ渡す定型。
 *
 * 本文はコードに持たず、設定値（`runtimeConfig.claude.firstPrompt` / `continuePrompt`）
 * から読む（specs/ai-invocation: 定型は設定値として外に出す）。指示本文は prompt に
 * 載せない。従う手順はスキル（`openspec-ff-change`）自身が持ち、各アーティファクトの
 * 書き方はワークフロースキーマの instruction にある。claude が呼び出しごとに自分で
 * 取得して従う。セッションごとの動的値の差し込みは持たない。セッション id は cwd の
 * ディレクトリ名と `${CLAUDE_SESSION_ID}`、接続先は spawn 時の環境変数 `STROKE_BASEURL`
 * で claude 側へ届く。
 */

/** 初回（`--session-id` での新規起動）で渡す定型。 */
export function firstPrompt(): string {
  return readClaudeConfig().firstPrompt
}

/**
 * 2回目以降（`--resume` での継続）で渡す定型。リトライも同じこの1本を使う
 * （design.md 決定1）。新しい入力は prompt に載せず、エージェントが取得スキルで読む。
 * 同じ入力を送り直さないというリトライ規定も、これで満たされる。
 */
export function continuePrompt(): string {
  return readClaudeConfig().continuePrompt
}
