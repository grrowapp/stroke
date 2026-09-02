---
status: Planning
tags:
  - proposal
triage:
  - bug
change: add-activated-phase
order: 0.0
date: 2026-09-02
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
配信（決着）  'done'             invocation === 'idle'            （session-store.ts の creationOutcomeOf）
```

`invocation` は「claude のプロセスがどうなったか」しか表さない。`/write-steering-v2` が存在せず claude が `Unknown command` を返して**正常終了**すると `idle` になり、決着として `done` が流れる。

`invocation` を行の判定からは追い出したのに、配信側を揃えずに残したのが直接の原因である。`session-store.ts` の `writeInvocation` のコメントがその半端な状態を追認している。

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
- **それを立てる endpoint をサーバに足す。** 成果物の有無を確かめてから書く
- **行も配信も phase を見る。** 根拠を1つにする
- **`invocation` は失敗の応答に専念させる。** 成功の判定材料にしない

## 前提

- **スキルが無くて steering の作成が完了しなかったのなら、プロジェクトの生成が失敗したという状態が現れるべきである。** それが現れず完成扱いになったのがこの ticket の症状で、`/write-steering-v2` が無い件（[[fix-missing-write-steering-skill]]）はその引き金にすぎない。スキルを置くのはあちらの仕事で、置いても「完了しなかったのに失敗として現れない」構造はそのまま残る
- phase の値の集合がばら撒かれている。**値を足す前に1箇所へ閉じる。** イコール比較を各所へ足していく形は取らない
- **`server/handler/phase.ts` は没にする。** 設計に問題がある。`state.json` を zod を通さず生で読む3つ目の `readPhase` を持ち、`isBeforeApproval` / `isAfterApproval` という承認を軸にした述語を endpoint の外に置いている。`docs/specs/api/projects/delete.md` は「どの局面のものを許すかは各 endpoint が持つ」と定めており、この置き方はそれに反する。`activated` を足すためにここへ手を入れるのではなく、ファイルごと外す。phase の読みは `session-store` の `readState`（zod）に1本化し、削除の2 endpoint は自分の受理範囲を自分で持つ。具体の形は design で決める
- ~~**`activated` の位置が未決。**~~ `approved` の後で読む（`stroking → proposed → approved → activated`）。区間の始点が承認後、終点が提出後なので順序は一意に決まる
- 承認 endpoint が3つの仕事を1回でやっている件（`separate-approval-decision-from-promotion`）は **2026-09-02 に archive 済み**。下の「前提の変化」を参照
- 画面側（クラッカー・モーダル・やり直す・破棄する）は既に実装済みで、動く。**足りないのは判定の層だけ**

## 前提の変化（2026-09-02）

**この ticket を起票した後、土台が動いた（下の3点）。** 一度書いた `specs` / `design` / `tasks` はいずれもこの変化より前の前提に乗っており、追随のたびに書き換えが要る状態だったので、**artifact を proposal だけに戻し、調べた事実をここへ移した**。作り直すときはここを起点にする。

### 承認が3段に分かれた

`separate-approval-decision-from-promotion` がマージされ、**`phase` を書く endpoint が U10 から移った**。

| 段 | endpoint | すること |
| --- | --- | --- |
| 判断 | U10 `POST /api/strokes/:id/approve` | 判断を `proposed` の中の `decision` として記録する。**`phase` を動かさない・改名しない・起動しない**。取り下げは同 path の `DELETE` |
| 昇格 | U14 `POST /api/strokes/:id/promote` | 改名して `phase: 'approved'` を書く。**本文を取らない**（名前は判断が持つ）。起動しない。busy ガードを持つ |
| 起こし | U13 `GET /api/strokes/:id/invoke-agent` | steering を起こす。昇格の成功を見た側が呼ぶ |

**昇格の完了時点で `invocation` は `failed` に置かれる**（U14 が A8 経由で書く）。起動の要求が届かなくても巡回が拾えるようにするためで、**失敗の印ではなく「起こし直す対象」の印**である。決着として流すと昇格した瞬間に失敗のモーダルが出るので、流してはいけない。

### `docs/specs/api/` が分割された

`contract.md` 1本だった資料が、`overview.md`（目録）＋ `contract.md`（共通の約束と入出力）＋ `sessions/` `projects/` `ws/` の個別ファイルに分かれた。整合反映の宛先は分割後の構成に合わせて選び直すこと。

### steering に `didWork` が入った

`fix-steering-empty-completion` の実装が develop に入り（change 自体はまだ archive 前）、steering の起動にも `didWork` が渡るようになった（`invoke.ts` の `submittedByLaunch(token)`）。**文書を1本も書かずに終わった実行は `idle` にならず `failed` へ倒れる。**

ただし数えているのは **steering 文書の提出**であって承認依頼ではない。**文書は書いたが承認依頼を出さずに終わった実行は今も `idle` になる**ので、「レビューする」の先が空になる経路は残っている。

## 調べた事実（artifact を作り直すときの材料）

### 完成の判定材料の候補と、その可否

| 材料 | 可否 | 理由 |
| --- | --- | --- |
| `.spec-workflow/approvals/` に承認依頼のファイルが在るか | **有力** | 本家が動いていなくても読める。承認直後は本家がまだ registry に載せていないことがある。`activated` の意味（レビューできる状態）と一致する |
| 本家 REST の承認依頼一覧 | 難あり | 本家の稼働に依存する。取れなかったことと0件が混ざる（`docs/adr/0005`） |
| 自前 MCP `submit-document`(steering) の呼び出し回数 | 不可 | **承認依頼はこのツールを通らない**。承認依頼を作るのは本家 `spec-workflow-mcp` の `request-approval` である。文書の PUT を数えても承認依頼の有無は分からない |
| AI のプロセスの終了（`invocation === 'idle'`） | 不可 | 何も作らずに正常終了しうる（この ticket の「事実」節） |

### `activated` を足すと落ちる分岐

`activated` は「`approved` の後」であって「`approved` の代わり」ではない。**`approved` だけを見ている分岐は、放っておくと `activated` を別物として落とす。**

| 箇所 | いまの形 | 落ちると何が起きるか |
| --- | --- | --- |
| `shared/stroke.ts` の `Phase` | ユニオン3本 | — |
| `handler/phase.ts` の `readPhase` と `isAfterApproval` | 生読みの `=== 'stroking' \|\| === 'proposed' \|\| === 'approved'` と `phase === 'approved'` | **ファイルごと没にする**（上の「前提」）。残したまま `activated` を足すと、`DELETE /api/projects/:projectId` が `isAfterApproval` で受理範囲を決めているので**削除の endpoint 2つのどちらからも消せなくなる** |
| **`session-core.ts:242` のもう1つの `readPhase`** | 同じ連鎖。外れた値を `'unknown'` に倒す | U12 の一覧が `activated` を `'unknown'` として返し、**巡回の母集合が変わる**。起票時に数えていなかった5箇所目 |
| `session-store.ts` の zod | `phase` の判別可能ユニオン | `activated` の `state.json` が読めず `readState` が全面的に失敗する |
| `session-store.ts` の `creationOutcomeOf` | `phase !== 'approved'` なら流さない | — |
| `invoke-agent.get.ts:61`（U13）の `kind` 導出 | `phase === 'approved' ? 'steering' : 'stroke'` | 完成したプロジェクトを起こし直すと**ストロークの定型**で走り、steering の MCP も渡らない |
| `invoke-agent.get.ts:72` の `runId` | `phase === 'approved' ? state.runId : undefined` | 会話の続き先を失い、初回として走り直す |
| `promote.post.ts`（U14）の受理判定 | `phase === 'approved'` なら「既に昇格している」 | そのままでよい。`activated` も昇格済みなので同じ 409 に落ちるべき |

### 既存の `state.json` の移行が要る

`activated` を足すと、**既に完成しているプロジェクトはすべて `approved` のまま**なので、そのままでは全部が生成中として並び、入れなくなる。実物の `/opt/projects` に `state.json` を持つプロジェクトが在るので実害が出る。

前例は `server/plugins/01.reap-running.ts` の「立ち上がったときに、前のプロセスが残した `running` を倒す」（以前は `01.retry-failed.ts` の初回周回が担っていたが、いまは分かれている）。同じ場所・同じ考え方で一度きりの書き上げを置ける。

**巻き戻しに注意。** `activated` を書かれた `state.json` が残った状態で `Phase` から `activated` を外すと、phase を読む側が知らない値として落とし（zod なら `readState` が失敗、`session-core` の `readPhase` なら `'unknown'`）、**削除の endpoint がどちらも受理しなくなる**。

### 検討した案（決定ではない）

- **`activated` を書く endpoint** — 3段化で「段ごとに endpoint を持つ」形になったので、`POST /api/strokes/:id/activate` を1本置く案を検討した。U10 は「`phase` を動かさない」と契約に明記されており足せない。U14 は「本文を取らない」ので `{ phase }` を足すと昇格が名前を引数で受け取れる余地を開く。**起票時の tasks が書いていた「新規 endpoint を生やさない」は、U10 が唯一の phase 書き込み endpoint だった時点の前提**なので、そのまま適用できない
- **行と配信の根拠** — 成功は phase の遷移から、失敗は `invocation` の `error` から導く案を検討した。失敗は「区間の中で終われなかった」ことで区間の外に出る出来事ではないため、phase では表せない
- **走査の使い道** — `.spec-workflow/` の有無は**プロジェクトの母集合を作るためだけ**に使い、行の状態の判定には使わない。生成中の行を接続の判定の対象から外せば、「アクティブに化けて入場できる」経路が閉じる。入場のガード（`app/pages/projects/index.vue:55`）自体は今のままでよい

### 上位資料との食い違い（未反映）

`docs/agents/issue-tracker.md`「更新対応」により、**design.md で提案してユーザーの承認を得るまで書き換えない**。artifact を作り直すときに改めて提案する。

| 資料 | 食い違い |
| --- | --- |
| `openspec/specs/project/generation` | 「生成中か完了かはファイルシステムの事実だけで判定する」が `.spec-workflow/` の有無を判定材料に定めている。**この Requirement の MODIFIED を delta に載せないと、change の中で矛盾が残る** |
| `docs/specs/api/` | 完成を記録する endpoint が載っていない。`phase` の値に `activated` が無い。U13 の定型の選び分けが `approved` だけ |
| `CONTEXT.md`「生成中」 | 「終わりは `.spec-workflow/` が出来たときで、そこで通常のプロジェクトになる」。**定義本体（ステアリングをまだ作り終えていない状態）は正しく、誤っているのは判定基準のこの一文だけ** |
| `docs/specs/plan/portal-stroke-exit.md` | 図が「`.spec-workflow/` ができる → 実行が終わったら done を配信」になっている |
