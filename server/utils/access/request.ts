import { randomUUID } from 'node:crypto'
import { basename, dirname, resolve } from 'node:path'
import type { Peer } from 'crossws'
import { createError, getHeader, getRequestIP, type H3Event } from 'h3'
import { allows } from 'nuxt-authorization/utils'
import type { AccessUser } from '#shared/access'
import { manageAccess, viewProject, viewSession } from '#shared/access'
import { isPromotedPhase } from '#shared/stroke'
import { resolveProjectName } from '../../handler/project-directory'
import { readServerConfig } from '../config'
import { readRegistry } from '../upstream/registry'
import { resolveAccessUser, type RequestMaterial } from './identity'
import { readAccessStore, updateAccessStore, type AccessStore, type AdminEntries } from './store'
import { ACCESS_TOKEN_HEADER, type TokenSettings } from './token'
import { readStartedBy } from './started-by'

/**
 * リクエストから利用者を求め、api が対象ごとに見られるかを確かめる端（design D1・D5）。
 *
 * 設定を引くのはここだけである。判定の実体（`identity.ts`）と登録の読み書き（`store.ts`）は
 * 設定を引数で受ける。
 */

/** `runtimeConfig.access` を読む */
export function accessSettings(): TokenSettings & { admins: AdminEntries } {
  const access = useRuntimeConfig().access
  return {
    teamDomain: String(access.teamDomain ?? '').trim(),
    aud: String(access.aud ?? '').trim(),
    admins: {
      emails: [...(access.admins?.emails ?? [])],
      networks: [...(access.admins?.networks ?? [])],
      hosts: [...(access.admins?.hosts ?? [])],
    },
  }
}

/** 保存先。`access.json` はこの下に置く */
export function shareRoot(): string {
  return useRuntimeConfig().projectShareRoot
}

/** 登録を読む。`access.json` が無いあいだの管理者は `runtimeConfig.access.admins`（design D11） */
export function loadAccessStore(): Promise<AccessStore> {
  return readAccessStore(shareRoot(), accessSettings().admins)
}

/** 登録を書き換える。初期値の扱いは `loadAccessStore` と同じ */
export function saveAccessStore(update: (store: AccessStore) => AccessStore): Promise<AccessStore> {
  return updateAccessStore(shareRoot(), update, accessSettings().admins)
}

// --- サーバー内部の呼び出し（design D3） ---

/** 内部 token を運ぶ header の名前 */
export const INTERNAL_TOKEN_HEADER = 'x-stroke-internal'

/**
 * 内部 token。プロセスの起動時に乱数で作り、メモリにだけ持つ。外へ出さない。
 *
 * 画面で編集できる管理者の登録に頼らず、`/mcp` と同じく利用者の判定と別の仕組みで通す。
 */
const internalToken = randomUUID()

type FetchOptions = NonNullable<Parameters<typeof $fetch>[1]>

function withInternalToken<T extends FetchOptions>(options: T | undefined): T {
  const headers = new Headers(options?.headers as HeadersInit | undefined)
  headers.set(INTERNAL_TOKEN_HEADER, internalToken)
  return { ...options, headers } as T
}

/**
 * サーバーから自分の API を呼ぶ口。**サーバーが自分の API を呼ぶときは必ずこれを使う。**
 * 使い方は全域の `$fetch` と同じで、内部 token の header を足すだけである。
 *
 * 素の `$fetch` で呼ぶと内部 token が付かず、利用者の判定に掛かって 404 になる。
 *
 * 全域の `$fetch` は呼ぶたびに引く。Nitro の起動で入るので、このモジュールが読み込まれた
 * 時点ではまだ無いことがある。
 */
export const internalFetch = Object.assign(
  <T = unknown>(request: string, options?: FetchOptions) =>
    $fetch<T>(request, withInternalToken(options)),
  {
    raw: <T = unknown>(request: string, options?: FetchOptions) =>
      $fetch.raw<T>(request, withInternalToken(options)),
  },
)

function isInternal(event: H3Event): boolean {
  return getHeader(event, INTERNAL_TOKEN_HEADER) === internalToken
}

// --- 利用者 ---

/** 判定の材料をリクエストから取り出す。接続元は `x-forwarded-for` の先頭を先に見る（design D4） */
export function materialOf(event: H3Event): RequestMaterial {
  return {
    token: getHeader(event, ACCESS_TOKEN_HEADER) || undefined,
    address: getRequestIP(event, { xForwardedFor: true }),
    host: getHeader(event, 'host'),
  }
}

/** 内部の呼び出しの利用者。管理者と同じく、すべてを見られる */
const INTERNAL_USER: AccessUser = { email: null, admin: true, projects: [] }

/**
 * このリクエストの利用者。1リクエストにつき1回だけ求め、`event.context` に置く。
 *
 * 求めるのは使われたときである。静的ファイルのような判定を使わないリクエストで
 * `access.json` を読まない。
 */
