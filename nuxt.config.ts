import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  compatibilityDate: '2026-08-21',

  // Nitro サーバーが本家 spec-workflow-mcp への接続を持つため SSR を有効にする。
  // ブラウザは stroke-board のサーバーとだけ話す（structure.md の Module Boundaries）。
  ssr: true,

  modules: ['@nuxt/ui'],

  // ブラウザへの通知配信に使う。本家 WebSocket に繋ぐのは Nitro だけで、ブラウザは繋がない
  nitro: { experimental: { websocket: true } },

  css: ['~/assets/css/main.css'],

  // auto-import を使わない。composable / util は `#imports` から明示的に import する。
  // components.dirs を空にしてもモジュール（@nuxt/ui）が登録するコンポーネントは
  // 止まらない。これは Nuxt の仕様であり、規約の例外として受け入れる。
  imports: { autoImport: false },
  components: { dirs: [] },

  // 既定はダークテーマ。本家の ThemeProvider の初期値が 'dark' である（ui.md の Visual Language）
  colorMode: { preference: 'dark', fallback: 'dark' },

  typescript: { typeCheck: false, strict: true },

  // DevTools は画面の上に自前のバーとボタンを重ねる。本家にも prototype にも無いものなので、
  // 見た目を突き合わせる邪魔になる。切っておく
  devtools: { enabled: false },

  // 起動の待ち受け。3000 はこのマシンで別のプロセスが使っているのでずらしてある。
  // 別マシンのブラウザから開くため、localhost ではなく全インタフェースで待つ
  devServer: { host: '0.0.0.0', port: 3100 },

  runtimeConfig: {
    // 本家に触るために要る3つ。読み方は server/utils/config.ts に閉じる。
    upstreamBaseUrl: 'http://127.0.0.1:5000',
    projectsParentPath: '/opt/projects',
    specWorkflowHome: '/opt/projects/.spec-workflow-mcp',

    // アクティブ集合を見直す間隔（ミリ秒）
    syncIntervalMs: '30000',
  },
});
