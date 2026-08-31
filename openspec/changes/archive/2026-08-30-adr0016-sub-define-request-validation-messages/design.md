# adr0016-sub-define-request-validation-messages — Design

## Context

動機は proposal.md「Why」に書いた。ここでは実装が置かれている場所と、そこに掛かる制約だけを述べる。

受け口の入力検証は、いま2系統に分かれている。

- **`server/utils/stroke/request-schemas.ts`** — 画面から届くボディ。`parseBody(schema, body)` が `safeParse` して、失敗なら 400 を投げる。7 つの endpoint（`strokes/index.post` `answer` `approve` `proposal` `send-back` `submission`）がここを通る
- **`server/utils/stroke/question.ts`** — A5（問いの提出）の本体。`rawQuestionSchema` を持ち、`parseQuestion(value)` が読み取れれば `Question`、読み取れなければ `null` を返す。`parseBody` は通らない

`parseQuestion` の呼び出し側は 3 つある。A5 の endpoint、AI 応答の読み取り（失敗ならリトライ）、`questionSchema`（`strokes.json` に保存済みの問いを読み直す）。理由の文字列が要るのは A5 だけで、あとの 2 つは真偽しか使わない。

送り手まで届く経路にも制約がある。エージェントは MCP ツール `send-question` 越しに A5 を叩く。ツールは `readFetchFailure` で `error.data.message` **だけ**を取り出し、`outputSchema` は `{ status, errorCode, error }`。つまり **1 本の文字列しか送り手に届かない**。構造化した違反リストを渡すには MCP 側に組み立てを足すことになり、それは ADR-0014（MCP サーバー側に事前検証・独自分岐を足さない）に触れる。

この design が書かれた時点で、A5 の分だけが `521b273` で実装済みである。`request-schemas.ts` 側は未着手（下の「実装状況」を各決定に付す）。

## Goals / Non-Goals

**Goals:**

- 違反を伝える 1 件分の形（位置・理由・現在値）を 1 つ決め、A5 と `parseBody` の両系統で同じ形にする
- 検証の定義（zod スキーマ）と、その失敗を文にする処理を、同じファイルの隣に置く
- 既存の呼び出し側の署名を壊さずに理由を足す

**Non-Goals:**

- 検証の内容（何を許すか）は変えない。上限値・必須項目・列挙値はすべて現状のまま
- MCP ツール側で事前に弾くことはしない（ADR-0014）。`inputSchema` の `.describe()` で上限を伝えるところまで
- エラー本文を構造化データ（配列・オブジェクト）で返す形にはしない。上の Context の経路制約による
- 検証の共通基盤（バリデーションフレームワークの差し替え、独自 issue 型の導入）は作らない

## Decisions

### 決定1: 理由の列挙は `parseQuestion` とは別の関数にする（実装済み・`521b273`）

`questionViolations(value: unknown): string[]` を `question.ts` に置き、`parseQuestion` と**同じ** `rawQuestionSchema` を `safeParse` し直して `error.issues` を文字列配列にする。`parseQuestion` の署名（`Question | null`）は変えない。

- **なぜ**: `parseQuestion` の戻りを `{ ok, question, violations }` のような形に変えると、理由を使わない 2 経路（AI 応答のリトライ・保存済み記録の読み直し）まで書き換えになる。理由が要るのは A5 だけなので、要る側だけが追加の関数を呼ぶ
- **採らなかった案**: `parseQuestion` を Result 型にする → 呼び出し 3 箇所すべてに波及し、`questionSchema` の `transform` も書き換わる
- **代償**: 失敗時に `safeParse` が 2 回走る。走るのは弾いたときだけで、成功経路は 1 回のまま

### 決定2: 1 件の違反は「位置: 理由」の 1 行にする（実装済み・`521b273`）

位置は `issue.path.join('.')`。`options.0.description` のように配列添字ごと出る。`path` が空なら `(全体)`。

