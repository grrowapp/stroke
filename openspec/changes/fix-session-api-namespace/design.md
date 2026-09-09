## Context

動機は proposal.md「Why」。ここは**移設の中身**（どのディレクトリをどこへ、どの参照をどう直すか、`useAgentQuestion` の 404 をどのテストで押さえるか、何を確かめれば残りが A 系だけだと言えるか）を決める。

現状の制約:

- 名前空間の正は `docs/specs/api/overview.md` である。セッション系 11 本が `/api/sessions/…`、エージェント向けの A 系 5 本が `/api/strokes/:id/…`、WS の W1 / W2 が `/api/sessions/:id/ws/…`。`docs/specs/api/sessions/*.md`・`ws/delivery.md`・`contract.md` も同じ形で書かれている（`contract.md` は子 change `fix-api-contract-path-drift` が追随済み）。**これらは基準で、この change は 1 文字も触らない**
- 実装で `/api/sessions/` に在るのは U11（`server/api/sessions/[id]/index.delete.ts`）と U15（`server/api/sessions/[id]/activate/index.post.ts`）の 2 本だけである。残りの U 系 9 本と W1 / W2 は `/api/strokes/` に在る
- 直前の子 change `fix-session-api-layout`（Gitea #13）で `server/api/` の handler はすべて `<endpoint 名>/index.<method>.ts` に揃っている。**移設は `<namespace>/[id]/<endpoint 名>/` というディレクトリを丸ごと動かす形になり、階層の深さが変わらない。したがって相対 import は 1 行も動かない**——`fix-session-api-layout` が `../../../utils/…` → `../../../../utils/…` の付け替えに費やした手当ては、この change では要らない
- handler を指しているのは **URL だけ**である（`fix-session-api-layout` の design で確認済み。handler のファイル path を `import` している本番コードは無く、`await import()` で直に読むのはテストだけ）。したがって URL を変える側の追随先は「path の文字列を書いている箇所」に尽き、`grep` で全数を列挙できる
- `send-back` だけは 1 つの Endpoint 名に 2 つの契約が同居している。POST が U9（画面が差し戻しを送る）、GET が A4（エージェントが指摘を読む）で、`overview.md` は前者を `/api/sessions/:id/send-back`、後者を `/api/strokes/:id/send-back` に置く。**ディレクトリごと動かせない唯一の Endpoint である**
- `useAgentQuestion.ts` の基底は `/api/${sessionId}` で、名前空間そのものを落としている。回答の送信（U7）も起動要求（U13）も 404 になる。**この経路を通るテストは単体・E2E とも 1 本も無い**——`test/app/composables/useAgentQuestion.test.ts` は在るが、URL を `url.includes('/invoke-agent')` で見るだけで path を 1 度も検査していない。E2E（`agent-question.spec.ts`）は 404 を避けるために末端の受理を stub で差し替えており、その旨が docblock に書いてある
- E2E の 5 本と `.claude/settings.json` は、URL の文字列を直接持つ。旧 path の互換を残さない以上、同じ差分で追随させないと落ちる

## Goals / Non-Goals

**Goals:**

- U 系 9 本と W1 / W2 の URL を `overview.md` の名前空間へ移し、A 系 5 本を `/api/strokes/` に残す。**移設の後、`grep -rn "api/strokes" app server shared test .claude` に残るのが A 系と MCP tools だけになる**
- handler の移動を `git mv` のディレクトリ単位で済ませ、**handler の中身を 1 行も変えない**（`send-back` の POST / GET の切り分けと、旧ファイル名を挙げた docblock の追随だけが例外）
- `useAgentQuestion` の 404 を直し、**その経路を通るテストを単体と E2E の両方で残す**。単体は path そのものを検査し、E2E は stub を外して実物の U7 を通す
- 関連 docs 4 ページを実装と一致させる（承認済み）
- `openspec/specs/server/session-management` の 2 つの Scenario を `overview.md` の名前空間へ揃える

**Non-Goals:**

- 旧 path の互換（`connect-portal-and-strokes` 7.1 の決め。capability `server/api-layout`「移した後に旧 path を残そうとする」）
- A 系 5 本の path の変更、`server/mcp/tools/*` の変更（親 change「触らないもの」）
- handler の中身を `server/handler/` へ切り出す整理（Gitea #15・#18）
- `test/server/api/**` 全体に `[id]` の段を挟むかどうかの一般化（下の「テストの移動」で範囲を限る）
- 旧 ticket 2 本の `.archive/` への移動と、README だけの change ディレクトリの削除（親が行う）

## Decisions

### handler の移動 — `server/api/strokes/` から `server/api/sessions/` へ、ディレクトリごと `git mv`

`server/api/` からの相対で書く。左が現在、右が移動後。

