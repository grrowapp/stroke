import { describe, expect, it } from 'vitest';

import { resolveDirectoryActions } from '../../../../server/utils/control/actions';

describe('一覧画面の操作の可否', () => {
  it('作成は行えない。接続先の別プロジェクトが未定だから（interview Q40）', () => {
    const actions = resolveDirectoryActions();

    expect(actions.create.available).toBe(false);
    if (!actions.create.available) expect(actions.create.reason).toBe('target-undecided');
  });

  it('登録も行えない。ただし理由は作成と別（interview Q39）', () => {
    const actions = resolveDirectoryActions();

    expect(actions.register.available).toBe(false);
    if (!actions.register.available) expect(actions.register.reason).toBe('meaning-undecided');
  });

  it('作成と登録の理由を同じものにしない', () => {
    const actions = resolveDirectoryActions();

    if (actions.create.available || actions.register.available) throw new Error('前提が崩れた');
    expect(actions.create.reason).not.toBe(actions.register.reason);
  });
});
