import {
  DEFAULT_API_BASE_URL,
  DEFAULT_CLAUDE_COMMAND,
  DEFAULT_CONTINUE_PROMPT,
  DEFAULT_FIRST_PROMPT,
  DEFAULT_OPENSPEC_BIN,
  DEFAULT_OPENSPEC_INIT_ARGS,
  DEFAULT_PROJECTS_ROOT,
  DEFAULT_SESSIONS_ROOT,
  DEFAULT_WORKFLOW_SCHEMA,
  DEFAULT_WS_PATH_PATTERN,
  defaultClaudeArgs,
} from './server/utils/stroke/settings'

export default defineNuxtConfig({
  // ===========================================================================
  // ビルド時に決まる設定
  //
  // ビルドがこれらを消費して出力を作るため、`runtimeConfig` に置けない。環境変数を
  // 与えても動作は変わらず、変えるにはアプリを作り直す必要がある（specs/configuration）。
  // 「これも外に出せるのでは」と再検討しないこと。
  // ===========================================================================

  // ビルド時: モジュールの解決とプラグインの生成がビルドで行われる
  modules: ['@nuxt/ui'],

  // ビルド時: CSS はバンドルに畳み込まれる
  // main.css はアプリ全体、stroke.css はストローク側の画面だけ（docs/structure.md）
  css: ['~/assets/css/main.css', '~/assets/css/stroke.css'],

  // ビルド時: DevTools はビルドに組み込まれる。
  // 環境ごとに切り替えたい値だが、切り替えるにはビルドを分けるしかない
  devtools: { enabled: false },

  // ビルド時: 走査対象の除外はビルドの入力を決める。
  // 使い捨てのプロトタイプは本体のビルドに巻き込まない
  ignore: ['.prototype/**'],

  nitro: {
    experimental: {
      // ビルド時: WebSocket のサポートはサーバのビルドに組み込まれる。
      // W1・W2（agent-api の WS 配信）に要る
      websocket: true,
    },
  },

  // ===========================================================================
  // 実行時に決まる設定
  //
  // 値の中身はここに書かず、`server/utils/stroke/settings.ts` を import して宣言する。
  // 設定の正は docs/settings-reference.md（ADR 0004）で、そこに無いものは設定ではない。
  //
  // **差し替えられるのは置き場の2件だけ**である（`NUXT_SESSIONS_ROOT` /
  // `NUXT_PROJECTS_ROOT`）。動かす機械ごとに変わるためで、それ以外はここに書かれた値だけを
  // 使う。読み手が endpoint と CLI（`yarn session`、Nitro の外）に分かれる値は、
  // `useRuntimeConfig()` を使えない CLI のために `settings.ts` の解決関数を通る。
  // ===========================================================================

  runtimeConfig: {
    // 置き場。`NUXT_SESSIONS_ROOT` / `NUXT_PROJECTS_ROOT` で差し替えられる
    sessionsRoot: DEFAULT_SESSIONS_ROOT,
    projectsRoot: DEFAULT_PROJECTS_ROOT,

    // AI（claude -p）の呼び出しの中で使う値。起動定義そのものは public 側にある
    claude: {
      // エージェント向け endpoint の base URL。spawn 時に環境変数 STROKE_BASEURL として
      // 渡し、セッション API スキルがそこから接続先を解決する（prompt には載せない）
      apiBaseUrl: DEFAULT_API_BASE_URL,
      // セッションの openspec/config.yaml に書くワークフロースキーマ名。実体は
      // user レベル（~/.local/share/openspec/schemas/）に配置されたものが解決される
      workflowSchema: DEFAULT_WORKFLOW_SCHEMA,
      // AI へ渡す定型。本文をコードに持たない（specs/ai-invocation）。初回はスキル起動＋
      // 最低限の固定指示、継続は続きを促すだけ（入力は prompt に載せず、エージェントが
      // 取得スキルで読む）
      firstPrompt: DEFAULT_FIRST_PROMPT,
      continuePrompt: DEFAULT_CONTINUE_PROMPT,
    },

    // セッションの openspec ルートを初期化する CLI とその引数
    openspec: {
      bin: DEFAULT_OPENSPEC_BIN,
      initArgs: DEFAULT_OPENSPEC_INIT_ARGS,
    },

    // WS の URL からセッション id を抜くパターン。`{channel}` がチャネル名に置き換わる
    wsPathPattern: DEFAULT_WS_PATH_PATTERN,

    public: {
      // `claude` の起動定義。`.mcp.json` の記述形式に倣い、command と args のひとかたまりで
      // 持つ（docs/settings-reference.md）。`-p` / `--output-format json` と、
      // `--session-id` / `--resume` とセッション id、`--` 以降の prompt は呼び出しごとに
      // 決まるので、ここには入れず claude.ts が args の後ろに付ける。
      // `--add-dir` に渡す置き場はどちらもこのリポジトリの中にあるので、直書きせず
      // ルートから導く（nuxt.config.ts はリポジトリルートに在る）
      claude: {
        command: DEFAULT_CLAUDE_COMMAND,
        args: defaultClaudeArgs(import.meta.dirname),
      },
    },
  },
})
