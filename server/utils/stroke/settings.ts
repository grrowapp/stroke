import { isAbsolute } from 'node:path'

/**
 * 設定の唯一の置き場。
 *
 * ソースコードを設定値の置き場所にしないため、各モジュールに散っていた `DEFAULT_*` と
 * `resolve*()` をここへ集めた。設定の**正**は `docs/settings-reference.md` である
 * （docs/adr/0004）。ここに書いてよいのは資料に載っているものと、資料が「設定ではない」と
 * している内部の決め事（固定値）だけである。
 *
 * `#shared/*` を import しない。Nuxt のエイリアスが存在しない時点で評価される
 * `nuxt.config.ts` から読めなくなるためである（実測で `error TS2307`）。
 * `useRuntimeConfig()` も呼ばない。CLI（`yarn session`）は Nitro の外で走るため、
 * endpoint と CLI の両方から読める口はこのモジュールだけである。
 *
 * 3つに分かれている。
 *
 * 1. `.env` で差し替えられるもの（置き場2件）— 動かす機械ごとに変わる
 * 2. `runtimeConfig` の既定値 — `nuxt.config.ts` が import する。環境変数では差し替えない
 * 3. 固定値 — システム内部の決め事。設定ではないので外から変えられない
 */

// ===========================================================================
// 1. `.env` で差し替えられるもの
//
// 置き場の2件だけ。機械ごとに変わるので外に出す。ここだけが `process.env` を読む。
// ===========================================================================

/**
 * セッションディレクトリの置き場。`claude -p` の cwd になる。
 * `/var/lib` は実行ユーザーでは書き込み不可なので、この配下の作成と所有権付与は
 * アプリ外の配置作業（docs/adr 参照）。起動時チェックは server/plugins/00.startup-checks.ts。
 */
export const DEFAULT_SESSIONS_ROOT = '/var/lib/stroke-board/sessions'

/** 承認時にプロジェクトのトップディレクトリを作る場所。 */
export const DEFAULT_PROJECTS_ROOT = '/opt/projects'

function fromEnv(name: string, fallback: string): string {
  const env = process.env[name]?.trim()
  return env || fallback
}

/** `NUXT_SESSIONS_ROOT` があればそれ、無ければ既定。 */
export function resolveSessionsRoot(): string {
  return fromEnv('NUXT_SESSIONS_ROOT', DEFAULT_SESSIONS_ROOT)
}

/** `NUXT_PROJECTS_ROOT` があればそれ、無ければ既定。 */
export function resolveProjectsRoot(): string {
  return fromEnv('NUXT_PROJECTS_ROOT', DEFAULT_PROJECTS_ROOT)
}

/**
 * 置き場として与えられた値が形をなしているか。起動時チェックが集める。
 * 相対パスは、プロセスの cwd 次第で書き込み先が動くので受け付けない。
 *
 * 検査がこれ1本なのは、環境変数から値が入る経路が置き場だけになったためである。
 * 他の値は `nuxt.config.ts` と下の固定値に書かれたものしか通らない。
 */
export function describePathsError(): string | null {
  const problems: string[] = []
  for (const name of ['NUXT_SESSIONS_ROOT', 'NUXT_PROJECTS_ROOT']) {
    const raw = process.env[name]?.trim()
    if (raw && !isAbsolute(raw)) problems.push(`${name}: 絶対パスでない（${raw}）`)
  }
  return problems.length > 0 ? problems.join(' / ') : null
}

// ===========================================================================
// 2. `runtimeConfig` の既定値
//
// `nuxt.config.ts` がここを import して宣言し、読み手は `useRuntimeConfig()` で読む。
// 環境変数では差し替えない（docs/settings-reference.md）。
// ===========================================================================

/**
 * エージェント向け endpoint の base URL。spawn 時に環境変数として子へ渡す。
 * CLI（`yarn session create`）は転送先 URL の組み立てにこの値を直接使う。
 */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3001'

/**
 * セッションの `openspec/config.yaml` に書くワークフロースキーマ名。
 * 実体は user レベル（`~/.local/share/openspec/schemas/`）から解決される。
 */
export const DEFAULT_WORKFLOW_SCHEMA = 'flontier-strokeflow'

/**
 * 初回（`--session-id` での新規起動）で渡す定型。
 * 指示の本文はコードに持たない（specs/ai-invocation）。従う手順はスキル自身が持つ。
 */
export const DEFAULT_FIRST_PROMPT
  = '/openspec-ff-change draft-proposal\n\nスキルの指示に従って作業を実施する。'

/** 2回目以降・リトライで渡す定型。新しい入力は載せず、取得スキルで読ませる。 */
export const DEFAULT_CONTINUE_PROMPT = '続きを進めろ。状況は取得スキルで確認してから判断しろ。'

/** セッションの openspec ルートを初期化する CLI。PATH 上の名前でも絶対パスでもよい。 */
export const DEFAULT_OPENSPEC_BIN = 'openspec'

/** ルート初期化のサブコマンドとフラグ。空白区切りで与える。 */
export const DEFAULT_OPENSPEC_INIT_ARGS = 'init --tools none'

/**
 * WS の URL からセッション id を抜くパターン。`{channel}` がチャネル名に置き換わる。
 * リバースプロキシでサブパス配信する構成にするときは、ここを配信の形に合わせる。
 */
