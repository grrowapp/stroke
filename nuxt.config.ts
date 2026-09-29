import { defineNuxtConfig } from 'nuxt/config';

import { sbIcons, upstreamIcons } from './app/assets/icons';
import { recordDevListenAddress } from './server/utils/stroke/listen-address';

const SETTING_SOURCES_REQUIRED = 'project';

export default defineNuxtConfig({
  compatibilityDate: '2026-08-21',

  // [agent decision] Nitro が本家への接続を持つので SSR を有効にする
  ssr: true,

  // markdown は `modules/markdown/` が自分で `@nuxtjs/mdc` を登録する。
  //
  // **`@nuxt/ui` より前に並べること。** `modules/` ディレクトリの自動読み込みに任せると
  // 後回しになり、`@nuxt/ui` の setup 時点で `hasNuxtModule('@nuxtjs/mdc')` が偽になって
  // Prose 一式が登録されない（`@nuxt/ui/dist/module.mjs:121`）。切り出し後は package 名
  // `markxdown` がこの位置に並ぶので、これが最終形と同じ並びになる。
  modules: ['./modules/markdown', '@nuxt/ui', '@nuxtjs/mcp-toolkit', 'nuxt-authorization'],

  // [agent decision] inline SVG で描く。パスが DOM に出るので prototype / 本家との一致をテストで比較できる
  icon: {
    mode: 'svg',
    customCollections: [sbIcons, upstreamIcons],
  },

  // [agent decision] スタイルは main.css の1本。区画の分け方はそのファイルのコメント
  css: ['~/assets/css/main.css'],

  // [agent decision] DevTools のバーが見た目の比較の邪魔になるので切る
  devtools: { enabled: false },

  // [agent decision] 使い捨ての prototype をビルドに巻き込まない
  ignore: ['.prototype/**'],

  // [agent decision] ブラウザ通知と agent-api の WS 配信に要る。本家の WebSocket に繋ぐのは Nitro だけ
  nitro: { experimental: { websocket: true } },

  // [agent decision] auto-import はポータル側では廃止（明示 import）だが、ストローク側が依存しているので有効のまま

  // [agent decision] 本家の ThemeProvider の初期値に合わせてダーク
  colorMode: { preference: 'dark', fallback: 'dark' },

  typescript: { typeCheck: false, strict: true },

  // [agent decision] `--port` 無しで起動したときの既定。`yarn dev` は `package.json` の `--port` で上書きする。
  // 実際に listen したアドレスは `listen-address.ts` が記録し、MCP の url はそこから組み立てる。
  // 別マシンのブラウザから開くため全インタフェースで listen する
  devServer: { host: '0.0.0.0', port: 3599 },

  hooks: {
    // dev でしか呼ばれない。ビルド済みの出力はこのファイルを読まない
    listen(server) {
      recordDevListenAddress(server);
    },
  },

  runtimeConfig: {
    // [agent decision] セッションとプロジェクトの共通の親。承認はこの下でのディレクトリ改名で昇格し、一覧はこの直下を
    // 走査する。2つの設定に分けると、食い違ったときに昇格したプロジェクトが一覧から消える
    projectShareRoot: '/opt/projects',

    // 本家に触るための2つ。読み方は server/utils/config.ts
    upstreamBaseUrl: 'http://192.168.1.204:5000',
    specWorkflowHome: '/opt/projects/.spec-workflow-mcp',

    // アクティブ集合を見直す間隔（ミリ秒）
    syncIntervalMs: '30000',

    // [agent decision] AI（claude -p）の起動定義。画面は読まないのでサーバー専用
    claude: {
      // [agent decision] 分解済みの配列で持つ（空白区切りの文字列を後から分割しない）。
      //
      // `--add-dir` は渡さない。cwd だけでよく、リポジトリのルートを渡すと他セッションのログと
      // 開発者の settings / plugin がエンドユーザーの実行へ届く。`--setting-sources` に user を
      // 含めないのも同じ理由。cwd に `.claude/` は無いのでロードされるスキルは0本。
      //
      // `-p` / `--output-format` / `--session-id` / `--resume` / `--mcp-config` / MCP ツール分の
      // `--allowedTools` / prompt は呼び出しごとに決まるので、呼び出し側が後ろに足す
      // （`server/utils/stroke/invoke.ts`・`server/utils/mcp/allowed-tools.ts`）
      command: 'claude',
      args: [
        '--setting-sources', SETTING_SOURCES_REQUIRED,
        '--model', 'sonnet',
        // [agent decision] 取得・提出は MCP ツールだけが担う。`Write` / `Edit` / curl / jq は渡さない。
        // `Read` は steering 工程に文脈を取る MCP ツールが無いので残す
        '--allowedTools', 'Skill Bash(openspec *) Read',
        '--disallowedTools', 'Bash(cd *)',
        // [agent decision] `--mcp-config` は追加であって限定ではない。これが無いと開発者個人の MCP 設定が全部載る
        '--strict-mcp-config',
      ],

      // セッションの openspec/config.yaml に書くスキーマ名。実体は ~/.local/share/openspec/schemas/
      workflowSchema: 'flontier-strokeflow',

      // [agent decision] 手順の本文は prompt に書かず、MCP ツール（get-guide / get-steering-guide）が返す。
      // 2箇所に持つと片方だけが古くなる
      firstPrompt: 'stroke-board の MCP ツール get-guide で進め方を読み、そのとおりに作業しろ。',
      continuePrompt: '続きを進めろ。stroke-board の MCP ツール get-guide で進め方を読み直し、状況を確認してから判断しろ。',

      // 昇格直後に steering 文書を作らせる定型。cwd は昇格先のプロジェクト
      steeringPrompt: 'stroke-board の MCP ツール get-steering-guide で進め方を読み、そのとおりに steering 文書を作成しろ。',

      // 失敗した実行を再起動する回数の上限。超えたら起動せず invocation を error にする
      maxRetries: 2,

      // [agent decision] 1回の起動のタイムアウト = timeoutMs + timeoutStepMs × これまでの再起動回数。
      // 3分は実測から（MCP ツール化後は1回 30〜65 秒）。timeoutStepMs の 0 は「伸ばさない」
      timeoutMs: 180000,
      timeoutStepMs: 0,

      // [agent decision] 呼び出しの生出力（stream-json）をセッションごとに追記するディレクトリ。空なら書かない（既定）。
      // 概要・問い・proposal の全文がローテーション無しで溜まるので、調査が終わったら空へ戻す。
      // 空のあいだ `yarn check:stroke` は実行の終了を数えられず固定の待ちに落ちる
      debugLogDir: '',
    },

    // セッションの openspec ルートを初期化する CLI とその引数
    openspec: {
      bin: 'openspec',
      initArgs: 'init --tools none',
    },

    // WS の URL からセッション id を抜くパターン。`{channel}` はチャネル名に置き換わる。
    // サブパスで配信する構成にするときはここを合わせる
    wsPathPattern: '/api/sessions/([^/]+)/ws/{channel}(?:$|[/?#])',

    // 利用者の判定（docs/specs/core/settings-reference.md「access」）。読むのは server/utils/access/config.ts の1本
    access: {
      // Cloudflare Access の team domain。token の公開鍵（/cdn-cgi/access/certs）と iss はここから作る
      teamDomain: 'royal-frost-b225.cloudflareaccess.com',
      // Access application（stroke-mc-tool。対象は stroke.grrow.app と mc-tool.geekport.jp）の AUD tag。
      // 空のあいだは token を検証できないので、token を持つリクエストは利用者なしになる
      aud: '9fc18f5d8a25fc21596ff34ad0366d85ee7ef5acb3dbc2405f44ef5171ac474d',
      // 管理者の初期値。画面で編集したものは access.json に置き、これと合わせて判定する
      admins: {
        emails: [] as string[],
        // token が無い接続を管理者として通す接続元（CIDR）。Tailscale は 100.64.0.0/10
        networks: ['127.0.0.1/32', '::1/128', '192.168.1.0/24', '100.64.0.0/10'],
        // token が無い接続を管理者として通すホスト名（port を除いた形）
        hosts: [] as string[],
      },
    },
  },
});
