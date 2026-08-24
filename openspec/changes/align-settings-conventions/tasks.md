全ての群で守ること（design.md の Non-Goals）。

- **関数の引数を増やさない。** 値は使う場所で `resolve*()` を呼んで読む
- **新しいモジュールを作らない。** 既定値と解決関数は、その値を使うモジュールに置く
- **呼び出し側を変えない。** 外出しは値の出どころを変えるだけ
- **既定値は現在の直書きと同じ値にする。** 何も設定しなければ振る舞いは変わらない

形は `api-base-url.ts` / `workflow-schema.ts` に倣う（design.md 決定1）。

## 1. 境界を引く

- [x] 1.1 `nuxt.config.ts` の設定を「ビルド時に決まるもの」と「実行時に差し替えられるもの」に分けて並べ替える
- [x] 1.2 ビルド時に決まるもの（`modules` / `css` / `nitro.experimental.websocket` / `devtools` / `ignore`）に、なぜビルド時なのかを1行ずつ添える
- [x] 1.3 環境ごとに切り替えたい値がビルド時側にある場合（`devtools`）、切り替えるにはビルドを分ける必要があることを書く

## 2. 置き場

- [x] 2.1 `paths.ts` に `DEFAULT_SESSIONS_ROOT` / `resolveSessionsRoot()` を置き、`SESSIONS_ROOT` の直書きを置き換える。`sessionDir` / `sessionFile` の引数は増やさない
- [x] 2.2 `paths.ts` に `DEFAULT_PROJECTS_ROOT` / `resolveProjectsRoot()` を置き、`PROJECTS_ROOT` の直書きを置き換える。`projectDir` の引数は増やさない
- [x] 2.3 `session-core.ts` と `startup-checks.ts` が `SESSIONS_ROOT` / `PROJECTS_ROOT` を直接参照している箇所を解決関数に切り替える（`project.ts` も同様）
- [x] 2.4 `nuxt.config.ts` の `runtimeConfig` に2つを宣言し、既定値は `paths.ts` から import する
- [x] 2.5 起動時チェックが見る値と、実際に読み書きする値が同じになることを確認する

## 3. セッション内のファイル名と openspec ルート

- [x] 3.1 `session-core.ts` のファイル名5種（`state.json` / `strokes.json` / `proposal.md` / `overview.txt` / `send-back.json`）を既定値＋解決関数の形にする
- [x] 3.2 `session-core.ts` の一覧の検査が見る `openspec` ディレクトリ名と `config.yaml` を外に出す
- [x] 3.3 `openspec.ts` のバイナリ名・サブコマンドとフラグ（`init --tools none`）・書き込み先の相対パスを外に出す
- [x] 3.4 `nuxt.config.ts` の `runtimeConfig` には足さず、足さない理由を注記する（design.md 決定3。当初は「宣言して既定値を import する」としていたが、エイリアスの制約で成立しないことが実測で分かったため改めた）

**3.1〜3.2 の置き場について**: 既定値と解決関数は `session-core.ts` ではなく **`paths.ts`** に置いた。`nuxt.config.ts` は Nuxt のエイリアスがまだ存在しない時点で評価されるため、`#shared/stroke` を import する `session-core.ts` を読めない（`error TS2307` で実測）。`api-base-url.ts` / `workflow-schema.ts` が単独モジュールなのも同じ理由である。ファイル名は置き場の一部なので `paths.ts` に属する。新しいモジュールは作っていない。

## 4. 閾値

- [x] 4.1 `question.ts` の5件（話題タグ12 / 詳細説明300 / 問い本文20 / 選択肢の説明50 / 選択肢の件数5）を外に出す
- [x] 4.2 `request-schemas.ts` の名前付き11件を外に出す
- [x] 4.3 `request-schemas.ts` のインライン件（指摘の id 200 / timestamp 64 / ハイライトの bg・border 各200 → 名前は3つに集約）を名前を付けて外に出す
- [x] 4.4 zod のスキーマが解決関数の戻り値を使うようにする。スキーマの組み立てが起動時に1度だけ走ることを確認する（`const limits = resolve*()` をモジュール先頭で1度だけ評価する形にした）
- [x] 4.5 `runtimeConfig` には足さない（design.md 決定3）。`.env.example` に載せる分は 8.1 で扱う

## 5. 子プロセスの起動

