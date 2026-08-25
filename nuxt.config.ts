import { defineNuxtConfig } from 'nuxt/config';

import { sbIcons, upstreamIcons } from './app/assets/icons';

/** ADR 0001: ここを外すとスキルが一切ロードされない。 */
const SETTING_SOURCES_REQUIRED = 'project';

export default defineNuxtConfig({
  compatibilityDate: '2026-08-21',

  // Nitro サーバーが本家 spec-workflow-mcp への接続を持つため SSR を有効にする。
  // ブラウザは stroke-board のサーバーとだけ話す（structure.md の Module Boundaries）。
  ssr: true,

  // ===========================================================================
  // ビルド時に決まる設定
  //
  // ビルドがこれらを消費して出力を作るため、`runtimeConfig` に置けない。環境変数を
  // 与えても動作は変わらず、変えるにはアプリを作り直す必要がある（specs/configuration）。
  // 「これも外に出せるのでは」と再検討しないこと。
  // ===========================================================================

  // ビルド時: モジュールの解決とプラグインの生成がビルドで行われる
  modules: ['@nuxt/ui', '@nuxtjs/mdc'],

  // ビルド時: markdown の parse 設定はビルドで畳み込まれる。
  mdc: {
    // 既定では h2〜h4 に自動でアンカーリンクが付き、本家の文書表示と別物になるので切る
    // （docs/specs/plan/components-library-replacement.md）
    headings: { anchorLinks: false },

    // **生 HTML は描かない。** MDC の既定サニタイズは属性しか落とさず、`<img>` や
    // `<script>` はタグとして残る。`rehype-raw` を切ると生 HTML が要素にならず、
    // 文書側の HTML が描かれる経路そのものが無くなる。
    // stroke-board は本家のファイルを読んで出すだけで、文書の中身を信用して実行する
    // 立場にない。
    rehypePlugins: { 'rehype-raw': false },

    // Prose コンポーネントを使わず素のタグで描く。
    // `@nuxtjs/mdc` を入れると @nuxt/ui が自前の Prose 一式（ProseTable / ProseTh …）を
    // 自動登録し（`hasNuxtModule` 判定なので `ui.prose: false` では止まらない）、
    // Tailwind クラスを直付けする。クラスは `.sb-markdown` の指定に勝つため、
    // 本家写しの見た目（docs/specs/core）が丸ごと効かなくなる。
    //
    // そのうえで `pre` だけ自前の受け口に差し替える。本家は mermaid のフェンスを図（SVG）に
    // しているが、shiki は生ソースのコードブロックにしてしまう。`MarkdownPre` が
    // `language` を見て mermaid だけ図へ回し、それ以外の `pre` は属性ごと素通しする。
    // 値は `resolveComponent()` で引かれるので、対象は `app/components/global/` に置く
    // （そこに置いたものだけが `app.component()` で登録される）。
    //
    // `prose` は上のとおり切ったままにする。Prose を戻すと `.sb-markdown` が効かなくなる。
    components: { prose: false, map: { pre: 'MarkdownPre' } },
  },

  // ビルド時: アイコンはバンドルに畳み込まれる。
  // `mode: 'svg'` は CSS mask ではなく inline SVG で描く指定。パスが DOM に出るので、
  // prototype / 本家と絵が同じであることをテストで突き合わせられる（既定は 'css'）。
  icon: {
    mode: 'svg',
    customCollections: [sbIcons, upstreamIcons],
  },

  // ビルド時: CSS はバンドルに畳み込まれる
  // main.css はアプリ全体、stroke.css はストローク側の画面だけ（docs/specs/core/system-structure.md）
  css: ['~/assets/css/main.css', '~/assets/css/stroke.css'],

  // ビルド時: DevTools はビルドに組み込まれる。画面の上に自前のバーとボタンを重ね、
  // 見た目を突き合わせる邪魔になるので切っておく
  devtools: { enabled: false },

  // ビルド時: 走査対象の除外はビルドの入力を決める。
  // 使い捨てのプロトタイプは本体のビルドに巻き込まない
  ignore: ['.prototype/**'],

  // ビルド時: WebSocket のサポートはサーバのビルドに組み込まれる。
  // ポータルのブラウザ通知配信と、ストロークの agent-api WS 配信（W1・W2）に要る。
  // 本家 WebSocket に繋ぐのは Nitro だけで、ブラウザは繋がない
  nitro: { experimental: { websocket: true } },

  // auto-import はポータル側の規約では廃止（明示 import）だが、ストローク側のコードが
  // まだ依存しているため当面は有効のまま。廃止への統一は align-coding-conventions で行う。
  // ポータル側の明示 import は auto-import が有効でもそのまま動く

  // 既定はダークテーマ。本家の ThemeProvider の初期値が 'dark' である（ui.md の Visual Language）
  colorMode: { preference: 'dark', fallback: 'dark' },

  typescript: { typeCheck: false, strict: true },

  // 起動の待ち受け。3000 はこのマシンで別のプロセスが使っているのでずらしてある。
  // 3001 はストロークの `claude.apiBaseUrl` と揃える値。
  // 別マシンのブラウザから開くため、localhost ではなく全インタフェースで待つ
  devServer: { host: '0.0.0.0', port: 3001 },

  // ===========================================================================
  // 実行時に決まる設定
  //
  // 設定の正は docs/specs/core/settings-reference.md（ADR 0004）で、そこに無いものは
  // 設定ではない。ストローク側の値の実体はこのファイルにだけ在り、**環境変数からは
  // 読まない**。既定値を並べた別モジュールも作らない（出どころが2箇所に割れるため）。
  //
  // 読み手は endpoint が `useRuntimeConfig()`、CLI（`yarn session`、Nitro の外）は
  // このファイルを直接 import する。環境変数を見ないので両者は同じ値になる。
  // 共有のモジュール（session-core / paths / claude など）は設定を引かず、
  // 端で解決した値を引数で受け取る。
  //
  // ポータル側の4件（upstream〜syncIntervalMs）はこの流儀に未統合で、環境変数で
  // 差し替えられる（README の「設定（ポータル側）」）。一本化は別 change で行う
  // ===========================================================================

  runtimeConfig: {
    // --- セッションとプロジェクトの共通の親。ポータルとストロークが共有する1つの場所。
    //
    // ストローク: 承認はこの下でのディレクトリ改名だけで昇格を行うので、セッションと
    // プロジェクトが同じ親に居ることが前提になる。
    // ポータル: 一覧はここの直下1階層を走査し、`.spec-workflow/` を持つものを拾う。
    //
    // 昇格したプロジェクトが一覧に現れるのは、両者がこの1つの値を見ているからである。
    // 2つの設定に分けると、食い違ったときに承認したプロジェクトが一覧から消える
    projectShareRoot: '/opt/projects',

    // --- ポータル: 本家に触るために要る2つ。読み方は server/utils/config.ts に閉じる
    upstreamBaseUrl: 'http://127.0.0.1:5000',
    specWorkflowHome: '/opt/projects/.spec-workflow-mcp',

    // --- ポータル: アクティブ集合を見直す間隔（ミリ秒）
    syncIntervalMs: '30000',

    // --- ストローク: AI（claude -p）の起動定義と、呼び出しの中で使う値。
    // 画面は1つも読まないのでサーバー専用（public に置かない）
    claude: {
      // 起動定義。`.mcp.json` の command / args の記述形式に倣い、分解済みの配列
      // そのものを持つ（空白区切りの文字列を後から割らない）。
      //
      // `--add-dir` に渡すのはリポジトリのルートで、`.claude` や skills をパスに
      // 含めない（ADR 0001）。1つ目が grilling / domain-modeling / write-steering-v2 と
      // opsx コマンドの置き場、2つ目がセッション API スキル（assets/.claude/skills/）の
      // 置き場。どちらもこのリポジトリの中にあるので、置き場所を直書きせずルートから
      // 導く（nuxt.config.ts はリポジトリルートに在る）。
      //
      // `--setting-sources` に user を含めないのは、開発者個人の設定
      // （~/.claude/CLAUDE.md）をエンドユーザーのセッションへ持ち込まないためである。
      // project を外すとスキルが一切ロードされない（ADR 0001）。
      //
      // AI に許すツールは Skill Bash Read Write Edit。取得・提出は endpoint への HTTP 発行
      // （Bash で curl）で行い、proposal.md / stroke.md は AI 自身が書いてパスで渡す。
      //
      // **`Skill` を外してはならない。** セッション API スキルの curl は
      // `${CLAUDE_SESSION_ID}` でセッション id を解決するが、この変数が値を持つのは
      // **スキルの `!` フェンスの中だけ**である（実測 2026-08-25: Bash ツールから
      // `printenv` すると空、フェンスからは `--session-id` の値が取れる）。
      // `Skill` が無いと claude はスキルを起動できず、Bash で curl を真似ようとして
      // 空の id を掴み、提出に至らないままタイムアウトする。
      //
      // `-p` / `--output-format json`、`--session-id` / `--resume` とセッション id、
      // `--mcp-config`、`--` 以降の prompt は呼び出しごとに決まるのでここには入れず、
      // 呼び出し側が args の後ろに足す
      command: 'claude',
      args: [
        '--setting-sources', SETTING_SOURCES_REQUIRED,
        '--model', 'sonnet',
        '--add-dir', import.meta.dirname,
        '--add-dir', `${import.meta.dirname}/assets`,
        '--allowedTools', 'Skill Bash(openspec *) Bash(curl -X POST *) Bash(jq -n *) Bash(printenv *) Read Edit',
        '--disallowedTools', 'Bash(cd *)',
      ],

      // エージェント向け endpoint の base URL。spawn 時に環境変数 STROKE_BASEURL として
      // 渡し、セッション API スキルがそこから接続先を解決する（prompt には載せない）
      apiBaseUrl: 'http://127.0.0.1:3001',

      // セッションの openspec/config.yaml に書くワークフロースキーマ名。実体は
      // user レベル（~/.local/share/openspec/schemas/）に配置されたものが解決される
      workflowSchema: 'flontier-strokeflow',

      // AI へ渡す定型。指示の本文はコードに持たない（specs/agent/invocation）。従う手順は
      // スキル自身が持つ。初回はスキル起動＋最低限の固定指示、継続は続きを促すだけ
      // （入力は prompt に載せず、エージェントが取得スキルで読む）
      firstPrompt: '/openspec-ff-change \n\n取得スキルで内容を確認しスキルに従って作業しろ',
      continuePrompt: '続きを進めろ。状況は取得スキルで確認してから判断しろ。',

      // 承認で昇格した直後に steering 文書を作らせる定型（ADR 0011）。cwd は昇格先の
      // プロジェクトで、--mcp-config は呼び出し側がそこから組み立てて足す。
      // write-steering（v2 でない方）は対話インタビュー（grill）を含み、無人実行では
      // 進まないため使わない
      steeringPrompt: '/write-steering-v2\n\nスキルの指示に従って steering 文書を作成する。',

      // 失敗した実行を起こし直す回数の上限。上限に達したら起動せず invocation を
      // error（終端）にする。総待ち時間は「(回数 + 1) × タイムアウト」で決まる
      maxRetries: 2,
    },

    // --- ストローク: セッションの openspec ルートを初期化する CLI とその引数
    openspec: {
      bin: 'openspec',
      initArgs: 'init --tools none',
    },

    // --- ストローク: WS の URL からセッション id を抜くパターン。`{channel}` がチャネル名に置き換わる。
    // リバースプロキシでサブパス配信する構成にするときは、ここを配信の形に合わせる
    wsPathPattern: '/api/strokes/([^/]+)/ws/{channel}(?:$|[/?#])',
  },
});
