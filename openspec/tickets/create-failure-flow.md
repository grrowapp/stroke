---
status: Doing
origin: user
date: 2026-09-09
change: create-failure-flow
tags:
  - proposal
  - specs
  - design
  - tasks
  - pre2/4f092b9f-635f-480b-922e-0f648f0319e0
---

# create-failure-flow

異常系が起きた後の後始末——リトライで畳む範囲と、完全な失敗としてユーザーへ引き渡す境目、引き渡した先の選択肢——を、工程と画面を問わない規範として `docs/specs/architecture/failure.md` へ書き出す（ユーザー指示 2026-09-09）。

## 起票時の状態

- 後始末の記述は3箇所に断片で在り、いずれも**セッションの実行（`invocation`）についてだけ**である
  - `docs/specs/api/contract.md` — U2 の説明として「`error` は終端。画面は再実行か削除を出す」
  - `docs/specs/architecture/session-workflow.md`「実行の記録（`invocation`）」 — 状態の遷移図
  - `openspec/specs/stroke/frontier`「実行が error に達したら画面が示し、回復はユーザーが選ぶ」
- 上層のプロジェクト一覧・spec 画面・文書の編集で同じ「もう自動では通らない」が起きたとき、何を示し何を選ばせるかは決まっていない
- ユーザーへ出る選択肢は再実行と削除の2つだけ（`app/composables/useWaitingRetry.ts` の `retryFromError` / `discard`）。**時間を置いて戻る道と、人へ引き渡す道が無い**。削除は破壊を伴うのに、承諾を挟む規定も無い
- 行き止まりの禁止は `stroke/frontier` の中にしか無く、他の画面へ及ばない

## 畳む方向

1. `docs/specs/architecture/failure.md` を新設する。失敗の段階（リトライで畳む／完全な失敗と判定して引き渡す）・通知・対処の選択肢の4性質（そのまま再実行／時間を置いて再開／最初からやり直す／人へ引き渡す）・破壊を伴う選択肢の承諾・行き止まりの禁止を持つ
2. `api/contract.md` と `architecture/session-workflow.md` は `invocation` に固有の事実だけを残し、後始末の判断は新設の資料への参照にする
3. `stroke/frontier` の2つの Requirement を、新設の規範の適用として書き直す
4. 画面へ反映する。いま無いのは「時間を置いて再開」「最初からやり直す（承諾つき）」「人へ引き渡す」の3つ。問い合わせ先は設定として持つ必要があり、`docs/specs/core/settings-reference.md` への追加を design.md で諮る

## 書き出し先の決定

ユーザーへ3案（`architecture/` へ新設 / `session-workflow.md` へ節を追加 / `api/contract.md` へ節を追加）を諮り、**新設**を採った（2026-09-09）。名前は指摘を2度受けて決めた——長いとの指摘で `failure-recovery.md` から縮め、続けて「recovery ではなく failure」との指示で `failure.md` にした（指示の綴り `failer` は英語として立たないため、通用する `failure` を採った。`docs/agents/issue-tracker.md`「用語の表記」）。capability も `failure`、change-id も `create-failure-flow` に揃えた。

## 作業で分かったこと（2026-09-09）

- **W1 の接続時配信が終端の表示を消していた。** 答え終わっていない問いが残ったまま `error` に達した
  セッションを開くと、接続の瞬間に届く1問が `stopWaiting()` を呼び、終端の表示ごと落ちる。ユーザーは
  選択肢に触れないまま、答えても進まない問いの前に立たされていた。終端は問いの到着で解けない形に直した
- **初期状態の判定が一度きりで効かない場面があった。** 画面1 はモーダル（`stroke` レイアウト）の中に
  あり、中身は client 側にだけ描かれる。SSR の payload を持たずに hydration すると、setup の時点で
  `status` がまだ null で、`error` を拾えないまま問いの面が出る。`watch` で当てる形に直した
- **一覧から `error` のセッションへ戻れない。** 上層の一覧は昇格したプロジェクトだけを返し、ストローク中の
  セッションは載らない。「時間を置いて再開する」の戻り側が無い。扱いは design.md「Open Questions」で
  ユーザーへ諮る

対応する change: `create-failure-flow`