- **なぜ**: 実測で 400 の原因だったのは `options[].description` の 1 字超過だった。項目名だけでは何番目の選択肢かが決まらず、送り手は全選択肢を削って探すことになる
- **採らなかった案**: 項目名だけ（`description`）→ 選択肢が複数あると特定できない

### 決定3: 量の違反にだけ「現在いくつか」を添える（実装済み・`521b273`）

`issue.code` が `too_big` / `too_small` のときだけ、入力を `issue.path` でたどって実際の長さを取り、`（現在 N）` を末尾に付ける。文字列は `trim()` **後**の字数、配列は件数（`lengthAt`）。

- **なぜ**: zod の issue は上限（`maximum`）は持つが、入力が実際にいくつだったかは持たない。上限だけ伝えても、送り手は自分の値を数え直してから削る量を決めることになる。実測では 1 字だけの超過に 5 回連続で当たり損ねた
- **`trim()` 後で数える理由**: スキーマが `z.string().trim().max(n)` なので、検証が見ている長さは trim 後。表示と検証の基準がずれると「50 字にしたのにまだ弾かれる」が起きる
- **採らなかった案**: `issue` から復元する → 実際値が入っていないので不可能。入力側をたどるしかない

### 決定4: 違反は全件返し、1 本の文字列に畳む（実装済み・`521b273`）

`error.issues` を全件 map し、`' / '` で連結する。

- **なぜ 1 本にするか**: Context に書いた経路制約。`createError` の `data` に配列で載せても、MCP ツールの `readFetchFailure` は `data.message` しか取らないため送り手に届かない。届く器に合わせて文字列へ畳む
- **なぜ全件か**: 1 件ずつ返すと、送り手は直しては送り直す往復になる。往復ごとにエージェントの実行が 1 回消える
- **採らなかった案**: `createError({ data: { violations: [...] } })` で構造化 → 受け取る側（MCP ツール）に組み立てを足す必要があり、ADR-0014 に触れる

### 決定5: 既存の 1 文は残し、その後ろに足す（実装済み・`521b273`）

`問いの構造として読み取れない。` はそのまま先頭に置き、違反があればその後ろに連結する。`violations` が空なら従来の 1 文だけを返す分岐を残す。

- **なぜ**: 契約（`docs/specs/api/contract.md` A5「400 スキーマ不適合」）と既存テスト（`test/server/mcp/tools/send-question.test.ts`）が見ている文言を変えずに情報を足せる
- **空分岐について**: `parseQuestion` と `questionViolations` は同じスキーマ・同じ入力を見るので、片方が失敗して片方が成功することは実際には起きない。2 回 `safeParse` する構造（決定1）に対する防御として残している

### 決定6: 制約ごとのメッセージは zod スキーマの定義位置に置く（未実装）

`.max(50)` の第 2 引数、`.min(1)` の第 2 引数として、その制約に対応する日本語メッセージを書く。`request-schemas.ts` が `overview` / `comment` / `projectName` などで既に採っている形（`z.string().trim().min(1, '概要が要る。')`）を、メッセージの無い制約すべてに広げる。

- **なぜこの位置か**: 制約とメッセージが 1 行に並ぶので、制約を変えたときにメッセージが取り残されない。issue の `code` と `path` から後段でメッセージを引く辞書を別に持つと、辞書とスキーマがずれる
- **現状の確認結果（実測）**: `questionViolations` が今返しているのは
  `header: Too big: expected string to have <=12 characters（現在 13）` である。zod の既定文（英語）がそのまま出ており、spec の「検証の仕組みの言葉が漏れない」は**まだ満たしていない**。位置と現在値を足すところまでが `521b273` の範囲
- **メッセージが無い制約**（`request-schemas.ts` を読んで確認）: `annotationBase.id` / `annotationBase.timestamp` / `highlightColorSchema.name` / `bg` / `border` / `startOffset` / `endOffset` / `sendBackBody.response` / `sendBackBody.annotations` / `nextSteps` / `submissionBody.invocation` / `retries`。`question.ts` の `rawQuestionSchema` は長さ・件数の制約すべてにメッセージが無い

