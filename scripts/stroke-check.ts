import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

// ランナー（`playwright test`）には載せないが、ブラウザを動かす口は `@playwright/test` が
// 再エクスポートしているものを使う。`playwright` を直接指すと間接依存に頼ることになる
import { chromium, type Browser, type Locator, type Page } from '@playwright/test'

import nuxtConfig from '../nuxt.config'
import { removeTarget } from '../server/handler/delete'
import { parseStrokeConfig } from '../server/utils/stroke/config'
import { isSafeSegment } from '../server/utils/stroke/paths'

/**
 * ストロークが着地するかを、**動いている dev サーバーへブラウザで当てて**確かめる
 * （`yarn check:stroke`）。
 *
 * ビルドの流れに載せるテストではない。対向の枠組み（スキル版・MCP ツール版・openspec
 * スキーマの調整）を差し替えたときに、人が意図して叩いて「ストロークが続くか」を見る道具
 * である。だから `playwright test` のランナーには載せず、E2E の設定（claude を `/bin/true`
 * に差し替える等）を一切引き継がない。本番の経路をそのまま動かす。
 *
 * 見るのは**着地したか**の一点。問いの中身は判定に使わない——実物のエージェントは毎回
 * 違う問いを返すので、中身で落とすと成果物の欠陥と出力の揺らぎを切り分けられなくなる。
 * 応対の品質は、書き出す HTML を人が見て評価する。
 *
 * 使い方: 別の端末で `yarn dev` を起こしてから `yarn check:stroke`。
 *
 *   yarn check:stroke                        既定（推奨を選ぶ・最大12往復）
 *   yarn check:stroke --policy first         先頭を選ぶ
 *   yarn check:stroke --rounds 20            上限を変える
 *   yarn check:stroke --overview ./foo.md    概要を差し替える
 *   yarn check:stroke --send-back           proposal を1回差し戻す（指摘は haiku が書く）
 *   yarn check:stroke --send-back '<指摘>'  指摘の文言を指定して差し戻す
 *   yarn check:stroke --approve             承認まで進め、steering 工程の着地まで見る
 *   yarn check:stroke --cleanup             この実行で作ったセッションを最後に片付ける
 */

const execFileAsync = promisify(execFile)

const PORT = nuxtConfig.devServer?.port ?? 3399
const BASE = `http://127.0.0.1:${PORT}`

/**
 * ここが道具側の**設定を引く端**である。`session.ts` と同じく `nuxt.config.ts` を
 * import して zod を通す（docs/specs/core/settings-reference.md）。
 *
 * **`??` で既定値を書かない。** 書けば `180000` や `2` の実体が
 * `nuxt.config.ts` 以外のソースファイルにも現れ、「値の実体をこの2つ以外のソース
 * ファイルに置かない」（同資料）を破る。キーが欠けていれば `parseStrokeConfig` が
 * 例外で落ちる——黙って別の値で走るより落ちるほうがよい。
 */
const { projectShareRoot, claude } = parseStrokeConfig(nuxtConfig.runtimeConfig)

const PROJECTS_ROOT = projectShareRoot
const DEBUG_LOG_DIR = claude.debugLogDir

/** claude 側の打ち切りが最も長くなる場合。刻みは起こし直しの回数だけ乗る（設定が正） */
const LONGEST_CLAUDE_TIMEOUT_MS
  = claude.timeoutMs + claude.timeoutStepMs * claude.maxRetries

/**
 * 1往復あたりの待ちの上限。
 *
 * claude 側の打ち切り（`claude.timeoutMs` + `claude.timeoutStepMs` × 起こし直しの回数）
 * より短くしない。短いと、まだ動いている実行を待たずに諦めることになる。1分だけ長めに
 * 取って、claude が自分で打ち切ったあとの表示まで見届ける。
 */
const ROUND_TIMEOUT_MS = LONGEST_CLAUDE_TIMEOUT_MS + 60 * 1000

/**
 * 変化が無いまま待ち続けたときに、画面を取り直す間隔。
 *
 * dev がモジュールを取り落とすと Vue が動かなくなり、サーバー側は進んでいるのに画面だけが
 * 止まる。取り直せば現在の状態を拾い直せる（`sendBack`）。
 */
const RELOAD_INTERVAL_MS = 60 * 1000

/**
 * 承認の名前を変えて出し直す上限。
 *
 * 同じ概要を流せば同じ名前が提案されるので、回すたびに衝突する。連番を足して抜けるが、
 * 際限なく試さない（`approve`）。
 */
const APPROVE_NAME_ATTEMPTS = 5

/** steering 文書の本数（product / tech / structure）。3本揃ったら着地とみなす */
const STEERING_DOCUMENTS = 3

/**
 * 直前の待ちに入った時点の生出力の本数。`settle` が「もう終わっているか」を見るのに使う。
 *
 * **待ちに入るものは必ず `beginRoundWait()` を通すこと。** 待ちの中で実行が終わったか
 * どうかは、この基準からの増分でしか分からない——`settle` の呼び出し時点で数え直すと、
 * 既に終わっている実行を「まだ動いている」と読み違える。逆に**基準が古いままだと、
 * 前の実行が終わったことを次の実行の終わりと取り違えて素通りする**（`--send-back` を
 * 併用したとき、差し戻しの待ちが基準を更新しないと `approve` の `settle` が確定的に
 * 素通りしていた。santa-method レビュー指摘 9周目 2026-08-31）。
 */
let roundStartLogs = 0

/** 待ちに入る。`settle` が見る基準を取り直す */
function beginRoundWait(): void {
  roundStartLogs = logEntryCount()
}

/** 画面1 を開き直す上限。dev がモジュールを取り落とすと数回に1回は開けない（`openStrokes`） */
const OPEN_ATTEMPTS = 5

/**
 * 投入する既定の概要。設計判断が既にいくつか入っていて、問いが立ちやすいもの。
 *
 * **見出しの名前は、実在のプロジェクトと被らないものにすること。** エージェントは
 * この見出しからプロジェクト名の候補を作り、承認するとその名前で `projectShareRoot`
 * （`/opt/projects`）にディレクトリができる。実在の名前を使うと、検証で作った物と
 * 本物が同じ場所に並び、片付けのときに本物を消す事故が起きうる
 * （ユーザー指摘 2026-09-01。かつて `setai` を使っており、実在の `/opt/projects/setai`
 * と `setai-2`〜`setai-5` が隣り合っていた）。
 *
 * `stroke-check-` で始めておけば、検証で出来たものだと名前だけで分かる。
 */
const DEFAULT_OVERVIEW = `## stroke-check-fixture

- Claude Code の \`settings.json\` を編集する CLI
- 上記のメニュー型編集操作-TUI版

### 副産物

- JSON ファイルを編集する汎用 CLI
- Go プログラムから使える JSON 編集ライブラリ

### key requirements
- スキーマ依存の構成は取らない
- settings.json のキーをベースにサブコマンドを定義し、動作の責務はサブコマンドがすべて持つ
- サブコマンド名はキー名と必ず対応する方式にはしない。サブコマンド名からのキー名抽出はやらない
- メインコマンドはサブコマンドへのルーティングと共通的に発生する前処理・後処理（ファイル
  読み込みや出力制御等）が責務。settings.json の各キーに関する知識は持たない`

/**
 * 回答ポリシー。ブラウザ側の応答の選び方。
 *
 * 対向の枠組みを試すのが目的なので応答は機械的でよい。ただし選び方で往復の進み方が
 * 変わるため、外から差し替えられるようにしてある。
 */
type Policy = (options: Locator[], round: number) => Promise<number | 'free'>

const policies: Record<string, Policy> = {
  /** 推奨があればそれ、無ければ先頭。既定。エージェントの意図に沿い、再現もする */
  recommended: async (options) => {
    for (const [index, option] of options.entries()) {
      if (await option.getByTestId('agent-question-recommended').count() > 0) return index
    }
    return 0
  },
  /** 常に先頭。推奨を無視したときの進み方を見る */
  first: async () => 0,
  /** 常に末尾。推奨から最も遠い選択を続けたときの進み方を見る */
  last: async options => options.length - 1,
  /** seed 付き乱数。網羅性を上げつつ再現する */
  random: async (options, round) => {
    const value = (seed * 1103515245 + round * 12345) >>> 0
    return value % options.length
  },
  /** 選択肢を使わず自由記述で返す */
  free: async () => 'free',
}

const args = process.argv.slice(2)
const arg = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}

const policyName = arg('policy') ?? 'recommended'
const maxRounds = Number(arg('rounds') ?? 12)
const seed = Number(arg('seed') ?? 1)

