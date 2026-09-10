## Context

動機と範囲は proposal.md。ここは**何をどの粒度で `server/handler/` へ出すか**と、**WS の route をどう薄くするか**を決める。

現状（2026-09-09。base は `pre3` = 5cc889c0）:

- `server/api/strokes/[id]/**` は 5 本。A7 proposal が 67 行、A5 question が 39 行、A8 submission が 29 行、A1 overview が 16 行、A4 send-back が 17 行
- `server/routes/api/sessions/[id]/ws/` は 2 本。W1 question が 32 行、W2 proposal が 31 行
- `server/handler/` に在るのは `activate.ts`・`answer.ts`・`approve.ts`・`delete.ts`・`invoke-agent.ts`・`promote.ts`・`session.ts` の 7 本（`update-session-api-handler` が置いた）
- `server/api/` を走査すると、`writeState` / `.publish(` / 保存された本文の書き込みが直接現れるのは A5 と A7 の 2 本だけである（実測。`grep -rn "writeState\|writeInvocation\|rename\|broadcast\|\.publish(\|sessionProposal" server/api/`）
- `ProposalMessage`（`{ proposal, projectName }`）の組み立てが A7 と W2 の 2 箇所にある
- W1 / W2 の route にテストは 1 本も無い

制約:

- URL・入出力・受理の条件・応答・配信の内容と順序を変えない（親 change の非目標）
- A7 の順序は「残す → phase を進める → W2 配信」（`docs/specs/api/contract.md` A7）
- A5 の 400 の文言（`問いの構造として読み取れない。`）は契約と既存テストが見ている
- 「接続した瞬間に現在分を流す」（`docs/specs/api/ws/delivery.md`）
- 局面の述語は端が持つ（capability `server/api-handler`）
- `server/handler/` は Nitro に依存しない（`update-session-api-handler` design D3。CLI が tsx から直に import する）
- docs には触れない（issue #18「docs には触れない」）

## Goals / Non-Goals

**Goals:**

- A5・A7 を「読む → 局面の述語 → handler を呼ぶ → 返す」の形にする
- W1・W2 の route を「id を読む → 在るかを見る → register → 現在分を送る」の形にする
- `ProposalMessage` の組み立てを 1 箇所にする
- WS の route を capability で判定できるようにする（Requirement を 1 つ足す）

**Non-Goals:**

- A1・A4・A8 に handler を作ること（D3）
- `server/utils/` の関心単位の切り直し
- 接続時配信の仕組み（`ws-channels.ts` の registry）の作り直し
- 受理の条件・応答・配信の順序の見直し

## Decisions

### D1. handler の粒度と名前 — チャネルごとに 1 本（`question.ts`・`proposal.ts`）

`server/handler/question.ts` と `server/handler/proposal.ts` の 2 本を作る。issue #18 は `question.ts`・`proposal.ts`・`ws-current.ts` の 3 本を候補に挙げていたが、**接続時配信を別ファイルにせず、受理と同じファイルへ入れる**。

| ファイル | 持つもの |
| --- | --- |
| `server/handler/question.ts` | `submitQuestion`（A5 の受理——`state.json` へ残す・W1 配信・提出の記録）／`currentQuestion`（W1 の接続時配信——現在の 1 問の読み出し） |
| `server/handler/proposal.ts` | `submitProposal`（A7 の受理——本文を残す・マーカー行・`state.json`・W2 配信・提出の記録）／`currentProposal`（W2 の接続時配信——保存された本文と候補名から `ProposalMessage` を組み立てる） |

**理由は 2 つある。**

1. **書く側と読む側が同じ 1 つの「現在分」を指している。** A5 が `state.currentQuestion` に書いたものを W1 が接続時に流す。A7 が `docs/proposal.md` と `state.projectName` に残したものを W2 が接続時に流す。**同じファイルに置くと、書いた形と流す形が一致していることがその場で読める。** 別ファイルにすると、片方を変えたときにもう片方が付いてこない
2. **`ProposalMessage` の組み立てが 1 つになる。** 現状 A7（`server/api/strokes/[id]/proposal/index.post.ts:61`）と W2（`server/routes/api/sessions/[id]/ws/proposal.ts:24`）に同じ組み立てが 2 つある。同じファイルへ寄せれば内部の 1 関数で作れる。`ws-current.ts` に接続時の側だけを集めると、この 2 つは別ファイルのまま残る（capability「同じ実処理を 2 箇所に書かない」に当たる）

