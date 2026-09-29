import { allows } from 'nuxt-authorization/utils'
import { describe, expect, it } from 'vitest'

import { manageAccess, viewProject, viewSession, type AccessUser } from '../../../../shared/access'

/** 許可による絞り込みの規則（access/permission・access/user-management） */
const guest: AccessUser = { email: 'guest@example.com', admin: false, projects: ['alpha'] }
const other: AccessUser = { email: 'other@example.com', admin: false, projects: [] }
const admin: AccessUser = { email: null, admin: true, projects: [] }

describe('プロジェクト', () => {
  it('許可のあるプロジェクトだけを見られる', async () => {
    expect(await allows(viewProject, guest, 'alpha')).toBe(true)
    expect(await allows(viewProject, guest, 'beta')).toBe(false)
  })

  it('管理者は許可に関わらず見られる', async () => {
    expect(await allows(viewProject, admin, 'beta')).toBe(true)
  })
})

describe('作成途中のストローク', () => {
  it('始めた本人と管理者だけが見られる', async () => {
    expect(await allows(viewSession, guest, 'Guest@Example.com')).toBe(true)
    expect(await allows(viewSession, other, 'guest@example.com')).toBe(false)
    expect(await allows(viewSession, admin, 'guest@example.com')).toBe(true)
  })

  it('始めた利用者を持たないものは管理者だけ', async () => {
    expect(await allows(viewSession, guest, null)).toBe(false)
    expect(await allows(viewSession, admin, null)).toBe(true)
  })
})

describe('ユーザー管理', () => {
  it('管理者だけが使える', async () => {
    expect(await allows(manageAccess, admin)).toBe(true)
    expect(await allows(manageAccess, guest)).toBe(false)
  })
})