| 契約 | 現在 | 移動後 |
| --- | --- | --- |
| U1 | `strokes/index.post.ts` | `sessions/index.post.ts` |
| U12 | `strokes/index.get.ts` | `sessions/index.get.ts` |
| U2 | `strokes/[id]/index.get.ts` | `sessions/[id]/index.get.ts` |
| U3 | `strokes/[id]/strokes/index.get.ts` | `sessions/[id]/strokes/index.get.ts` |
| U7 | `strokes/[id]/answer/index.post.ts` | `sessions/[id]/answer/index.post.ts` |
| U9 | `strokes/[id]/send-back/index.post.ts` | `sessions/[id]/send-back/index.post.ts` |
| U10 | `strokes/[id]/approve/index.post.ts`・`index.delete.ts` | `sessions/[id]/approve/index.post.ts`・`index.delete.ts` |
| U13 | `strokes/[id]/invoke-agent/index.get.ts` | `sessions/[id]/invoke-agent/index.get.ts` |
| U14 | `strokes/[id]/promote/index.post.ts` | `sessions/[id]/promote/index.post.ts` |

残るもの（動かさない）:

| 契約 | 場所 |
| --- | --- |
| A1 | `strokes/[id]/overview/index.get.ts` |
| A4 | `strokes/[id]/send-back/index.get.ts` |
| A5 | `strokes/[id]/question/index.post.ts` |
| A7 | `strokes/[id]/proposal/index.post.ts` |
| A8 | `strokes/[id]/submission/index.post.ts` |
| U11 | `sessions/[id]/index.delete.ts`（既に移動先の側） |
| U15 | `sessions/[id]/activate/index.post.ts`（既に移動先の側） |

移動の後、`server/api/strokes/[id]/` に残るのは A 系 5 本だけになり、`server/api/strokes/` の直下（`index.get.ts`・`index.post.ts`）は空になる。A 系は 5 本とも `:id` を取るので、これは `overview.md` の「`strokes/` — 5本」と 1 対 1 で対応する形である。

- **`send-back` だけはディレクトリを分ける。** POST（U9）を `sessions/[id]/send-back/` へ移し、GET（A4）を `strokes/[id]/send-back/` に残す。同じ Endpoint 名のディレクトリが 2 つの名前空間に並ぶが、**それぞれが持つ Method は 1 つずつ**なので capability `server/api-layout`「同一 Endpoint の複数 Method は Method ごとの handler にする」に反しない。URL が別である以上、これは同一 Endpoint ではない
- **相対 import は触らない。** `strokes/[id]/answer/` と `sessions/[id]/answer/` は `server/api/` から見て同じ深さなので、`../../../../utils/…` はそのまま解決される。U1 / U12 も `strokes/` 直下から `sessions/` 直下への移動なので同じ。**付け替え漏れという失敗の形がそもそも生じない**——`fix-session-api-layout` の主要なリスクは、この change には存在しない
- 代替: 旧 path に薄い転送の handler を残す → `connect-portal-and-strokes` 7.1 の決めと capability「移した後に旧 path を残そうとする」に反する。呼び手は画面・サーバ内・E2E だけで全数を同じ差分で追随できるので、互換を置く理由が無い。却下
- 代替: `overview.md` を実装に合わせて `/api/strokes/` に直す → 基準は触らないという親 change の決め。却下

### WS route と `wsPathPattern` — route を移し、既定値を 1 箇所で書き換える

`server/routes/api/strokes/[id]/ws/{question,proposal}.ts` を `server/routes/api/sessions/[id]/ws/` へ `git mv` する。ここも深さが変わらないので相対 import（`../../../../../utils/…`）は動かない。

`nuxt.config.ts` の `runtimeConfig.wsPathPattern` の既定値を直す。

- 現状: `'/api/strokes/([^/]+)/ws/{channel}(?:$|[/?#])'`
- 追従後: `'/api/sessions/([^/]+)/ws/{channel}(?:$|[/?#])'`

パターンを読むのは `server/utils/stroke/ws-channels.ts` の `sessionIdFromUrl` 1 本だけで、そこは文字列を持たないので触らない。**ただし同じファイルの doc コメント 2 行が `/api/:id/ws/question`・`/api/:id/ws/proposal` と書いており、名前空間を落とした形である。** 移設後の URL に合わせて `/api/sessions/:id/ws/…` に直す。route 側 2 本の docblock（`W1 /api/:id/ws/question`・`W2 /api/:id/ws/proposal`）も同じ理由で直す。

**route の移動と `wsPathPattern` は必ず同じ差分で動かす。** 片方だけを動かすと、接続は張られるが `sessionIdFromUrl` が `null` を返し、**peer が無言で閉じる**（`question.ts` の `open` が `peer.close()` する）。エラーも出ないので、画面には「問いが届かない」としか現れない。

- 代替: `wsPathPattern` を `/api/(?:sessions|strokes)/…` の両受けにする → 旧 path の互換を残すことにあたる。却下