- 代替: `ws-current.ts` に W1・W2 の接続時配信をまとめる（issue の候補）→ まとめる理由が「WS だから」という置き場の都合だけで、扱う対象（問い／proposal）は互いに無関係である。上の 2 点が失われる。却下
- 代替: endpoint 名に合わせて `question.ts`・`proposal.ts` とし、接続時配信は route に残す → 完了条件（route が capability の Scenario を満たす）に届かない。却下

関数名は `update-session-api-handler` の流儀（`recordAnswer` / `recordActivation` / `recordDecision`）に合わせつつ、A5・A7 が契約で「提出」と呼ばれる操作なので `submit*` にする。読み出しの側は返すものの名前をそのまま関数名にする（`currentQuestion` / `currentProposal`）。

### D2. 分け目 — 状態は端が読み、handler へ渡す。接続時配信だけは handler が読む

**A5・A7（HTTP 側）**: 局面の述語（`isPromotedState` → 409）は api が持つので、`readState` は api が 1 度だけ呼ぶ（capability の「api が持ってよいもの」3）。読んだ状態は handler の引数として渡す。U7 answer が `state.currentQuestion` と `state.invocation` を `recordAnswer` へ渡しているのと同じ形で、**状態を 2 度読まない**（現状も 1 度である。応答も書き込む内容も変わらない）。

**W1・W2（WS 側）**: 接続時配信で読むのは「今流すもの」そのものであり、route はそれを送る以外に使わない。**読み出しごと handler が持つ**——route が読んで handler に渡すと、route に `readState` と保存された本文の読み出しが残り、capability の走査に引っかかる。流してよい局面は route の literal で持ち、集合として渡す（D4）。

- 代替: A5・A7 でも handler が `readState` する → api が局面の述語のために既に読んでおり、2 度読むことになる。読みの間に別の書き込みが挟まると api が判定した局面と handler が書く相手がずれる。却下

### D3. A1・A4・A8 は触らない

3 本とも capability の Scenario「既に薄い endpoint」（`id を解決する → 既存の 1 関数を呼ぶ → 結果を返す`）に当たる。

- A1 overview: `requireSessionId` → `readOverview` → 404 か `{ overview }`
- A4 send-back: `requireSessionId` → `readSendBack` → 404 か本文
- A8 submission: `requireSessionId` → `parseBody` → `writeInvocation` → 204

**A8 について。** `writeInvocation` は `state.json` を書くので「保存先への書き込み」に見えるが、api の中に在るのは呼び出し 1 行だけで、書き込みの規則（値の意味づけ・`retries` の上書き・`failed` の配信）はすべて `session-store.ts` の `writeInvocation` にある。同じ実体を `invoke.ts` も呼んでおり、既に共有されている。ここへ handler を挟んでも中身の無い素通しが 1 段増えるだけで、capability の走査（`writeState` / `rename` / `broadcast*` / 本家 REST）にも当たらない。**`server/utils/stroke/session-store.ts` は api と handler の双方が呼ぶ保存の層**であり（A1・A4 の読み出しも同じ層）、そこを 1 回呼ぶことは実処理を api に書くことに当たらない。

- 代替: A8 にも `server/handler/submission.ts` を作る → `writeInvocation` を呼ぶだけの 1 行の handler になる。読む段数が 1 つ増えるだけで、共有も判定も増えない。却下

### D4. 流してよい局面は route の literal、handler は集合を当てはめるだけ

capability「局面の述語は api が持ち handler は持たない」を WS にも当てる。現状の判定をそのまま集合に写す。