- [x] 5.1 `claude.ts` のバイナリ名を外に出す
- [x] 5.2 `claude.ts` のタイムアウト時のシグナル（`SIGKILL`）を外に出す
- [x] 5.3 `claude.ts` が子へ渡す環境変数の名前（`STROKE_BASEURL`）を外に出す。これは**こちらが読む設定ではなく渡す名前**なので `NUXT_` の規則の外である旨をコメントに残す（design.md 決定6）
- [x] 5.4 `claude.ts` の継続先喪失の判定文言（`No conversation found with session ID`）を外に出す
- [x] 5.5 `ai.ts` の `MAX_RETRIES` を外に出す（spec `ai-invocation`「失敗はサーバ側でリトライし、ユーザーに見せない」の追加シナリオに対応）
- [x] 5.6 `runtimeConfig` には足さない（design.md 決定3）。`.env.example` に載せる分は 8.1 で扱う

## 6. 生成物・正規表現・ログ

- [x] 6.1 `project.ts` の生成先の構造（`docs` / `proposal.md`）を外に出す
- [x] 6.2 `project.ts` の名前として許す文字の規則を外に出す。**`..` を含む名前を弾く判定は外に出さない**（置き場の外へ出られる形を設定で許してはならない・design.md 決定9）
- [x] 6.3 `routes/api/strokes/[id]/ws/proposal.ts` と `question.ts` の正規表現を外に出す（同じ規定が2箇所にあったので、`ws-channels.ts` の `sessionIdFromUrl(url, channel)` 1本にまとめた）
- [x] 6.4 ログの接頭辞（`[stroke-board]`）を外に出す。`ai.ts` と `startup-checks.ts` の2箇所が同じ出どころを読む
- [x] 6.5 `runtimeConfig` には足さない（design.md 決定3）。`.env.example` に載せる分は 8.1 で扱う

## 7. 検証

- [x] 7.1 検査する関数を値の定義と同じモジュールに置く（`describe*Error(): string | null`）。design.md 決定4。当初は「zod スキーマ1式に集める」としていたが、値の定義が各モジュールに散る（決定3）以上、集めると検査だけが値から離れるため改めた
- [x] 7.2 環境変数は文字列で来るため、数値・正規表現・絶対パスの3種を検査する。不正な値は既定へ倒し、不正であることは起動時チェックが示す（解決関数は投げない）
- [x] 7.3 起動時チェックが全体の検証を呼ぶようにする（置き場 / 問いの閾値 / リクエストの閾値 / リトライ回数 / 子プロセスの起動 / WS のパス / プロジェクト名の規則の7つ）

**自己レビューで見つけた漏れ（対応済み）**: `NUXT_CLAUDE_TIMEOUT_SIGNAL` に知らないシグナル名を入れても起動は通り、**タイムアウトが起きた瞬間に** `child.kill()` が `ERR_UNKNOWN_SIGNAL` で落ちる。「不正なまま走り出さない」（specs/configuration）に反するので、`os.constants.signals` と突き合わせる検査を足した。`NUXT_OPENSPEC_INIT_ARGS` が空白だけの場合も同様に弾く。

実測: `NUXT_CLAUDE_TIMEOUT_SIGNAL=SIGBOGUS` で起動すると `子プロセスの起動の設定が不正: NUXT_CLAUDE_TIMEOUT_SIGNAL: 知らないシグナル名（SIGBOGUS）` が出て止まり、`SIGTERM` なら通常どおり起動した。
- [x] 7.4 **既定値のまま起動して検証が必ず通ることを確認する**（検証の追加で起動が落ちやすくなるため）
- [x] 7.5 形をなしていない値を与えて起動し、その不正が起動の時点で示されることを確認する

**7.5 の実測**: `.env` に `NUXT_REQUEST_OVERVIEW_MAX=すぐ` / `NUXT_SESSIONS_ROOT=relative/path` / `NUXT_PROJECT_NAME_PATTERN=[` を与えて起動すると、3件すべてが名前と値つきで示され、プロセスが止まった。

```
ERROR  [stroke-board] 起動できない
  - 書き込みできない: relative/path
  - 置き場の設定が不正: NUXT_SESSIONS_ROOT: 絶対パスでない（relative/path）
  - リクエストの閾値の設定が不正: NUXT_REQUEST_OVERVIEW_MAX: 正の整数でない（すぐ）
  - プロジェクト名の規則の設定が不正: NUXT_PROJECT_NAME_PATTERN: 正規表現として読めない（…）
```

あわせて、この案内の文末が `runtimeConfig.claude を確かめること` のままだと実態と合わなくなるため、`.env` / 環境変数と `.env.example` を指す文言に直した。

