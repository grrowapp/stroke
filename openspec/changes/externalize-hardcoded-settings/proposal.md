# externalize-hardcoded-settings

## Why

サーバ側を全数洗い出したところ、**運用で変えたくなるのに再ビルドしないと変えられない値が 62 箇所**あった。うち明示的な定数は 31、残りはインラインのマジックナンバーと文字列である。

外出しされているのは `runtimeConfig.claude` の8つだけで、そこから漏れたものが実害を出している。

- **合わないとアプリが起動しない。** `SESSIONS_ROOT = '/var/lib/stroke-board/sessions'` と `PROJECTS_ROOT = '/opt/projects'` は起動時チェックが書き込み権限を必須にし、満たさなければ `process.exit(1)` で即死する。開発機・コンテナ・別ボリュームのいずれでも真っ先に変えたくなる値が、再ビルドでしか変えられない
- **AI の成功率に直結する。** 問いの閾値（`QUESTION_MAX = 20` など）を超えた提出は 400 で弾かれ、提出が届かないままリトライ経路へ落ちる。超過が続けば試行を使い切って `invocation: failed` に至る。最も頻繁に微調整したい値が固定されている
- **総待ち時間を制御できない。** `MAX_RETRIES = 2` はコード自身が「MVP の割り切りで設定値にしない」と書いている意図的な負債。`timeoutMs` だけ外出しされているため、最悪 3 試行 × 180 秒でセッションが約9分ふさがるのに、運用者はその長さを決められない
- **同じ値が2箇所に直書きされている。** プロジェクト名の上限 100 が `request-schemas.ts` と `session-store.ts` に別々にあり、片方だけ変えると「受理できるが読み戻せない」状態になる。ポート 3001 も `package.json` と `apiBaseUrl` の二重管理で、片方だけ変えるとエージェントだけが古い接続先を掴む

## What Changes

- **設定値をコードに直書きしない。** 洗い出した全件を `runtimeConfig` へ出し、環境変数で実行時に差し替えられるようにする。再ビルドを要さない。対象は絶対パス、閾値、リトライ回数、ファイル名、prompt の文言、実行するバイナリ名とフラグ、CLI 出力の判定に使う値、正規表現、ログのプレフィックスまで含む
- **同じ値の二重定義をなくす。** 出どころを1つにし、参照側はそこを読む
- **外に出した値は起動時に検証する。** 直書きをやめる以上、誤った値が入る経路が増える。形をなしていない値で走り出さず、起動の時点で落とす（既存の `claude` 設定と同じ扱い）。検証は値の形だけでなく、外部インターフェースとの整合が壊れると分かるものについては、それが分かる形で行う

外に出す単位（1つの平たい設定にするか、`claude` のように意味ごとに束ねるか）と、各値の検証規則は design で確定する。

## Capabilities

### New Capabilities

- `runtime-configuration`: 設定値はコードに直書きせず、再ビルドなしに差し替えられ、差し替えられた値は起動の時点で検証される、という規定

### Modified Capabilities

- `ai-invocation`: 既存の「起動設定は再ビルドなしで変更できる」は AI の起動フラグだけを対象にしている。同じ性質の規定が `runtime-configuration` に一般形で入るため、重複しないよう対象を整理する

## Impact

- `nuxt.config.ts` — `runtimeConfig` の追加
- `server/utils/paths.ts` — `SESSIONS_ROOT` / `PROJECTS_ROOT`
- `server/utils/ai.ts` — `MAX_RETRIES`
- `server/utils/question.ts` — 問いの構造の閾値6件
- `server/utils/request-schemas.ts` — リクエストの閾値17件、および `session-store.ts` との二重定義の解消
- `server/utils/session-store.ts` — セッション内のファイル名
- `server/utils/project.ts` — 生成先のディレクトリ名・ファイル名、名前規則
- `server/utils/claude.ts` — 実行バイナリ名、フラグ、子プロセスへ渡す環境変数名、タイムアウト時のシグナル、CLI の出力とメッセージの判定に使う値
- `server/utils/openspec.ts` — `openspec` のバイナリ名とサブコマンド
- `server/utils/prompt.ts` — prompt の固定文言2本
- `server/routes/api/[id]/ws/*.ts` — セッション id を抜く正規表現
- `server/utils/running.ts` — セッションあたりの同時実行数
- `server/plugins/00.startup-checks.ts` — 追加した設定の検証、要求するパーミッション、チェック失敗時の振る舞い
- 各所のログのプレフィックス
- `package.json` — ポートの二重管理の解消
- `README.md` / `docs/session-workflow.md` — 設定できる値の記載

**前提**: `remove-store-dependency` を先に済ませること。`storeId` が廃止され、セッションディレクトリの位置も確定するため、先に進めると `paths.ts` と `claude-config.ts` を二度書くことになる。

**この change に含めないもの**: 洗い出しで見つかった、設定値ではない不具合。プロジェクト名の連番採番が上限のない無限ループであること、コメントが実在しないファイル名を指していること。どちらも `docs/known-issues.md` に記録し、別の change で扱う。

なお、WS の URL からセッション id を抜く正規表現は設定値として外へ出すため、リバースプロキシでサブパス配信したときに接続が無言で閉じる問題は、この change の範囲で解ける。