| route | 現状の判定 | 渡す集合 |
| --- | --- | --- |
| W1 question | `!isPromotedState(state)`（`approved` / `activated` は問いを持たない） | `['stroking', 'proposed']` |
| W2 proposal | `state.phase !== 'stroking'` | `['proposed', 'approved', 'activated']` |

`Phase` は `stroking` / `proposed` / `approved` / `activated` の 4 つ（`shared/stroke.ts:111`）なので、どちらの写しも現状と同値である。**判定の中身は変わらない。**

handler の側は `from.includes(state.phase)` を見た後、**流す形かを型の判別子で確かめる**。W1 は昇格後の形（`PromotedState`）が `currentQuestion` の項目を持たないため、集合を通した後にもう一度 `isPromotedState` で narrowing する。これは capability の Scenario「handler が書き込みの前に状態の形を確かめる」と同じ扱いで、**受理する局面を決めているのは呼び出し元が渡した集合**である（handler は自分の literal で局面を増やしも減らしもしない）。

- 代替: 述語を関数として渡す → handler の中で任意のコードが動くため「handler は判定を持たない」が確かめられなくなる（`update-session-api-handler` design D4 と同じ理由）。却下
- 代替: `isPromotedState` の呼び出しごと handler へ移し、集合を渡さない → 受理する局面を handler が自分の literal で決める形になる。却下

### D5. `ActiveSessionState` — narrowing した状態の型を `session-store.ts` に置く

A5 は `{ ...state, currentQuestion: question }` を書き、A7 は `state.invocation` / `state.retries` / `state.projectName` を読む。どちらも api が `isPromotedState` で弾いた**後**の形（`stroking` か `proposed`）に対する操作なので、handler の引数の型もその形でなければ通らない。

`session-store.ts` に 1 行足す。

```ts
/** 昇格前の局面（`stroking` / `proposed`）の状態。`isPromotedState` で弾いた残り */
export type ActiveSessionState = Exclude<SessionState, PromotedState>
```

置き場が `session-store.ts` なのは、`SessionState`・`PromotedState`・`isPromotedState` がそこに在るからである。`question.ts` と `proposal.ts` の両方が使うので、片方の handler に置いて他方が import する形は採らない（handler どうしの依存を作らない）。

- 代替: handler の引数を `SessionState` にし、handler の中で `isPromotedState` を再び見る → api が既に弾いた判定を handler が持ち直すことになる。却下
- 代替: 状態を渡さず、必要な項目（`invocation` / `retries` / `projectName` / 元の状態）を個別の引数で渡す → A5 の `{ ...state, ... }` は「今の状態を丸ごと保つ」ことに意味があり（`currentQuestion` 以外を触らない）、項目を並べ直すと将来 `SessionState` に項目が増えたとき落ちる。却下

### D6. A7 の順序は handler の中で 1 続きにする

契約の順序「残す → phase を進める → W2 配信」は、切り出しの前は api の中で 5 行に並んでいた。**分けずに `submitProposal` の中へそのまま移す。** api には順序が 1 段も残らないので、api と handler をまたいで順序が崩れることが起きない。順序の理由（残せなければ受理しない・逆順にすると配信だけ届いて残っていない状態が作れる）を書いた docblock も handler へ移し、api には「この口が何を受けるか」の説明を残す（`update-session-api-handler` design の Risks と同じ扱い）。

候補名の決定（`projectName && isKebabCase(projectName) ? projectName : state.projectName`）も handler へ移す。**これは入力の検証ではない**——kebab-case でない候補名が来ても 400 にはならず、既存の候補が残るだけである。受理の可否を変えないので「書き込む値の決定」であり、handler の側に属する。入力の検証（本文が空でないか・型）は `parseBody(proposalSubmitBody, …)` が api で済ませている。

### D7. テストの寄せ替え

`update-session-api-handler` design D5 と同じ方針。