## 8. 一覧と CLI

- [x] 8.1 `.env.example` を作り、外に出した値の名前と既定値を並べる
- [x] 8.2 `package.json` の `session` スクリプトを `tsx --env-file-if-exists=.env scripts/session.ts` にする（design.md 決定8）
- [x] 8.3 `.env` に置き場を差し替えた値を書き、`yarn session list` とサーバ経由の一覧が**同じ値に解決される**ことを確認する（spec `configuration`「実行経路が違っても同じ値に解決される」）
- [x] 8.4 `.env` を消した状態で `yarn session list` が落ちないことを確認する

**8.3 の実測（CLI 内）**: `.env` に `NUXT_SESSIONS_ROOT=<一時ディレクトリ>` を書いて `yarn session create` すると、`/var/lib/stroke-board/sessions` ではなくその一時ディレクトリにセッションができた。続けて `yarn session delete <uuid>` が同じ置き場を見て消せることも確認した。

**8.3 の実測（サーバ ↔ CLI）**: 同じ `.env` で dev サーバーを起動し、**HTTP でセッションを作ってから CLI で消した**。サーバが作った実体は差し替えた置き場に落ち、CLI がそれを同じ置き場で見つけて消した。経路をまたいで同じ値に解決されている。

**一覧の網羅性**: コード中の `NUXT_*` と `.env.example` の項目を機械的に突き合わせ、**漏れ0件・死んだ項目0件**を確認した（差分に出た4件は `NUXT_CLAUDE_*` のようなコメント中の接頭辞表記で、実在の変数名ではない）。

**8.4 の実測**: `.env` を消すと `.env not found. Continuing without it.` と出て続行し、既定の置き場の一覧を返した。終了コードは 0。

## 9. 通し確認とドキュメント

- [x] 9.1 既定値のまま dev サーバーを起動し、概要の受理が従来どおり動くことを確認する
- [x] 9.2 `.env` で閾値を1つ変え、再ビルドなしにその閾値で検査されることを確認する（spec `configuration`「実行時に差し替えられる設定は再ビルドなしに反映される」）
- [x] 9.3 ビルド時に決まる設定を環境変数で変えようとして、動作が変わらないことを確認する（spec `configuration`「ビルド時に決まる設定は作り直すまで動作に現れない」）
- [x] 9.4 `README.md` の設定表を、外に出した値の全体に合わせる
- [x] 9.5 `docs/session-workflow.md` の設定に関する記述を実態に合わせる
- [x] 9.6 `yarn check` が通ることを確認する

**9.1 の実測**: 既定値で起動し、起動時チェックは無警告。20001字の概要は 400「概要が長すぎる。」、短い概要は 200 でセッションが作られた（確認後 `yarn session delete` で消した）。**AI の呼び出しまでは通していない**（`claude` の実起動を伴うため）。

**9.2 の実測（dev）**: `.env` に `NUXT_REQUEST_OVERVIEW_MAX=10` を置いて起動し直すと、15字の概要が 400「概要が長すぎる。」になった。ビルドし直していない。

**9.2 の実測（本番ビルド）**: `yarn build` は exit 0 で通る。**同じ `.output` に対して**、

- `NUXT_REQUEST_OVERVIEW_MAX=10` を与えて起動 → 15字の概要が **400**
- 何も与えずに起動 → 同じ15字が **200**（セッションが作られる）

ビルド成果物を作り直さずに閾値が切り替わることを確認した。`configuration`「実行時に差し替えられる設定は再ビルドなしに反映される」の直接の証拠である。

**9.3 の実測**: 同じ `.env` に `NUXT_DEVTOOLS_ENABLED=true` を置いても `/__nuxt_devtools__/client/` は 404 のままだった（`devtools` はビルド時に決まるので環境変数が届かない）。

**9.6 の結果**: `yarn typecheck` は 0 エラー。`yarn check` 全体は**失敗する**が、原因は `connect-portal-and-strokes` の specs が未作成であることで、この change の変更とは無関係な既存の状態である（`openspec validate --all` は 16 passed / 1 failed）。

## 見つけたが、この change では外に出さなかったもの

差分を読み直して見つけた直書き。proposal の Impact に挙がっておらず、外に出す理由も無いと判断した。

