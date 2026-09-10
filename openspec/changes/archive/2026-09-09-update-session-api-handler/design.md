## Context

動機と範囲は proposal.md。ここは**何をどの粒度で `server/handler/` へ出すか**と、**`session-core.ts` をどう解くか**を決める。

現状（2026-09-09。#17 の移設後）:

- `server/api/sessions/**` は 12 本・679 行。U14 promote が 213 行、U13 invoke-agent が 98 行、U15 activate が 75 行、U11 delete が 74 行、U10 approve が 59 + 35 行、U7 answer が 46 行。U1・U2・U3・U9・U12 は 11〜24 行で既に薄い
- `server/handler/` に在るのは `delete.ts` 1 本（`isSafeSegment` / `targetExists` / `removeTarget` / `DeleteError`）
- `server/utils/stroke/session-core.ts`（284 行）が endpoint と CLI の共有の実処理を `*Core` の名で持つ
- 重複が 4 組ある——「消す実行」（`deleteSessionCore` と `removeTarget`）、「在るかの判定」（`sessionExistsCore` と `targetExists`）、`isSafeSegment`（`session-core.ts` と `handler/delete.ts`）、`toHttp`（U11 と P1）
- `server/utils/stroke/{project,running}.ts` は 409 を `createError` で投げる。api の外で HTTP を作る形が既にある

制約:

- URL・入出力・受理の条件・応答を変えない（親 change の非目標）
- 局面の述語は api が持つ（`docs/specs/api/projects/delete.md`・`sessions/delete.md`）
- `server/utils/` の関心単位の切り直しはしない（issue #15「スコープ外」）
- CLI（`yarn session`）の使い方・出力・終了コードを変えない（`openspec/specs/tools/session-cli`）

## Goals / Non-Goals

**Goals:**

- `server/api/sessions/**` の 12 本を「読む → handler を呼ぶ → 返す」の形にする
- `session-core.ts` を消し、`*Core` の名と 4 組の重複を無くす
- 切り出しの物差しを capability にし、#18・#19 が同じ判定で進められるようにする

**Non-Goals:**

- `server/utils/stroke/{project,running}.ts` が HTTP を投げる形の解消（後述 D7 の据え置き）
- A 系・WS route・プロジェクトの endpoint（#18・#19）
- 受理の条件・応答の見直し

## Decisions

### D1. 分け目 — api が持つ 5 つ、それ以外は handler

api の handler ファイルが持ってよいものを 5 つに決め、capability の Requirement にする。

1. 入力の読み取りと検証（`requireSessionId` / `parseBody` / `getQuery`）
2. 設定の解決（`readStrokeConfig`。設定を引くのは端だけ——`docs/specs/core/settings-reference.md`）
3. `readState` を 1 度呼ぶことと、それに対する局面の述語
4. 受理の可否を決める前提の確認（`isRunning`・`missingPrerequisites`）
5. 結果の HTTP 化（status・`conflict`・`createError`・`Response`）

それ以外——保存先への書き込み、改名、配信、占有、本家 REST、複数段の後始末——は handler。

**issue #15 の「現状の判定」表は 3・4 も「api 内に持つ実処理」に数えているが、そこから外した。** 3 は「局面の述語は api が持つ」という基準（`sessions/delete.md`）が api に置くことを要求しており、その述語を判定するための `readState` を handler へ移すと述語だけが api に浮く。4 の `isRunning` / `missingPrerequisites` は保存先も上層も動かさない**受理の可否の読み**で、5 と同じ「受け付けるかどうか」の側にある。表は現状の記述であって到達点の定義ではないため、到達点は capability の Scenario（`writeState` / `rename` / `broadcast*` / 本家 REST が api に直接現れない）で置く。

- 代替: 前提の確認も handler へ入れる → handler が「起動できるか」を返し api がそれを 503 に写す形になるが、U13 では `missingPrerequisites` が `readState` より**前**に効く順序（対象が壊れていても 503 が先）が変わる。応答を変えないという制約に反する。却下

### D2. handler の粒度と名前 — endpoint ごとに 1 本、共有するものは呼び手の数で 1 本

