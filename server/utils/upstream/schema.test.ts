import { describe, expect, it } from 'vitest';

import approvalsFixture from './__fixtures__/approvals.v2.2.5.json';
import infoFixture from './__fixtures__/info.v2.2.5.json';
import {
  approvalRequestSchema,
  approvalUpdateMessageSchema,
  initialMessageSchema,
  projectInfoSchema,
  taskStatusUpdateMessageSchema,
  taskSummarySchema,
  upstreamMessageSchema,
} from './schema';

/** 2.2.7 の `task-status-update`。`blocked` を含む */
function taskUpdate2_2_7() {
  return {
    type: 'task-status-update',
    projectId: 'p1',
    data: {
      specName: 'auth-spec',
      taskList: [
        {
          id: '1.1',
          description: '認証を作る',
          status: 'blocked',
          lineNumber: 3,
          indentLevel: 0,
          isHeader: false,
          completed: false,
          inProgress: false,
          blocked: true,
          blockedReason: '仕様が未確定',
        },
      ],
      summary: { total: 1, completed: 0, inProgress: 0, pending: 0, blocked: 1, headers: 0 },
      inProgress: null,
    },
  };
}

/** 2.2.5 の `task-status-update`。`blocked` が一切入らない */
function taskUpdate2_2_5() {
  return {
    type: 'task-status-update',
    projectId: 'p1',
    data: {
      specName: 'auth-spec',
      taskList: [
        {
          id: '1.1',
          description: '認証を作る',
          status: 'in-progress',
          lineNumber: 3,
          indentLevel: 0,
          isHeader: false,
          completed: false,
          inProgress: true,
        },
      ],
      summary: { total: 1, completed: 0, inProgress: 1, pending: 0, headers: 0 },
      inProgress: '1.1',
    },
  };
}

describe('本家ペイロードの検証', () => {
  describe('稼働中の 2.2.5 から実際に取得したもの', () => {
    it('承認依頼の一覧が通る', () => {
      const parsed = approvalRequestSchema.array().parse(approvalsFixture);
      expect(parsed).toHaveLength(3);
    });

    it('承認依頼がステアリング文書に対して立っている', () => {
      const parsed = approvalRequestSchema.array().parse(approvalsFixture);
      expect(parsed.every((a) => a.category === 'steering')).toBe(true);
    });

    it('承認依頼の filePath が相対パスで来る', () => {
      const parsed = approvalRequestSchema.array().parse(approvalsFixture);
      expect(parsed[0]!.filePath.startsWith('/')).toBe(false);
    });

    it('プロジェクト情報が通る', () => {
      const parsed = projectInfoSchema.parse(infoFixture);
      expect(parsed.steering.documents.product).toBe(true);
    });
  });

  describe('基準は 2.2.7 だが 2.2.5 も通す（ADR-0004）', () => {
    it('blocked を含む 2.2.7 の task-status-update が通る', () => {
      const parsed = taskStatusUpdateMessageSchema.parse(taskUpdate2_2_7());
      expect(parsed.data.summary.blocked).toBe(1);
      expect(parsed.data.taskList[0]!.blockedReason).toBe('仕様が未確定');
    });

    it('blocked を含まない 2.2.5 の task-status-update が通る', () => {
      const parsed = taskStatusUpdateMessageSchema.parse(taskUpdate2_2_5());
      expect(parsed.data.summary.blocked).toBeUndefined();
      expect(parsed.data.taskList[0]!.blocked).toBeUndefined();
    });

    it('optional にしたのは blocked まわりの3つだけで、他は必須のまま', () => {
      const summary = { total: 1, completed: 0, inProgress: 0, headers: 0 }; // pending が無い
      expect(taskSummarySchema.safeParse(summary).success).toBe(false);
    });
  });

  describe('形が合わないものは通さない', () => {
    it('未知の status を弾く', () => {
      const payload = taskUpdate2_2_5();
      payload.data.taskList[0]!.status = 'deferred';
      expect(taskStatusUpdateMessageSchema.safeParse(payload).success).toBe(false);
    });

    it('未知の承認カテゴリを弾く', () => {
      const payload = { ...(approvalsFixture as unknown[])[0] as object, category: 'unknown' };
      expect(approvalRequestSchema.safeParse(payload).success).toBe(false);
    });

    it('必須フィールドが欠けたものを弾く', () => {
      const payload = taskUpdate2_2_5();
      // @ts-expect-error 検証のために意図的に壊す
      delete payload.data.specName;
      expect(taskStatusUpdateMessageSchema.safeParse(payload).success).toBe(false);
    });

    it('数値であるべきところに文字列が来たら弾く', () => {
      const payload = taskUpdate2_2_5();
      // @ts-expect-error 検証のために意図的に壊す
      payload.data.summary.total = '1';
      expect(taskStatusUpdateMessageSchema.safeParse(payload).success).toBe(false);
    });
  });

  describe('メッセージの振り分け', () => {
    it('initial が通る', () => {
      const payload = { type: 'initial', projectId: 'p1', data: { specs: [], approvals: [] } };
      expect(initialMessageSchema.safeParse(payload).success).toBe(true);
    });

    it('approval-update が通る', () => {
      const payload = { type: 'approval-update', projectId: 'p1', data: approvalsFixture };
      expect(approvalUpdateMessageSchema.safeParse(payload).success).toBe(true);
    });

    it('通知にしないメッセージも union としては通る', () => {
      for (const type of ['spec-update', 'steering-update', 'projects-update']) {
        expect(upstreamMessageSchema.safeParse({ type, projectId: 'p1', data: {} }).success).toBe(true);
      }
    });

    it('知らない type は弾く', () => {
      expect(upstreamMessageSchema.safeParse({ type: 'job-update', data: {} }).success).toBe(false);
    });
  });
});