/**
 * proposal の着地後に承認まで進めるかどうか。`--approve` を渡したときだけ進む。
 *
 * **既定は proposal で止める。** 承認はプロジェクトを生成する不可逆な操作であり、意図せず
 * 走らせない。取り違えたときの損害が非対称なので、既定は安全側に倒す。
 *
 * 承認まで進めると、`get-steering` と `submit-document`（`type: steering`）の成功経路を
 * 初めて通せる。この2本は提供以来一度も実機で動作を見られていない。
 */
const approveRequested = args.includes('--approve')

/**
 * 実行の最後に、この実行で作ったセッションを消すかどうか。
 *
 * **何度も回す道具なので、片付けまで手元で完結させる。** 残すと `projectShareRoot` に
 * 溜まり続けるうえ、途中で止めたセッションは `phase` が `stroking` のまま残り、巡回
 * （`server/plugins/01.retry-failed.ts`）に拾われて勝手に再キックされる。
 *
 * 消すのは**この実行が作った1本だけ**である。他の worktree や人が作ったものには触らない。
 * 証跡（`.stroke-check/` の HTML と `debugLogDir` の生出力）は消さない。合否の根拠は
 * そちらに残る。
 */
const cleanup = args.includes('--cleanup')

/**
 * この実行が作ったものの名前。片付けの対象である。
 *
 * 片付けは `run` の戻り値ではなくここを見る。**途中で落ちても片付けるためである。**
 * 戻り値からしか名前を知れないと、クラッシュした実行のセッションが必ず残り、`phase` が
 * `stroking` のまま巡回（`server/plugins/01.retry-failed.ts`）に拾われて勝手に再キック
 * され続ける。落ちたときこそ片付けが要る。
 *
 * **承認するとセッションディレクトリはプロジェクト名へ改名される**（U10）が、差し替えでは
 * なく**足す**。`approve` は承認の応答を取り逃したときも名前を返す（`response === null`
 * を成功として扱う）ので、差し替えにすると、実際には改名が起きていない場合に uuid の
 * セッションが対象から外れて残る。両方を候補にしておけば、在るほうが消える——無いほうは
 * `removeSession` が「無かった」と告げて終わるだけである。
 */
const cleanupTargets = new Set<string>()

/** 起動中のブラウザ。信号を受けたときに閉じるため、`main` の外からも触れるようにする */
let openBrowser: Browser | null = null

/** ブラウザを閉じるのを待つ上限。閉じ切れなくても片付けは進める */
const BROWSER_CLOSE_TIMEOUT_MS = 10_000

/**
 * 走っている片付け。**二度目の呼び出しは、済んだことにせず同じ完了を待つ。**
 *
 * `finally` と信号ハンドラの両方から呼ばれ、両方が同時に来ることがある。二度目を
 * 素通しにすると、信号側の片付けがまだセッションを消している最中に本流の例外が
 * top-level まで抜け、node がそこで終了して片付けごと落ちる（実測 2026-08-30:
 * 「片付けてから終わる」だけ出てディレクトリが残った）。
 */
let teardownRun: Promise<void> | null = null

/**
 * ブラウザを閉じ、`--cleanup` ならこの実行が作ったセッションを消す。
 *
 * ブラウザを先に閉じる。開いたままだと画面が消えた先を叩き続ける。消せなくても実行は
 * 落とさない（`removeSession` が飲み込む）ので、元の失敗を隠さない。
 */
function teardown(): Promise<void> {
  teardownRun ??= (async () => {
    if (openBrowser !== null) {
      // **閉じるのを無限には待たない。** 固まると、その先のセッション削除が永久に来ない。
      // 信号の経路には「2度目で待たずに落ちる」逃げ道があるが、`finally` には無い。
      // 閉じ切れなくても片付けは進める——残るのは子プロセス1つで、残せば困るのは
      // 巡回に拾われ続けるセッションのほうである
      // 逃げ用のタイマーは `unref` する。付けないと、閉じるのが先に済んでもタイマーが
      // イベントループに残り、正常終了の実行が最後に上限ぶんぶら下がる
      await Promise.race([
        openBrowser.close().catch(() => {}),
        new Promise((resolve) => { setTimeout(resolve, BROWSER_CLOSE_TIMEOUT_MS).unref() }),
      ])
    }
    if (!cleanup) return
    for (const target of cleanupTargets) await removeSession(target)
  })()
  return teardownRun
}

// **信号で殺されても片付ける。** `finally` は SIGINT / SIGTERM では走らない。片付かないと
// セッションが `stroking` のまま残り、巡回（`server/plugins/01.retry-failed.ts`）に拾われて
// 再キックされ続ける。
//
// この道具は外から落とされる。実測 2026-08-30: 同じマシンの別 worktree が E2E を回している
// 間、chromium が外部から SIGTERM（exitCode 143）され、この道具ごと落ちた。
//
// **2度目の信号は待たずに落ちる。** 片付けを待つあいだ node 既定の終了は効かないので、
// `browser.close()` が固まると Ctrl-C を何度押しても同じ promise を待つだけになる。
// 逃げ道を残す（片付けは諦める）。
let signalled = false
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    const code = 128 + (signal === 'SIGHUP' ? 1 : signal === 'SIGINT' ? 2 : 15)
    if (signalled) {
      console.log(`\n${signal} をもう一度受けた。片付けを待たずに終わる`)
      process.exit(code)
    }
    signalled = true
    console.log(`\n${signal} を受けた。片付けてから終わる`)
    void teardown().finally(() => process.exit(code))
  })
}

/**
 * proposal の着地後に差し戻すかどうか。`--send-back` を渡したときだけ差し戻す。
 *
 * 差し戻しは `get-send-back` の**成功経路**を通す唯一の手段である。差し戻しが無い間、
 * このツールが返す 404（`no_send_back`）は正常動作であって成功結果ではない。
 *
 * **指摘の文言は実行前に決め打てない。** proposal の中身は実行してみるまで分からず、
 * 固定文言では噛み合わない。噛み合わない指摘では、出し直された proposal が改善したのか
 * どうかを見られない。そこで値なしのときは、着地した proposal を読ませて haiku に
 * 指摘を書かせる（`draftSendBack`）。値を添えたときはその文言をそのまま使う
 */
const sendBackAt = args.indexOf('--send-back')
const sendBackRequested = sendBackAt !== -1
const nextOfSendBack = sendBackAt === -1 ? undefined : args[sendBackAt + 1]
const sendBackGiven = nextOfSendBack !== undefined && !nextOfSendBack.startsWith('--')
  ? nextOfSendBack
  : undefined
const overviewPath = arg('overview')
const overview = overviewPath === undefined ? DEFAULT_OVERVIEW : readFileSync(overviewPath, 'utf8')

/** 1往復ぶんの記録 */
type Round = {
  header: string
  detail: string
  question: string
  options: { label: string; description: string; recommended: boolean }[]
  answer: string
}

async function main(): Promise<void> {
  const policy = policies[policyName]
  if (policy === undefined) {
    fail(`回答ポリシー ${policyName} は無い（${Object.keys(policies).join(' / ')}）`)
  }

  // **デバッグログが無いと、承認まで進める判定が2つとも鈍る。** 黙って弱い判定に落ちると、
  // 通ったのか見られていないだけなのかが報告から分からない。使う前に言う
  if (approveRequested && DEBUG_LOG_DIR === '') {
    console.log('  注意: claude.debugLogDir が空なので、次の2つが効かない')
    console.log('    - 実行の終了を数えられないので、承認の手前の待ちが5秒固定になる')
    console.log('      （まだ動いている claude の作業場所を承認が改名しうる）')
    console.log('    - steering の着地を文書の有無だけで判定する')
    console.log('      （ツールを通さず直接書かれたものと区別できない）')
  }

  const before = new Set(logNames())

  // **`handleSIGINT: false` を外さない。** Playwright は既定で自前の SIGINT ハンドラを入れ、
  // ブラウザを閉じ終えた**直後に `process.exit(130)` を呼ぶ**（playwright-core の
  // `sigintHandler`）。こちらの片付けはブラウザを閉じてからセッションを消すので、
  // 既定のままだと Ctrl-C で削除の手前で node が落ち、セッションが残る（実測 2026-08-30）。
  // 残れば `stroking` のまま巡回に拾われて再キックされ続ける——この道具が塞ごうとした故障
  // そのものである。SIGTERM / SIGHUP のハンドラは exit を呼ばないので触らない。
  const browser = await chromium.launch({ handleSIGINT: false })
  openBrowser = browser
  try {
    const { rounds, landed, sessionId, revised, approved, steered } = await run(browser, policy)
    const html = render({ rounds, landed, sessionId, logs: logNames().filter(n => !before.has(n)) })
    const out = join(process.cwd(), '.stroke-check', `${sessionId}.html`)
    mkdirSync(join(process.cwd(), '.stroke-check'), { recursive: true })
    writeFileSync(out, html)

    console.log(`\nセッション: ${sessionId}`)
    console.log(`往復: ${rounds.length} / 着地: ${landed ? 'proposal に到達' : `未着地（上限 ${maxRounds}）`}`)
    if (revised !== null) {
      console.log(`差し戻し: ${revised ? 'proposal が出し直された' : `出し直されないまま時間切れ（${ROUND_TIMEOUT_MS}ms）`}`)
    }
    if (approved !== null) {
      console.log(`承認: プロジェクト「${approved}」を作った`)
      console.log(`steering: ${steered === true ? `文書 ${STEERING_DOCUMENTS} 本が揃った` : '揃わないまま時間切れ'}`)
    }
    console.log(`記録: ${out}`)

    // 頼んだことが空振りしたら、着地していても失敗として扱う。成功経路を見るのが目的で、
    // 空振りしたら見られていない
    if (!landed || revised === false || steered === false) process.exitCode = 1
  } finally {
    // **片付けは finally に置く。** 成功経路に置くと、途中で落ちた実行のセッションが
    // 必ず残る（実測 2026-08-30: 2往復目でブラウザが閉じた2回とも残った）。残ったものは
    // `stroking` のまま巡回に拾われて再キックされ続けるので、落ちたときこそ消す
    await teardown()
  }
}

