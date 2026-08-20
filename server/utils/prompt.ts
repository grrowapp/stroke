import { readClaudeConfig } from './claude-config'

/**
 * AI へ渡す prompt。
 *
 * 指示本文は prompt に載せない。ワークフロー定義（openspec の schema.yaml / template）に
 * あり、claude が呼び出しごとに自分で取得して従う（design.md 決定1）。ここに載せるのは
 * 実行させるコマンドと最低限の固定指示だけで、セッションごとの動的値の差し込みは持たない。
 * セッション id は cwd のディレクトリ名と `${CLAUDE_SESSION_ID}`、接続先は spawn 時の
 * 環境変数 `STROKE_BASEURL` で claude 側へ届く。
 */

/**
 * 初回（`--session-id` での新規起動）。実行させる opsx コマンドと、定義の在り処
 * （store）を示す。どちらも設定値で、再ビルドなしに差し替えられる。
 */
export function firstPrompt(): string {
  const config = readClaudeConfig()

  return `/${config.opsxCommand}

次のセッションを進める。store は ${config.storeId}。対象の change は cwd のディレクトリ名と同名。
従う指示はワークフロー定義から取得すること。`
}

/**
 * 2回目以降（`--resume` での継続）。リトライも同じこの1本を使う（design.md 決定1）。
 * 新しい入力は prompt に載せず、エージェントが取得スキルで読む。同じ入力を送り直さない
 * というリトライ規定も、これで満たされる。
 */
export function continuePrompt(): string {
  return '続きを進めろ。状況は取得スキルで確認してから判断しろ。'
}
