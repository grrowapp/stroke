import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

/**
 * 許可と、画面で編集した管理者の登録を持つ `access.json` の読み書き（design D7）。
 *
 * 置き場は保存先（`projectShareRoot`）の下の `.stroke-board/access.json`。セッションと
 * プロジェクトと同じ親に置くので、worktree を替えても同じ許可を見る。直下の走査は
 * `.spec-workflow` か `state.json` を持つディレクトリしか拾わないので、一覧に混ざらない。
 *
 * Nitro に依存しない。保存先は呼び出し側が渡す（docs/specs/core/settings-reference.md
 * 「設定を引くのは端だけである」）。
 */

const ACCESS_DIR = '.stroke-board'
const ACCESS_FILE = 'access.json'

export interface AdminEntries {
  emails: string[]
  networks: string[]
  hosts: string[]
}

export interface AccessStore {
  /** メールアドレス（小文字）→ 許可のあるプロジェクト（ディレクトリ名） */
  users: Record<string, string[]>
  /** 管理者の登録。`access.json` が無いあいだは `runtimeConfig.access.admins` が入る */
  admins: AdminEntries
}

const storeSchema = z.object({
  users: z.record(z.string(), z.array(z.string())).default({}),
  admins: z
    .object({
      emails: z.array(z.string()).default([]),
      networks: z.array(z.string()).default([]),
      hosts: z.array(z.string()).default([]),
    })
    .default({ emails: [], networks: [], hosts: [] }),
})

export function accessFile(root: string): string {
  return join(root, ACCESS_DIR, ACCESS_FILE)
}

export function emptyStore(): AccessStore {
  return { users: {}, admins: { emails: [], networks: [], hosts: [] } }
}

/**
 * 読む。無ければ、許可は空・管理者の登録は `initialAdmins` として返す（design D11）。
 *
 * 入れた時点ではどの利用者にも許可が無い。管理者の登録は `runtimeConfig.access.admins` を
 * 初期値として始め、画面で保存した時点から `access.json` の内容だけが判定に使われる。
 * 初期値も画面から足し引きできる。
 */
export async function readAccessStore(root: string, initialAdmins?: AdminEntries): Promise<AccessStore> {
  let raw: string
  try {
    raw = await readFile(accessFile(root), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return initialAdmins === undefined ? emptyStore() : normalizeStore({ users: {}, admins: initialAdmins })
    }
    throw error
  }
  return normalizeStore(storeSchema.parse(JSON.parse(raw)))
}

/** 書く。一時ファイルへ書いてから rename するので、読み手は書きかけを見ない。 */
export async function writeAccessStore(root: string, store: AccessStore): Promise<void> {
  const target = accessFile(root)
  await mkdir(join(root, ACCESS_DIR), { recursive: true })
  const temp = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(normalizeStore(store), null, 2)}\n`, 'utf8')
    await rename(temp, target)
  } catch (error) {
    await unlink(temp).catch(() => {})
    throw error
  }
}

/** read-modify-write を直列化する。同じプロセスの書き手はすべてここを通る。 */
let queue: Promise<unknown> = Promise.resolve()

export function updateAccessStore(
  root: string,
  update: (store: AccessStore) => AccessStore,
  initialAdmins?: AdminEntries,
): Promise<AccessStore> {
  const run = queue.then(async () => {
    const next = normalizeStore(update(await readAccessStore(root, initialAdmins)))
    await writeAccessStore(root, next)
    return next
  })
  queue = run.catch(() => {})
  return run
}

/** 利用者にプロジェクトの許可を足す。既にあれば何も変えない。 */
export function grantProject(store: AccessStore, email: string, project: string): AccessStore {
  const key = email.toLowerCase()
  const current = store.users[key] ?? []
  if (current.includes(project)) return store
  return { ...store, users: { ...store.users, [key]: [...current, project] } }
}

/**
 * 形を揃える。メールアドレスは小文字にし、重複と空を落とす。照合で大文字と小文字を
 * 区別しないため（`access/identity`）。
 */
export function normalizeStore(store: AccessStore): AccessStore {
  const users: Record<string, string[]> = {}
  for (const [email, projects] of Object.entries(store.users)) {
    const key = email.trim().toLowerCase()
    if (!key) continue
    users[key] = unique([...(users[key] ?? []), ...projects])
  }
  return {
    users,
    admins: {
      emails: unique(store.admins.emails.map((email) => email.trim().toLowerCase())),
      networks: unique(store.admins.networks.map((network) => network.trim())),
      hosts: unique(store.admins.hosts.map((host) => host.trim().toLowerCase())),
    },
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))]
}
