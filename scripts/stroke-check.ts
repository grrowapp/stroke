import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

// ランナー（`playwright test`）には載せないが、ブラウザを動かす口は `@playwright/test` が
// 再エクスポートしているものを使う。`playwright` を直接指すと間接依存に頼ることになる
import { chromium, type Browser, type Locator, type Page } from '@playwright/test'

import nuxtConfig from '../nuxt.config'

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
 *   yarn check:stroke --cleanup             この実行で作ったセッションを最後に片付ける
 */

const execFileAsync = promisify(execFile)

const PORT = nuxtConfig.devServer?.port ?? 3399
const BASE = `http://127.0.0.1:${PORT}`

/** セッションの置き場と、claude の生出力の書き出し先。設定が正（nuxt.config.ts） */
const claude = nuxtConfig.runtimeConfig?.claude as { debugLogDir?: string } | undefined
const PROJECTS_ROOT = String(nuxtConfig.runtimeConfig?.projectShareRoot ?? '/opt/projects')
const DEBUG_LOG_DIR = claude?.debugLogDir ?? ''

/**
 * 1往復あたりの待ちの上限。
 *
 * claude 側の打ち切り（`CLAUDE_TIMEOUT_MS` = 3分）より短くしない。短いと、まだ動いている
 * 実行を待たずに諦めることになる。少し長めに取って、claude が自分で打ち切ったあとの
 * 表示まで見届ける。
 */
const ROUND_TIMEOUT_MS = 4 * 60 * 1000

/**
 * 変化が無いまま待ち続けたときに、画面を取り直す間隔。
 *
 * dev がモジュールを取り落とすと Vue が動かなくなり、サーバー側は進んでいるのに画面だけが
 * 止まる。取り直せば現在の状態を拾い直せる（`sendBack`）。
 */
const RELOAD_INTERVAL_MS = 60 * 1000

