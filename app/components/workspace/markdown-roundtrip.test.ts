// @vitest-environment happy-dom
/**
 * WYSIWYG を採らなかった根拠を残す。
 *
 * 編集して保存する以上、読み込んで取り出しただけで内容が変わってはいけない。
 * Nuxt UI の `Editor`（TipTap）を検証したところ、見出し・箇条書き・コードブロック・
 * 引用・リンク・強調は往復して元に戻り、チェックボックスも `@tiptap/extension-list` の
 * `TaskList` / `TaskItem` を足せば戻った。**表だけが1行に潰れる。**
 *
 * `StarterKit` は表を持たず、Nuxt UI の `Editor` も table 拡張を読み込んでいない。
 * 仕様書もステアリングも表を使うため、開いて保存しただけで壊れる編集機能は入れられない。
 * そこで変換を挟まない構成（markdown のテキストを直接編集する）を選んだ。
 *
 * このテストは「TipTap を使えばよいのでは」と再検討されたときのために、何が壊れるかを
 * 固定しておくものである。壊れなくなったら、そのとき改めて検討してよい。
 */
import { Editor } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';

/** 読み込んで取り出す。この2つで元に戻るかを見る */
function roundtrip(markdown: string): string {
  const editor = new Editor({
    // StarterKit はチェックボックスを含まない。tasks.md がそれを使うので足す
    extensions: [StarterKit, TaskList, TaskItem, Markdown],
    content: markdown,
    contentType: 'markdown',
  });

  const out = editor.getMarkdown();
  editor.destroy();
  return out;
}

describe('TipTap の markdown 往復', () => {
  it('表は往復しない。これが WYSIWYG を採らなかった理由である', () => {
    const src = '| 列1 | 列2 |\n| --- | --- |\n| a | b |';

    // 行が潰れて1行になる。表として読めなくなる
    expect(roundtrip(src)).not.toBe(src);
    expect(roundtrip(src)).not.toContain('\n');
  });

  it('表のほかは往復する', () => {
    const cases = [
      '# 見出し1\n\n## 見出し2',
      '- 1つめ\n- 2つめ',
      '- 親\n  - 子',
      '1. 1つめ\n2. 2つめ',
      '```ts\nconst a = 1;\n```',
      '- [ ] 未完了\n- [x] 完了',
      '**太字**と*斜体*と`コード`',
      '> 引用文',
      '[リンク](https://example.com)',
    ];

    for (const src of cases) {
      expect(roundtrip(src), src).toBe(src);
    }
  });
});