### サーバ内の自己呼び出し — 5 箇所。U12 の一覧が 4 本、U13 の path が 1 本

| ファイル | 何を叩いているか | 現状 → 追従後 |
| --- | --- | --- |
| `server/utils/stroke/invoke.ts:46`（`invokePath`） | U13 | `/api/strokes/${id}/invoke-agent?cwd=…` → `/api/sessions/${id}/invoke-agent?cwd=…` |
| `server/utils/stroke/invoke.ts:263`（`hasConversation`） | U12 | `'/api/strokes'` → `'/api/sessions'` |
| `server/plugins/01.reap-running.ts:33` | U12 | 同上 |
| `server/plugins/01.activate-approved.ts:35` | U12 | 同上 |
| `server/plugins/01.retry-failed.ts:46` | U12 | 同上 |

`server/utils/stroke/submission-path.ts` は path を 2 つ持つが、**どちらも変わらない**。`submissionPath`（A8）は `/api/strokes/:id/submission` のままが正しく、`activatePath`（U15）は既に `/api/sessions/:id/activate` である。触るのは docblock の 1 文だけで、

- 現状: 「path は docs（`docs/specs/api/overview.md`）の定義どおり `/api/sessions/` に置く。他の U 系が実装では `/api/strokes/` に在るのは実装側の誤りで、別 ticket（fix-session-api-path）が直す。」
- 追従後: 「path は docs（`docs/specs/api/overview.md`）の定義どおり `/api/sessions/` に置く。U 系は `/api/sessions/`、エージェント向けの A 系は `/api/strokes/` で、名前空間が分かれている。」

**この change が `fix-session-api-path` である**（親 change design「旧 ticket の吸収」）ので、先送りの断り書きは残さない。

### 画面 — 8 本。`useAgentQuestion` だけが path の修正ではなく不具合の修正である

| ファイル | 契約 | 現状 → 追従後 |
| --- | --- | --- |
| `app/pages/strokes/index.vue:19`・`:33` | U1・U13 | `'/api/strokes'`・`/api/strokes/${id}/invoke-agent` → `/api/sessions` 系 |
| `app/pages/strokes/[sessionId]/index.vue:23`・`:39`・`:95`・`:107` | U2・U3・U2・U7 | 同上 |
| `app/pages/strokes/[sessionId]/proposal.vue:20`・`:38` | U2・U3 | 同上 |
| `app/composables/useSessionChannel.ts:20` | W1 / W2 | `…/api/strokes/${id}/ws/${channel}` → `…/api/sessions/${id}/ws/${channel}` |
| `app/composables/useWaitingRetry.ts:60`・`:128` | U2・U13 | 同上（`:162` の U11 は既に `/api/sessions/`） |
| `app/composables/useProjectApi.ts:183` | U13 | 同上 |
| `app/composables/useProposalReview.ts:78`（`base`）・`:490`（`kickSteering`） | U2 ほか・U2 + U13 | 同上 |
| `app/composables/useAgentQuestion.ts:63`（`base`） | U7 + U13 | **`/api/${id}` → `/api/sessions/${id}`** |

`useProposalReview.ts:77` の doc コメント「このセッションの API。`/api/<uuid>`」は、`base` の実体（`/api/strokes/<uuid>`）と既に食い違っている。`base` を直すのと同じ行の説明なので `/api/sessions/<uuid>` に揃える。

**`useAgentQuestion` の 1 行だけは、名前空間の移設ではなく 404 の修正である。** 他の 7 本は「動いていた URL が別の URL に変わる」だけだが、ここは「届いていなかった URL が届くようになる」。したがって**この経路を通る自動テストを残すことが受け入れ条件に入っている**（旧 ticket `fix-agent-question-api-path`）。

### `useAgentQuestion` の経路を通るテスト — 単体で path を検査し、E2E で stub を外す

**単体（`test/app/composables/useAgentQuestion.test.ts` に 1 つの `describe` を足す）。** 既存の 3 件は `url.includes('/invoke-agent')` で分岐するだけで、path を 1 度も検査していない。**基底が `/api/` でも `/api/sessions/` でも同じように通る**ので、この不具合を 1 件も検出できない。足すのは次の 2 件である。

1. `send` が回答を送る先が `/api/sessions/<id>/answer` であること（U7）
2. その直後の起動要求の先が `/api/sessions/<id>/invoke-agent` であること（U13）

`fetchMock.mock.calls` から実際に渡された URL を取り出して突き合わせる。**`toHaveBeenCalledWith` の第 1 引数を実際の文字列で書く**ので、基底が変われば落ちる。

