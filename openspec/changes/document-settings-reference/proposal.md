## Why

設定が**気付いたら増えている**状態を止められない。

`align-settings-conventions` は値をコードから外へ出したが、外に出す判断そのものには誰の目も通らなかった。結果、49 項目が並び、その中に「設定であってはならないもの」が混ざった。

- `NUXT_CLAUDE_SESSION_MISSING_MESSAGE` — 名前は「メッセージ」だが、実体は `claude` CLI の出力に対する `includes()` の照合文字列。差し替えられる設定として置く理由が無い
- `NUXT_REQUEST_*` 14 件 — リクエストの長さ上限。運用で微調整する類ではなく、そもそも上限を設ける必要が無かった
- `NUXT_QUESTION_*` 5 件 — AI 応答を「規定の構造として読み取れるか」を決める契約。schema の定義であって設定ではない
- 子プロセスの終わらせ方（timeout / signal / retries）— システム既定値

**コードを正に置く限り、この流れは止まらない。** 設定を1つ増やすのはコードを1行足すだけで済み、資料の更新は後追いの善意に依存する。実際、コードと `.env.example` と資料の3者が食い違う状態が生じた。

**資料を正に置く。** 設定を増やす行為そのものに、change とユーザー承認を挟む。

**今やる理由**: 統合すると運用者が向き合う設定は1組になる。その時点で「何が設定で、何が設定ではないか」が定まっていないと、マージ先の設定と突き合わせる作業が、また個別の値を追う作業に戻る。

## What Changes

**`docs/settings-reference.md` を作り、`docs/adr/0004-settings-reference-is-authoritative.md` でその扱いを定める。**

資料が載せるのは**設定だけ**である。設定とは、`nuxt.config.ts` に書かれ、`useRuntimeConfig()` から読まれる値を指す。

1. **`runtimeConfig`** — サーバー専用。9 項目。うち置き場2件（`sessionsRoot` / `projectsRoot`）だけが `.env` で差し替えられる
2. **`runtimeConfig.public`** — 画面とサーバーの両方が読む。`claude` の起動定義（`command` / `args`）

**環境変数は置き場2件だけ。** `NUXT_SESSIONS_ROOT` / `NUXT_PROJECTS_ROOT` を残し、他の `NUXT_*` は全廃する（`align-settings-conventions` 10.13h〜10.13k）。置き場だけを外に出すのは**動かす機械ごとに変わるから**であり、他の設定は機械が変わっても変わらない。`.env.example` もこの2件だけを持つ。

**システム内部の決め事は載せない。** `settings.ts` の固定値（セッション内のファイル名、openspec ルート、子プロセスの終わらせ方、ログ接頭辞、プロジェクト生成の構造）、ビルド時に決まる設定、schema の定義に畳んだ閾値は、いずれも設定ではない。**資料に無い＝設定ではない**が成立する状態にする。

**対応表は持たない。** `align-settings-conventions` の対応内容を資料側へ書き写すと、archive された履歴の複製が本体に残る。資料は「今この瞬間、何が設定か」だけを持つ。

**ADR 0004 が定める3つ**:

1. 設定の中身を変えるとき、`docs/settings-reference.md` の編集を必ず伴う
2. 資料の編集は、必ず OpenSpec の change を起こして行う
3. その change には、ユーザーの承認を得る

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。

**`skip_specs: true` を `.openspec.yaml` に置く。** この change は資料1本と ADR 1本で、観測できる振る舞いを変えない。設定の振る舞いは `configuration` が既に規定していて、この change はその**扱い方**を定めるだけである。仕様を書くために要件を作らない。

## Impact

- `docs/settings-reference.md` — 新規。この change の成果物
- `docs/adr/0004-settings-reference-is-authoritative.md` — 新規。資料の扱いを定める
- `docs/adr/0003-settings-precedence.md` — 0004 に取って代わられた旨を冒頭に置く。本文は記録として残す
- `docs/structure.md` — 資料の置き場と役割を1行
- `CLAUDE.md` の Docs 一覧 — 1行
- `.env.example` — 置き場2件だけを持つ形に絞る（実作業は `align-settings-conventions` 10.13j）

**コードは変えない。** `server/` / `nuxt.config.ts` / `package.json` に手を入れない。環境変数の全廃と `settings.ts` への集約は `align-settings-conventions` が持つ。

**前提**:

- `align-settings-conventions` — 資料が写す実態そのもの。10 章（環境変数の全廃・`settings.ts` への集約・起動定義の JSON 化）が作業ツリーに入っていること