async function run(browser: Browser, policy: Policy): Promise<{
  rounds: Round[]
  landed: boolean
  sessionId: string
  /** 差し戻しの結果。`--send-back` を渡していなければ null */
  revised: boolean | null
  /** 承認で確定したプロジェクト名。`--approve` を渡していなければ null */
  approved: string | null
  /** steering 工程の着地。承認まで進めていなければ null */
  steered: boolean | null
}> {
  const page = await browser.newPage({ baseURL: BASE })

  await openStrokes(page)

  await page.getByRole('textbox').first().fill(overview)

  // 概要の投稿もセッションの作成と起動要求の2本立て（`app/pages/strokes/index.vue`）
  //
  // **セッションは受理（`POST /api/sessions`）の時点で出来ている。** 起動要求より早いので、
  // 片付けの対象はこちらで拾うのが最短である。ここを待たずにいると、投稿の直後に画面が
  // 死んだとき（実測 2026-08-30: chromium が外から SIGTERM される）、サーバー側に出来た
  // セッションが対象から外れ、`stroking` のまま巡回に拾われて再キックされ続ける
  const created = page.waitForResponse(
    response => response.request().method() === 'POST' && /\/api\/sessions\/?($|\?)/.test(response.url()),
    { timeout: 60_000 },
  ).catch(() => null)

  const launched = page.waitForResponse(
    response => response.url().includes('/invoke-agent'),
    { timeout: 60_000 },
  ).catch(() => null)

  await page.getByRole('button', { name: '投稿' }).click()

  const createResponse = await created
  if (createResponse !== null) {
    const body = await createResponse.json().catch(() => null) as { sessionId?: unknown } | null
    if (typeof body?.sessionId === 'string') cleanupTargets.add(body.sessionId)
  }

  const launchResponse = await launched

  // **id が分かった時点で覚える。** 起動要求の URL には既にセッション id が入っている
  // （`/api/sessions/<uuid>/invoke-agent`）ので、下の `waitForURL` を待たずにここで拾う。
  // 待ってから覚えると、その手前の分岐——409 の起こし直し・非 ok の throw・URL 待ちの
  // 時間切れ——で落ちたときに、**サーバー側に出来ているセッションが片付けの対象から
  // 外れる**。残れば `stroking` のまま巡回に拾われて再キックされ続ける
  if (launchResponse !== null) {
    const fromLaunch = /\/sessions\/([0-9a-f-]{36})\//.exec(launchResponse.url())?.[1]
    if (fromLaunch !== undefined) cleanupTargets.add(fromLaunch)
  }

  if (launchResponse !== null && launchResponse.status() === 409) {
    // 概要の直後なので、まだ問いは1つも出ていない
    await relaunch(page, undefined)
  } else if (launchResponse !== null && !launchResponse.ok()) {
    const body = await launchResponse.text().catch(() => '')
    throw new Error(`概要投稿後の invoke-agent が ${launchResponse.status()}: ${body.slice(0, 300)}`)
  }

  // 概要を受理するとセッションが立ち、URL に id が入る
  await page.waitForURL(/\/strokes\/[0-9a-f-]{36}/, { timeout: 60_000 })
  const sessionId = page.url().split('/strokes/')[1]!.split('/')[0]!
  // 起動要求を取り逃していた場合はここが最初の記録になる（Set なので重複は畳まれる）
  cleanupTargets.add(sessionId)
  console.log(`セッション ${sessionId} を作った。ポリシー: ${policyName}`)

  const rounds: Round[] = []
  let previous: string | undefined
  for (let round = 1; round <= maxRounds; round++) {
    console.log(`  [${round}/${maxRounds}] 次を待つ`)
    if (await waitForNext(page, previous) === 'proposal') {
      // 差し戻し → 出し直し → 承認 の順で、1回の実行に通せる（併用できる）
      const revised = sendBackRequested ? await sendBack(page, policy, rounds, sessionId) : null
      const approved = approveRequested ? await approve(page) : null
      // 承認で uuid のディレクトリはプロジェクト名へ改名される（U10）。
      //
      // **名乗られた名前を鵜呑みにしない。** `approve` は承認の応答を取り逃したときも
      // 名前を返す（`response === null` を成功として扱う）。その名前をそのまま消しに行くと、
      // 承認が名前の衝突で失敗していた場合に**他人が作った同名のプロジェクトを消す**。
      // 消す先は phase の検査を持たない `removeTarget` なので、承認済みでも止まらない。
      // `--cleanup` の約束（消すのはこの実行が作った1本だけ）を破る不可逆な削除になる。
      //
      // 改名が起きたことを、uuid が消えて名前のほうが在ることで確かめてから足す。
      if (approved !== null
        && !existsSync(join(PROJECTS_ROOT, sessionId))
        && existsSync(join(PROJECTS_ROOT, approved))) {
        cleanupTargets.add(approved)
      }
      const steered = approved === null ? null : await waitForSteering(page, approved)
      return { rounds, landed: true, sessionId, revised, approved, steered }
    }
    // 待ちに入った時点（`waitForNext`）を基準に、問いを出した実行の終わりを待つ
    await settle(page, roundStartLogs)
    const answered = await answer(page, policy, round)
    rounds.push(answered)
    // ここでは基準を取り直さない。次の反復の `waitForNext` が待ちに入るときに取る
    previous = answered.question
    console.log(`  Q${round} ${answered.header}: ${answered.question} → ${answered.answer}`)
  }

  return { rounds, landed: false, sessionId, revised: null, approved: null, steered: null }
}

/**
 * **次の**問いが出るか proposal に着地するまで待つ。
 *
 * 待機表示が消えるのを待つのではなく、次の場面そのものを待つ。待機は出ないまま
 * 着地することがある。
 *
 * **直前に答えた問いと同じ本文なら、まだ次が来ていないとみなす。** 回答を送っても
 * AI が次を返すまでの間、画面には答えたばかりの問いが残る。それを「次が来た」と
 * 判断すると同じ問いに何度も答え続ける（実測 2026-08-28: 同一の問いに6回答え、
 * `strokes.json` にも同じ問いが5件記録された）。
 */
