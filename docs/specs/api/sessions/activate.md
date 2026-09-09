# 完成の記録 — `POST /api/sessions/:id/activate`

昇格したプロジェクトの**完成**——呼び手が完成と判定したこと——を記録する。承認の判断（U10）・昇格（U14）・起動（U13）と同じく、承認の流れの1段を1つの endpoint が受け持つ。**完成したかの判定は受け持たない。** 共通の約束は [contract.md](../contract.md)。

- input: 本文なし
- output: 本文なし（204）

## 振る舞い

- phase を `approved` から `activated` に変える。`stroking → proposed → approved → activated` の一方向で、戻す操作は無い
- **判定を持たない（ADR-0014）。** 完成したかを決めるのは呼び手で、ここは `approved` → `activated` の遷移を記録するだけ。**成果物・ファイルシステム（`.spec-workflow/` 配下）・本家の REST・`invocation` を受理の可否の材料にしない。** 受理を断るのは責務の不成立——対象が無い・`state.json` を読めない・phase が `approved` でない——の3つだけである
- 起動も判断も昇格も受け持たない。`invocation` にも触れない——実行の記録は invoke-agent がこの応答を見てから書く
- **busy を見ない。** 叩くのは invoke-agent が `invocation` を `idle` に変える前で、その時点で対象の実行はまだ占有中。busy を見ると自分の実行に弾かれる
- **読んで書くはセッション単位で直列化する。** `state.json` は1ファイルで、書き込みは丸ごとである。起動時の後始末（A8 で `invocation`）と同じ対象に同時に触れても、古い写しで互いを上書きしない（`session-store.ts` の `withStateLock`。A8・会話 id の記録も同じ待ち行列を通る）
- 受理したら上層へ `project-creation` の `done` を配信する（[ws/delivery.md](../ws/delivery.md)）。**成功の決着を出すのはここだけ**で、A8 で `idle` を書いても決着にはならない

## 誰が叩くか

| 呼び手 | いつ | 応答の読み方 |
|---|---|---|
| invoke-agent | 生成中（`approved`）の steering が完了し、**終了時点で本家に3本の steering 文書と3件の承認依頼が在る**と確かめたとき、`idle` を書く前 | 2xx なら `idle`、それ以外（409・404・不達）は `failed`。断られたら phase を読み直し、既に `activated` なら受理と同じに扱う |
| 起動時の書き上げ（`server/plugins/01.activate-approved.ts`） | 起動のたびに1回、U12 の **`approved` かつ `invocation: 'idle'`** の各件に | 2xx は書き上げ、409 は生成中のまま。件数をログに出す |

**完成の判定はこの呼び手が持つ。** invoke-agent の判定の中身と、完成済み（`activated`）の起動し直しでここを叩かないことは [architecture/invoke-agent.md](../../architecture/invoke-agent.md)「作業が行われたかの判定」「完成の記録」。起動時の書き上げは一覧が返す実行の記録で対象を選び、`failed` / `error` / `running` は生成中のまま残す。

**判定の材料は本家の状態であって、`.spec-workflow/` 配下のファイルではない。** かつて U15 自身が `.spec-workflow/approvals/` の JSON を読んで受理の可否を変えていた形は、API が状態を判定する（ADR-0014）ので採らない。判定は呼び手に置き、呼び手は本家 REST に問い合わせる。

## エラー

| status | 状況 |
|---|---|
| 404 | 対象が無い |
| 409 phase | `state.json` を読めない（壊れたものは書き換えない） |
| 409 phase | まだ昇格していない（`stroking` / `proposed`） |
| 409 phase | 既に完成している（`activated`） |

409 はすべて `phase`。呼び手は「この対象は今この責務を成立させない」と読む。

## 巻き戻し

`activated` を書いた `state.json` が残ったまま `Phase` から `activated` を外すと、`readState` が失敗して削除の2本（U11・P1）がどちらも受理しなくなる。この change を巻き戻すときは、**先に `state.json` の `activated` を `approved` へ戻してから**コードを戻す。書き上げ（起動時のプラグイン）の逆の一度きりの手順で、対象は `phase: "activated"` を持つ `state.json` だけである。