- **`session-core.ts` の `/^schema:\s*\S+/m`** — 一覧の検査が `config.yaml` の中身を見る正規表現。これは openspec が書くファイルの**書式**であって、こちらの設定ではない。書式が変わったら追随するのはコードの側である
- **`session-core.ts` の uuid の正規表現** — design.md 決定9 のとおり、緩めれば置き場の外へ出られるので外に出さない
- **`shared/stroke.ts` の語彙**（`phase` の3値・`invocation` の3値・`kind` の2値・ハイライトの5色） — 画面とサーバの契約であり、設定で増減してはならない（design.md 決定9）

## 10. 指摘対応

**ソースコードを設定値の置き場所にしない。** 実装モジュール（`question.ts` / `request-schemas.ts` / `claude.ts` / `openspec.ts` / `ai.ts` / `ws-channels.ts` / `project.ts` / `paths.ts`）に散った `DEFAULT_*` を全て退け、設定ファイル1本に集める。決定1・決定3（既定値は使うモジュールに置く／新しいモジュールを作らない）はこれで覆る。

置き場は `server/utils/stroke/settings.ts`。`#shared/*` を import しない単独モジュールにして、`nuxt.config.ts` から読めるようにする。CLI（`yarn session`）は Nitro の外で `session-core.ts` を直接 import して走るため、`useRuntimeConfig()` ではなくこの設定ファイルの解決関数を通る。

### 集約

- [x] 10.1 `server/utils/stroke/settings.ts` を作る。外部設定化する値の既定値と解決関数、固定値をここに集める

  **できた構成**（3ブロック。`#shared/*` も `useRuntimeConfig()` も使わない単独モジュール）:

  | ブロック | 中身 |
  |---|---|
  | `.env` で差し替えられるもの | `DEFAULT_SESSIONS_ROOT` / `DEFAULT_PROJECTS_ROOT`、`resolveSessionsRoot()` / `resolveProjectsRoot()`、`describePathsError()`。**`process.env` を読むのはここだけ** |
  | `runtimeConfig` の既定値（`nuxt.config.ts` が import） | `DEFAULT_API_BASE_URL` / `DEFAULT_WORKFLOW_SCHEMA` / `DEFAULT_FIRST_PROMPT` / `DEFAULT_CONTINUE_PROMPT` / `DEFAULT_OPENSPEC_BIN` / `DEFAULT_OPENSPEC_INIT_ARGS` / `DEFAULT_WS_PATH_PATTERN` / `DEFAULT_CLAUDE_COMMAND` / `defaultClaudeArgs(repoRoot)`、`describeClaudeArgsError(args)` |
  | 固定値 | `SESSION_FILES`（5種）/ `OPENSPEC_DIR` / `OPENSPEC_CONFIG_FILE` / `CLAUDE_TIMEOUT_MS` / `CLAUDE_TIMEOUT_SIGNAL` / `CLAUDE_MAX_RETRIES` / `CLAUDE_SESSION_MISSING_MESSAGE` / `CLAUDE_BASE_URL_ENV_NAME` / `PROJECT_DOCS_DIR` / `PROJECT_PROPOSAL_FILE` / `PROJECT_NAME_PATTERN` / `LOG_PREFIX` |

- [x] 10.2 `paths.ts` から `DEFAULT_*` / `resolve*()` / `describePathsError()` を退け、`settings.ts` を参照する。**残ったのは `sessionDir` / `sessionFile` / `projectDir` の3本だけ**
- [x] 10.3 `question.ts` の5件を `settings.ts` へ移す。**移さなかった。** 10.13d で schema の定義に直書きしたため、`settings.ts` へ移す対象が残っていない
- [x] 10.4 `request-schemas.ts` の14件を `settings.ts` へ移す。**移さなかった。** 10.13b で上限そのものを廃したため、移す対象が残っていない
- [x] 10.5 `claude.ts` の4件を `settings.ts` へ移す
- [x] 10.6 `openspec.ts` の2件を `settings.ts` へ移す
- [x] 10.7 `ai.ts` の2件を `settings.ts` へ移す
- [x] 10.8 `ws-channels.ts` の1件を `settings.ts` へ移す
- [x] 10.9 `project.ts` の3件を `settings.ts` へ移す
- [x] 10.10 `api-base-url.ts` / `workflow-schema.ts` を `settings.ts` に畳む。**どちらもモジュールごと削除した。** `workflow-schema.ts` は読み手が1つも無い死んだモジュールで、`api-base-url.ts` は唯一の読み手（`scripts/session.ts`）が `DEFAULT_API_BASE_URL` を直接読む形になった
- [x] 10.11 検査関数（`describe*Error()`）も `settings.ts` に集め、起動時チェックはそれを呼ぶ。**集めた結果、残ったのは2本**（`describePathsError()` / `describeClaudeArgsError()`）。8本のうち6本は 10.13c のとおり検査対象そのものが無くなった