- **endpoint 固有の実処理は endpoint ごとに 1 本**: `server/handler/{promote,activate,approve,answer,invoke-agent}.ts`。ファイル名は endpoint の名前に合わせる（`server/api/sessions/[id]/<name>/` の `<name>`）。U10 は POST（記録）と DELETE（取り下げ）で 1 つの `approve.ts` にまとめる——取り下げは U14 の name-conflict でも起きるので、判断の書き換えを 1 箇所に置く
- **複数の呼び手が共有する実処理はまとまりで 1 本**: `server/handler/delete.ts`（既存。セッション・プロジェクト・CLI・道具が呼ぶ）、`server/handler/session.ts`（endpoint と CLI が共有するセッションの実体——作る・並べる・消す・原子的に書く）
- `server/handler/invoke-agent.ts` は `server/utils/stroke/invoke.ts`（`kick` の実体）と別物である。名前で取り違えないよう endpoint 名をそのまま使い、`invoke.ts` にはしない

粒度の理由: endpoint 固有の実処理を 1 本にまとめると、`promote` の巻き戻しと `answer` の再送判定のような無関係なものが同じファイルに並ぶ。逆に共有の実処理を呼び手ごとに割ると、CLI と endpoint で同じ実装が 2 つに戻る。**呼び手が 1 つなら endpoint 単位、2 つ以上ならまとまり単位**という線で引く。

- 代替: `session-list.ts` / `session-create.ts` に分ける（issue の候補名） → `createSession` と `listSessions` と `writeAtomic` は同じ `SessionError` を投げ、同じ `SESSION_FILES` を読む。分けると共有の型だけを持つ 3 本目が要る。1 本にまとめて `session.ts` とする
- 代替: `server/handler/session-core.ts` に名前だけ寄せる → `Core` を落とすのがこの change の完了条件。却下

### D3. `session-core.ts` の解き方 — 実処理は handler、名前の決めは `paths.ts`、重複は既存へ寄せる

| `session-core.ts` の中身 | 行き先 |
| --- | --- |
| `listSessionsCore` + `passesListChecks` / `readInvocation` / `readPhase` | `server/handler/session.ts` の `listSessions` |
| `createSessionCore` | 同 `createSession` |
| `writeAtomic` | 同 `writeAtomic`（root を引数で受ける形のまま） |
| `readInvocationCore` | 同 `readStoredInvocation`（CLI の削除の実行中判定が使う） |
| `SessionCoreError` | 同 `SessionError`（kind は `io` だけに絞る。下記） |
| `deleteSessionCore` | **消す。** `server/handler/delete.ts` の `removeTarget` と同じ実装だった。CLI もそちらを通る |
| `sessionExistsCore` | **消す。** `handler/delete.ts` の `targetExists` と同じ判定（`state.json` が在ること）だった |
| `removeSessionDir` | **消す。** 検査の無い層を別に持つ理由は、道具（`yarn check:stroke`）が自分の後始末に使うためだった。`removeTarget` に寄せて経路を 1 本にする。**振る舞いは 1 点だけ変わる**——道具の事前確認はディレクトリの有無（`existsSync`）で、`removeTarget` が見るのは `state.json` の有無なので、`state.json` を持たない残骸は道具でも消えなくなり「消せなかった」と告げて終わる。**消してよいものの定義を道具だけ緩めない**方を採る（`scripts/stroke-check.ts` の docblock に明記した） |
| `SESSION_FILES` | `server/utils/stroke/paths.ts`（`sessionFile` の隣。ファイル名の決めと path の組み立ては同じ関心） |
| `isSafeSegment` | 同 `paths.ts`（`handler/delete.ts` の写しを消し、こちらを import する） |
| `isSessionId` | **消す。** 参照が 1 つも無い |

`SessionCoreError` の kind は `not-found` / `io` / `phase` の 3 つだったが、`not-found` を投げていたのは `deleteSessionCore`（→ `DeleteError` に一本化）だけ、`phase` は投げ手が 1 つも無い。`SessionError` は `io` だけを持つ。`sessionErrorToHttp`（`session-store.ts`）は `SessionError` 以外を 500 に落とす既存の形のまま残るので、応答は変わらない。

`paths.ts` は fs に触らない（`isSafeSegment` は正規表現だけ）。`server/handler/` は Nitro に依存しない（`useRuntimeConfig` を呼ばず、root を引数で受ける）——CLI が tsx から直に import するため、この性質は `session-core.ts` から引き継ぐ。

