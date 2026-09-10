/**
 * A8 の path。`invocation` の唯一の書き込み口。
 *
 * `invoke.ts`（`kick` の中の `buildRun` が組み立てる書き手）と `ai.ts`（組み立てに
 * 失敗した経路の書き手・`invokeAi` の中）の両方が要るので、どちらから読んでも循環
 * import にならない場所へ独立させてある（fix-idle-stuck-on-run-build-failure design.md D1）。
 */
export function submissionPath(sessionId: string): string {
  return `/api/strokes/${encodeURIComponent(sessionId)}/submission`
}

/**
 * U15 の path。完成の記録（phase を `activated` にする）の唯一の書き込み口。
 *
 * 叩くのは invokeAi の呼び出し側（`invoke.ts` の `recordCompletion`）と、起動時の書き上げ
 * （`server/plugins/01.activate-approved.ts`）。A8 と同じ理由でここに並べる
 * （openspec/changes/add-activated-phase design D4）。
 *
 * path は docs（`docs/specs/api/overview.md`）の定義どおり `/api/sessions/` に置く。セッションの
 * endpoint は `/api/sessions/`、エージェントが叩く endpoint は `/api/strokes/` で、名前空間が
 * 分かれている——同じファイルの `submissionPath`（A8）が `/api/strokes/` を返すのはそのためである。
 */
export function activatePath(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/activate`
}

/**
 * A9 の path。実行の決着（提出されたものに応じた phase の切り替えと画面への配信）の
 * 唯一の書き込み口。
 *
 * 叩くのは invokeAi の呼び出し側（`invoke.ts` の `settle`）だけである。提出を受ける口
 * （A5・A7）は記録だけを行い、局面は動かさない——局面が変わってよいのは実行が終わった
 * 時点だけで、それを知るのは子プロセスを制御する invokeAi だけである
 * （openspec/specs/agent/invocation・api/stroke/proposal・api/stroke/question）。
 */
export function settlementPath(sessionId: string): string {
  return `/api/strokes/${encodeURIComponent(sessionId)}/settlement`
}