### 外部設定化しないもの

セッション内のファイル名と openspec ルートは、システム内部の決め事なので外から変更できないようにする。

- [x] 10.12 セッション内のファイル名5種（`state.json` / `strokes.json` / `proposal.md` / `overview.txt` / `send-back.json`）の `NUXT_SESSION_FILES_*` と解決関数を廃し、`settings.ts` の固定値にする
- [x] 10.13 openspec ルートの2件（`NUXT_OPENSPEC_DIR` / `NUXT_OPENSPEC_CONFIG_FILE`）も同様に固定値にする
- [x] 10.13l 子プロセスの終わらせ方3件を**システム既定値**として `settings.ts` の固定値にする。運用で差し替えるものではない。5.2 / 5.5 の判断はこれで覆る

  | 環境変数 | 定数 | 既定値 | 使われ方 |
  |---|---|---|---|
  | `NUXT_CLAUDE_TIMEOUT_MS` | `claude-config.ts` の `timeoutMs` | `180000` | 子プロセスを打ち切るまでの待ち時間 |
  | `NUXT_CLAUDE_TIMEOUT_SIGNAL` | `claude.ts` の `DEFAULT_TIMEOUT_SIGNAL` | `SIGKILL` | 打ち切るときに送るシグナル |
  | `NUXT_CLAUDE_MAX_RETRIES` | `ai.ts` の `DEFAULT_MAX_RETRIES`（`claude-config.ts` の `maxRetries` と**同じ環境変数を2箇所が読んでいる**） | `2` | 失敗時に起こし直す回数 |

  `resolveTimeoutSignal()` / `ai.ts` の `resolveMaxRetries()` と、`claude-config.ts` の zod スキーマの該当項目を削る。シグナル名が実在するかの検査（7.3a）も、固定値になれば不要になるので併せて削る

- [x] 10.13m 旧 `app.config.ts` 相当の残り5件も**システム既定値**として `settings.ts` の固定値にする。**`app.config.ts` は作らない。** 固定値の置き場は `settings.ts` 1本にする

  | 環境変数 | 定数 | 既定値 |
  |---|---|---|
  | `NUXT_PROJECT_DOCS_DIR` | `project.ts` の `DEFAULT_PROJECT_DOCS_DIR` | `docs` |
  | `NUXT_PROJECT_PROPOSAL_FILE` | `project.ts` の `DEFAULT_PROJECT_PROPOSAL_FILE` | `proposal.md` |
  | `NUXT_PROJECT_NAME_PATTERN` | `project.ts` の `DEFAULT_PROJECT_NAME_PATTERN` | `^[A-Za-z0-9][A-Za-z0-9._-]*$` |
  | `NUXT_CLAUDE_BASE_URL_ENV_NAME` | `claude.ts` の `DEFAULT_BASE_URL_ENV_NAME` | `STROKE_BASEURL` |
  | `NUXT_LOG_PREFIX` | `ai.ts` の `DEFAULT_LOG_PREFIX` | `[stroke-board]` |

  `project.ts` の `fromEnv()` と `resolveProject*()` 3本、`claude.ts` の `resolveBaseUrlEnvName()`、`ai.ts` の `resolveLogPrefix()` を削る。名前の規則の検査（`project.ts:37` が `process.env.NUXT_PROJECT_NAME_PATTERN` を直読み）も併せて削る

- [x] 10.13a 継続先喪失の判定文言（`NUXT_CLAUDE_SESSION_MISSING_MESSAGE`）を廃し、`settings.ts` の固定値にする。**これはこちらが出すメッセージではなく、`claude` CLI の stderr/stdout に対する `includes()` の照合文字列である**（`claude.ts:163`）。5.4 の判断はこれで覆る

### 上限そのものを廃すもの