**E2E（`test/e2e/agent-question.spec.ts`）。** `stubFollowupAnswer`（`page.route('**/answer', …)`）を消す。この stub は「基底の誤りに引きずられずに、送ったあと面がどう動くかを確かめる」ために置かれたもので、docblock がその理由を明記している。基底が直れば理由が消え、**実物の U7 を通せる**——画面2 の問い返しは `phase: 'proposed'` かつ `currentQuestion` が在る局面で送られるので、U7 の門（承認以降を断つ・問いが無ければ断つ）はどちらも通る。stub を外した 3 件（`AI が問いを打ち止めると…`・`問いが置き換わると…`・`問いが長くても…`）が、そのまま「回答の送信が 404 にならない」の証拠になる。docblock も削る。

- 代替: 単体テストだけ足して E2E の stub は残す → stub が残っている限り、E2E は基底が誤っていても通り続ける。旧 ticket の受け入れ条件「回答の送信が成功し、404 にならない」を E2E では確かめられない。却下
- 代替: E2E だけで押さえる → E2E は負荷で落ちうるので、path の検査という機械的な判定を E2E だけに置かない。単体と E2E の両方に置く

### テストの移動 — U 系 7 本を `test/server/api/sessions/` へ。`[id]` の段は挟まない

`docs/specs/structure/system-structure.md` §2 は「単体は `app/` `modules/` `server/` `shared/` の構造をそのまま写す」と定める。handler が名前空間をまたぐので、テストの写しも同じだけ動かす。

| 現在 | 移動後 |
| --- | --- |
| `test/server/api/strokes/answer/index.post.test.ts` | `test/server/api/sessions/answer/index.post.test.ts` |
| `test/server/api/strokes/approve/index.post.test.ts` | `test/server/api/sessions/approve/index.post.test.ts` |
| `test/server/api/strokes/approve/index.delete.test.ts` | `test/server/api/sessions/approve/index.delete.test.ts` |
| `test/server/api/strokes/invoke-agent/index.get.test.ts` | `test/server/api/sessions/invoke-agent/index.get.test.ts` |
| `test/server/api/strokes/invoke-agent/multiplex.test.ts` | `test/server/api/sessions/invoke-agent/multiplex.test.ts` |
| `test/server/api/strokes/promote/index.post.test.ts` | `test/server/api/sessions/promote/index.post.test.ts` |
| `test/server/api/strokes/send-back/index.post.test.ts` | `test/server/api/sessions/send-back/index.post.test.ts` |

残るもの: `test/server/api/strokes/question/index.post.test.ts`（A5）・`proposal/index.post.test.ts`（A7）。`test/server/api/sessions/activate/index.post.test.ts`（U15）は既に移動先の側に在る。

深さが変わらないので、直すのは次の 2 つだけである。相対 path（`'../../support'`・`'../../../../../server/…'`）と `vi.mock` の第 1 引数の**段数**は動かない。

1. `await import()` と `vi.mock` が指す handler の path — `…/server/api/strokes/[id]/answer/index.post` → `…/server/api/sessions/[id]/answer/index.post`
2. 冒頭 docblock の「対象は `server/api/…`」と `describe` の path の表記 — `U7 POST /api/strokes/:id/answer` → `U7 POST /api/sessions/:id/answer`

**`[id]` の段は挟まない。** `fix-session-api-layout` の design がこの判断を #17 へ引き継いでいた（「`test/server/api/strokes/**` を `sessions/**` へ動かすときに合わせて判断するのが自然である」）。結論は「現行の置き方を続ける」で、根拠は 2 つある。

- Gitea issue #17 が移動先を `test/server/api/sessions/` と指定しており、`[id]` の段を足せと言っていない
- A 系のテスト 2 本は `test/server/api/strokes/<endpoint 名>/` に残る。片側だけ `[id]` を足すと、**同じ `server/api/<namespace>/[id]/<endpoint 名>/` を写した 2 つのディレクトリが違う形になる**。揃えるなら A 系も動かすことになり、issue の「A 系はそのまま」を超える

### `test/server/api/sessions/index.delete.test.ts` の階層合わせ — `fix-session-api-layout` からの申し送り

`test/server/api/sessions/index.delete.test.ts` は `server/api/sessions/[id]/index.delete.ts`（U11）を対象とするテストだが、`test/server/api/sessions/` の直下に置かれている。`test/server/api/sessions/[id]/index.delete.test.ts` へ移す。

**この change で直す理由。** これまでは `server/api/sessions/` の直下に handler が 1 本も無かったので、位置の誤りが実害にならなかった。この change で U1（`sessions/index.post.ts`）と U12（`sessions/index.get.ts`）が名前空間の直下に置かれるため、**`test/server/api/sessions/index.<method>.test.ts` という位置は「名前空間の直下の handler のテスト」を意味するようになる**。`index.delete.test.ts` をそこに残すと、実在しない `server/api/sessions/index.delete.ts` を写したものと読める。

