/**
 * 一覧画面の操作（登録・作成）が使えるかどうか。
 *
 * どちらも今は使えない。ただし理由が違い、決着している内容も違う。
 *
 * - **作成** — 実処理を担うのは接続先の別プロジェクトで、stroke-board は入口だけを持つ。
 *   接続が無ければ作成は行えず、その状態は画面に出る（interview Q40）。**接続先が具体的に
 *   何であるかは未定**なので、「接続が無い」の理由は今のところ「接続先が未定」である
 * - **登録** — 本家に `POST /api/projects/add` が実在する一方、stroke-board の一覧は
 *   親パスの走査で作る。stroke-board の「登録」がその API を指すのか別物なのかが未定
 *   （interview Q39）
 *
 * 接続先が決まったら、ここが設定や実際の疎通を見る場所になる。画面はこの結果だけを見て
 * いるので、画面側を書き換えずに済む。
 */

import type { DirectoryActions } from '#shared/types';

export function resolveDirectoryActions(): DirectoryActions {
  return {
    register: { available: false, reason: 'meaning-undecided' },
    create: { available: false, reason: 'target-undecided' },
  };
}
