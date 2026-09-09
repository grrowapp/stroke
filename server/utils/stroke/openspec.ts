import { execFile } from 'node:child_process'
import { access, rm, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** パスが在るか。埋め戻してよいかの判定にだけ使う */
async function exists(path: string): Promise<boolean> {
  return await access(path).then(() => true).catch(() => false)
}

/**
 * セッションの openspec ルート。名前は openspec が決めるもので、こちらは従う。
 * 設定ではない（docs/specs/core/settings-reference.md）。
 */
export const OPENSPEC_DIR = 'openspec'
export const OPENSPEC_CONFIG_FILE = 'config.yaml'

/**
 * セッションディレクトリを openspec ルートとして初期化する。
 *
 * cwd = セッションディレクトリで `openspec init --tools none` を実行し、`config.yaml` を
 * スキーマ名で上書きする。スキーマの実体は user レベル（`~/.local/share/openspec/schemas/`）
 * から解決される。store はどのコードパスからも使わない。
 *
 * 起こす CLI とその引数（`bin` / `initArgs`）とスキーマ名は、呼び出し側が設定から引いて
 * 渡す。この関数は設定を引かない（settings-reference.md「設定を引くのは端だけである」）。
 * ルートのディレクトリ名と `config.yaml` は openspec が決めるものなので固定値で持つ。
 *
 * change はここでは作らない。**そして、掘ったルートを使う者が現状は居ない。** 使い手と
 * して書いていた `/openspec-ff-change` は本 change が `firstPrompt` から外し、スキルの
 * 実体も無い（`--add-dir` を外したのでスキルとしてもロードされない）。実測でも、変更後に
 * 完走したセッションの `openspec/changes` は空（`archive` だけ）で、同セッションの
 * `tool_use` に `Bash` は0回だった（2026-08-30）。`openspec init` を走らせ続けるかどうかの
 * 判断は本 change の範囲外なので、掘る側は据え置いてある
 * （santa-method レビュー指摘 7周目 2026-08-30）。
 *
 * **消えたセッションのためには掘らない。** 掘る前と掘った後に `sessionExists` を見て、
 * 実在しなければ何もしない（掘ってしまっていたら埋め戻す）。消えたセッションに openspec
 * ルートだけを作っても、`state.json` を持たない殻は一覧にも巡回にも載らず、保存先に
 * 溜まるだけである。実際に `yarn check:stroke --cleanup` の片付けとこの初期化が競合し、
 * 消した直後に同じ uuid の殻が生まれている（実測 2026-08-30・SIGINT）。
 *
 * 実在の判定は渡してもらう。この関数は保存先も設定も知らない（上と同じ理由）。
 *
 * 失敗は素の Error のまま呼び出し側へ届ける。
 */
export async function initSessionOpenspec(options: {
  cwd: string
  bin: string
  initArgs: string
  schemaName: string
  /** 対象がまだ実在するか。`state.json` の有無で答える（`sessionExists`） */
  sessionExists: () => Promise<boolean>
}): Promise<void> {
  const { cwd, bin, initArgs, schemaName, sessionExists } = options

  // 掘る前に見る。ここで落とせば、そもそも殻が生まれない
  if (!(await sessionExists())) {
    throw new Error(`セッションが無いので openspec ルートを作らない: ${cwd}`)
  }

  // **掘る前に openspec ルートが在ったかを控える。** 埋め戻してよいのは、この呼び出しが
  // 作った場合だけである。既に在ったなら中身は他が作ったもので、消すと成果物を壊す
  // （`openspec/changes/…` ごと消える。santa-method レビュー指摘 7周目 2026-08-30）。
  //
  // 既に在る状態で `prepare` が走るのは、`config.yaml` に `schema:` が無くて一覧の検査を
  // 通らないときである（`server/handler/session.ts` の `passesListChecks`）。そこを踏んだときに
  // 埋め戻すと、消してよいものと悪いものの区別が付かなくなる。
  const rootCreatedHere = !(await exists(join(cwd, OPENSPEC_DIR)))

  let failure: unknown = null
  try {
    await execFileAsync(bin, initArgs.split(/\s+/), { cwd })
    await writeFile(
      join(cwd, OPENSPEC_DIR, OPENSPEC_CONFIG_FILE),
      `schema: ${schemaName}\n`,
      'utf8',
    )
  } catch (error) {
    failure = error
  }

  // 掘っている間に消えることがある（`openspec init` は自分で掘り直す）。**成否に
  // 関わらず見る**——途中で落ちたときこそ掘りかけが残る。
  //
  // `sessionExists` は `stat` の失敗を全部 false に畳む（`server/handler/delete.ts` の
  // `targetExists`）。EACCES や
  // EMFILE でも false になるので、**生きているセッションを消えたと誤認しうる**。だから
  // 埋め戻しは `rootCreatedHere` で二重に守る——誤認しても、こちらが作っていないものには
  // 触れない。
  if (!(await sessionExists())) {
    if (rootCreatedHere) await discardOpenspecRoot(cwd)
    throw new Error(`初期化の途中でセッションが消えた: ${cwd}`)
  }

  if (failure !== null) throw failure
}

/**
 * 掘った分を埋め戻す。
 *
 * **呼ぶのは、この初期化が openspec ルートを作った場合だけである**（呼び出し側の
 * `rootCreatedHere`）。この関数自体は在ったかどうかを見ないので、直接呼ばないこと。
 *
 * openspec ルートを消し、それで空になったときだけディレクトリ自体を取り除く
 * （`rmdir` は中身が残っていれば失敗する）。ここは削除の経路ではないので、
 * 消えなかったことを失敗にはしない——元の失敗を隠さないためでもある。
 */
async function discardOpenspecRoot(cwd: string): Promise<void> {
  await rm(join(cwd, OPENSPEC_DIR), { recursive: true, force: true }).catch(() => {})
  await rmdir(cwd).catch(() => {})
}