`fix-project-api-layout` → `fix-session-api-layout` が `test/server/api/projects/index.delete.test.ts` を `[projectId]/index.delete.test.ts` へ移したのと同型で、同じ形で畳む。**これは 1 つ上の「`[id]` の段は挟まない」と矛盾しない**——`[id]` の段を書くのは、**名前空間の直下の handler と `[id]` の直下の handler を区別する必要があるときだけ**である。Endpoint 名のディレクトリ（`answer/`・`approve/` …）はその名前で区別が付くので要らない。`projects` 側が既にその形になっている（`projects/index.post.test.ts` は直下のまま、`projects/[projectId]/index.delete.test.ts` は `[projectId]` を挟む）。

直すのは相対 path の深さ（`'../support'` → `'../../support'`、`'../../../../server/…'` → `'../../../../../server/…'`）だけで、`await import()` が指す handler は動いていないのでそのまま。

### 期待値だけを直すテスト — 3 本

| ファイル | 行 | 何を見ているか | 現状 → 追従後 |
| --- | --- | --- | --- |
| `test/app/composables/useWaitingRetry.test.ts` | 160・166 | U13 の要求先 | `/api/strokes/${SESSION}/invoke-agent` → `/api/sessions/…` |
| `test/server/utils/stroke/sweep.test.ts` | 27・40 | `invokePath`（U13） | `/api/strokes/abc/invoke-agent?…` → `/api/sessions/…` |
| `test/server/middleware/mcp-token.test.ts` | 80 | 素通しする path の例（U12） | `'/api/strokes'` → `'/api/sessions'` |

`mcp-token.test.ts:81` の `'/api/strokes/session-1/overview'`（A1）はそのままである。同じ配列の中で 1 行だけ直すので、**A 系と U 系が名前空間で分かれていることが、この 2 行の並びにそのまま現れる**。

### E2E — 5 本。U 系と W1 / W2 だけを直し、A 系はそのまま

| ファイル | 直すもの | 残すもの |
| --- | --- | --- |
| `agent-question.spec.ts` | U1（`startSession`）、`page.route` の `**/api/strokes/*/answer` 3 箇所（U7）、`new RegExp('/api/strokes/<id>$')`（U2）、`stubFollowupAnswer` の削除 | A5（`/question`）・A7（`/proposal`） |
| `proposal-annotation.spec.ts` | U1 | A7 |
| `proposal-persistence.spec.ts` | U1、U2 の 2 箇所 | A7 の 3 箇所 |
| `stroke-exit.spec.ts` | U10（`/approve`）、U2 の 2 箇所、U14（`/promote`） | A8（`/submission`） |
| `ws-disconnect.spec.ts` | U1、W1 / W2 の `ws://…/api/strokes/<id>/ws/<channel>` | A5・A7 |

`page.unroute` は `page.route` と同じ pattern を渡す必要があるので、対になっている 2 行を必ず一緒に直す（`agent-question.spec.ts:439` と `:451`）。**pattern だけがずれても Playwright は黙って何もしない**ので、typecheck でも実行でも落ちない形になりうる。

### `.claude/settings.json` — 許可行 1 つ

- 現状: `"Bash(curl -s -X POST http://127.0.0.1*/api/strokes -H \"Content-Type: application/json\" -d '{*}')"`
- 追従後: `"Bash(curl -s -X POST http://127.0.0.1*/api/sessions -H \"Content-Type: application/json\" -d '{*}')"`

U1 の疎通を手で確かめるための許可で、移設後は旧 path を叩いても 404 になる。

### `fix-session-api-layout` の据え置き表から拾うもの — この change が触るファイルの docblock だけ

`fix-session-api-layout` の design「コード中のコメントが指すファイル名は据え置き、親へ引き継ぐ」は、旧ファイル名（`<endpoint 名>.<method>.ts`）を挙げたままの箇所を表で全数記録し、**「#17 が同じ箇所をもう一度ずらすので 2 度直すより 1 度で済ませる」**という理由で据え置いた。その #17 がこの change である。**この change が触るファイルの分を直す。**

| ファイル | 何を挙げているか | 追従後 |
| --- | --- | --- |
| `server/api/sessions/[id]/approve/index.delete.ts:9` | path `/api/strokes/:id/approve` | `/api/sessions/:id/approve` |
| 同上 `:12` | `send-back.get.ts` / `send-back.post.ts` | `send-back/index.get.ts`（A4）/ `send-back/index.post.ts`（U9）。名前空間が分かれたので、どちらの側の話かが分かる形で書く |
| `server/api/sessions/[id]/approve/index.post.ts:13`・`:17` | `promote.post.ts`・`approve.delete.ts` | `promote/index.post.ts`・`approve/index.delete.ts` |
| `server/api/sessions/[id]/promote/index.post.ts:33`・`:37`・`:40`・`:43` | `approve.delete.ts`・`approve.post.ts`・`activate.post.ts` | `approve/index.delete.ts`・`approve/index.post.ts`・`activate/index.post.ts` |

