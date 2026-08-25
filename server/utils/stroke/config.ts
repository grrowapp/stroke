import { z } from 'zod'

/**
 * ストローク側の設定を読む唯一の口。
 *
 * 出どころは `nuxt.config.ts` の `runtimeConfig` だけである
 * （docs/specs/core/settings-reference.md・ADR 0004）。環境変数からは読まない。
 *
 * 読むのは**端**——endpoint・plugin・CLI——だけとする。core（`session-core.ts` /
 * `paths.ts` / `claude.ts` / `openspec.ts` / `project.ts`）は設定を知らず、値を引数で
 * 受け取る。core が自分で引くと、endpoint（Nitro）と CLI（Nitro の外）で経路が割れる。
 *
 * 読むたびに検証するのは、宣言の書き間違い（キーの綴り違い・空文字）が、呼び出しの
 * 実行時まで気付かれずに残るのを防ぐためである。
 */

const schema = z.object({
  /** セッションと、承認で昇格したプロジェクトの共通の親。ポータルの走査先でもある */
  projectShareRoot: z.string().trim().min(1),
  claude: z.object({
    /** 実行ファイル */
    command: z.string().trim().min(1),
    /** 呼び出しに依らないフラグ一式。ADR 0001 の検査は `describeClaudeArgsError` */
    args: z.array(z.string()).min(1),
    /** エージェント向け endpoint の base URL。`STROKE_BASEURL` として子へ渡る */
    apiBaseUrl: z.string().trim().min(1),
    /** セッションの openspec/config.yaml に書くワークフロースキーマ名 */
    workflowSchema: z.string().trim().min(1),
    /** 初回（`--session-id` での新規起動）で渡す定型 */
    firstPrompt: z.string().trim().min(1),
    /** 2回目以降・リトライで渡す定型。新しい入力は載せず、取得スキルで読ませる */
    continuePrompt: z.string().trim().min(1),
    /** 承認で昇格した直後に steering 文書を作らせる定型（ADR 0011） */
    steeringPrompt: z.string().trim().min(1),
    /** 失敗を起こし直す回数の上限。到達したら起動せず `error`（終端）にする */
    maxRetries: z.number().int().min(0),
  }),
  openspec: z.object({
    /** セッションの openspec ルートを初期化する CLI */
    bin: z.string().trim().min(1),
    /** ルート初期化のサブコマンドとフラグ。空白区切りで与える */
    initArgs: z.string().trim().min(1),
  }),
  /** WS の URL からセッション id を抜くパターン。`{channel}` がチャネル名に置き換わる */
  wsPathPattern: z.string().trim().min(1),
})

export type StrokeConfig = z.infer<typeof schema>

/**
 * 生の `runtimeConfig` を検証して型付きで返す。
 *
 * 入力を引数で受けるのは、endpoint が `useRuntimeConfig()` を、CLI が
 * `nuxt.config.ts` の import を出どころにするためである。検証の規則はこの1本を通る。
 */
export function parseStrokeConfig(raw: unknown): StrokeConfig {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join(' / ')
    throw new Error(`runtimeConfig が不正: ${detail}`)
  }
  return parsed.data
}

/** endpoint・plugin 側の端。Nitro の外からは呼べない。 */
export function readStrokeConfig(): StrokeConfig {
  return parseStrokeConfig(useRuntimeConfig())
}

/** ADR 0001: ここを外すとスキルが一切ロードされない。 */
const SETTING_SOURCES_REQUIRED = 'project'

/**
 * 起動定義が ADR 0001 の制約を満たしているか。起動時チェックが呼ぶ。
 *
 * `args` が配列1本なので、`--setting-sources` の値だけを個別に検証することはできない。
 * 並びの中に `--setting-sources project` が在ることを見る。
 */
export function describeClaudeArgsError(args: readonly string[]): string | null {
  const at = args.indexOf('--setting-sources')
  if (at === -1 || args[at + 1] !== SETTING_SOURCES_REQUIRED) {
    return `runtimeConfig.claude.args に \`--setting-sources ${SETTING_SOURCES_REQUIRED}\` が無い（ADR 0001: 外すとスキルがロードされない）`
  }
  return null
}