export function accessUserOf(event: H3Event): Promise<AccessUser> {
  const cached = event.context.accessUser as Promise<AccessUser> | undefined
  if (cached) return cached

  const resolved = isInternal(event)
    ? Promise.resolve(INTERNAL_USER)
    : loadAccessStore().then((store) => resolveAccessUser(materialOf(event), accessSettings(), store))
  event.context.accessUser = resolved
  return resolved
}

/**
 * WebSocket の接続の利用者（design D6）。
 *
 * upgrade は `request` hook を通らないので、接続が開いたときに peer から求める。接続元は
 * `x-forwarded-for` の先頭を先に見て、無ければ socket のアドレスを使う。
 */
export async function accessUserOfPeer(peer: Peer): Promise<AccessUser> {
  const headers = peer.request.headers
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const material: RequestMaterial = {
    token: headers.get(ACCESS_TOKEN_HEADER) || undefined,
    address: forwarded || peer.remoteAddress,
    host: headers.get('host') ?? undefined,
  }
  return resolveAccessUser(material, accessSettings(), await loadAccessStore())
}

// --- 対象ごとの確認（design D5）。見られなければ 404 ---

/**
 * `authorize` は使わない。AuthorizationError 以外の例外を握り潰して通すため
 * （nuxt-authorization issue #77）。`allows` の結果で自分で 404 を投げる。
 */
function notFound(): Error {
  return createError({ statusCode: 404, statusMessage: 'Not Found' })
}

/** プロジェクト（ディレクトリ名）を見られなければ 404 */
export async function requireProjectName(event: H3Event, projectName: string): Promise<void> {
  if (!(await allows(viewProject, await accessUserOf(event), projectName))) throw notFound()
}

/** 本家の `projectId` のプロジェクトを見られなければ 404。名前が引けないものも 404 */
export async function requireProjectId(event: H3Event, projectId: string): Promise<void> {
  const user = await accessUserOf(event)
  if (user.admin) return
  const name = await projectNameOf(projectId)
  if (name === null || !(await allows(viewProject, user, name))) throw notFound()
}

/**
 * セッションの id の対象を見られなければ 404。
 *
 * id は昇格前は uuid、昇格後はプロジェクト名である。昇格後はプロジェクトの許可で、
 * 昇格前は始めた利用者で決める。`state.json` が読めないものは、在るかどうかの判定を
 * 各 endpoint に任せる（管理者でなければ 404 になる）。
 */
export async function requireSession(event: H3Event, sessionId: string): Promise<void> {
  const user = await accessUserOf(event)
  if (user.admin) return
  if (!(await canViewSession(user, sessionId))) throw notFound()
}

export async function canViewSession(user: AccessUser, sessionId: string): Promise<boolean> {
  if (user.admin) return true
  const record = await readStartedBy(shareRoot(), sessionId)
  if (record === null) return false
  if (isPromotedPhase(record.phase)) return allows(viewProject, user, sessionId)
  return allows(viewSession, user, record.startedBy)
}

/** 一覧の行のうち、利用者が見られるものだけを残す。行の id はセッションの id と同じ扱い */
export async function visibleSessions<T extends { id: string }>(event: H3Event, rows: T[]): Promise<T[]> {
  const user = await accessUserOf(event)
  if (user.admin) return rows
  const visible = await Promise.all(rows.map((row) => canViewSession(user, row.id)))
  return rows.filter((_, index) => visible[index])
}

/** プロジェクト一覧の行のうち、利用者が見られるものだけを残す（`project/directory`） */
export async function visibleProjects<T extends { name: string }>(event: H3Event, rows: T[]): Promise<T[]> {
  const user = await accessUserOf(event)
  if (user.admin) return rows
  const visible = await Promise.all(rows.map((row) => allows(viewProject, user, row.name)))
  return rows.filter((_, index) => visible[index])
}

/** ユーザー管理を使えなければ 404 */
export async function requireAdmin(event: H3Event): Promise<void> {
  if (!(await allows(manageAccess, await accessUserOf(event)))) throw notFound()
}

/**
 * 本家の `projectId` から、保存先の直下の名前を引く。
 *
 * 本家の registry に載っていれば、その `workflowRootPath` が保存先の直下にある場合に限って
 * その名前を使う。載っていなければ、承認で作ったものに限って導出値から引く
 * （`handler/project-directory.ts` の `resolveProjectName`）。
 */
export async function projectNameOf(projectId: string): Promise<string | null> {
  const config = readServerConfig()
  const root = config.projectsParentPath
  if (root === null) return null

  const registry = await readRegistry(config.specWorkflowHome)
  if (registry.status === 'ok') {
    const entry = registry.entries.find((candidate) => candidate.projectId === projectId)
    if (entry && resolve(dirname(entry.workflowRootPath)) === resolve(root)) return basename(entry.workflowRootPath)
  }
  return resolveProjectName(root, projectId)
}