- **`test/server/handler/question.test.ts`（新設）**: `submitQuestion` が `state.json` へ問いを残すこと・W1 へ配信すること・提出を記録すること。`currentQuestion` が集合に当てはまる局面でだけ現在の 1 問を返すこと
- **`test/server/handler/proposal.test.ts`（新設）**: `submitProposal` の順序（残す → phase → 配信）・出し直しで `decision` を持ち越さないこと・候補名の採用と不採用。`currentProposal` が集合と保存された本文の有無で返すもの
- **`test/server/api/strokes/{question,proposal}/index.post.test.ts`**: handler を `vi.mock` し、204 の返し方・A5 の 400・A5 / A7 の 409（`approved` と `activated`）・通ったときに handler が期待した引数で 1 度呼ばれることだけを見る。実処理の検査は消すのではなく handler 側へ移す

W1 / W2 の接続時配信には今までテストが無かった。**handler へ出したことで初めて素の vitest から呼べるようになる**（route は `useRuntimeConfig()` を通る `sessionIdFromUrl` と crossws の peer を要る）ので、接続時配信の検査はここで足す。route 自体のテストは作らない——残るのは `register` / `send` / `unregister` の 3 行で、それを確かめるには crossws の実行時が要り、E2E が既にその経路を通っている。

### D8. capability への追加は Requirement 1 つ（新しい capability は作らない）

完了条件は「`server/api/strokes/[id]/**` と WS route が capability の Scenario を満たす」だが、capability の 3 つの Requirement はいずれも `server/api/` の handler ファイルを名指ししており、`server/routes/` の WS route は範囲に入っていない。**そのままでは WS 側の完了を測れない。**

そこで Requirement を 1 つ足す（`specs/server/api-handler/spec.md` の `## ADDED Requirements`）。既存の 3 つは文言を変えない——api 側の物差しはこの change で変わらないからである。足す Requirement は WS 固有の準備と後始末（`sessionIdFromUrl` / `sessionExists` / `register` / `unregister` / `peer.close` / `peer.send`）を列挙し、現在分の読み出しとメッセージの組み立てを handler の側に置く。列挙という限定の根拠は issue #18 の「route は `register` / `send` / `unregister` だけにする」であり、この change が独断で足した限定ではない（`docs/adr/0024`）。

- 代替: 既存の Requirement の「`server/api/`」を「端（api と WS の route）」へ広げる → HTTP 固有の 5 つ（`readBody` / `createError` / status など）と WS 固有の 4 つ（`register` / `peer.send` など）が 1 つの列挙に混ざり、どちらの範囲にも当てはまらない項目が並ぶ。却下
- 代替: `skip_specs: true` にして spec を触らない → 完了条件の「WS route が capability の Scenario を満たす」が測れないままになる。却下

## 関連 docs（この change は書き換えない）

issue #18 が「矛盾なし。A 系・WS の実処理の置き場を書いた『事実』のページは無い」と判定しており、実物で確かめた結果も同じである。

- `docs/specs/structure/system-structure.md:46` は `server/handler/` を「api が呼ぶ実処理（判定は持たない）」と書くだけで、中のファイルを並べていない。2 本足しても記述は合ったままである
- 同 `:48` は `routes/` を「WebSocket（`ws.ts` と `api/sessions/:id/ws/**` = 契約 W1・W2）」と書く。route の位置も役割も変わらない
- `docs/specs/api/contract.md`・`ws/delivery.md`・`overview.md` は URL と配信のタイミングを書く。どちらも変わらない
- `docs/specs/structure/server-structure.md` は `server/utils/` の棚卸しで、`server/handler/` は対象外と明記されている（`:16`）。`session-store.ts` に型を 1 つ足しても本数は変わらない

**docs に新しく生まれる食い違いは無い。** 消すファイルが 1 つも無く、既存のファイル名を指す docs の記述はすべて生き残る。

**コード中の docblock は直す。** docs と違って承認の対象ではなく、移した先を指さないままにする理由が無い（`update-session-api-handler` design D8 と同じ扱い）。3 行が対象になる。