- [x] 10.13b リクエストの閾値14件を**全て**廃す。設定だけでなくキャップ自体を無くす（`z.string().max(...)` / `z.array(...).max(...)` を外す）。`request-schemas.ts` から `DEFAULT_*` 14本・`intFromEnv()`・`resolveRequestLimits()`・`describeRequestLimitsError()`・`const limits` を丸ごと削り、閾値の仕組み自体を無くす。4.2 / 4.3 / 4.4 の判断はこれで覆る

  廃す14件（`request-schemas.ts`）:

  | 環境変数 | 定数 | 適用先 |
  |---|---|---|
  | `NUXT_REQUEST_OVERVIEW_MAX` | `DEFAULT_OVERVIEW_MAX` | `startSessionBody.overview` |
  | `NUXT_REQUEST_FREE_ANSWER_MAX` | `DEFAULT_FREE_ANSWER_MAX` | `answerBody` の `free.value` |
  | `NUXT_REQUEST_OPTION_LABEL_MAX` | `DEFAULT_OPTION_LABEL_MAX` | `answerBody` の `option.value` |
  | `NUXT_REQUEST_COMMENT_MAX` | `DEFAULT_COMMENT_MAX` | `annotationBase.comment` |
  | `NUXT_REQUEST_QUOTE_MAX` | `DEFAULT_QUOTE_MAX` | `annotationSchema.selectedText` |
  | `NUXT_REQUEST_NEXT_STEP_MAX` | `DEFAULT_NEXT_STEP_MAX` | `sendBackBody.nextSteps` の各要素の長さ |
  | `NUXT_REQUEST_NEXT_STEPS_MAX` | `DEFAULT_NEXT_STEPS_MAX` | `sendBackBody.nextSteps` の要素数 |
  | `NUXT_REQUEST_SUMMARY_MAX` | `DEFAULT_SUMMARY_MAX` | `sendBackBody.response` |
  | `NUXT_REQUEST_RECORD_MAX` | `DEFAULT_RECORD_MAX` | `sendBackBody.annotations` |
  | `NUXT_REQUEST_PROPOSAL_MAX` | `DEFAULT_PROPOSAL_MAX` | `proposalSubmitBody.proposal` |
  | `NUXT_REQUEST_TIMESTAMP_MAX` | `DEFAULT_TIMESTAMP_MAX` | `annotationBase.timestamp` |
  | `NUXT_REQUEST_COLOR_VALUE_MAX` | `DEFAULT_COLOR_VALUE_MAX` | `highlightColorSchema.bg` / `border` |
  | `NUXT_REQUEST_COMMENTS_MAX` | `DEFAULT_COMMENTS_MAX` | `sendBackBody.comments` の要素数 |
  | `NUXT_REQUEST_ANNOTATION_ID_MAX` | `DEFAULT_ANNOTATION_ID_MAX` | `annotationBase.id` |

  残すのは `min(1)` の**必須検査**だけ（概要・回答・指摘の本文・引用・proposal の「空でないこと」）。上限は1つも残さない。

### schema の定義として持つもの

- [x] 10.13d 問いの構造の閾値5件を外部設定から外し、**zod スキーマの定義として直接書く**。これらは AI 応答を「規定の構造として読み取れるか」を決める契約であって、運用で差し替える設定ではない。4.1 の判断はこれで覆る

  | 環境変数 | 定数 | 既定値 | schema 上の位置 |
  |---|---|---|---|
  | `NUXT_QUESTION_HEADER_MAX` | `DEFAULT_HEADER_MAX` | `12` | `rawQuestionSchema.header` |
  | `NUXT_QUESTION_DETAIL_MAX` | `DEFAULT_DETAIL_MAX` | `300` | `rawQuestionSchema.detail` |
  | `NUXT_QUESTION_QUESTION_MAX` | `DEFAULT_QUESTION_MAX` | `20` | `rawQuestionSchema.question` |
  | `NUXT_QUESTION_DESCRIPTION_MAX` | `DEFAULT_DESCRIPTION_MAX` | `50` | `rawOptionSchema.description` |
  | `NUXT_QUESTION_OPTIONS_MAX` | `DEFAULT_OPTIONS_MAX` | `5` | `rawQuestionSchema.options` の件数 |

  `question.ts` から `DEFAULT_*` 5本・`intFromEnv()`・`resolveQuestionLimits()`・`describeQuestionLimitsError()`・`const limits` を削り、値は `rawQuestionSchema` / `rawOptionSchema` に直接置く。`rawOptionSchema.label` に上限を置かない現行の判断（design.md 決定2）はそのまま残す

### 起動定義として1かたまりにするもの