### 決定7: `parseBody` も全件返しに揃える（未実装）

現在の `parseBody` は `parsed.error.issues[0]` だけを取り、`message` に 1 件、`data.path` に 1 件分の path を入れて 400 を投げる。これを決定2〜4 と同じ組み立て（位置 + メッセージ + 量なら現在値、全件を連結）に置き換える。

- **なぜ揃えるか**: 送り手から見て、どの受け口に当たったかで返る形が変わる理由が無い。A5 だけ全件・他は先頭 1 件、という状態を残すと、送り手は口ごとに読み方を覚えることになる
- **共通化の置き場**: 組み立て（issue → 1 行の文字列、量なら現在値を添える）は `question.ts` と `request-schemas.ts` の両方から使うので、どちらか一方に置いたまま import させるのではなく、`server/utils/stroke/` 配下の 1 モジュールに寄せる。`lengthAt` も同じところへ移す
- **`data.path` の扱い**: 現在 `parseBody` は `data: { path: issue?.path ?? [] }` を返している。全件になると 1 本の path では表せない。画面側（`useAgentQuestion` / `useProposalReview`）は `statusMessage` と `message` しか読んでおらず `data.path` を使っていないため、削るか全件の path 配列にするかは実装時に決めてよい

### 決定8: 検証を通していない受け口を通す（未実装）

proposal が挙げた 2 件の現状を、コードで確認した結果は次のとおり。

- `strokes/[id]/question.post.ts` — `parseBody` は通らないが、`parseQuestion` + `questionViolations` という**別経路の検証**は通っている（決定1〜5）。「検証を経ずに受ける」状態ではない。残るのは決定6・決定7 との形の統一
- `strokes/[id]/delete.post.ts` — **ボディを読んでいない**（`readBody` の呼び出しが無い）。パスパラメータの `sessionId` だけを `requireSessionId` で受ける。送り手が値を組み立てて送る口ではないため、ボディスキーマを足す対象ではない

このため、この change での「検証を通していない受け口を通す」の実作業は、proposal が想定したより小さい。詳細は tasks.md の 4 章。

## Risks / Trade-offs

- **エラー本文が長くなる** → 違反が多いほど 1 行が伸びる。A5 の上限は 4 項目 + 選択肢 5 件 × 2 項目 = 最大 14 件程度で、`' / '` 連結でも数百字に収まる。上限を設けて切り詰めると「切られた側が読めない」が起きるので、切らない
- **`safeParse` が失敗時に 2 回走る（決定1）** → 弾いたときだけなので、成功経路の負荷は変わらない。A5 は 1 リクエスト 1 問なので実測で問題にならない
- **メッセージ文言がテストの資産になる** → 決定6 でメッセージを足すと、文言に依存したテストは書き直しになる。テストは「どの項目が出るか」「現在値が出るか」を見る形にし、文言全文の一致では見ない（既存の `test/server/utils/stroke/question.test.ts` はこの形で書かれている）
- **入力をたどる `lengthAt` は path が深いと `undefined` を返す** → その場合は現在値を添えずに位置と理由だけ返す。落ちるより情報が減るほうを選ぶ
- **`trim()` 後で数える（決定3）と、送り手の手元の字数と食い違うことがある** → 前後に空白を入れた入力で「現在 50 と言われたのに 52 字ある」が起きうる。検証が見る値と揃えるほうを優先した

## Migration Plan

- 段階は 2 つ。**A5 の形を先に確定させ（`521b273`・完了）**、そこで固まった組み立てを `parseBody` へ広げる（決定7）。逆順にすると、実測で効くと分かっていない形を全受け口に広げることになる
- 保存済みデータへの影響は無い。変えるのは 400 応答の本文だけで、`state.json` / `strokes.json` の形は触らない
- ロールバックは該当コミットの revert で足りる。`questionViolations` は追加された関数で、既存の呼び出し側は `parseQuestion` のまま
- 画面への影響は無い。A5 を叩くのはエージェント（MCP 経由）だけで、画面は A5 を呼ばない