export const DEFAULT_WS_PATH_PATTERN = '/api/strokes/([^/]+)/ws/{channel}(?:$|[/?#])'

/** ADR 0001: ここを外すとスキルが一切ロードされない。 */
const SETTING_SOURCES_REQUIRED = 'project'

/** `claude` の起動定義の実行ファイル。 */
export const DEFAULT_CLAUDE_COMMAND = 'claude'

/**
 * `claude` の起動定義の引数。`.mcp.json` の `command` / `args` の記述形式に倣い、
 * 分解済みの配列そのものを設定として持つ（空白区切りの文字列を後から割らない）。
 *
 * `--add-dir` に渡すのはリポジトリのルートで、`.claude` や skills をパスに含めない
 * （ADR 0001）。1つ目が grilling / domain-modeling と opsx コマンドの置き場、2つ目が
 * セッション API スキル（`assets/.claude/skills/`）の置き場。どちらもこのリポジトリの
 * 中にあるので、置き場所を直書きせずルートから導く。
 *
 * `--setting-sources` に user を含めないのは、開発者個人の設定（`~/.claude/CLAUDE.md`）を
 * エンドユーザーのセッションへ持ち込まないためである。
 *
 * AI に許すツールは `Bash Read Write Edit`。取得・提出は endpoint への HTTP 発行
 * （Bash で curl）で行い、proposal.md / stroke.md は AI 自身が書いてパスで渡す
 * （design.md 決定7）ため Write / Read が要る。
 *
 * @param repoRoot リポジトリのルート。`nuxt.config.ts`（ルートに在る）が自分の位置を渡す
 */
export function defaultClaudeArgs(repoRoot: string): string[] {
  return [
    '--setting-sources', SETTING_SOURCES_REQUIRED,
    '--model', 'fable',
    '--add-dir', repoRoot,
    '--add-dir', `${repoRoot}/assets`,
    '--allowedTools', 'Bash Read Write Edit',
  ]
}

/**
 * 起動定義が ADR 0001 の制約を満たしているか。起動時チェックが呼ぶ。
 *
 * `args` が配列1本になったので、`--setting-sources` の値だけを個別に検証することは
 * できない。並びの中に `--setting-sources project` が在ることを見る。
 */
export function describeClaudeArgsError(args: readonly string[]): string | null {
  const at = args.indexOf('--setting-sources')
  if (at === -1 || args[at + 1] !== SETTING_SOURCES_REQUIRED) {
    return `runtimeConfig.public.claude.args に \`--setting-sources ${SETTING_SOURCES_REQUIRED}\` が無い（ADR 0001: 外すとスキルがロードされない）`
  }
  return null
}

// ===========================================================================
// 3. 固定値
//
// システム内部の決め事であって設定ではない。外から変えられないようにする
// （docs/settings-reference.md に載っていない = 設定ではない）。
// ===========================================================================

/**
 * セッションディレクトリ内のファイル名。中身の書式とセットで決まるものなので、
 * 名前だけを外から差し替えられる意味がない。
 */
export const SESSION_FILES = {
  state: 'state.json',
  strokes: 'strokes.json',
  proposal: 'proposal.md',
  overview: 'overview.txt',
  sendBack: 'send-back.json',
} as const

/** セッションの openspec ルート。名前は openspec が決めるもので、こちらは従う。 */
export const OPENSPEC_DIR = 'openspec'
export const OPENSPEC_CONFIG_FILE = 'config.yaml'

/**
 * 子プロセスを打ち切るまでの待ち時間。超えたらリトライ経路へ流す。
 * 起動後この時間内に endpoint への提出が無ければ、その呼び出しは失敗として扱う
 * （specs/ai-invocation）。
 */
export const CLAUDE_TIMEOUT_MS = 180000

/** 打ち切るときに送るシグナル。 */
export const CLAUDE_TIMEOUT_SIGNAL = 'SIGKILL' as const

/** 失敗時に起こし直す回数。総待ち時間は「(回数 + 1) × タイムアウト」で決まる。 */
export const CLAUDE_MAX_RETRIES = 2

/**
 * 継続しようとしたセッションが存在しないときに `claude` が出す文言（実測）。
 * こちらが出すメッセージではなく、子プロセスの stdout/stderr に対する照合文字列である。
 * CLI 側が文言を変えたらここを追随させる。
 */
export const CLAUDE_SESSION_MISSING_MESSAGE = 'No conversation found with session ID'

/**
 * 子プロセスへ接続先を渡す環境変数の名前。
 * **これはこちらが読む設定ではなく、渡す名前である。** セッション API スキルがこの名前で
 * 接続先を読むので、変えるならスキル側と揃える。
 */
export const CLAUDE_BASE_URL_ENV_NAME = 'STROKE_BASEURL'

/** 承認時に作るプロジェクトの中身。 */
export const PROJECT_DOCS_DIR = 'docs'
export const PROJECT_PROPOSAL_FILE = 'proposal.md'

/**
 * プロジェクト名として許す文字。置き場の外へ出られる形（`/` や先頭の `.`）を通さない。
 * 緩めれば `/opt/projects/` の外へ書けてしまうので、外から差し替えられないようにする。
 */
export const PROJECT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** ログの接頭辞。 */
export const LOG_PREFIX = '[stroke-board]'
