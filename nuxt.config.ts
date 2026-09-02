import { defineNuxtConfig } from 'nuxt/config';

import { sbIcons, upstreamIcons } from './app/assets/icons';
import { recordDevListenAddress } from './server/utils/stroke/listen-address';

/**
 * ADR 0001 がスキルのロードに要ると定めた値。**ただし、いまはロードされるスキルが0本である。**
 *
 * `--add-dir` を丸ごと外した（下の args の注記）ので、project 設定の探索先はセッションの
 * cwd（`/opt/projects/<uuid>`）だけになった。そこに `.claude/` は無いので、スキルも
 * プロジェクト設定もロードされない——実測（2026-08-30・変更後の実行ログ3本）でも `Skill`
 * の呼び出しは0回、`permission_denials` はすべて空で、`project` を残しても外しても結果は
 * 変わらない。下の「`Skill` は空振りする」の注記と同じ状態を指している。
 *
 * それでも値は残し、`server/utils/readiness.ts` の起動時チェックで不在を落とし続ける。
 * 案内スキルを配り直したときに要る守りであり、外す判断は本 change の範囲外である
 * （santa-method レビュー指摘 7周目 2026-08-30）。
 */
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
  // @nuxtjs/mcp-toolkit: stroke-board 自身が MCP サーバーになる（route は既定 `/mcp`、
  // ツール定義の置き場 `dir` も既定 `server/mcp`）。0.x のため package.json でバージョンを
  // 固定してある（provide-operations-via-mcp design.md）
  //
  // markdown は `modules/markdown/` が自分で `@nuxtjs/mdc` を入れるのでここに書かない。
  // parse 設定もそちらに在る（`openspec/specs/markdown/module`）。**戻さないこと。**
  // `modules/` は Nuxt が自動で読む置き場なので、この配列に列挙する必要もない
  modules: ['@nuxt/ui', '@nuxtjs/mcp-toolkit'],

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

  // 起動の待ち受けの既定値。3000 はこのマシンで別のプロセスが使っているのでずらしてある。
  // `package.json` の `dev` スクリプト（`nuxt dev --port 3100`）がこの `port` を上書きする
  // ので、実際に listen するポートはそちら——ここは `--port` を渡さず起こしたときの既定に
  // すぎない。**claude に渡す MCP の url とはもう連動しない**（`listen-address.ts` が実際の
  // 待ち受けから組み立てるので、ここを変えても揃えて変える必要はない。
  // provide-operations-via-mcp 続き）。
  // 別マシンのブラウザから開くため、localhost ではなく全インタフェースで待つ
  devServer: { host: '0.0.0.0', port: 3599 },

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
      // 実際に bind されたポートを覚える（provide-operations-via-mcp 続き）。claude に
      // 渡す MCP の url はここから組み立てる——設定の固定値だと、待ち受けを変えた瞬間に
      // 届かなくなる（実測 2026-09-01: yarn dev は 3100 で listen するのに設定は 3599
      // を指し ECONNREFUSED）。詳細は `server/utils/stroke/listen-address.ts` の docblock。
      recordDevListenAddress(server);

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
      // **`--add-dir` を渡さない。** 作業場所はセッションのディレクトリ（cwd）だけでよい。
      //
      // かつてはリポジトリのルートを渡し、「grilling / domain-modeling / write-steering-v2 と
      // opsx コマンドの置き場だから」を根拠にしていた。**その根拠は実在しなかった**——
      // `.claude/skills/` は無く、実運用ログの `slash_commands` 67件にそれらは1件も現れない
      // （実測 2026-08-30）。届いていたのは次の2つだけで、どちらも渡したくないものである。
      //
      // - **他人のセッションの全文**。`claude.debugLogDir` はリポジトリ配下にあり、
      //   `--output-format stream-json` で概要・問い・proposal がそのまま残る。実測で、
      //   セッション A の claude が B のログを `Read` で読めた（`permission_denials: []`）
      // - **開発者の権限とプラグイン**。ルート配下の `.claude/settings.json` が
      //   `--setting-sources project` で効き、`Agent` や `Bash(claude *)` が渡っていた。
      //   `Edit` の deny は `/opt/projects/stroke-board/**` の絶対パスなので worktree には
      //   効かず、無人実行のエージェントがソースツリーへ書ける状態だった
      //
      // 操作系スキルは同じく届かなくなり、その後**ファイルごと撤去した**
      // （`adr0016-sub-switch-workflow-to-mcp-tools`）。取得・提出は MCP ツールが担うので、
      // スキル経由で真似る余地を残さない。
      //
      // `--setting-sources` に user を含めないのは、開発者個人の設定
      // （~/.claude/CLAUDE.md）をエンドユーザーのセッションへ持ち込まないためである。
      // `project` は残してあるが、`--add-dir` が無い今、探索先の cwd に `.claude/` は
      // 無いのでロードされるスキルは0本である（冒頭の `SETTING_SOURCES_REQUIRED`）。
      //
      // 取得・提出の操作は stroke-board の MCP ツールが担う（provide-operations-via-mcp）。
      // その分の `--allowedTools`（`mcp__stroke-board`）は呼び出しごとに決まるのでここには
      // 入れず、`server/utils/mcp/allowed-tools.ts` が値へ足す。
      //
      // `Skill` は役割分担（操作系＝MCP ツール / 案内・手順＝Skill）の受け皿として残して
      // ある。**ただし現時点で prompt が指す案内スキルは1つも無い。** `/openspec-ff-change`
      // も `/write-steering-v2` も実体が無く、どちらも prompt から外した（下の3定型は
      // スラッシュコマンドを持たない）。案内を配り直すまで `Skill` は空振りする
      // （change の tasks「案内スキルの実体が無い」）。
      //
      // `-p` / `--output-format json`、`--session-id` / `--resume` とセッション id、
      // `--mcp-config`、MCP ツール分の `--allowedTools`、`--` 以降の prompt は
      // 呼び出しごとに決まるのでここには入れず、呼び出し側が args の後ろに足す
      command: 'claude',
      args: [
        '--setting-sources', SETTING_SOURCES_REQUIRED,
        '--model', 'sonnet',
        // curl / jq / printenv は落とした（取得・提出を MCP ツール以外で真似る余地を
        // 残さない・ユーザー指示 2026-08-27）。
        //
        // **`Write` / `Edit` は外した**（adr0016-sub-fix-direct-write-allowance）。
        // かつての注記「`Write` は proposal を `docs/proposal.md` に書くのに要る」は
        // 誤りで、それを書くのは A7（`server/utils/stroke/session-store.ts` の
        // `sessionProposal().write`）である。実際に入った理由はワークフロー定義の
        // `generates`（`stroke.md` / `proposal.md`）の新規作成だった（`1ce89cfc`）が、
        // その手順は `get-guide` が `openspec` コマンドを禁じたことで届いていない。
        //
        // 実測（2026-09-01、`yarn check:stroke --approve` の flontier / steering 2実行）
        // で `Write` も `Edit` も呼び出し0回。外した状態でも往復・承認・steering 3本が
        // 揃うことを実機で確かめてある。**これで「文書は MCP ツールを通してしか出せない」
        // が構造で担保される**（`docs/specs/mcp/tools.md`「操作の入口はこれだけ」）。
        //
        // `Read` は残す。steering 工程には文脈を取る MCP ツールが無く（公開は
        // get-steering-guide / get-steering / submit-document の3本）、実測でも
        // `Read` 5回・`Bash` 2回でプロジェクトを直接読んでいる。読み取りの口を
        // MCP へ寄せるのは別 change の仕事である。
        '--allowedTools', 'Skill Bash(openspec *) Read',
        '--disallowedTools', 'Bash(cd *)',
        // `--mcp-config` は「追加」であって「限定」ではない。これが無いと開発者個人の
        // MCP 設定が全部読み込まれる——実測（2026-08-30・デバッグログ全23本）で
        // `claude.ai Slack` / `Google Drive` / `Canva` など8本・約80ツールが、
        // `--allowedTools` に無いので**呼べないまま**エンドユーザーの実行に並んでいた。
        // 上の `--setting-sources` の注記（個人の設定を持ち込まない）と、工程ごとに
        // 公開ツールを工程ごとに絞った意図（specs `mcp/server`「呼べないものを見せてから
        // 失敗させない」）の両方を破っていた（santa-method レビュー指摘 5周目）
        '--strict-mcp-config',
      ],

      // エージェント向け endpoint の base URL（`claude.apiBaseUrl`）は**設定から外した**
      // （provide-operations-via-mcp 続き）。待ち受けを決めるのは `devServer.port` /
      // `package.json` の `nuxt dev --port` であって、ここに手で書いた値ではない——
      // 一致する保証が無く、実測 2026-09-01 で ECONNREFUSED になっていた。
      //
      // 起動ごとに組み立てる `--mcp-config` の url（`${apiBaseUrl}/mcp`）と、spawn 時の
      // 環境変数 STROKE_BASEURL（`server/utils/stroke/claude.ts`。読み手は今は居ない）は、
      // どちらも実際の待ち受けから `server/utils/stroke/listen-address.ts` が組み立てる
      // （`server/utils/stroke/invoke.ts` の `buildRun`）

      // セッションの openspec/config.yaml に書くワークフロースキーマ名。実体は
      // user レベル（~/.local/share/openspec/schemas/）に配置されたものが解決される
      workflowSchema: 'flontier-strokeflow',

      // AI へ渡す定型。指示の本文はコードに持たない（specs/agent/invocation）。従う手順は
      // スキル自身が持つ。初回も最低限の固定指示だけ、継続は続きを促すだけ
      // （入力は prompt に載せず、エージェントが取得ツールで読む）
      //
      // 取得・提出の操作も手順の案内も stroke-board の MCP ツールが担う。案内は
      // `get-guide`（adr0016-sub-create-flontier-guidance-mcp-tool）で、手順の本文は
      // `server/mcp/tools/get-guide.ts` の定数が正である。**prompt に手順そのものを
      // 書かない**——本文が設定とコードの2箇所になり、片方だけが古くなる。
      //
      // かつては案内をスキルが担う分担で `/openspec-ff-change` を prompt の先頭に置いて
      // いたが、**実体が無かった**（`.claude/skills/` にも assets にも openspec のスキーマ
      // にも存在しない）。`Unknown command` で初回起動が何もせず終わる（実測 2026-08-27:
      // assistant のターンがゼロで「プロセスは成功したが提出が届かない」になり、巡回の
      // 再起動が毎回拾っていた）。実在するツールを指す形に置き換えたのがいまの定型である
      firstPrompt: 'stroke-board の MCP ツール get-guide で進め方を読み、そのとおりに作業しろ。',
      continuePrompt: '続きを進めろ。stroke-board の MCP ツール get-guide で進め方を読み直し、状況を確認してから判断しろ。',

      // 承認で昇格した直後に steering 文書を作らせる定型（ADR 0011）。cwd は昇格先の
      // プロジェクトで、--mcp-config は呼び出し側がそこから組み立てて足す。
      //
      // **`/write-steering-v2` の起動は外した。** firstPrompt の `/openspec-ff-change` と
      // まったく同じで実体が無く（`.claude/skills/` は存在せず、当時の
      // `assets/.claude/skills/` の10件にも無かった）、prompt の先頭に置くと
      // `Unknown command` で起動が assistant の
      // ターンをひとつも持たずに終わる。steering 工程が何もせず終わっていた直接の原因で、
      // 5.2 の残り2ツール（get-steering / submit-document の steering 種別）が一度も
      // 呼ばれなかったのはこれによる（santa-method レビュー指摘 4周目 2026-08-30）。
      //
      // 取得・提出も案内も MCP ツールが担う。案内は `get-steering-guide`
      // （adr0016-sub-create-steering-guidance-mcp-tool）で、手順の本文は
      // `server/mcp/tools/get-steering-guide.ts` の定数が正である。
      // write-steering（v2 でない方）は対話インタビュー（grill）を含み、無人実行では
      // 進まないため使わない
      steeringPrompt: 'stroke-board の MCP ツール get-steering-guide で進め方を読み、そのとおりに steering 文書を作成しろ。',

      // 失敗した実行を起こし直す回数の上限。上限に達したら起動せず invocation を
      // error（終端）にする。総待ち時間は下の2件と合わせて決まる
      maxRetries: 2,

      // 1回の起動を打ち切るまでの時間。
      //
      //   その起動のタイムアウト = timeoutMs + timeoutStepMs × これまでに起こし直した回数
      //
      // 初回のキックは「起こし直し」ではないので回数は 0、つまり timeoutMs そのもの。
      // 伸びるのはひと続きの起こし直しの中だけで、回数が 0 に戻れば timeoutMs へ戻る。
      //
      // timeoutMs の 3分は実測から置いた値である。180 秒では初回が必ず時間切れになり
      // 10分へ延ばしたが（実測 2026-08-25。当時は claude がスキルをロードし `!` フェンスの
      // 中で curl を往復させていた）、操作が MCP ツールへ移って所要が減ったので戻した
      // （実測 2026-08-28: 8回の呼び出しで 28.5〜64.7 秒、turns は 4〜15）。
      //
      // timeoutStepMs の既定 0 は「伸ばさない」。どれだけ伸ばすのが妥当かの実測がまだ
      // 無いので、刻みは箱だけ用意して既定では効かせない
      timeoutMs: 180000,
      timeoutStepMs: 0,

      // 呼び出しの生出力を書き残すディレクトリ。**空文字なら書かない（既定）。**
      // 調査用の複製で、呼び出しの成否には影響しない。
      //
      // 設定するとツールの呼び出しと結果まで残る（`--output-format stream-json`）。
      // 出力はセッションごとに1ファイルへ追記される。**有効のまま置かないこと**——
      // 概要・問い・proposal の全文がローテーション無しで溜まる。調査が終わったら空へ戻し、
      // 残ったファイルは手で消す（`docs/specs/core/settings-reference.md`）。
      //
      // **空のあいだは `yarn check:stroke` の判定が鈍る。** `settle` は実行の終了を数えられず
      // 5秒固定の待ちに落ち、steering の着地判定は `submit-document` の回数を数えられないので
      // 文書の有無だけで判定する（`scripts/stroke-check.ts`）
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