- [x] 10.13e `claude` の起動に関わる5件を、**`runtimeConfig.public` 内で `.mcp.json` の記述形式に倣った JSON のひとかたまり**として持つ。バラバラの `NUXT_CLAUDE_*` 5本を廃す。5.1 の判断はこれで覆る

  畳む5件（現行）:

  | 環境変数 | 現在の runtimeConfig キー | 既定値 | 起動時の使われ方（`claude.ts:92-115`） |
  |---|---|---|---|
  | `NUXT_CLAUDE_BIN` | （`resolveClaudeBin()` 直読み） | `claude` | `spawn()` の実行ファイル |
  | `NUXT_CLAUDE_SETTING_SOURCES` | `claude.settingSources` | `project` | `--setting-sources <値>` |
  | `NUXT_CLAUDE_MODEL` | `claude.model` | `fable` | `--model <値>` |
  | `NUXT_CLAUDE_ADD_DIR` | `claude.addDir` | リポジトリのルートと `<ルート>/assets` | 空白区切りで分解し `--add-dir <値>` を繰り返す |
  | `NUXT_CLAUDE_ALLOWED_TOOLS` | `claude.allowedTools` | `Bash Read Write Edit` | 空でなければ `--allowedTools <値>` |

  形は `.mcp.json` の `command` / `args` に倣い、`runtimeConfig.public.claude.command`（文字列）と `runtimeConfig.public.claude.args`（配列）にする。**環境変数からは読まない。** `NUXT_PUBLIC_CLAUDE_*` を含め、この起動定義に対応する環境変数を一切置かず、値は `nuxt.config.ts` に書かれたものだけとする（10.17 の確認対象からも外れる）。`addDir` の空白区切り分解と `allowedTools` の空判定は、args を組み立てる側の処理ではなく**設定に書かれた配列そのまま**になるので、`claude.ts` の分解・分岐を削る

- [x] 10.13f 実行時に決まる引数は設定に畳まない。`-p` / `--output-format json` は固定、`--session-id` / `--resume` とセッション id、`--` 以降の prompt は呼び出しごとに変わるため、`args` の後ろに `claude.ts` が付ける。**設定の args と実行時の args の境界を `claude.ts` のコメントに1行で書く**

- [x] 10.13g ADR 0001 の制約の検査先を移す。現在は `claude-config.ts` の zod が `settingSources` / `addDir` を個別に検証しているが、args が配列1本になると個別の検証ができない。**`args` の中に `--setting-sources project` が含まれることを検査する**形に置き換える（ADR 0001: project を外すとスキルが一切ロードされない）

### 環境変数参照を置き場2件だけに絞る

**`.env` で差し替えられるのは `NUXT_SESSIONS_ROOT` と `NUXT_PROJECTS_ROOT` の2件だけにする。** 置き場は動かす機械ごとに変わるので外に出す。それ以外の `NUXT_*` は全廃し、値の出どころは `settings.ts`（固定値）と `nuxt.config.ts`（`runtimeConfig` / `runtimeConfig.public`）だけにする。決定2（既定値はモジュールに置き `NUXT_*` で上書きする）を、この2件に限った規則へ狭める。

- [x] 10.13h 置き場2件（`NUXT_SESSIONS_ROOT` / `NUXT_PROJECTS_ROOT`）**以外**の `NUXT_*` 参照を全て廃す。10.13a〜10.13e・10.13l・10.13m で扱った分の外に残るのは以下。消し漏れは実装時に `grep -rn "process\.env" server` で機械的に確かめる

  | モジュール | 環境変数 |
  |---|---|
  | `claude-config.ts`（`runtimeConfig` 経由） | `NUXT_CLAUDE_API_BASE_URL` / `NUXT_CLAUDE_WORKFLOW_SCHEMA` / `NUXT_CLAUDE_FIRST_PROMPT` / `NUXT_CLAUDE_CONTINUE_PROMPT` |
  | `openspec.ts` | `NUXT_OPENSPEC_BIN` / `NUXT_OPENSPEC_INIT_ARGS` |
  | `ws-channels.ts` | `NUXT_WS_PATH_PATTERN` |

  `project.ts` / `claude.ts` / `ai.ts` の分は 10.13l・10.13m が固定値として引き取る

- [x] 10.13i `intFromEnv()` を全て削り、`fromEnv()` は置き場2件の分だけ残す。**`server/` に残る `process.env` の読み取りは `settings.ts` の2箇所だけ**になった（`claude.ts:56` の `process.env` は子プロセスへの環境の引き継ぎであって、設定の読み取りではない）