- 代替: `session-core.ts` を丸ごと `server/handler/session.ts` へ改名する → 重複 3 組（消す実行・在るかの判定・`isSafeSegment`）が `server/handler/` の中に 2 本並ぶだけになる。capability の「同じ実処理を 2 箇所に書かない」に反する。却下

### D4. 判定を含む区間 — 許す局面を引数で渡す（U15）

U15 は `withStateLock` の中で「読む → 判定 → 書く」を 1 区間にしている（A8 の書き込みと同じ待ち行列を通すため）。api が先に `readState` すると、判定と書き込みの間に区間が割れる。

そこで `recordActivation(sessionId, from)` とし、**許す局面 `from` は api の literal**（`const ACTIVATABLE: readonly Phase[] = ['approved']`）で渡す。handler は lock の中で読み、`from` に当てはまるかだけを見て、当てはまらなければ観測した phase（読めなければその旨）を返す。api がそれを 409 の文言へ写す。handler は自分の literal を持たず、呼び出し元も知らない。

同じ形を U10 POST・U14 にも使う。handler は「起きたこと」を返し（`{ ok: true }` / `{ ok: false, reason: … }`）、status と文言は api が決める。**文言は現状のものをそのまま api へ移す**ので、応答は 1 文字も変わらない。

- 代替: handler が `conflict()` を投げる → handler が HTTP を知ることになり、capability に反する。却下
- 代替: 述語を関数として渡す → api が literal を持つ点は同じだが、handler の中で任意のコードが動くため「handler は判定を持たない」が確かめられなくなる。集合を渡す形にする
- **物差しは「受理する局面をどちらが決めているか」である。** handler が書き込みの前に「書ける形か」を確かめること自体は述語に当たらない——決めているのは `from` だからである。U14 の取り下げの「判断を持つか」は項目で見られるので `'decision' in current` にした。U15 の「昇格後の形か」は**項目では見られない**（`proposed` も候補名を持ちうる。A7 が書く）ので、型の判別子である phase を `isPromotedState` で確かめる。santa-method の 2 巡で、`isPromotedState` → `'projectName' in state`（不健全）→ `isPromotedState`（形の確認であることを明記）と直した

### D5. テストの寄せ替え — 実処理は `test/server/handler/`、api は準備／後始末だけ

api のテストは `server/utils/**` を `vi.mock` して endpoint を直に呼ぶ形（`test/server/api/support.ts`）である。実処理を handler へ出しても、handler は同じ utils を import するので**そのまま置いておくと endpoint と handler を一緒に通す二重のテストになる**。

- 実処理の検査（改名の順序・巻き戻し・判断の取り下げ・再送の判定・占有の解放・A8 への引き渡し・配信）は `test/server/handler/<name>.test.ts` へ移す。モックの対象（`utils/stroke/**`）は変えず、**呼ぶ相手を endpoint から handler へ差し替える**だけにする。Nitro の全域（`stubNitroGlobals`）は handler のテストには要らない
- api のテストに残すのは、404 / 409 / 503 / 204 の返し方と、handler が期待した引数で 1 度呼ばれること。handler は `vi.mock` する
- `test/server/utils/stroke/session-core.test.ts` は `test/server/handler/session.test.ts` へ移す

`test/` は写し元の構造をそのまま写す（`docs/specs/structure/system-structure.md` §2）ので、`server/handler/` の写しは `test/server/handler/` になる。既に `delete.test.ts` がある。

### D6. 共有の後始末 `toHttp` — `server/utils/stroke/conflict.ts` に置く

`DeleteError` を 404 / 500 へ写す `toHttp` が U11 と P1 に同じ形で 2 つある。1 箇所に出し、`deleteErrorToHttp` として export する。置き場は `server/utils/stroke/conflict.ts`——**api が結果を HTTP へ写すための語彙を既に持つファイル**で、セッションの endpoint もプロジェクトの endpoint も既にここを import している。#19 で P1 が同じものを使う。

- 代替: `server/handler/delete.ts` に置く → handler が `createError` を知ることになる。却下
- 代替: `server/utils/` に新しいファイルを作る → `server-structure.md` の棚卸しの本数が変わり、承認済みの docs 書き換え（34 → 33）と食い違う。既にその関心を持つファイルへ入れる方を採る
- **P1 の写しはこの change では消さない。** `server/api/projects/**` は #19 の範囲であり、issue #15 も「#19 で P1 が同じものを使う」と書いている。今の呼び手が U11 だけであることは `conflict.ts` の docblock に事実として書く（santa-method の 2 レビュアーが「doc が事実と違う」と挙げたのを受けて直した）

