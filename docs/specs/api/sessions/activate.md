# 完成の記録 — `POST /api/sessions/:id/activate`

昇格したプロジェクトの**完成**——呼び手が完成と判定したこと——を記録する。承認の判断（U10）・昇格（U14）・起動（U13）と同じく、承認の流れの1段を1つの endpoint が受け持つ。**完成したかの判定は受け持たない。** 共通の約束は [contract.md](../contract.md)。

- input: 本文なし
- output: 本文なし（204）

## 振る舞い

- phase を `approved` から `activated` に変える。`stroking → proposed → approved → activated` の一方向で、戻す操作は無い
- **判定を持たない（ADR-0014）。** 完成したかを決めるのは呼び手で、ここは `approved` → `activated` の遷移を記録するだけ。**成果物・ファイルシステム（`.spec-workflow/` 配下）・本家の REST・`invocation` を受理の可否の材料にしない。** 受理を断るのは責務の不成立——対象が無い・`state.json` を読めない・phase が `approved` でない——の3つだけである
- 起動も判断も昇格も受け持たない。`invocation` にも触れない——実行の記録は invokeAi がこの応答を見てから書く
- **busy を見ない。** 叩くのは invokeAi が `invocation` を `idle` に変える前で、その時点で対象の実行はまだ占有中。busy を見ると自分の実行に弾かれる
- **読んで書くはセッション単位で直列化する。** `state.json` は1ファイルで、書き込みは丸ごとである。起動時の後始末（A8 で `invocation`）と同じ対象に同時に触れても、古い写しで互いを上書きしない（`session-store.ts` の `withStateLock`。A8・会話 id の記録も同じ待ち行列を通る）
- 受理したら上層へ `project-creation` の `done` を配信する（[ws/delivery.md](../ws/delivery.md)）。**成功の決着を出すのはここだけ**で、A8 で `idle` を書いても決着にはならない

## 誰が叩くか

| 呼び手 | いつ | 応答の読み方 |
|---|---|---|
| invokeAi（`server/utils/stroke/invoke.ts` の `recordCompletion`） | 生成中（`approved`）の steering が完了し、**その起動で steering 文書の提出が本家に受理されていた**とき（`didWork`）、`idle` を書く前 | 2xx なら `idle`、それ以外（409・404・不達）は `failed`。巡回が起こし直し、続きの実行の完了時にもう一度叩く。断られたら phase を読み直し、既に `activated` なら受理と同じに扱う（起動時の書き上げと同時に走った実行のため） |
| 起動時の書き上げ（`server/plugins/01.activate-approved.ts`） | 起動のたびに1回、U12 の **`approved` かつ `invocation: 'idle'`** の各件に | 2xx は書き上げ、409 は生成中のまま。件数をログに出す |

**完成の判定はこの呼び手が持つ。** invokeAi は `didWork`（その起動で文書の提出が受理されたか）で決め、作業が無ければここを叩かず `failed` にする。起動時の書き上げは一覧が返す実行の記録で対象を選び、`failed` / `error` / `running` は生成中のまま残す。完成済み（`activated`）の steering を起こし直しても、完了時にここは叩かない。

> **承認依頼を根拠にする形は 2026-09-04 に退けた。** かつては `.spec-workflow/approvals/<category>/*.json` の存在を完成の根拠にしていたが、API が状態を判定していた（ADR-0014）ことに加え、steering 工程には承認依頼を出す手段が無く（本家 `request-approval` は allowedTools に無い）、文書を出し終えた実行がすべて 409 で断られて `failed` → `error` に倒れた（実機確認）。

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
