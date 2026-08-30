import { describe, expect, it } from 'vitest'

import { invokePath } from './invoke'
import { shouldRetry } from './sweep'

/**
 * 巡回は `failed` だけを拾う（openspec/specs/portal/batch）。
 * `running` の時間切れ判定は invokeAi、`idle` はやり直すものが無く、`error` は
 * ユーザーへ引き渡す終端なので、いずれも拾わない。
 */

describe('shouldRetry', () => {
  it('failed だけを拾う', () => {
    expect(shouldRetry('failed')).toBe(true)
  })

  it('running / idle / error は拾わない', () => {
    expect(shouldRetry('running')).toBe(false)
    expect(shouldRetry('idle')).toBe(false)
    expect(shouldRetry('error')).toBe(false)
  })
})

describe('invokePath', () => {
  it('path を cwd として添える', () => {
    expect(invokePath('abc', '/opt/projects/abc')).toBe(
      '/api/strokes/abc/invoke-agent?cwd=%2Fopt%2Fprojects%2Fabc',
    )
  })

  it('相対パスである（自分自身の待ち受けを知らない）', () => {
    expect(invokePath('abc', '/x')).not.toMatch(/^https?:/)
  })

  it('cwd に含まれる記号を素通しにしない', () => {
    expect(invokePath('id', '/opt/a b&c')).toContain('cwd=%2Fopt%2Fa%20b%26c')
  })

  it('プロジェクト名に含まれる記号も素通しにしない', () => {
    expect(invokePath('a b', '/x')).toContain('/api/strokes/a%20b/invoke-agent')
  })
})