- [x] 10.13c 起動時チェックの検証を減らす。`describe*Error()` 8本のうち `describePathsError()` を残し、残り7本と `server/plugins/00.startup-checks.ts` の該当呼び出しを削る。**ただし 10.13g の `describeClaudeArgsError()` が加わるので、最終的に残るのは2本**（置き場の検査と ADR 0001 の検査）。起動時チェックは「書き込み検査＋この2本」の3つになる。環境変数から値が入る経路が置き場だけになれば、検査する対象もそこだけになる。7.1〜7.3 と 10.11 の判断はこれで覆る

- [x] 10.13j `.env.example` を置き場2件だけに絞る。他の項目は読まれないので並べない。8.1 の判断はこの範囲に狭まる

- [x] 10.13k `yarn session` の `--env-file-if-exists=.env` は**残す**。CLI も置き場2件を `.env` から読む必要がある（8.2 はそのまま有効）

### `runtimeConfig`

- [x] 10.14 `nuxt.config.ts` の `runtimeConfig` に、外部設定化する全項目を `settings.ts` から import して宣言する。**資料の10項目と一致**（置き場2 / `claude` 4 / `openspec` 2 / `wsPathPattern` 1、＋ `public.claude` の起動定義）
- [x] 10.15 endpoint 側の読み口を `useRuntimeConfig()` に揃える。**置き場2件だけは例外。** 読み手が CLI と共通なので `settings.ts` の解決関数を通る（どちらも `NUXT_SESSIONS_ROOT` を見るので値は一致する）

### 一覧と検証

- [x] 10.16 `grep -rn "NUXT_" .` で、残っている `NUXT_*` が `NUXT_SESSIONS_ROOT` / `NUXT_PROJECTS_ROOT` の2件だけであることを確認する

  **確認した。** コードで `NUXT_*` を読むのは `settings.ts` の置き場2件のみ。他のヒットは `nuxt.config.ts` / `README.md` / `docs/settings-reference.md` / ADR 0003・0004 の**記述**で、いずれも同じ2件を指す。`server` / `scripts` の `process.env` は `settings.ts` の2箇所と、`claude.ts:56` の子プロセスへの環境引き継ぎだけ

- [x] 10.17 **全項目について、値が実際に届くことを1件ずつ確認する。** 結果を証拠として記録する

  **実測**: 既定値で dev 起動 → 起動時チェック無警告。`POST /api/strokes` 200 でセッションに `overview.txt` / `state.json` / `strokes.json` が生成（固定ファイル名が効いている）。`GET .../overview` 200。WS `question` 接続が維持（`runtimeConfig.wsPathPattern` が効いている）。`NUXT_SESSIONS_ROOT=<一時dir>` を与えると `yarn session create` がその置き場に生成する。ADR 0001 の検査は、`args` から `--setting-sources project` を一時的に外すと `process.exit(1)` することを実測し、元に戻して正常起動を再確認

- [x] 10.18 CLI 経路（`yarn session`）でも同じ値に解決されることを確認する

  **実測**: `create` の出力 URL は `http://127.0.0.1:3001/...`（固定の `apiBaseUrl`）。**HTTP で作ったセッションを `yarn session delete` が同じ置き場で消せる**ことを確認し、経路をまたいで同値であることが取れた

- [x] 10.19 `docs/settings-reference.md` を実態に合わせて完成させる。**ADR 0004 により、この資料が設定の正である。** コードを先に変えて資料を後から合わせるのではなく、資料に載っていない設定をコードが持たない状態にする

  **資料を先に確定させ、実装をそこへ合わせた。** 資料に載っていて実装が持っていない設定、実装が読んでいて資料に無い設定、ともにゼロ
- [x] 10.20 `docs/adr/0003-settings-precedence.md` の扱いを決める。**supersede とする。** 環境変数が置き場2件に限られ「優先順位」を設定の一般則として置けなくなったため、書き換えず記録として残す。**新方針の ADR（0004）を立てるのは `document-settings-reference` の役目**（同 change の tasks 1章）。ここでは 0003 の扱いを決めるところまで
- [x] 10.21 `yarn check` が通ることを確認する

  **`yarn typecheck` は 0 エラー。** `yarn check` 全体は失敗するが、原因は `connect-portal-and-strokes` の specs が未作成であることで、この change の変更とは無関係な既存の状態である（`openspec validate --all` は 17 passed / 1 failed。`align-settings-conventions` と `document-settings-reference` はともに passed）。9.6 と同じ状況が続いている

## 11. 完了

- [ ] 11.1 変更を1つの commit にまとめる
