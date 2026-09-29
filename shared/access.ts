/**
 * 利用者の判定の結果と、それを使う ability。画面とサーバーが同じ定義を使う（design D5）。
 *
 * 判定の規則は `access/identity`、絞り込みの範囲は `access/permission` にある。
 */

import { defineAbility } from 'nuxt-authorization/utils'

/**
 * リクエストの利用者。
 *
 * - token があれば `email` はそのメールアドレス（小文字）。管理者に指名されていれば `admin`
 * - token が無ければ `email` は null。登録された接続元・ホスト名からなら `admin`
 * - サーバー内部の呼び出しは `admin`（design D3）
 */
export interface AccessUser {
  email: string | null
  admin: boolean
  /** 許可のあるプロジェクト（ディレクトリ名）。管理者は許可に関わらず入れるので見ない */
  projects: string[]
}

/** 管理者として扱う登録。メールアドレス・接続元ネットワーク（CIDR）・ホスト名 */
export interface AdminEntriesDto {
  emails: string[]
  networks: string[]
  hosts: string[]
}

/** ユーザー管理画面が読み書きする登録（`GET` / `PUT /api/access`） */
export interface AccessSettingsDto {
  /** メールアドレス → 許可のあるプロジェクト（ディレクトリ名） */
  users: Record<string, string[]>
  /** 管理者の登録。画面で保存するまでは `nuxt.config.ts` の初期値 */
  admins: AdminEntriesDto
}

/** 利用者を判別できず、管理者でもない */
export const NO_USER: AccessUser = { email: null, admin: false, projects: [] }

/** プロジェクト（ディレクトリ名）を見られるか */
export const viewProject = defineAbility(
  (user: AccessUser, projectName: string) => user.admin || user.projects.includes(projectName),
)

/**
 * プロジェクトへ昇格する前のストロークを見られるか。始めた利用者本人と管理者だけ。
 * 始めた利用者を持たないストローク（`startedBy` が null）は管理者だけ。
 */
export const viewSession = defineAbility(
  (user: AccessUser, startedBy: string | null) =>
    user.admin || (user.email !== null && startedBy !== null && user.email === startedBy.toLowerCase()),
)

/** ユーザー管理画面とその API を使えるか */
export const manageAccess = defineAbility((user: AccessUser) => user.admin)