### D7. 据え置き — utils が投げる 409 はこの change では動かさない

`assertNameAvailable`（`utils/stroke/project.ts`）と `beginRun`（`utils/stroke/running.ts`）は 409 を `createError` で投げる。handler がこれらを呼ぶので、**handler の中を HTTP のエラーが素通りする**形が残る。

この change では動かさない。理由は 2 つ——(1) 直すには `server/utils/` の切り方（どちらも他の endpoint・巡回・A8 から呼ばれる）に手が要り、issue #15 のスコープ外である。(2) 素通りさせる限り応答は変わらないが、写し替えると 409 の `data.reason` を作り直すことになり、「応答を変えない」制約を自分で危うくする。

capability の Requirement は「api の handler ファイルの中に書かない」であって「handler の中に HTTP が一切現れない」ではないので、この据え置きは Requirement に反しない。**親へ引き継ぐ**——#18・#19 が同じものに当たったときに、まとめて 1 本の change にする候補である。

### D8. 旧ファイル名を指す docblock

`fix-session-api-namespace` の design「据え置き」表のうち、この change が触るファイルの分を直す。`server/utils/stroke/session-store.ts:242`・`:271`（`submission.post.ts`・`activate.post.ts`）と `scripts/stroke-check.ts:653`・`:966`（`approve.post.ts`・`proposal.post.ts`）が対象になる——どちらもこの change で中身に手を入れるファイルである。`server/utils/stroke/sweep.ts:14`・`request-schemas.ts:125` は触らないので据え置き、親へ引き継ぐ。

## 関連 docs の書き換え案（現状 → 追従後。**承認済み 2026-09-09**）

`docs/agents/issue-tracker.md`「更新対応」の手順どおり案を出す。3 件ともユーザー承認済み（2026-09-09。親から伝達）。基準（`docs/specs/api/overview.md`・`server.md`・`sessions/*.md`・`projects/delete.md`）は触らない。

### 1. `docs/specs/structure/system-structure.md` §1 — `handler/` の行を足す

- 現状（45〜48 行目）: `server/` の下は `api/` `plugins/` `routes/` `utils/` の 4 行
- 追従後: `api/` の次に 1 行足す

```
│   ├── handler/                api が呼ぶ実処理（判定は持たない）
```

### 2. 同 §4 — api の段落の末尾に 1 文足す

- 現状: 「**api は契約が正。** …プロジェクト系（`/api/projects/**`）は本家の読み取り10本と書き込み3本（…）で、`read-only.test.ts` が範囲を機械的に固定している。」
- 追従後: 同じ段落の末尾に足す——「api の handler ファイルは HTTP 固有の準備（読み取り・検証・id の解決）と後始末（status・エラーの HTTP 化）だけを持ち、実処理は `handler/` を呼ぶ。どの局面を許すかの判定は api が持ち、handler は持たない」

### 3. `docs/specs/structure/server-structure.md` — 棚卸しから `session-core` を外す

- 現状: 見出し「## 規範への対応 — 全34本」、本文「現在の34本を…」、セッションの行の先頭が `session-core`
- 追従後: 見出しと本文の本数を 33 にし、セッションの行から `session-core` を落とす。表の後ろに 1 行足す——「`server/handler/` はこの棚卸しの対象外（`server/utils/` ではない）。api が呼ぶ実処理の置き場で、規範は `system-structure.md` §1・§4」

## この change が新しく作る docs の食い違い（**承認済み 2026-09-09。この change で直す**）

`session-core.ts` を消したことで、そのファイル名を挙げている 3 ページ・6 行が実在しない
path を指す。当初は承認の対象外として据え置く案だったが、親がユーザーへ 1 ページずつ諮り、
3 ページとも承認を得た（2026-09-09）。`docs/agents/issue-tracker.md`「更新対応」の
「上位資料への整合反映までが change の責務範囲」に従い、この change で直す。

置き場は実物で確かめた——`SESSION_FILES` は `server/utils/stroke/paths.ts:30`、
`isSafeSegment` は同 `:48`。

