## 1. 走っているプロセスを見つける

- [x] 1.1 走っているプロセスの一覧を取る口を作る（`server/utils/stroke/live-processes.ts`）。取れなければ `null` を返し、呼び手が「調べられない」に倒せるようにする
- [x] 1.2 argv から「どの対象の実行か」を判定する照合を作る（`server/utils/stroke/reap-match.ts`）。ストロークは `--session-id` / `--resume` の会話 id、steering は `--mcp-config` に載る cwd（design Decision 1）
- [x] 1.3 **どのサーバープロセスが起こしたかは照合しない**ことを、照合の docblock に理由つきで書く（design Decision 2）
- [x] 1.4 組み立て側（`invoke.ts` の `buildRun` + `claude.ts` の `runClaude`）と照合が同じ事実を見ていることを、実際に argv を作らせて固定する

## 2. 終了させてから畳む

- [x] 2.1 pid を `SIGKILL` で終了させ、**終了したことを確かめてから** `true` を返す口を作る（design Decision 5）
- [x] 2.2 判断がつかないとき（`ESRCH` 以外の失敗）は「まだ在る」側に倒す——止められた側へ倒さない
- [x] 2.3 `running` の対象ごとに分岐する判定を作る（`server/utils/stroke/reap.ts`）。走っている → 終了させて `failed` / 走っていない → `failed` / 終了させられない・調べられない → `error`
- [x] 2.4 判定は Nitro を知らない形にし、依存（一覧・終了・書き込み）を引数で受け取る——vitest から判定だけを確かめられるようにする
- [x] 2.5 `invocation` の書き込みは A8（`POST /api/strokes/:id/submission`）を通す。ファイルを直接読んで判定しない
- [x] 2.6 後始末の結果（終了させた件数・`failed` にした件数・`error` にした件数）をログへ出す

## 3. 巡回から切り出す

- [x] 3.1 起動時に1回だけ走る専用プラグインを置く（`server/plugins/01.reap-running.ts`）
- [x] 3.2 巡回プラグイン（`server/plugins/01.retry-failed.ts`）から「初回だけ `running` も倒す」を外し、`failed` だけを拾う形へ戻す（`portal/batch` の規定。design Decision 3）
- [x] 3.3 後始末と巡回の間に呼び出し順序の取り決めを置かない。その理由を巡回側の docblock に書く

## 4. 確かめる

- [x] 4.1 走っているプロセスを実際に起こして見つけ、`SIGKILL` で終了させてから `failed` にするところまでを本物で通す（`claude` は起動せず `node` で代用）
- [x] 4.2 対象に一致するプロセスが無ければ `failed` になることを確かめる
- [x] 4.3 終了させられない／一覧を取れない／対象の種別を組み立てられないとき `error` になり、`failed` にならないことを確かめる
- [x] 4.4 複数件が混ざったとき、それぞれ正しく数えて書くことを確かめる
- [x] 4.5 `yarn typecheck` と `yarn test` が通ることを確かめる（2026-09-02 実測: typecheck exit 0 / 72 files・904 tests 全通過）

## 5. 上位資料への整合反映（ユーザー承認を得てから書き換える）

- [ ] 5.1 `docs/specs/architecture/session-workflow.md`「実行の記録（`invocation`）」を、後始末が「まず終了させてから `failed` へ倒す」「終了させられない／調べられないものは `error`」を持つ形へ改める
- [ ] 5.2 同ファイルの状態遷移図に `running --> error: 起動時に後始末できない` を足す
- [ ] 5.3 資料が指す後始末のファイル名（`server/plugins/01.reap-running.ts`）と実体を一致させる
- [ ] 5.4 `error` の意味が「リトライ上限到達の終端」から「自動では回復しない終端」へ広がったことを、`error` を説明している資料へ反映する

## 6. 閉じる

- [ ] 6.1 santa-method レビューを通す
- [ ] 6.2 ユーザーの完了承認を得る
- [ ] 6.3 `openspec archive fix-orphan-run-on-restart --store stroke`