async function waitForNext(page: Page, previous: string | undefined): Promise<'question' | 'proposal'> {
  const question = page.getByTestId('agent-question-text')
  // ストロークの proposal 画面には testid が無いので、URL とボタンで見る。
  // `approval-approve` はポータル側（本家の承認カード）の testid で、ここには出ない
  // （実測 2026-08-28: 着地しているのに検知できず、上限まで待って落ちた）
  const proposal = page.getByRole('button', { name: '承認して作る' })
  const deadline = Date.now() + ROUND_TIMEOUT_MS

  // 待っている間は無言にしない。AI の応答は数分かかることがあり、進んでいるのか
  // 止まっているのかが外から分からないと、待つ判断も切る判断もできない
  const started = Date.now()
  beginRoundWait()
  const logs = roundStartLogs
  let notified = 0

  while (Date.now() < deadline) {
    if (page.url().includes('/proposal') || await proposal.count() > 0) { endProgress(); return 'proposal' }
    if (await question.count() > 0) {
      // **`count()` の後に消えることがある。** 問いは待機に入ると画面から手放され
      // （`useAgentQuestion` の決着）、その瞬間に読むと `innerText` が時間切れで落ちる
      // （実測 2026-08-30: `locator.innerText: Timeout 30000ms exceeded`）。消えたのなら
      // 待ち続ければよいだけなので、読めなかったことを失敗にしない
      const text = (await question.innerText().catch(() => '')).trim()
      if (text !== '' && text !== previous) { endProgress(); return 'question' }
    }

    const elapsed = Math.floor((Date.now() - started) / 1000)
    if (elapsed > notified) {
      notified = elapsed
      // claude の生出力が1本増える = 1回の呼び出しが終わった。増えていなければまだ実行中
      // 画面のエラー文言は 409 から回復しても残るので、現在の状態として出さない。
      // いま動いているかどうかは、claude の生出力が増えたかで見る
      const done = logEntryCount() - logs
      progress(`${elapsed}秒 — ${done > 0 ? '応答は返った。次を待っている' : 'AI が応答を組み立てている'}`)
    }

    await page.waitForTimeout(1000)
  }
  endProgress()

  // **画面のエラー表示で落とさない。** 起動の成否は要求の status で既に見ている
  // （`answer` / 概要投稿を参照）。画面のメッセージは 409 から回復しても残るため、
  // それを根拠に落とすと、回復済みの古いエラーを拾って毎回止まる
  // （実測 2026-08-28）。ここでは手がかりとして添えるだけにする。
  const failure = await launchFailure(page)
  throw new Error(
    `${ROUND_TIMEOUT_MS}ms 待っても次の問いも proposal も出なかった`
    + (failure === null ? '' : `（画面の表示: ${failure}）`),
  )
}

/**
 * 自由記述の回答を haiku に書かせる。
 *
 * **定型文では意味がない。** 以前は「ポリシー free による自動回答（N 往復目）」という
 * 中身の無い文字列を送っていた。口はあっても答えになっておらず、エージェントは
 * 何も受け取れない。それでは選択肢を外した意味がなく、往復も積まれない。
 *
 * 選択肢から選ぶ限り、エージェントは答えが確定したと扱う。自由記述で「どれでもない」
 * を返したときに、追加で問うのか、そのまま proposal へ行くのかを見るのがこのポリシーの
 * 目的である（ユーザー指示 2026-08-29）。
 */