**触らないファイルの分は据え置く。** 理由は `fix-session-api-layout` と同じで、この change の「修正するファイル」の外だからである。全数は次のとおりで、親へ引き継ぐ。

| ファイル | 何を挙げているか | なぜ据え置くか |
| --- | --- | --- |
| `server/api/strokes/[id]/submission/index.post.ts:16` | `sessions/[id]/activate.post.ts` | A8。この change は中身も位置も触らない |
| `server/mcp/tools/get-send-back.ts:13`・`:34` | `server/api/strokes/[id]/send-back.get.ts` | 親 change「触らないもの」 |
| `server/mcp/tools/get-overview.ts:20`・`:49` | `server/api/strokes/[id]/overview.get.ts` | 同上 |
| `server/mcp/tools/submit-document.ts:146` | `server/api/strokes/[id]/proposal.post.ts` | 同上 |
| `server/utils/stroke/sweep.ts:14` | `promote.post.ts` | issue #17 の「修正するファイル」の外。endpoint の通称として使われている |
| `server/utils/stroke/session-store.ts:242`・`:271` | `submission.post.ts`・`activate.post.ts` | 同上 |
| `server/utils/stroke/request-schemas.ts:125` | `question.post.ts` | 同上 |
| `scripts/stroke-check.ts:653`・`:966` | `approve.post.ts`・`proposal.post.ts` | 同上 |

親の `openspec/` にある旧 ticket 3 本（`replace-polling-with-push.md` 34・35 行、`fix-retry-count-without-launch.md` 59 行、`fix-session-api-path.md` 41 行）も実在しない path を挙げたままである。**書き換えてはならない**——親 change の「やってはいけないこと」が「親の `openspec/` にある他の change の artifact を書き換える」を禁じている。`fix-session-api-path.md` はこの change が吸収する当の ticket なので、親が `.archive/` へ移すときに当時の記録としてそのまま残る（`docs/agents/issue-tracker.md`「過去の記録」）。**この 3 本は親へ引き継ぐ。**

### 関連 docs 4 ページの書き換え案（現状 → 追従後）

`docs/agents/issue-tracker.md`「更新対応」の手順どおり、案を design に出す。**ユーザー承認済み**（2026-09-09。ticket「経緯」に箇所が列挙してある）。

#### `docs/specs/structure/system-structure.md` — 2 箇所

§1 のディレクトリ構造（47 行目）:

- 現状: ``│   ├── routes/                 WebSocket（ws.ts と api/strokes/:id/ws/** = 契約 W1・W2）``
- 追従後: ``│   ├── routes/                 WebSocket（ws.ts と api/sessions/:id/ws/** = 契約 W1・W2）``

§4「サーバー — `server/`」の冒頭（106 行目）:

- 現状: ``**api は契約が正。** ファイルの置き方（Endpoint はディレクトリ、Method は `index.<method>.ts`）は `docs/specs/api/server.md`。セッション系（`/api/strokes/**`、WS を含む）は `docs/specs/api/contract.md` の番号どおり。プロジェクト系（`/api/projects/**`）は……``
- 追従後: ``**api は契約が正。** ファイルの置き方（Endpoint はディレクトリ、Method は `index.<method>.ts`）は `docs/specs/api/server.md`。セッション系（`/api/sessions/**`、WS を含む）は `docs/specs/api/contract.md` の番号どおり。**エージェントが叩く A 系は `/api/strokes/**` に分かれている**（`docs/specs/api/overview.md`）。プロジェクト系（`/api/projects/**`）は……``

A 系の 1 文を足すのは、`server/api/` に `sessions/` と `strokes/` の 2 つが並ぶ理由が、この節を読んだだけで分かるようにするためである。

#### `docs/specs/architecture/session-workflow.md` — 1 箇所

「畳み方」（81 行目）:

- 現状: ``- **サーバが動いているとき**: `GET /api/strokes` で一覧し、`POST /api/strokes/<uuid>/delete` で消す（実行中の呼び出しを持つ間は 409）。``
- 追従後: ``- **サーバが動いているとき**: `GET /api/sessions` で一覧し、`DELETE /api/sessions/<uuid>` で消す（実行中の呼び出しを持つ間は 409）。``

削除の側は path だけでなく Method も現状と違う。実装は `connect-portal-and-strokes` の 7.2 で `DELETE /api/sessions/:id`（U11）になっており、`docs/specs/api/sessions/delete.md` もそう定めている。**この行は移設の前から実装と食い違っていた**ので、名前空間の追随と同じ 1 行で揃える。

同じページの 86 行目 ``書き込みは A8（`POST /api/strokes/:id/submission`）を通す`` は A 系で正しいので触らない。

#### `docs/specs/core/settings-reference.md` — 1 箇所

`wsPathPattern` の既定値の表（45 行目）:

- 現状: ``| `wsPathPattern` | `/api/strokes/([^/]+)/ws/{channel}(?:$\|[/?#])` |``
- 追従後: ``| `wsPathPattern` | `/api/sessions/([^/]+)/ws/{channel}(?:$\|[/?#])` |``

#### `docs/specs/structure/file-composables.md` — 5 箇所

一覧の表（290 行目）:

- 現状: ``| `useWaitingRetry.ts` | 送信後の待機と失敗の判定 | HTTP（`GET /api/strokes/<id>` を `useIntervalFn` でポーリング） | …``
- 追従後: ``| `useWaitingRetry.ts` | 送信後の待機と失敗の判定 | HTTP（`GET /api/sessions/<id>` を `useIntervalFn` でポーリング） | …``

`useSessionChannel.ts`（303 行目）:

- 現状: ``` `ws://<host>/api/strokes/<id>/ws/<channel>` に `useWebSocket`（vueuse、`autoReconnect: true`）で繋ぎ、… ```
- 追従後: ``` `ws://<host>/api/sessions/<id>/ws/<channel>` に `useWebSocket`（vueuse、`autoReconnect: true`）で繋ぎ、… ```

`useWaitingRetry.ts`（327 行目）:

- 現状: ``待機中だけ3秒おきに `GET /api/strokes/<id>` を読み、…``
- 追従後: ``待機中だけ3秒おきに `GET /api/sessions/<id>` を読み、…``

`useAgentQuestion.ts` の「個別」（364 行目）:

- 現状: ``**送信先の `base` が `/api/${sessionId}` になっている**（`useProposalReview` と画面1は `/api/strokes/${sessionId}`）。契約（`docs/specs/api/contract.md`）の形は `/api/strokes/<id>` なので、これは食い違いである。ここでは現状の記録として残す。``
- 追従後: ``~~**送信先の `base` が `/api/${sessionId}` になっている**~~ → **解消済み**（2026-09-09。change `fix-session-api-namespace`）。`base` は `/api/sessions/${sessionId}` になり、`useProposalReview`・画面1 と同じ形に揃った。U 系の名前空間が `/api/sessions/` である根拠は `docs/specs/api/overview.md`。回答の送信（U7）と、その直後の起動要求（U13）が実在する path に届くことは `test/app/composables/useAgentQuestion.test.ts` が path そのもので検査する。``

「気づいたこと」（403 行目）:

- 現状: ``- **`useAgentQuestion` だけ API の base が `/api/<id>` で、他は `/api/strokes/<id>`。** 契約との食い違い（上の「個別」）``
- 追従後: ``- ~~**`useAgentQuestion` だけ API の base が `/api/<id>` で、他は `/api/strokes/<id>`。** 契約との食い違い~~ → **解消済み**。HTTP を叩く3本（`useWaitingRetry`・`useAgentQuestion`・`useProposalReview`）はどれも `/api/sessions/<id>` を、`useSessionChannel` は `ws://<host>/api/sessions/<id>/ws/<channel>` を組み立てる（上の「個別」）``

打ち消し線 + 「**解消済み**」は、同じページの 399 行目が既に使っている形である（`useQuestionChannel` / `useProposalChannel` の統合）。**食い違いを消した記録を残す形をページの中で 1 つに保つ。**

#### 触らない docs

- `docs/specs/api/overview.md`・`server.md`・`sessions/*.md`・`ws/delivery.md`・`contract.md` — 基準
- `docs/specs/mcp/tools.md` — A 系で正しい（`overview` / `strokes` / `send-back` の GET / `question` / `proposal`）
- `docs/specs/plan/portal-stroke-exit.md`・`docs/adr/0009`・`0016`・`0017`・`0019` — 当時の記録。親 change「触らないもの」
- `docs/specs/structure/system-structure.md` 45 行目 ``api/  契約どおり（strokes は contract.md、projects は本家仲介）`` — ここでの `strokes` は path ではなくストローク側という意味で、承認された 2 箇所にも入っていない

### 検証の順序 — typecheck・単体・E2E・grep

- `yarn typecheck` — 相対 import は動かないので、ここで落ちるのは import ではなく型の食い違いだけである。**この change では typecheck が移動の正しさを保証しない**（`fix-session-api-layout` とはリスクの形が違う）
- `yarn test` — 移した 7 本の `await import()` と `vi.mock` の path、期待値を直した 3 本、`useAgentQuestion` の新しい 2 件。**`vi.mock` の第 1 引数の付け替え漏れは typecheck を素通りする**（文字列なので型が付かない）ので、ここでしか落ちない
- `yarn build` の生成物のルート表（`.nuxt/types/nitro-routes.d.ts`）— ビルドが登録した `/api/**` の一覧を見る。移設後に `/api/strokes/:id/{overview,question,proposal,submission,send-back}` の 5 本だけが `strokes` 側に残り、U 系 9 本が `sessions` 側へ移っていることを route キーで直接確かめられる
- `yarn test:e2e` — URL が実際に届くことの判定。**この change ではここが主判定である**。stub を外した `agent-question.spec.ts` の 3 件が U7 の実物を通る。E2E は 50000 番から空きポートを取るので他の worktree と並走できる。起こしたものは必ず止め、ポートの解放を確かめる
- `grep -rn "api/strokes" app server shared test .claude` — 完了条件の直接の確認。残るのが A 系（`overview` / `send-back` の GET / `question` / `proposal` / `submission`）と MCP tools だけであること
- `openspec validate --all --store stroke` — この change と `server/session-management` の delta が valid であること

## Risks / Trade-offs

- [WS route を移したのに `wsPathPattern` を直し忘れる（またはその逆）] → **接続は張られるが `sessionIdFromUrl` が `null` を返し、peer が無言で閉じる。** 例外もログも出ない。`ws-disconnect.spec.ts` が W1 / W2 に実際に繋いで配信を受けるので、E2E で落ちる。2 つを同じタスクで動かす
- [`send-back` の POST だけを移すつもりで GET も一緒に動かす（またはその逆）] → A4 が `/api/sessions/` へ行くと MCP の `get-send-back` が 404 になる。移動の後に `find server/api/strokes -type f` で A 系 5 本が揃っていることと、`server/api/sessions/[id]/send-back/` に `index.post.ts` しか無いことを確かめる
- [`page.route` と `page.unroute` の pattern が片方だけ直る] → **Playwright は黙って何もしない。** typecheck でも実行でも落ちず、「1 度目は落として 2 度目は通す」の 2 度目が落ちたままになるので、`agent-question.spec.ts` の当該テストが落ちて気づく形になる。対になっている 2 行を必ず一緒に直す
- [`useAgentQuestion` の基底だけ直してテストを足さない] → 旧 ticket の受け入れ条件（この経路を通るテストが 1 本以上）を満たさない。単体で path を検査し、E2E の stub を外す。**既存の 3 件は path を見ていないので、それを「テストが在る」の根拠にしない**
- [E2E の stub を外したことで、path とは無関係な理由で落ちる] → U7 の門は `phase` が承認以降であることと `currentQuestion` が無いことの 2 つだけで、画面2 の問い返しはどちらにも当たらない。落ちたら stub を戻すのではなく、落ちた理由を切り分けてから決める
- [`.claude/settings.json` の許可行を直し忘れる] → 挙動には影響しないが、U1 の疎通を手で確かめるときに許可が外れる。`grep` の走査範囲に `.claude` を入れる
- [E2E が高負荷で落ち、移設のせいか環境のせいか切り分けられない] → 落ちた spec を負荷が下がってから回し直し、通ることで切り分ける（`fix-project-api-layout`・`fix-session-api-layout` で同じ事象が起きている）
- [`grep` の掃き出しで A 系と U 系を取り違える] → 残ってよいのは `overview` / `send-back` の GET / `question` / `proposal` / `submission` の 5 つと、それらを叩く MCP tools・その単体テスト・A 系を書いた docs / ADR だけである。`grep` の結果を 1 行ずつ、この 5 つのどれかであるかで判定する

## Migration Plan

1. 移動先のディレクトリを `mkdir -p` で先に作る（`git mv` はディレクトリを作らない）
2. `git mv` で U 系 handler を移す（移動の表）。`send-back` は POST だけを移す
3. `git mv` で WS route 2 本を移し、`nuxt.config.ts` の `wsPathPattern` と `ws-channels.ts`・route 2 本の doc コメントを直す
4. サーバ内の自己呼び出し 5 箇所と `submission-path.ts` の docblock を直す
5. 画面 8 本の path を直す（`useAgentQuestion` の基底を含む）
6. `git mv` でテスト 7 本を移し、`await import()`・`vi.mock`・docblock・`describe` を直す。`test/server/api/sessions/index.delete.test.ts` を `[id]/` へ移す
7. 期待値だけを直すテスト 3 本と、`useAgentQuestion` の新しい 2 件
8. E2E 5 本と `.claude/settings.json`
9. 移した handler の docblock（据え置き表から拾う分）
10. `yarn typecheck` → `yarn test` → `yarn build && yarn test:e2e`
11. 関連 docs 4 ページ（承認済み）
12. `grep` と `openspec validate --all --store stroke` で完了条件を確かめる

巻き戻し: この change の commit を revert すれば旧 path に戻る。**URL が変わるので、revert するときは画面・E2E・`wsPathPattern`・`.claude/settings.json` も同じ revert で一緒に戻る**必要があり、部分的な revert はできない。すべて 1 つの commit に入れる理由でもある。

## Open Questions

なし。
