import { describe, expect, it } from 'vitest'

import { matchesHost, matchesNetwork, parseCidr } from '../../../../server/utils/access/source'

/** token が無い接続を、接続元とホスト名で管理者と判定する材料（access/identity） */
describe('接続元ネットワークの照合', () => {
  const networks = ['192.168.1.0/24', '100.64.0.0/10', '::1/128']

  it('登録した範囲の中のアドレスは当たる', () => {
    expect(matchesNetwork('192.168.1.20', networks)).toBe(true)
    expect(matchesNetwork('100.64.1.2', networks)).toBe(true)
    expect(matchesNetwork('::1', networks)).toBe(true)
  })

  it('IPv4 を IPv6 の形で受けても当たる', () => {
    expect(matchesNetwork('::ffff:192.168.1.20', networks)).toBe(true)
  })

  it('範囲の外と、アドレスが無いものは当たらない', () => {
    expect(matchesNetwork('192.168.2.20', networks)).toBe(false)
    expect(matchesNetwork(undefined, networks)).toBe(false)
    expect(matchesNetwork('', networks)).toBe(false)
  })

  it('形の崩れた登録はその1件だけを無視する', () => {
    expect(matchesNetwork('192.168.1.20', ['not-a-cidr', '192.168.1.0/24'])).toBe(true)
    expect(parseCidr('10.0.0.0/33')).toBeNull()
  })
})

describe('ホスト名の照合', () => {
  it('port を除いて、大文字と小文字を区別せずに照らす', () => {
    expect(matchesHost('XXX.grrow.app:443', ['xxx.grrow.app'])).toBe(true)
    expect(matchesHost('[::1]:3100', ['::1'])).toBe(true)
  })

  it('登録に無いホスト名は当たらない', () => {
    expect(matchesHost('stroke.grrow.app', ['xxx.grrow.app'])).toBe(false)
    expect(matchesHost(undefined, ['xxx.grrow.app'])).toBe(false)
  })
})
