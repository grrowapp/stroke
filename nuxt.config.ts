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

  // ビルド時: モジュールの解決とプラグインの生成がビルドで行われる。
  //
  // markdown は `modules/markdown/` が自分で `@nuxtjs/mdc` を入れるのでここに書かない。
  // parse 設定もそちらに在る（`openspec/specs/markdown/module`）。**戻さないこと。**
  // `modules/` は Nuxt が自動で読む置き場なので、この配列に列挙する必要もない
  modules: ['@nuxt/ui'],

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
  // 3399 はストロークの `claude.apiBaseUrl` と揃える値（変えるなら両方揃えて変える）。
  // 別マシンのブラウザから開くため、localhost ではなく全インタフェースで待つ
  devServer: { host: '0.0.0.0', port: 3399 },

  hooks: {
    /**
     * WS を乱暴に切られたときに dev サーバーが止まるのを防ぐ。
     *
     * 症状: WebSocket が異常切断（RST）されると dev サーバーが停止し、手で起動し直すまで
     * 戻らない。全セッション・全画面が同時に使えなくなる。
     *
     * 原因は上流（`@nuxt/cli` の dev、dist/dev-*.mjs）にある。2つが重なっている:
     *
     *   1. upgrade の受け口が `nuxt.server.upgrade(req, socket, head)` を catch せず、
     *      socket に `'error'` の受け手も付けていない
     *   2. dev の子プロセスが `process.once("unhandledRejection", () => { ...; process.exit() })`
     *      を持ち、**あらゆる** 未処理 rejection でプロセスを落とす
     *
     * 相手が RST を送ると `read ECONNRESET` が未処理 rejection になり、2 が発火して落ちる。
     * ビルド済みサーバーにはどちらの経路も無く、落ちない（実測: 異常切断7通りで無傷）。
     *
     * socket に `'error'` の受け手を付けるだけでは足りない（実測: 受け止めても落ちた）。
     * rejection は socket の emitter ではなく、catch されていない Promise の側から来る。
     * スタックは TCP 層だけで JS のフレームを持たず、発生点を掴めない。
     *
     * そこで、接続リセット系の rejection **だけ** を既存のリスナへ渡さない。それ以外は
     * 今まで通り上流の扱い（＝落ちる）に渡すので、本物の不具合は今までどおり表に出る。
     *
     * 上流側の欠落に対する詰め物である。上流が upgrade の失敗を扱うようになったら
     * このフックは不要になるので、そのとき外すこと。
     * 確認したバージョン: nuxt 4.5.2 / @nuxt/cli 3.37.0。
     *
     * `listen` は dev でしか呼ばれず、ビルド済みの出力はこのファイルを読まない
     * （実測: `.output` を grep して該当なし）。
     */
    listen(server) {
      // upgrade した socket に `'error'` の受け手を置く。受け手が無いと EventEmitter が
      // throw するため、まずここで throw の芽を摘む。
      // 再起動のたびに登録し直されるが、上流が `close` フックで `removeAllListeners('upgrade')`
      // を呼ぶので多重登録にはならない。
      server.prependListener('upgrade', (_req, socket) => {
        socket.on('error', () => {});
      });

      // ここから下は1プロセスに1回だけ。
      //
      // `listen` は dev の再起動（このファイルの編集・`.env` の変更・`restart` フック）の
      // たびに、同じプロセス・同じ server に対して再び呼ばれる。`process.emit` の差し替えは
      // 上流が後始末しないので、素直に書くと再起動のたびにラップが1段ずつ積み上がり、
      // クロージャと呼び出しコストが増え続ける。
      const applied = Symbol.for('stroke-board:ws-disconnect-guard');
      const flags = process as unknown as Record<symbol, boolean | undefined>;
      if (flags[applied]) return;
      flags[applied] = true;

      /** 相手が消えただけ。サーバーの落ち度ではないので、落とす理由にしない */
      const disconnected = new Set(['ECONNRESET', 'EPIPE', 'ECONNABORTED']);
      const isDisconnect = (reason: unknown): boolean => {
        // 実測した症状はトップレベルの `.code` に載る形だけである。`cause` や
        // `AggregateError` の中までは見ない。上流や Node がラップの仕方を変えると、
        // この判定は黙って効かなくなり症状が戻る。`yarn check:ws-disconnect` が
        // それを捕まえる（design.md - Risks）。
        const code = (reason as NodeJS.ErrnoException | undefined)?.code;
        return !!code && disconnected.has(code);
      };

      // socket の受け手を置いてもなお残る分を、リスナへ配る前に握る。
      //
      // リスナを差し替える形では足りない。`@nuxt/cli` は `listen` フックの**後**に
      // `process.once("unhandledRejection", restart)` を足す（dist/dev-*.mjs）ので、
      // フック時点のリスナを捕まえて再配布しても、後から付いた分は素通りする（実測）。
      // 登録順に依存しないよう、配布そのものを止める。
      //
      // **`true` を返すこと。** Node は `process.emit('unhandledRejection')` の戻り値で
      // 「誰かが処理したか」を判定し、偽なら `triggerUncaughtException` へ回す
      // （node:internal/process/promises）。`false` を返すと、リスナを黙らせた結果として
      // かえって素の例外で落ちる（実測）。
      //
      // 握った分は必ず出す。**この詰め物はプロセス全体の rejection を対象にする**ので、
      // 黙って捨てると、アプリ自身の catch し忘れが同じコードを持っていたときに気付けない。
      // 出しておけば、量や出どころから異常に気付ける。
      //
      // 型のキャストは Node の型定義の都合である。`process.emit` はイベント名ごとの
      // オーバーロードの集まりで、汎用のラッパーをそのまま代入できない（`as typeof
      // process.emit` が無いと TS2322、`as never` が無いと TS2345）。`as never` は引数の
      // 対応検査を無効にするので、この関数を触るときは実挙動で確かめること。
      //
      // `WS_GUARD_OFF=1 yarn dev` で外せる。`yarn check:ws-disconnect` がまだ症状を
      // 捉えているか（外すと本当に止まるか）を確かめるための口である。外して赤に
      // ならなくなったら、上流が直ったか、確認の方が症状を捉えなくなっている。
      const emit = process.emit.bind(process);
      process.emit = function (event: string | symbol, ...args: unknown[]) {
        if (!process.env.WS_GUARD_OFF && event === 'unhandledRejection' && isDisconnect(args[0])) {
          const code = (args[0] as NodeJS.ErrnoException).code;
          console.warn(`[ws-disconnect-guard] 接続が切れた rejection を握った: ${code}`);
          return true;
        }
        return emit(event as never, ...(args as never[]));
      } as typeof process.emit;
    },
  },

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
    upstreamBaseUrl: 'http://192.168.1.204:5000',
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
        '--allowedTools', 'Skill Bash(openspec *) Bash(curl -X POST *) Bash(jq -n *) Bash(printenv *) Read Edit Write',
        '--disallowedTools', 'Bash(cd *)',
      ],

      // エージェント向け endpoint の base URL。spawn 時に環境変数 STROKE_BASEURL として
      // 渡し、セッション API スキルがそこから接続先を解決する（prompt には載せない）
      apiBaseUrl: 'http://127.0.0.1:3399',

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

      // 呼び出しの生出力（--output-format json の stdout 全文）を書き残すディレクトリ。
      // 空なら書かない（既定 = 無効）。調査用の複製で、呼び出しの成否には影響しない
      debugLogDir: '',
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
