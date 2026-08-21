import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  compatibilityDate: '2026-08-21',

  // Nitro サーバーが本家 spec-workflow-mcp への接続を持つため SSR を有効にする。
  // ブラウザは stroke-board のサーバーとだけ話す（structure.md の Module Boundaries）。
  ssr: true,

  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  // auto-import を使わない。composable / util は `#imports` から明示的に import する。
  // components.dirs を空にしてもモジュール（@nuxt/ui）が登録するコンポーネントは
  // 止まらない。これは Nuxt の仕様であり、規約の例外として受け入れる。
  imports: { autoImport: false },
  components: { dirs: [] },

  // 既定はダークテーマ。本家の ThemeProvider の初期値が 'dark' である（ui.md の Visual Language）
  colorMode: { preference: 'dark', fallback: 'dark' },

  typescript: { typeCheck: false, strict: true },

  runtimeConfig: {
    // 本家ダッシュボードの URL と監視する親パス。値は環境変数から入る。
    // NUXT_UPSTREAM_BASE_URL / NUXT_PROJECTS_PARENT_PATH
    upstreamBaseUrl: '',
    projectsParentPath: '',
  },
});