| ページ・行 | 現状 | 追従後 |
| --- | --- | --- |
| `README.md:181` | どちらも同じ実体（`server/utils/stroke/session-core.ts`）を呼ぶ | 同じ実体（`server/handler/session.ts`）を呼ぶ |
| `docs/specs/architecture/session-workflow.md:72` | セッション作成（`server/utils/stroke/session-core.ts`）は… | `server/handler/session.ts` |
| 同 `:85` | endpoint と同じ実体（`session-core.ts`）を呼ぶ | 同じ実体（`server/handler/session.ts`）を呼ぶ |
| `docs/specs/core/settings-reference.md:18` | 共有のモジュール（`session-core.ts`・`paths.ts`・`claude.ts` など） | 共有のモジュール（`server/handler/`・`paths.ts`・`claude.ts` など） |
| 同 `:198` | セッションディレクトリ内のファイル名 → `server/utils/stroke/session-core.ts` | `server/utils/stroke/paths.ts`（`SESSION_FILES` の移動先） |
| 同 `:204` | 対象の id として受け付ける形 → `server/utils/stroke/session-core.ts` | `server/utils/stroke/paths.ts`（`isSafeSegment` の移動先） |

**コード中の docblock は直す。** `server/utils/stroke/{openspec,config,activate-approved}.ts`・
`server/utils/control/creating.ts`・`scripts/stroke-check.ts` の 6 行が同じ名前を挙げている。
docs と違って承認の対象ではなく、消したファイルを指したままにする理由が無い（D8 と同じ扱い）。

## Risks / Trade-offs

- [api と handler を跨いで動くコードが増え、読む順が 1 段深くなる] → handler のファイル名を endpoint の名前に揃え、api の docblock（責務の説明）は api に残す。実装の理由（順序・巻き戻し・占有の区間）は handler へ移す
- [テストの寄せ替えで検査が抜け落ちる] → 移す前後でテストの本数と `it` の題を突き合わせる。api 側に残すのは status の検査だけと決め、消すのではなく handler 側へ移す
- [`session-core.ts` の解体が広く波及する（`session-store` / `session-param` / `claude` / `scripts` の 2 本）] → import の差し替えだけで、関数の中身は動かさない。`yarn typecheck` が漏れを拾う
- [CLI の `yarn session delete` が `removeTarget` 経由になり、失敗の文言が変わる] → `DeleteError` の文言は `そのセッションは無い: <id>` から `その対象は無い: <id>` に変わる。CLI の**終了コードと使い方は変わらない**。`openspec/specs/tools/session-cli` は文言を規定していないことを確認済み
- [`server/utils/{project,running}.ts` の 409 が handler を素通りする（D7）] → capability の Requirement には反しないが、親へ引き継ぐ
- [**CLI（`yarn session`）は base（`pre3` = 3f228471）の時点で既に落ちる**] → `#shared/stroke` の alias を tsx が解決できず `ERR_PACKAGE_IMPORT_NOT_DEFINED` になる（`list` / `create` / `delete` のすべて）。実測 2026-09-09、この change の前後で同じ。**この change が作った不具合ではなく、直すのもこの change の範囲外**（`openspec/specs/tools/session-cli` が現に満たされていない別件）。呼び口の付け替えは型で確かめてある。親へ引き継ぐ

## Migration Plan

1. `server/utils/stroke/paths.ts` に `SESSION_FILES`・`isSafeSegment` を足す
2. `server/handler/session.ts` を作り、`session-core.ts` の実処理を移す（`Core` を落とす）。`handler/delete.ts` の写しの `isSafeSegment` を消す
3. `session-core.ts` を消し、`session-store.ts` / `session-param.ts` / `claude.ts` / `scripts/session.ts` / `scripts/stroke-check.ts` の呼び口を差し替える
4. endpoint ごとの handler を作り、api を薄くする（U11 → U7 → U10 → U15 → U13 → U14 の順。小さいものから）
5. `toHttp` を `conflict.ts` へ出し、U11 をそこから引く
6. テストを寄せ替える
7. docs 3 件（承認済み）
8. `yarn typecheck` → `yarn test` → `yarn build && yarn test:e2e` → `openspec validate --all --store stroke`

巻き戻し: この change の commit を revert すれば元の形に戻る。URL も入出力も動かさないので、画面・E2E・設定は revert の対象に入らない。

## Open Questions

なし。
