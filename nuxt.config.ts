import { DEFAULT_API_BASE_URL } from './server/utils/api-base-url'

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },

  // 使い捨てのプロトタイプは本体のビルドに巻き込まない
  ignore: ['.prototype/**'],

  nitro: {
    experimental: {
      // W1・W2（agent-api の WS 配信）に要る。
      websocket: true,
    },
  },

  runtimeConfig: {
    // AI（claude -p）の起動設定。再ビルドなしで差し替えられるよう runtimeConfig に置く。
    // NUXT_CLAUDE_SETTING_SOURCES / NUXT_CLAUDE_ADD_DIR / NUXT_CLAUDE_TIMEOUT_MS で上書きできる。
    claude: {
      // ADR 0001: `--setting-sources` から `project` を外すとスキルが一切ロードされない。
      // grilling と domain-modeling は --add-dir 配下の .claude/skills/ から読まれるため、
      // ここから project を外してはならない。user を含めないのは、開発者個人の設定
      // (~/.claude/CLAUDE.md) をエンドユーザーのセッションへ持ち込まないため。
      settingSources: 'project',
      // ADR 0001: 渡すのはリポジトリのルート。.claude や skills をパスに含めない。
      // 空白区切りで複数渡せる。1つ目が grilling / domain-modeling と opsx コマンドの置き場、
      // 2つ目がセッション API スキル（assets/.claude/skills/）の置き場。
      // どちらもこのリポジトリの中にあるので、置き場所を直書きせずルートから導く
      // （nuxt.config.ts はリポジトリルートに在る）。NUXT_CLAUDE_ADD_DIR で上書きできる。
      addDir: `${import.meta.dirname} ${import.meta.dirname}/assets`,
      // AI に許すツール。取得・提出は endpoint への HTTP 発行（Bash で curl）で行う。
      // proposal.md / stroke.md は store 上の change へ AI 自身が書き、提出はファイルパスで
      // 渡す（design.md 決定7）ため Write / Read が要る。
      // 空白区切り。NUXT_CLAUDE_ALLOWED_TOOLS で上書きできる。
      allowedTools: 'Bash Read Write Edit',
      // 子プロセスのタイムアウト。超えたらリトライ経路へ流す。
      // 起動後この時間内に endpoint への提出が無ければ、その呼び出しは失敗として扱う
      // （specs/ai-invocation）。
      timeoutMs: 180000,
      // `claude -p --model`。NUXT_CLAUDE_MODEL で上書きできる。
      model: 'fable',
      // エージェント向け endpoint の base URL。spawn 時に環境変数 STROKE_BASEURL として
      // 渡し、セッション API スキルがそこから接続先を解決する（prompt には載せない）。
      // NUXT_CLAUDE_API_BASE_URL で上書きできる（dev サーバーは 3001 固定）。
      // 既定値の出どころは server/utils/api-base-url.ts（script と共有）。
      apiBaseUrl: DEFAULT_API_BASE_URL,
      // セッションの openspec/config.yaml に書くワークフロースキーマ名。実体は
      // user レベル（~/.local/share/openspec/schemas/）に配置されたものが解決される。
      // NUXT_CLAUDE_WORKFLOW_SCHEMA で上書きできる。
      workflowSchema: 'flontier-strokeflow',
      // AI へ渡す定型。本文をコードに持たない（specs/ai-invocation: 定型は設定値として
      // 外に出す）。初回はスキル起動＋最低限の固定指示、継続は続きを促すだけ（入力は
      // prompt に載せず、エージェントが取得スキルで読む）。
      // NUXT_CLAUDE_FIRST_PROMPT / NUXT_CLAUDE_CONTINUE_PROMPT で上書きできる。
      firstPrompt: '/openspec-ff-change draft-proposal\n\nスキルの指示に従って作業を実施する。',
      continuePrompt: '続きを進めろ。状況は取得スキルで確認してから判断しろ。',
    },
  },
})