async function draftFreeAnswer(
  header: string,
  detail: string,
  question: string,
  options: { label: string, description: string, recommended: boolean }[],
): Promise<string> {
  const prompt = [
    'あなたは開発の依頼主である。AI から次の問いを受けた。選択肢のどれも選ばず、自分の言葉で答えろ。',
    '',
    '- 150 文字以内の日本語。1段落',
    '- 前置き・見出し・箇条書きを付けず、回答の本文だけを出す',
    '- 選択肢のどれかをそのまま選ぶ答えにはしない。条件を足す、前提を問い返す、範囲を切り直すなど、',
    '  選択肢に収まらない答えにする',
    '- 具体的に答える。「お任せします」のような判断の放棄はしない',
    '',
    `見出し: ${header}`,
    `背景: ${detail}`,
    `問い: ${question}`,
    '選択肢:',
    ...options.map(o => `- ${o.label}: ${o.description}`),
  ].join('\n')

  console.log('    自由記述の回答を haiku に書かせている')
  const { stdout } = await execFileAsync(
    'claude',
    ['-p', '--model', 'haiku', '--', prompt],
    { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
  )

  const drafted = stdout.trim()
  if (drafted === '') throw new Error('haiku が自由記述の回答を返さなかった')
  return drafted
}

/**
 * この実行で作ったセッションを消す（`--cleanup`）。
 *
 * **消す実体はアプリと共有する**（`server/handler/delete.ts` の `removeTarget`）。ここで
 * `fse.remove` なり `rmSync` なりを独自に書くと、削除の経路が endpoint・CLI・道具の3本に
 * 増える。消す実体は1本という決めがあり（`update-session-api-handler`）、道具が独自の
 * 経路を持つとその決めが崩れる。
 *
 * 通すのは存在検査までで、phase の検査は通らない。**どの局面のものを消してよいかは削除の口
 * （endpoint）が持つ**もので、道具が片付けるのは自分が作ったものに限られ、承認まで進めた
 * 場合は消す対象がプロジェクトへ変わる。その判定を通す理由が無い。
 *
 * `state.json` を持たない残骸はここでは消さない（`removeTarget` の存在検査に落ちる）。
 * **消してよいものの定義を道具だけ緩めない。** 落ちたことは下の `catch` が告げる。
 *
 * 消せなくても実行は落とさない。片付けは検証の結果とは別の関心で、ここで落とすと
 * 合否の報告まで失う。消えなかったことは告げて、あとは人に委ねる。
 */
async function removeSession(target: string): Promise<void> {
  // **消す名前は必ず1階層の識別子として検査する。** 空文字が混ざれば
  // `join('/opt/projects', '')` は `/opt/projects` そのものになり、`existsSync` を通って
  // 親ごと消える形になる。承認名は画面の入力値を経由してくるので、出どころを信用しない
  // （`removeTarget` も同じ検査を通すが、その手前でこの道具の言葉で告げる）
  if (!isSafeSegment(target)) {
    console.log(`片付け: 名前として受け付けられないので消さない（${target}）`)
    return
  }

  const path = join(PROJECTS_ROOT, target)

  // **消す前に在るかを見る。** 見ずに「消した」と出すと、片付けたつもりの取りこぼしが
  // 実行ログからも分からない。承認の応答を取り逃したときのように、対象が2つあって
  // どちらか一方しか実在しない場合もある（`cleanupTargets`）
  if (!existsSync(path)) {
    console.log(`片付け: ${path} は無かった`)
    return
  }

  try {
    await removeTarget(PROJECTS_ROOT, target)
    console.log(`片付け: ${path} を消した`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.log(`片付け: ${path} を消せなかった（${detail}）`)
  }
}

/**
 * proposal が名前を出さなかったときに使う、この道具だと分かる名前。
 *
 * 検証で作ったものだと後から見分けられるよう接頭辞を付ける。kebab-case で、時刻で一意にする。
 */
function fallbackProjectName(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `check-stroke-${stamp}`
}

/**
 * proposal を承認してプロジェクトを作る（`--approve`）。
 *
 * **承認は不可逆である。** セッションディレクトリが `<projectName>` へ改名され、以後は
 * プロジェクトとして扱われる（`docs/specs/api/contract.md` U10）。本番の削除経路
 * （U11・`yarn session delete`）はもう受け付けない。
 *
 * 名前の衝突（409 `name-conflict`）はサフィックスを足して出し直す。**同じ概要を流せば
 * 同じ名前が提案されて必ず衝突する**ので、人が毎回考える形にはしない。衝突以外の 409
 * （AI が実行中 / phase 不整合）は名前を変えても通らないので、そのまま落とす。
 *
 * @returns 承認で確定したプロジェクト名
 */
async function approve(page: Page): Promise<string> {
  // **承認そのものは busy ガードの対象である**（`approve/index.post.ts`。fix-rename-during-running-session
  // で対象になった。実行中に承認すると 409 busy で断られる）。それでも実行の終わりを
  // ここで待つのは、断られてやり直すのではなく**一度で通したい**からである——待たずに
  // 投げて 409 を踏むと、この巡回スクリプトはそこで止まってしまう。承認がセッション
  // ディレクトリを**改名する**性質そのもの（まだ動いている claude の cwd を足元から
  // 動かす）は変わっていない。
  //
  // 基準は**この待ちに入った時点**（`waitForNext` が控えた本数）にする。`settle` の中で
  // 数え直すと、proposal を出した実行が既に終わっていても「増えていない」と見えて、
  // 4分を丸ごと捨てる（実測 2026-08-31）
  await settle(page, roundStartLogs)

  await page.getByRole('button', { name: '承認して作る' }).click()

  const dialog = page.getByRole('dialog')
  const nameInput = dialog.getByRole('textbox')
  await nameInput.waitFor({ state: 'visible', timeout: 30_000 })

  // 既定値は proposal が提示した名前。衝突したときの土台にする。
  //
  // **空のことがある。** 画面は `ProposalMessage.projectName` を初期値に入れるが、MCP ツール
  // `submit-document` には projectName を渡す口が無く、MCP 経由の提出では null になる
  // （A7 の契約は `{ proposal, projectName? }` を受けるのに、ツールが送っていない）。
  // 名前が空だと `approveBlocked` で「作る」が押せず、承認の検証がそこで止まる。
  // 道具は自前の名前を入れて先へ進む——成果物側の欠陥は別に起票する（実測 2026-08-30）
  const offered = (await nameInput.inputValue()).trim()
  const proposed = offered === '' ? fallbackProjectName() : offered
  if (offered === '') console.log(`  proposal が名前を出していない。${proposed} で進める`)

  for (let attempt = 1; attempt <= APPROVE_NAME_ATTEMPTS; attempt++) {
    // 初回も書き込む。既定値が空のことがあり（下記 `offered`）、書かないと
    // `approveBlocked` が解けず「作る」を押せない
    const name = attempt === 1 ? proposed : `${proposed}-${attempt}`
    await nameInput.fill(name)

    const responded = page.waitForResponse(
      response => response.url().includes('/approve'),
      { timeout: 60_000 },
    ).catch(() => null)

    await dialog.getByRole('button', { name: '作る', exact: true }).click()
    const response = await responded

    if (response === null || response.ok()) {
      console.log(`  承認: ${name}`)
      return name
    }

    const body = await response.text().catch(() => '')
    // 409 は3つの意味を持つ（名前の衝突 / AI が実行中 / phase 不整合）。名前を変えて
    // 通るのは衝突のときだけなので、理由を見て分ける（`useProposalReview.approve` と同じ判断）
    if (response.status() === 409 && body.includes('name-conflict')) {
      console.log(`  「${name}」は既にある。名前を変えて出し直す`)
      continue
    }
    throw new Error(`承認が ${response.status()}: ${body.slice(0, 300)}`)
  }

  throw new Error(`名前を ${APPROVE_NAME_ATTEMPTS} 回変えても承認が通らなかった`)
}

/**
 * 承認後の steering 工程が着地するのを見届ける。
 *
 * **承認の導線は steering を見せない。** 承認すると画面は `/projects` へ移って流れが終わる
 * （ADR 0011: この後の steering はサーバーが裏で起こすので、ユーザーは待たない）。
 *
 * **着地の判定は書かれた文書そのもので行う。** `<projectName>/.spec-workflow/steering/` に
 * product / tech / structure の3本が揃ったら着地とみなす。
 *
 * ステアリング文書の一覧画面（`/projects/<name>/steering`）では判定しない。あの画面は
 * 本家 dashboard の `GET /api/projects/:id/info` に依存し、本家は**起動中のプロジェクト
 * しか返さない**（ADR-0006）。プロジェクトが本家の一覧に載るのは、そのプロジェクトを
 * ワークスペースとする MCP サーバーが動いている間だけで、それは steering の claude が
 * 動いている間だけである。**claude が終わった瞬間に画面は「未接続」に戻る。**
 *
 * つまり画面で判定すると、文書が3本揃った直後に判定できるかどうかが、claude の終了と
 * 画面の再読み込みのどちらが先かという競争になる。実測（2026-08-31）でも、3本すべてが
 * 書かれて `submit-document` が 3回とも 200 を返しているのに、一覧は5回開き直しても
 * 出なかった。**成果物は書かれた文書である。文書を見る。**
 *
 * 一覧は開くだけ開いて、出れば人が見るための表示として使う。出なくても落とさない。
 */
async function waitForSteering(page: Page, projectName: string): Promise<boolean> {
  const url = `/projects/${projectName}/steering`

  // 一覧は**見せるためだけ**に開く。出なくても判定には要らないので落とさない
  await openSteering(page, url).catch(() => {
    console.log('  steering の一覧は出なかった（本家が起動中のプロジェクトしか返さないため）。文書で判定する')
  })

  const deadline = Date.now() + ROUND_TIMEOUT_MS
  const logs = logEntryCount()
  const submitted = submitDocumentCount()
  const started = Date.now()
  let notified = 0

  while (Date.now() < deadline) {
    const ready = steeringDocumentCount(projectName)
    // **文書が在るだけでは合格にしない。** 同じ数だけ `submit-document` が呼ばれて
    // いること（＝ツールを通ったこと）まで見る。設定が空でログを数えられないときは
    // この条件が満たせないので、その場合だけ文書の数で判定する
    const throughTool = DEBUG_LOG_DIR === '' || submitDocumentCount() - submitted >= STEERING_DOCUMENTS
    if (ready >= STEERING_DOCUMENTS && throughTool) { endProgress(); return true }

    const elapsed = Math.floor((Date.now() - started) / 1000)
    if (elapsed > notified) {
      notified = elapsed
      const done = logEntryCount() - logs
      progress(
        `${elapsed}秒 — steering 文書 ${ready}/${STEERING_DOCUMENTS}`
        + `（${done > 0 ? '応答は返った' : 'AI が書いている'}）`,
      )
    }
    await page.waitForTimeout(1000)
  }

  endProgress()
  console.log(
    `  steering 文書は ${steeringDocumentCount(projectName)}/${STEERING_DOCUMENTS} で時間切れ`
    + `（submit-document は ${submitDocumentCount() - submitted} 回）`,
  )
  return false
}

/**
 * 書かれた steering 文書の本数。**中身が空のものは数えない。**
 *
 * 置き場は本家が決めるもので（`.spec-workflow/steering/<name>.md`）、こちらの設定ではない。
 * 中身の良し悪しは見ないが、**空ファイルを1本と数えると「置き場を作っただけ」で合格に
 * なる**（santa-method レビュー指摘 9周目）。
 */
function steeringDocumentCount(projectName: string): number {
  const dir = join(PROJECTS_ROOT, projectName, '.spec-workflow', 'steering')
  return ['product', 'tech', 'structure'].filter((name) => {
    const path = join(dir, `${name}.md`)
    try {
      return readFileSync(path, 'utf8').trim() !== ''
    } catch {
      return false
    }
  }).length
}

/**
 * これまでに呼ばれた `submit-document` の回数（デバッグログ全体）。
 *
 * **文書が在ることだけでは、提出を経た証拠にならない。** steering の claude は
 * `--allowedTools` に `Write` / `Edit` を持ち、cwd はそのプロジェクトなので、**ツールを
 * 通さず3本を直接書ける**。それを合格にすると、`get-steering-guide` が名指しで避けている
 * 故障（本家のやり方でファイルを直接書く）をそのまま見逃す（santa-method レビュー指摘
 * 9周目 2026-08-31）。
 *
 * 置き場は `logEntryCount` と同じくデバッグログで、設定が空なら数えられない。
 *
 * **`logEntryCount` と同じく、全セッションを横断した数である。** 別のセッションの
 * **steering の**提出が同時に起これば増分に混ざる。道具は1度に1セッションしか作らないので
 * 通常は起きないが、巡回が別のプロジェクトの steering を起こしている最中に走らせると
 * 誤って通りうる。
 *
 * **数えられるのは終了した実行の分だけである。** 生出力はプロセスの close でしか
 * フラッシュされない（`server/utils/stroke/claude.ts` の `child.on('close')`）ので、
 * この判定は実質「文書3本 **かつ** steering の実行が終わっている」を見ている。
 */
function submitDocumentCount(): number {
  if (DEBUG_LOG_DIR === '') return 0
  let total = 0
  for (const name of logNames()) {
    try {
      for (const line of readFileSync(join(DEBUG_LOG_DIR, name), 'utf8').split('\n')) {
        if (!line.startsWith('{')) continue
        let parsed: unknown
        try { parsed = JSON.parse(line) } catch { continue }
        total += steeringSubmissionsIn(parsed)
      }
    } catch {
      // 読めないファイルは数えない（`logEntryCount` と同じ）
    }
  }
  return total
}

/**
 * 生出力の1行に含まれる「steering 種別の `submit-document` の呼び出し」の数。
 *
 * **種別まで見る。** 名前だけで数えると flontier の proposal 提出も混ざり、別セッションの
 * 往復が steering の合格条件を満たしてしまう（santa-method レビュー指摘 10周目 2026-08-31）。
 */
function steeringSubmissionsIn(entry: unknown): number {
  const message = (entry as { message?: { content?: unknown } }).message
  const content = message?.content
  if (!Array.isArray(content)) return 0
  return content.filter((block) => {
    const b = block as { type?: string, name?: string, input?: { type?: string } }
    return b.type === 'tool_use'
      && b.name === 'mcp__stroke-board__submit-document'
      && b.input?.type === 'steering'
  }).length
}

/**
 * steering の一覧を開く。開けなければ開き直す。
 *
 * `openStrokes` と同じ事情である（dev がモジュールを取り落とすと `load` が終わらない）。
 * ここで諦めると、承認まで通した実行の steering を一度も見られないまま落ちる。
 * 一覧そのものは空でも出るので、待つのは `steering-list` が見えるところまで。
 */
async function openSteering(page: Page, url: string): Promise<void> {
  // **開き直さない。** 判定はこの画面を見ないので（`waitForSteering`）、出ないときに
  // 粘る意味が無い。本家が起動中のプロジェクトしか返さない以上、出ないほうが普通である。
  // 5回 × 30 秒を回すと、表示のためだけに最大150秒を捨てる（santa-method レビュー指摘 9周目）
  const navigated = await page.goto(url).then(() => true).catch(() => false)
  const shown = navigated && await page.getByTestId('steering-list')
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (!shown) throw new Error('steering の一覧が出なかった')
}

/**
 * 画面1（概要の入力）を開く。開けなければ開き直す。
 *
 * dev サーバーは依存を個別のモジュールとして配る。数が多く、途中で1本でも取り落とすと
 * Vue アプリがマウントされず、画面が白いまま何も出ない（実測 2026-08-29:
 * `net::ERR_NETWORK_CHANGED` と `Failed to fetch dynamically imported module: entry.js`。
 * 同じ dev サーバーに3回開き直して3回目で出た）。
 *
 * **これは stroke-board の欠陥ではなく dev の配信の問題である。** 成果物の評価に持ち込まない
 * よう、ここで吸収する。開き直しても出ないなら、そのときは環境として落とす。
 */
async function openStrokes(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt++) {
    // **`goto` 自体も落ちる。** モジュールを取り落とすと `load` が終わらず、ここで
    // タイムアウトする（実測 2026-08-30）。要素の待ちだけ拾っても、その手前で例外が
    // 抜けてリトライに入れない
    const navigated = await page.goto('/strokes').then(() => true).catch(() => false)
    const shown = navigated && await page.getByTestId('stroke-modal')
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    if (shown) return
    console.log(`  画面1 が出ない（${attempt}/${OPEN_ATTEMPTS}）。開き直す`)
  }
  throw new Error(`画面1（概要の入力）が ${OPEN_ATTEMPTS} 回開き直しても出なかった。dev サーバーの状態を疑う`)
}

/**
 * 着地した proposal を haiku に読ませて、差し戻しの指摘を書かせる。
 *
 * **ここで claude を直接呼ぶのは、人がやる仕事の代わりだからである。** 検証の原則
 * 「操作はブラウザのみ」は、stroke の工程を動かす claude（invoke.ts が spawn する側）に
 * かかる決まりで、その経路はここでは触らない。差し戻しの指摘を書くのは工程の外に居る
 * 人間の役割であり、その代役をここで立てている。
 *
 * 読むのは着地した proposal の実物（`docs/proposal.md`）。画面の DOM から拾うより確実で、
 * endpoint も叩かない。
 *
 * モデルは haiku。指摘を1つ書くだけの仕事に大きいモデルは要らない（ユーザー指示 2026-08-29）。
 */
async function draftSendBack(sessionId: string): Promise<string> {
  const proposal = readFileSync(join(PROJECTS_ROOT, sessionId, 'docs', 'proposal.md'), 'utf8')

  const prompt = [
    '次の proposal をレビューし、差し戻す理由を1つだけ挙げろ。',
    '',
    '- 200 文字以内の日本語。1段落',
    '- 前置き・見出し・箇条書きを付けず、指摘の本文だけを出す',
    '- proposal の具体的な記述を指し、何をどう直すかが分かる形で書く',
    '- 褒めない。直すべき点だけを書く',
    '',
    '--- proposal ---',
    proposal,
  ].join('\n')

  console.log('  差し戻しの指摘を haiku に書かせている')
  const { stdout } = await execFileAsync(
    'claude',
    ['-p', '--model', 'haiku', '--', prompt],
    { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
  )

  const drafted = stdout.trim()
  if (drafted === '') throw new Error('haiku が差し戻しの指摘を返さなかった')
  return drafted
}

/**
 * proposal を1回差し戻して、出し直されるまで見る。
 *
 * **差し戻しは `get-send-back` の成功経路を通す唯一の手段である。** 差し戻しが無い間、
 * このツールが返す 404（`no_send_back`）は正常動作であって成功結果ではない。
 *
 * 差し戻しには指摘が最低1件要る（`useProposalReview.sendBack`。0件だと画面が警告を出して
 * 送らない）。本文の箇所に紐づく指摘は範囲選択の操作が要るので、箇所を持たない
 * 「全体へのコメント」を1件付けて出す。
 *
 * 差し戻した後の応答は2通りある（`pages/strokes/[sessionId]/proposal.vue`）。
 *
 * - **問い返し**: 帯のボタンからモーダルを開いて答える。中身は画面1 と同じ
 *   `AgentQuestion.vue` なので `answer` がそのまま使える
 * - **出し直し**: 「差し戻しを受けて proposal が出し直されました」が出る
 *
 * 問い返しは何度でも来るので、出し直しに至るまで答え続ける。答えるたびに待ちの期限を
 * 取り直す（1回の応答に要る時間は往復のたびに変わらない）。
 */
async function sendBack(
  page: Page,
  policy: Policy,
  rounds: Round[],
  sessionId: string,
): Promise<boolean> {
  // 着地の検知は「承認して作る」ボタンでも通る（URL を見ていない経路がある）。
  // 指摘を付ける口が出るまで待ってから触る
  // **proposal を出した実行の終了を待ってから触る。** 受理（`server/handler/proposal.ts` の publish）は
  // 実行の途中で飛ぶので、画面に proposal が出た時点ではまだ動いている。ここで待たないと、
  // 続く `beginRoundWait()` の基準がその実行の終了行を含まず、`approve` の `settle` が
  // 「終わっている」と誤読して素通りする（santa-method レビュー指摘 11周目 2026-08-31）
  await settle(page, roundStartLogs)

  const addComment = page.getByRole('button', { name: '＋ 全体へのコメント' })
  await addComment.waitFor({ state: 'visible', timeout: 30_000 })

  const comment = sendBackGiven ?? await draftSendBack(sessionId)
  console.log(`  差し戻す: ${comment}`)
  await addComment.click()
  await page.getByPlaceholder('proposal 全体について').fill(comment)
  await page.getByRole('button', { name: '付ける' }).click()

  // ラベルは「差し戻す(件数)」。件数は付けた指摘の数で変わるので前方一致で掴む
  await page.getByRole('button', { name: /^差し戻す\(/ }).click()

  const followup = page.getByRole('button', { name: 'AI から質問があります' })
  const revised = page.getByText('差し戻しを受けて proposal が出し直されました')

  // 出し直しの実行はここから始まる。基準を取り直さないと、`approve` の `settle` が
  // 「差し戻しの前の実行が終わっている」を根拠に素通りする
  beginRoundWait()

  let deadline = Date.now() + ROUND_TIMEOUT_MS
  let started = Date.now()
  let notified = 0
  let reloadedAt = Date.now()

  while (Date.now() < deadline) {
    if (await revised.count() > 0) { endProgress(); return true }

    if (await followup.count() > 0) {
      endProgress()
      // 問い返しも AI の実行の途中で出る。答える前に終了を待たないと 409 を踏む（`settle`）
      await settle(page, roundStartLogs)
      await followup.click()
      const round = rounds.length + 1
      const answered = await answer(page, policy, round)
      rounds.push(answered)
      console.log(`  Q${round}（差し戻し後） ${answered.header}: ${answered.question} → ${answered.answer}`)
      // **答えたら新しい実行が始まる。ここで基準を取り直す。**
      // 取り直さないと、`approve` の `settle` は「問い返しを出した実行が終わっている」を
      // 根拠に素通りし、出し直しの実行が動いている足元でディレクトリを改名する
      // （santa-method レビュー指摘 10周目 2026-08-31。9周目の修正はこの経路を外していた）
      beginRoundWait()
      deadline = Date.now() + ROUND_TIMEOUT_MS
      started = Date.now()
      notified = 0
      reloadedAt = Date.now()
      continue
    }

    // **画面が固まると帯も出し直しの報せも出ない。** dev がモジュールを取り落とすと Vue が
    // 動かなくなり、サーバー側は進んでいるのに画面だけが止まる（実測 2026-08-29: 3問目が
    // `send-question` で提出済み・`state.json` にも入っているのに、帯が出ないまま時間切れ）。
    // 一定時間なにも変わらなければ画面を取り直して、状態を見直す
    if (Date.now() - reloadedAt > RELOAD_INTERVAL_MS) {
      endProgress()
      console.log('    変化が無い。画面を取り直す')
      await page.reload()
      reloadedAt = Date.now()
      started = Date.now()
      notified = 0
      continue
    }

    const elapsed = Math.floor((Date.now() - started) / 1000)
    if (elapsed > notified) {
      notified = elapsed
      progress(`${elapsed}秒 — 差し戻しを受けた AI の応答を待っている`)
    }
    await page.waitForTimeout(1000)
  }

  endProgress()
  return false
}

/**
 * 問いを出した実行が終わるのを待ってから答える。
 *
 * **これをしないと必ず 409 を踏む。** 問いは AI プロセスの実行の**途中**で提出されるので、
 * 画面に出た時点ではまだそのプロセスが動いている。そこへ答えると `invoke-agent` が
 * busy ガードに弾かれる。人は問いを読んで選ぶ間に終わるので踏まない。
 *
 * しかもこの画面（`pages/strokes/[sessionId]/index.vue`）は 409 のとき
 * 「AI を起動できませんでした。」を出すだけで再試行の口を持たない。踏んでからの回復が
 * 画面上に無いので、踏まないようにするのが唯一の道である（実測 2026-08-28）。
 *
 * 終了は claude の生出力が1本増えたことで分かる（`debugLogDir`）。設定が空で数えられない
 * ときは、一定時間だけ置いて進む。
 */
async function settle(page: Page, baseline: number): Promise<void> {
  if (DEBUG_LOG_DIR === '') {
    await page.waitForTimeout(5000)
    return
  }

  // **もう終わっているなら待たない。** 基準を渡されたときは、その時点から生出力が
  // 増えているかを見る。増えていれば実行は終わっており、ここで待つと何も起きないまま
  // `ROUND_TIMEOUT_MS`（4分）を丸ごと捨てる（実測 2026-08-31: `approve` の手前で毎回）
  const before = baseline
  if (logEntryCount() > before) return
  const deadline = Date.now() + ROUND_TIMEOUT_MS
  const started = Date.now()
  let notified = 0

  while (Date.now() < deadline) {
    if (logEntryCount() > before) { endProgress(); return }

    const elapsed = Math.floor((Date.now() - started) / 1000)
    if (elapsed > notified) {
      notified = elapsed
      progress(`${elapsed}秒 — 問いを出した実行の終了を待っている`)
    }
    await page.waitForTimeout(1000)
  }

  endProgress()
  console.log('    実行の終了を確認できないまま答える')
}

/**
 * busy（409）が解けるのを待って、起動要求だけを出し直す。
 *
 * 回答は既に受理されている（`answer` は成功している）ので、送り直すのは起動要求だけである。
 * 回答ごと送り直すと同じ答えが二重に記録される。
 */
async function relaunch(page: Page, previous: string | undefined): Promise<void> {
  const deadline = Date.now() + ROUND_TIMEOUT_MS
  const retryButton = page.getByTestId('invocation-retry')
  const started = Date.now()
  let notified = 0

  console.log('    busy(409) — 前の実行が終わるのを待つ')

  while (Date.now() < deadline) {
    await page.waitForTimeout(3000)

    const elapsed = Math.floor((Date.now() - started) / 1000)
    if (elapsed > notified) {
      notified = elapsed
      progress(`${elapsed}秒 — busy(409) の解除待ち`)
    }

    // 既に**次の**問いか proposal が出ていれば、待っている間に前の実行が片付いた。
    //
    // **直前の問いと同じなら回復していない。** 答えたばかりの問いは画面に残るので、
    // 「問いが見えている」だけを条件にすると、何も起動しないまま回復したと判断して戻り、
    // その後は永久に待つことになる（実測 2026-08-28: Q2 の回答は記録されたのに
    // `invocation: idle` のまま4分待って落ちた）。
    if (page.url().includes('/proposal')) { endProgress(); return }
    if (await page.getByTestId('invocation-error').count() === 0) {
      const shown = page.getByTestId('agent-question-text')
      if (await shown.count() > 0) {
        // `count()` の後に消えることがある（`waitForNext` と同じ事情）
        const text = (await shown.innerText().catch(() => '')).trim()
        if (text !== '' && text !== previous) { endProgress(); return }
      }
    }

    // **画面の操作でやり直す。** `fetch` でサーバーを直接叩くと、起動は通っても画面側の
    // 失敗状態（`useWaitingRetry` の errored）が残る。画面はその状態だと proposal へ
    // 遷移しない（`pages/strokes/[sessionId]/index.vue` の watch）ので、着地しているのに
    // 画面が動かないまま上限まで待つことになる（実測 2026-08-28: `phase: proposed` に
    // なっていたのにスクリプトは検知できず落ちた）。
    if (await retryButton.count() > 0) {
      await retryButton.click()
      endProgress()
      console.log('    画面から起動をやり直した')
      return
    }
  }

  endProgress()
  // この画面は 409 のとき再試行の口を出さない（`errorMessage` を出すだけ）。踏んだら
  // 画面からは戻れないので、それが分かる形で落とす。`settle` で踏まないようにしてある
  throw new Error(
    `${ROUND_TIMEOUT_MS}ms 待っても busy(409) から回復しなかった。`
    + 'この画面は 409 のとき再試行の口を出さないため、画面からは回復できない',
  )
}

/** 画面に出ている起動失敗の知らせ。無ければ null */
async function launchFailure(page: Page): Promise<string | null> {
  for (const title of ['AI を起動できませんでした', '答えを送れませんでした', 'AI からの応答が得られませんでした']) {
    const shown = page.getByText(title, { exact: false })
    if (await shown.count() > 0) return (await shown.first().innerText().catch(() => '')).trim()
  }
  return null
}

/** 今出ている問いに、ポリシーに従って答える */
async function answer(page: Page, policy: Policy, round: number): Promise<Round> {
  const text = async (id: string): Promise<string> => {
    const locator = page.getByTestId(id)
    return await locator.count() > 0 ? (await locator.innerText().catch(() => '')).trim() : ''
  }

  const header = await text('agent-question-header')
  const detail = await text('agent-question-detail')
  // **問いの本文は空で通さない。** ここが空だと `previous` が空になり、次の待ちが
  // `text !== previous` で**同じ問いを「次が来た」と誤認する**（実測 2026-08-28 の
  // 「同一の問いに6回答えた」故障の再発経路。santa-method レビュー指摘 9周目）。
  // 読めなかっただけのことがあるので1度だけ読み直し、それでも空なら落とす
  // **待って読む。** 1回×2秒だけだと、モーダルの描画が間に合わないだけで実行全体が落ちる。
  // この道具の他の待ちと同じく、期限まで粘ってから諦める
  let question = await text('agent-question-text')
  const readDeadline = Date.now() + 30_000
  while (question === '' && Date.now() < readDeadline) {
    await page.waitForTimeout(500)
    question = await text('agent-question-text')
  }
  if (question === '') {
    throw new Error('問いの本文を読めなかった。空のまま答えると、次の待ちが同じ問いを新しい問いと取り違える')
  }

  const locators = await page.getByTestId('agent-question-option').all()
  const options = await Promise.all(locators.map(async (option) => {
    const lines = (await option.innerText()).trim().split('\n').map(line => line.trim())
    return {
      label: lines[0] ?? '',
      description: lines[lines.length - 1] ?? '',
      recommended: await option.getByTestId('agent-question-recommended').count() > 0,
    }
  }))

  const choice = locators.length === 0 ? 'free' : await policy(locators, round)

  let answered: string
  if (choice === 'free') {
    answered = await draftFreeAnswer(header, detail, question, options)
    await page.getByTestId('agent-question-free').fill(answered)
  } else {
    answered = options[choice]?.label ?? ''
    await locators[choice]!.click()
  }

  // 送信は `answer` の受理と `invoke-agent` の起動要求の2本立て（`useAgentQuestion.send`）。
  // 2本目が飛ぶ前に次の待ちへ入らないよう、起動要求の応答まで待つ
  const launched = page.waitForResponse(
    response => response.url().includes('/invoke-agent'),
    { timeout: 60_000 },
  ).catch(() => null)

  await page.getByTestId('agent-question-submit').click()

  // 起動要求の結果をそのまま見る。画面のメッセージ（「AI を起動できませんでした」）は
  // 理由を潰してしまうので、status と本文を掴んでおく。
  //
  // **409 は待てば通る。** 問いが画面に出た時点では、その問いを出した AI のプロセスが
  // まだ終わっていない。人が問いを読んで選ぶ間に終わるので手では踏まないが、機械が即座に
  // 答えると busy ガードに弾かれる（実測 2026-08-28:「このセッションは AI の応答を
  // 待っている」）。待ってから起動要求だけを出し直す
  const response = await launched
  if (response !== null && response.status() === 409) {
    // いま答えた問いを渡す。これと同じものが見えている間は回復していない
    await relaunch(page, question)
  } else if (response !== null && !response.ok()) {
    const body = await response.text().catch(() => '')
    throw new Error(`invoke-agent が ${response.status()}: ${body.slice(0, 300)}`)
  }

  return { header, detail, question, options, answer: answered }
}

/** 待っている間の1行。同じ行を上書きし続けるので、止まっていれば止まって見える */
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
let spin = 0

function progress(text: string): void {
  const frame = SPINNER[spin++ % SPINNER.length]
  // `\r` で行頭へ戻して上書きする。行が流れ続けないので、長い待ちでも画面が荒れない
  process.stdout.write(`\r    ${frame} ${text.padEnd(48)}`)
}

/** 上書きしていた行を確定させ、次の出力と混ざらないようにする */
function endProgress(): void {
  process.stdout.write('\r'.padEnd(56) + '\r')
}

/** `debugLogDir` にあるログの名前。設定が空なら空配列 */
function logNames(): string[] {
  if (DEBUG_LOG_DIR === '') return []
  try {
    return readdirSync(DEBUG_LOG_DIR).sort()
  } catch {
    return []
  }
}

/**
 * これまでに記録された claude の呼び出しの回数。
 *
 * **ファイル数では数えられない。** ログはセッションごとに1ファイルへ**追記**される
 * （`adr0016-sub-update-debug-log-per-session`）ので、同じセッションの2回目以降は
 * ファイルが増えない。ファイル数で見ていると、2往復目からは実行が終わっても気付けず、
 * 必ず時間切れまで待つことになる（実測 2026-08-30: `settle` が毎回
 * 「実行の終了を確認できないまま答える」に落ちていた）。
 *
 * 1回の呼び出しは `# <日時>` の見出し行1本に対応する。それを数える。
 */
function logEntryCount(): number {
  if (DEBUG_LOG_DIR === '') return 0
  let total = 0
  for (const name of logNames()) {
    try {
      const text = readFileSync(join(DEBUG_LOG_DIR, name), 'utf8')
      total += text.split('\n').filter(line => line.startsWith('# ')).length
    } catch {
      // 読めないファイルは数えない。数え漏らしても待ちが伸びるだけで、誤検知はしない
    }
  }
  return total
}

/** セッションディレクトリのファイルを読む。無ければ空 */
function sessionFile(sessionId: string, ...path: string[]): string {
  try {
    return readFileSync(join(PROJECTS_ROOT, sessionId, ...path), 'utf8')
  } catch {
    return ''
  }
}

/**
 * 経過を1枚の HTML に綴じる。
 *
 * **判定ではない。** 記録は概要・往復・成果物・claude の生出力と散らばっており、
 * 1本の流れとして辿れない。応対の品質を人が見るために、時系列で1枚にまとめる。
 */
function render(input: {
  rounds: Round[]
  landed: boolean
  sessionId: string
  logs: string[]
}): string {
  const { rounds, landed, sessionId, logs } = input

  const escape = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const toolCalls = logs.flatMap(name => readToolCalls(join(DEBUG_LOG_DIR, name)))

  const roundBlocks = rounds.map((round, index) => `
    <section class="round">
      <h2>Q${index + 1} <span class="header">${escape(round.header)}</span></h2>
      <p class="detail">${escape(round.detail)}</p>
      <p class="question">${escape(round.question)}</p>
      <ul class="options">
        ${round.options.map(option => `
          <li class="${option.label === round.answer ? 'chosen' : ''}">
            <b>${escape(option.label)}</b>${option.recommended ? '<em>推奨</em>' : ''}
            <span>${escape(option.description)}</span>
          </li>`).join('')}
      </ul>
      <p class="answer">回答: <b>${escape(round.answer)}</b></p>
    </section>`).join('')

  return `<!doctype html>
<meta charset="utf-8">
<title>ストローク ${sessionId}</title>
<style>
  body { font: 14px/1.7 system-ui, sans-serif; max-width: 56rem; margin: 2rem auto; padding: 0 1rem;
         background: #14161a; color: #e6e8eb; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin: 0 0 .5rem; }
  .meta { display: flex; gap: 1.5rem; flex-wrap: wrap; color: #9aa4b2; font-size: .85rem;
          border-bottom: 1px solid #2a2f36; padding-bottom: 1rem; }
  .landed { color: ${landed ? '#5ac47d' : '#e0603f'}; font-weight: 600; }
  .round { border: 1px solid #2a2f36; border-radius: .5rem; padding: 1rem; margin: 1rem 0; }
  .header { color: #7aa2f7; }
  .detail { color: #9aa4b2; font-size: .9rem; }
  .question { font-weight: 600; font-size: 1.05rem; }
  .options { list-style: none; padding: 0; }
  .options li { border: 1px solid #2a2f36; border-radius: .4rem; padding: .5rem .75rem; margin: .35rem 0; }
  .options li.chosen { border-color: #5ac47d; background: #1a2620; }
  .options em { background: #2a2f36; border-radius: .25rem; padding: 0 .4rem; margin-left: .5rem;
                font-style: normal; font-size: .75rem; }
  .options span { display: block; color: #9aa4b2; font-size: .85rem; }
  .answer b { color: #5ac47d; }
  pre { background: #0e1013; border: 1px solid #2a2f36; border-radius: .4rem; padding: 1rem;
        overflow-x: auto; font-size: .8rem; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  td, th { border-bottom: 1px solid #2a2f36; padding: .3rem .5rem; text-align: left; }
  .fail { color: #e0603f; }
</style>

<h1>ストローク ${sessionId}</h1>
<div class="meta">
  <span>回答ポリシー: <b>${escape(policyName)}</b></span>
  <span>往復: <b>${rounds.length}</b></span>
  <span class="landed">${landed ? 'proposal に着地' : `未着地（上限 ${maxRounds}）`}</span>
</div>

<h2>概要</h2>
<pre>${escape(sessionFile(sessionId, 'overview.txt') || overview)}</pre>

${roundBlocks}

<h2>ツールの呼び出し</h2>
${toolCalls.length === 0
  ? '<p>記録なし（claude.debugLogDir が空か、ログを読めなかった）</p>'
  : `<table><tr><th>ツール</th><th>結果</th></tr>${toolCalls.map(call => `
      <tr><td>${escape(call.name)}</td>
          <td class="${call.failed ? 'fail' : ''}">${escape(call.result)}</td></tr>`).join('')}</table>`}

<h2>proposal</h2>
<pre>${escape(sessionFile(sessionId, 'docs', 'proposal.md') || '（未提出）')}</pre>

<h2>生ログ</h2>
<pre>${escape([
  `セッション: ${join(PROJECTS_ROOT, sessionId)}`,
  ...logs.map(name => `claude 出力: ${join(DEBUG_LOG_DIR, name)}`),
].join('\n'))}</pre>
`
}

/**
 * claude の生出力からツールの呼び出しと結果を拾う。
 *
 * `--output-format stream-json`（`debugLogDir` を設定したとき）の1行1イベントを読む。
 * ツールの失敗はここにしか残らない——最終結果のエンベロープは、途中でツールが失敗しても
 * `is_error: false` のまま成功で終わる（実測 2026-08-27: MCP ツールが 500 を返し続けたのに
 * サーバーのログにもエンベロープにも痕跡が無かった）。
 */
function readToolCalls(path: string): { name: string; result: string; failed: boolean }[] {
  let lines: string[]
  try {
    lines = readFileSync(path, 'utf8').split('\n').filter(line => line.trim() !== '')
  } catch {
    return []
  }

  const names = new Map<string, string>()
  const calls: { name: string; result: string; failed: boolean }[] = []

  for (const line of lines) {
    let event: Record<string, unknown>
    try {
      event = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }

    const message = event.message as { content?: unknown[] } | undefined
    for (const part of message?.content ?? []) {
      const block = part as Record<string, unknown>
      if (block.type === 'tool_use') {
        names.set(String(block.id), String(block.name))
      }
      if (block.type === 'tool_result') {
        const name = names.get(String(block.tool_use_id)) ?? '(不明)'
        calls.push({
          name,
          result: summarize(block.content),
          failed: block.is_error === true,
        })
      }
    }
  }

  return calls
}

/** ツールの結果を1行に畳む。全文は生ログを見ればよい */
function summarize(content: unknown): string {
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  const status = /"status":\s*(\d+)/.exec(text)?.[1]
  const head = text.replace(/\s+/g, ' ').slice(0, 120)
  return status === undefined ? head : `${status} ${head}`
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

await main()
