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
