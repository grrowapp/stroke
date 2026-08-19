export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },

  // 使い捨てのプロトタイプは本体のビルドに巻き込まない
  ignore: ['.prototype/**'],

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
      // AI に許すツール。把握完了時に proposal.md を書かせるため編集系を渡す。
      // 空白区切り。NUXT_CLAUDE_ALLOWED_TOOLS で上書きできる。
      allowedTools: 'Write Edit',
      // 子プロセスのタイムアウト。超えたらリトライ経路へ流す。
      timeoutMs: 180000,
      // `claude -p --model`。NUXT_CLAUDE_MODEL で上書きできる。
      model: 'fable',
    },
  },
})