/** 投入する既定の概要。設計判断が既にいくつか入っていて、問いが立ちやすいもの */
const DEFAULT_OVERVIEW = `## setai

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

  const before = new Set(logNames())

  const browser = await chromium.launch()
  try {
    const { rounds, landed, sessionId, revised } = await run(browser, policy)
    const html = render({ rounds, landed, sessionId, logs: logNames().filter(n => !before.has(n)) })
    const out = join(process.cwd(), '.stroke-check', `${sessionId}.html`)
    mkdirSync(join(process.cwd(), '.stroke-check'), { recursive: true })
    writeFileSync(out, html)

    console.log(`\nセッション: ${sessionId}`)
    console.log(`往復: ${rounds.length} / 着地: ${landed ? 'proposal に到達' : `未着地（上限 ${maxRounds}）`}`)
    if (revised !== null) {
      console.log(`差し戻し: ${revised ? 'proposal が出し直された' : `出し直されないまま時間切れ（${ROUND_TIMEOUT_MS}ms）`}`)
    }
    console.log(`記録: ${out}`)

    if (cleanup) removeSession(sessionId)

    // 差し戻しを頼んだのに出し直されなかったら、着地していても失敗として扱う。
    // `get-send-back` の成功経路を見るのが目的なので、差し戻しが空振りしたら意味がない
    if (!landed || revised === false) process.exitCode = 1
  } finally {
    await browser.close()
  }
}

async function run(browser: Browser, policy: Policy): Promise<{
  rounds: Round[]
  landed: boolean
  sessionId: string
  /** 差し戻しの結果。`--send-back` を渡していなければ null */
  revised: boolean | null
}> {
  const page = await browser.newPage({ baseURL: BASE })

  await openStrokes(page)

  await page.getByRole('textbox').first().fill(overview)

  // 概要の投稿もセッションの作成と起動要求の2本立て（`app/pages/strokes/index.vue`）
  const launched = page.waitForResponse(
    response => response.url().includes('/invoke-agent'),
    { timeout: 60_000 },
  ).catch(() => null)

  await page.getByRole('button', { name: '投稿' }).click()

  const launchResponse = await launched
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
  console.log(`セッション ${sessionId} を作った。ポリシー: ${policyName}`)

  const rounds: Round[] = []
  let previous: string | undefined
  for (let round = 1; round <= maxRounds; round++) {
    console.log(`  [${round}/${maxRounds}] 次を待つ`)
    if (await waitForNext(page, previous) === 'proposal') {
      if (!sendBackRequested) return { rounds, landed: true, sessionId, revised: null }
      const revised = await sendBack(page, policy, rounds, sessionId)
      return { rounds, landed: true, sessionId, revised }
    }
    await settle(page)
    const answered = await answer(page, policy, round)
    rounds.push(answered)
    previous = answered.question
    console.log(`  Q${round} ${answered.header}: ${answered.question} → ${answered.answer}`)
  }

  return { rounds, landed: false, sessionId, revised: null }
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
  const logs = logNames().length
  let notified = 0

  while (Date.now() < deadline) {
    if (page.url().includes('/proposal') || await proposal.count() > 0) { endProgress(); return 'proposal' }
    if (await question.count() > 0) {
      const text = (await question.innerText()).trim()
      if (text !== '' && text !== previous) { endProgress(); return 'question' }
    }

    const elapsed = Math.floor((Date.now() - started) / 1000)
    if (elapsed > notified) {
      notified = elapsed
      // claude の生出力が1本増える = 1回の呼び出しが終わった。増えていなければまだ実行中
      // 画面のエラー文言は 409 から回復しても残るので、現在の状態として出さない。
      // いま動いているかどうかは、claude の生出力が増えたかで見る
      const done = logNames().length - logs
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
 * 消せなくても実行は落とさない。片付けは検証の結果とは別の関心で、ここで落とすと
 * 合否の報告まで失う。消えなかったことは告げて、あとは人に委ねる。
 *
 * **承認まで進んだ場合は名前が変わる**（セッションディレクトリがプロジェクト名へ改名される）。
 * その場合 uuid のディレクトリはもう無いので、消すものが無いという結果になる。
 */
function removeSession(sessionId: string): void {
  const dir = join(PROJECTS_ROOT, sessionId)
  try {
    rmSync(dir, { recursive: true, force: true })
    console.log(`片付け: ${dir} を消した`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.log(`片付け: ${dir} を消せなかった（${detail}）`)
  }
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
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.goto('/strokes')
    const shown = await page.getByTestId('stroke-modal')
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    if (shown) return
    console.log(`  画面1 が出ない（${attempt}/5）。開き直す`)
  }
  throw new Error('画面1（概要の入力）が5回開き直しても出なかった。dev サーバーの状態を疑う')
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

  let deadline = Date.now() + ROUND_TIMEOUT_MS
  let started = Date.now()
  let notified = 0
  let reloadedAt = Date.now()

  while (Date.now() < deadline) {
    if (await revised.count() > 0) { endProgress(); return true }

    if (await followup.count() > 0) {
      endProgress()
      // 問い返しも AI の実行の途中で出る。答える前に終了を待たないと 409 を踏む（`settle`）
      await settle(page)
      await followup.click()
      const round = rounds.length + 1
      const answered = await answer(page, policy, round)
      rounds.push(answered)
      console.log(`  Q${round}（差し戻し後） ${answered.header}: ${answered.question} → ${answered.answer}`)
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
async function settle(page: Page): Promise<void> {
  if (DEBUG_LOG_DIR === '') {
    await page.waitForTimeout(5000)
    return
  }

  const before = logNames().length
  const deadline = Date.now() + ROUND_TIMEOUT_MS
  const started = Date.now()
  let notified = 0

  while (Date.now() < deadline) {
    if (logNames().length > before) { endProgress(); return }

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
        const text = (await shown.innerText()).trim()
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
    if (await shown.count() > 0) return (await shown.first().innerText()).trim()
  }
  return null
}

/** 今出ている問いに、ポリシーに従って答える */
async function answer(page: Page, policy: Policy, round: number): Promise<Round> {
  const text = async (id: string): Promise<string> => {
    const locator = page.getByTestId(id)
    return await locator.count() > 0 ? (await locator.innerText()).trim() : ''
  }

  const header = await text('agent-question-header')
  const detail = await text('agent-question-detail')
  const question = await text('agent-question-text')

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
