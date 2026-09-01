## Question

編集の面を広げるとき、「全幅」をどこまで厳密に取るか — 左右の余白を残してよいか、承認画面の右の指摘一覧をどう扱うか。

**この文書は、ユーザーが実際にブラウザで見た結果の記録だけを書く。** 記録は `docs/adr/0017-delegate-create-module-markdown.md`「add-full-width-markdown-editor」の節（2026-08-31 のユーザー判断）と、その判断を書き込んだ commit `da02ccd1` のメッセージにある。記録に無いことは「記録なし」と書き、想像で埋めない。

## Variants

prototype は承認画面（`/projects/:projectId/approvals/:approvalId`）の上に載せ、`?variant=` と下端の浮きバー（`PrototypeSwitcher`）で切り替えた。**3案が変えるのは「右の指摘一覧をしまったときに、つまみへ何を残すか」だけ**で、挙動はユーザー指定で固定されていた（`usePrototypePanels.ts` 冒頭の注記）:

1. 左のメニューバーと右の指摘一覧は連動しない。左を閉じても右は出たまま
2. 左の状態に関わらず、右をワンクリックで右端へスライドしてしまえる
3. しまった右はつまみ幅（44px）だけ画面に残し、つまみをワンクリックすると右だけ戻る

- **variant=a** 「縦書きの帯を残す」: しまった右のつまみに、縦書きの「コメント」と件数バッジを残す
- **variant=b** 「同じ場所で開閉するつまみ」: つまみには掴むところ（境界のレール）だけを残し、開くときも閉じるときも同じ位置（`aside` の右上）を押す
- **variant=c** 「見出しを細くして残す」: 見出し帯の絵（吹き出し）と件数バッジだけを細い帯にして残す

あわせて、右の一覧はパネルのどこを掴んでも左右へ引けるようにし（放した位置で開くか引っ込むかが決まる）、真ん中の面と右の一覧の組み方を grid（1:2 固定）から flex に替えて右の幅を可変にしていた。

**prototype はサイドバー（左のナビゲーション）を消す機構を持っていない。** 左は既存の畳み（256px → 64px の帯）をそのまま使い、編集の面がどこまで伸びるかは prototype では試していない。

## Chosen

**3案（a / b / c）のどれを採ったかは記録に無い。** ADR-0017 にも commit メッセージにも、案の名前は出てこない。したがって、承認画面で右の指摘一覧をしまえるようにするかどうかは tasks 2.2 の決定により**実装判断**とし、prototype の「しまう」機構（3案とも）は本実装に持ち込まない（tasks 2.3 / 3.3 で prototype ごと戻す）。

ブラウザで見たうえで記録に残っている決めは、案の選択ではなく**「全幅」の定義**である（ADR-0017 / `da02ccd1`）:

- **「全幅」は雰囲気であって、厳密な寸法の要件ではない。** 左右に一定の余白が無いと読み書きしづらくなるので、左右の隙間はある程度あってよい。ビューポート幅ぴったりに寄せることを目的にしない
- **固定幅の指定はしない（MUST NOT）。** 余白を作るために編集領域へ `max-width` や px 指定の桁幅を与えてはならない。幅はビューポートに追従して伸び縮みし、余白は相対的な padding として残す。「読みやすい行長に収める」ことを理由に固定幅へ寄せる案は却下
- 完了判定もこれに合わせて緩めた（ADR-0017「完了判定」5項目）

記録に無いもの（想像で埋めない）:

- 広げたときに編集の面がどこまで伸びたか — 記録なし。prototype はサイドバーを消していないので測っていない
- 左右に残った余白の実測値 — 記録なし。「ある程度あってよい」という判断だけがある。本実装では `main` の `px-6 py-6`（24px）がその実体になる（design.md 決定4）
- 承認画面で右の一覧をどう扱ったか — prototype では「しまえる」形を3案で試したが、採否の記録なし。tasks 2.2 により実装判断（design.md「Risks」: 残す）

## Prototype

- ブランチ `proto/full-width-markdown-editor`。**develop へマージ済み**（merge commit `34b58428`。「throwaway で main に入れない」という instruction の建前とは違い、develop の履歴に残っている）
- 実体は `app/composables/usePrototypePanels.ts` と `app/components/prototype/PrototypeSwitcher.vue`、および `app/layouts/workspace.vue` / `app/components/review/ApprovalAnnotator.vue` / `app/pages/projects/[projectId]/approvals/[approvalId].vue` への掴み
- 本 change の tasks 3章で撤去する。撤去後に prototype を見るには `34b58428` を checkout する
