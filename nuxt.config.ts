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
      addDir: '/home/vagrant/work/stroke-board/mvp',
      // AI に許すツール。取得・提出は endpoint への HTTP 発行（Bash で curl）で行う。
      // proposal.md 等はサーバが書くため、Write / Edit はもう要らない（decisions.md 保留事項の決定）。
      // 空白区切り。NUXT_CLAUDE_ALLOWED_TOOLS で上書きできる。
      allowedTools: 'Bash',
      // 子プロセスのタイムアウト。超えたらリトライ経路へ流す。
      // 起動後この時間内に endpoint への提出が無ければ、その呼び出しは失敗として扱う
      // （specs/ai-invocation）。
      timeoutMs: 180000,
      // `claude -p --model`。NUXT_CLAUDE_MODEL で上書きできる。
      model: 'fable',
      // エージェント向け endpoint の base URL。prompt に埋め込む取得先・提出先の1点。
      // NUXT_CLAUDE_API_BASE_URL で上書きできる（dev サーバーは 3001 固定）。
      apiBaseUrl: 'http://127.0.0.1:3001',
    },
  },
})
