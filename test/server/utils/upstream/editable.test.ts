/**
 * 保存できる文書の範囲を固定する。
 *
 * 本家も同じ値で弾くが、こちらでも弾く（specs/document-editing）。ここが緩むと、
 * 画面から任意の名前を送れるようになる。ステアリングは文書名がそのままファイル名に
 * なるので、とくに広げてはいけない。
 */

import { describe, expect, it } from 'vitest';

import { isSteeringDocument, STEERING_DOCUMENTS } from '../../../../server/utils/upstream/rest';
import { isSpecDocumentName, specDocumentNames } from '../../../../server/utils/upstream/schema';

describe('保存できる文書の名前', () => {
  describe('仕様書', () => {
    it('本家の allowedDocs と同じ3本である', () => {
      expect([...specDocumentNames]).toEqual(['requirements', 'design', 'tasks']);
    });

    it('3本はいずれも通る', () => {
      for (const name of specDocumentNames) {
        expect(isSpecDocumentName(name), name).toBe(true);
      }
    });

    it('知らない名前は通さない', () => {
      for (const name of ['spec', 'readme', 'requirement', 'Design', 'tasks.md']) {
        expect(isSpecDocumentName(name), name).toBe(false);
      }
    });

    it('パスを含む名前は通さない', () => {
      for (const name of ['../design', 'a/design', 'design/../../etc/passwd']) {
        expect(isSpecDocumentName(name), name).toBe(false);
      }
    });

    it('空文字は通さない', () => {
      expect(isSpecDocumentName('')).toBe(false);
    });
  });

  describe('ステアリング', () => {
    it('本家の allowedDocs と同じ3本である', () => {
      expect([...STEERING_DOCUMENTS]).toEqual(['product', 'tech', 'structure']);
    });

    it('3本はいずれも通る', () => {
      for (const name of STEERING_DOCUMENTS) {
        expect(isSteeringDocument(name), name).toBe(true);
      }
    });

    it('知らない名前は通さない', () => {
      for (const name of ['products', 'Tech', 'structure.md', 'requirements']) {
        expect(isSteeringDocument(name), name).toBe(false);
      }
    });

    it('パスを含む名前は通さない', () => {
      // 文書名がそのままファイル名になるため、ここを抜けるとファイル名を指定できてしまう
      for (const name of ['../product', 'a/tech', '../../etc/passwd']) {
        expect(isSteeringDocument(name), name).toBe(false);
      }
    });

    it('空文字は通さない', () => {
      expect(isSteeringDocument('')).toBe(false);
    });
  });

  it('仕様書とステアリングの名前は重ならない', () => {
    // どちらの経路でも通る名前があると、保存先が取り違えられる余地が残る
    for (const name of specDocumentNames) {
      expect(isSteeringDocument(name), name).toBe(false);
    }
    for (const name of STEERING_DOCUMENTS) {
      expect(isSpecDocumentName(name), name).toBe(false);
    }
  });
});