| ファイル・行 | 現状 | 追従後 |
| --- | --- | --- |
| `server/utils/stroke/ws-channels.ts:11` | 接続時配信は route ハンドラがそちらを読んで送る | 接続時配信は `server/handler/{question,proposal}.ts` が読み、route はその結果を送るだけである |
| `server/mcp/tools/submit-document.ts:150` | `server/api/strokes/[id]/proposal.post.ts` | `server/handler/proposal.ts` の候補名の決定 |
| `scripts/stroke-check.ts:968` | 受理（`proposal/index.post.ts` の publish） | 受理（`server/handler/proposal.ts` の publish） |

### 追従の案（この change の範囲外。親へ引き継ぐ）

1. `docs/specs/structure/system-structure.md` §4（`:107`）の末尾の 1 文は api の handler ファイルだけを述べており、WS の route には触れていない。capability に WS の Requirement が入るので、**現状**「api の handler ファイルは HTTP 固有の準備（読み取り・検証・id の解決）と後始末（status・エラーの HTTP 化）だけを持ち、実処理は `handler/` を呼ぶ。どの局面を許すかの判定は api が持ち、handler は持たない。」→ **追従後の案**: その後ろに 1 文足す——「WS の route も同じで、接続の準備（id の解決・在るかの確認・登録）と後始末（送る・解除）だけを持ち、接続時に流す現在分は `handler/` が読む」。**矛盾ではなく不足**なので、この change では書き換えない
2. `docs/specs/reference/stroke-modules.md:56` が W1 の path を `/api/:id/ws/question` と書いている。実際は `/api/sessions/:id/ws/question`（`docs/specs/api/contract.md:139`）。**この change が作った食い違いではない**（`fix-session-api-namespace` の URL 移動より前の記述が残ったもの）。この change は W1 の URL に触らないので、直すのは別の話として親へ引き継ぐ

## Risks / Trade-offs

- [api と handler をまたいで読む段数が 1 つ増える] → handler のファイル名をチャネル名（`question` / `proposal`）に揃え、api には「この口が何を受けるか」、handler には「どう成立させるか」を置く。A7 の順序は handler の中で 1 続きにする（D6）
- [テストの寄せ替えで検査が抜け落ちる] → 移す前後で `it` の題を突き合わせる。api 側に残すのは status の検査と handler の呼び出しだけと決め、消すのではなく handler 側へ移す
- [W1 / W2 の局面の判定を集合へ写すときに取りこぼす] → `Phase` は 4 つしか無く（`shared/stroke.ts:111`）、`!isPromotedState` と `!== 'stroking'` の補集合をそのまま書ける。写しが同値であることを D4 の表で示し、handler のテストで 4 つの局面すべてを通す
- [`readState` が投げたときの振る舞い] → 現状も route の `open` の中で投げており、handler へ移しても投げる場所が 1 段深くなるだけで route まで素通りする。**try / catch を足さない**——足すと「読めないときは無言で流さない」という新しい振る舞いを作ることになる
- [A5 / A7 は `withStateLock` を通っていない] → 現状のままにする。lock を足すと A8 の書き込みとの待ち行列の形が変わり、「応答と配信を変えない」制約を自分で危うくする。**この change が作った問題ではない**ので親へ引き継ぐ
- [E2E `approval-annotation.spec.ts` の 11 件が base の時点で落ちている（既知）] → この change の前後で同じであることを実測して切り分ける

## Migration Plan

1. `server/utils/stroke/session-store.ts` に `ActiveSessionState` を足す
2. `server/handler/question.ts` を作り、A5 の実処理と W1 の接続時配信を移す
3. `server/handler/proposal.ts` を作り、A7 の実処理と W2 の接続時配信を移す（`ProposalMessage` の組み立ては内部の 1 関数）
4. A5・A7 の api を薄くする
5. W1・W2 の route を薄くする（`DELIVERABLE` の literal を route に置く）
6. A1・A4・A8 が capability の物差しを満たしていることを確かめる（D3）
7. テストを寄せ替え、handler のテストを足す
8. `yarn typecheck` → `yarn test` → `yarn build && yarn test:e2e` → `openspec validate --all --store stroke`

巻き戻し: この change の commit を revert すれば元の形に戻る。URL も入出力も配信も動かさないので、画面・E2E・設定は revert の対象に入らない。

## Open Questions

なし。
