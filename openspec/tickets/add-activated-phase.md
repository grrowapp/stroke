---
status: Planning
change: add-activated-phase
tags:
  - proposal
  - specs
  - design
  - tasks
triage:
  - bug
---

# add-activated-phase

プロジェクトの完成を記録する状態が無い。そのため**成果物がゼロでもクラッカーが上がり、「レビューする」が押せる**。

## 事実

実測 2026-08-30。`/opt/projects/setai-2` が次の状態で残っている。

```json
{ "phase": "approved", "projectName": "setai-2", "invocation": "idle", "retries": 0 }
```

```
.spec-workflow/steering  0件   ← product.md も tech.md も structure.md も無い
.spec-workflow/specs     0件
```

承認は通り、`.spec-workflow/` のひな型もできているが、**中身が1つも無い**。それでも画面上は完成したプロジェクトとして扱われる。

## なぜ起きるか

`Phase` が `stroking` / `proposed` / `approved` の3つで終わっており、**`approved` が終着**になっている。完成を記録する場所が無い。

無いので、行と配信が別々のものを測って両方 `done` と名乗っている。

```
行（一覧）    creation: 'done'   走査で .spec-workflow が有った   （directory.ts）
配信（決着）  'done'             invocation === 'idle'            （session-store.ts:207）
```

`invocation` は「claude のプロセスがどうなったか」しか表さない。`/write-steering-v2` が存在せず claude が `Unknown command` を返して**正常終了**すると `idle` になり、決着として `done` が流れる。

`invocation` を行の判定からは追い出したのに、配信側を揃えずに残したのが直接の原因である。`session-store.ts:187` のコメントがその半端な状態を追認している。

> `invocation` を合図の材料に使っても、行の判定が `invocation` に依存することはない。

## 追加の観測（ユーザー報告 2026-09-01）

同じ穴が、利用者から見える形で次のように現れた。

1. proposal を承認し、一覧で「生成中」の行を確認した
2. 通知画面へ移り、一覧へ戻ると、**生成は終わっていないのに行が「アクティブ」になっていた**
3. その行からワークスペースへ入場できた。承認依頼は1件も無く、ステアリング文書も1本も無い
4. ステアリングの画面を開くと **404**
5. 決着の「レビューする」を押しても、**承認依頼が何も出ていない**
6. 一覧で待っていると、しばらくして突然クラッカーが出た

**行の判定が走査（`.spec-workflow/` の有無）に拠っていることの帰結である。** そのディレクトリは本家 MCP が接続した瞬間にできるので、行はそこで完了に変わり、registry にも載るので「アクティブ」になる。入場のガード（`app/pages/projects/index.vue:55`）は `connection` しか見ていないため素通りする。

実測 `/opt/projects/agent-messanger`。

| 時刻 | 出来事 |
| --- | --- |
| `12:33:34` | `.spec-workflow/`・`templates/`・`archive/` ができる（MCP の接続時） |
| `13:10:35` | 最初のステアリング文書 `steering/tech.md` が書かれる |

**37分の空白**がある。この間ずっと、完成したプロジェクトとして扱われていた。

## 求めるもの

- **`Phase` に `activated` を足す。** steering が成果物を出し終えた状態
- **それを立てる口をサーバに足す。** 成果物の有無を確かめてから書く
- **行も配信も phase を見る。** 根拠を1つにする
- **`invocation` は失敗の応答に専念させる。** 成功の判定材料にしない

## 前提

- **`/write-steering-v2` が無い件（[[fix-missing-write-steering-skill]]）は原因ではない。** この穴を露出させた症状である。スキルを置いても、次に claude が別の理由で空振りすれば同じことが起きる
- phase の値の集合が4箇所にばら撒かれている（`shared/stroke.ts` の型 / `handler/phase.ts` の `readPhase` / `session-store.ts` の zod / `creationOutcomeOf`）。**値を足す前に1箇所へ閉じる。** イコール比較を各所へ足していく形は取らない
- `handler/phase.ts` のコメントが既に「`approved` の先に何か足す」ことを想定している。`isBeforeApproval` / `isAfterApproval` で入口は1つになったが、値の集合は残ったまま
- ~~**`activated` の位置が未決。**~~ 決着済み。`approved` の後（`stroking → proposed → approved → activated`）。tasks.md 冒頭の区間図が始点と終点を確定させている（design.md D1）
- 承認 endpoint が3つの仕事を1回でやっている件（`separate-approval-decision-from-promotion`）とは別。段の分割はこちらでは扱わない
- 画面側（クラッカー・モーダル・やり直す・破棄する）は既に実装済みで、動く。**足りないのは判定の層だけ**
