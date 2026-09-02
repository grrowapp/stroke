## Context

動機は proposal.md「Why」。要件は `specs/project/ui/spec.md` と `specs/document-editing/spec.md` の delta。

**見た目と操作は prototype で確定している**（`prototype/index.html`。ui.md）。ここで決めるのは実装の置き方だけ。

実測（2026-09-01、pre3）:

- 承認画面の列は `grid gap-4 lg:grid-cols-3`、本文が `lg:col-span-2`、コメント欄が1列（`ApprovalAnnotator.vue` の `34b58428^`）。比率なので、左のナビを畳むとコメント欄も広がる
- 左のナビは `app/layouts/workspace.vue` が cookie（`spec-workflow-sidebar-collapsed`）で畳む。256px ↔ 64px
- 承認画面のプレビューは `approvals/[approvalId].vue:117-135` が `MarkdownEditor`（編集できる文書）または `MarkdownView`（それ以外）を差し込んでいる。編集の口はここから出ている
- 本家 `ApprovalsAnnotator` に編集は無い

## Goals / Non-Goals

**Goals:**

- コメント欄をしまって本文を広く読める。しまっても一覧へ戻る口が画面に残る
- 左のナビとコメント欄が互いに独立している
- コメント欄の幅が左の状態で変わらない
- 承認画面から編集の口が消え、本家と揃う

**Non-Goals:**

- 仕様書・ステアリングの画面、ストローク側の proposal 確認画面
- 仕様書・ステアリングの6本の編集そのもの（変えない。編集が無いのは承認画面だけ）
- 面（プレビュー／注釈／並列表示）の数と中身。`create-module-annotation` が持つ
- 差し戻し・却下のボタンの置き場。`update-ui-approval-review` が持つ
- 左のナビの畳み方を変えること

## Decisions

### 決定1: コメント欄の開閉は `ApprovalAnnotator` の中に閉じる。layout は触らない

しまう／戻すの状態は `ApprovalAnnotator.vue` が持つ `ref<boolean>` 1つ。`workspace.vue` は読まない。左のナビとの連動は要件で禁じられているので、共有する理由が無い。

- **却下: `useState` で共有** — 共有する相手が居ない
- **却下: cookie で持続** — 要件「しまった状態は保存しない」に反する

### 決定2: コメント欄の幅は px で固定し、比率にしない

開いたときの幅は、左のナビが開いている状態での「行の幅から 16px を引いた 1/3」を初回に測って px で固定する。以後、左の開閉で変えない。しまうと 44px。

- **なぜ** — `w-1/3` や `grid-cols-3` は行幅に比例するので、左を畳むとコメント欄まで広がる。要件「コメント欄は広がらない」に反する
- **却下: 固定の定数（例 373px）** — ウィンドウの幅で開いたときの適正幅が変わる。初回の実測で決める
- 本文の列は `min-w-0 flex-1` のまま。固定幅を与えない（要件）

### 決定3: 開閉の口は4つとも実装する。レールは不可視

prototype で確かめた4つ（掴んで引く／見出し帯のボタン／しまった帯のクリック／右辺の全高レール）をそのまま持つ。

- 掴んで引く: `pointerdown` で開始。6px 動かして初めてドラッグと判定し、クリックを潰さない。開いているときは中の `button, a, textarea, input, select` の上からは掴まない。放した位置が開いた幅の半分より狭ければしまう
- レール: `aside` の右辺に沿った 20px 幅の全高の `button`。**背景・線を持たず、hover / active でも光らない**（ユーザー指示 2026-09-01）。押すとしまう／戻す
- 見出し帯のボタン: 左のナビの `sidebar-collapse` と同じ作り（32px、chevron）
- しまった帯: 帯のどこを押しても戻る

### 決定4: しまった帯に何を残すか（つまみ）は ui.md の採用案に従う

3案（a 縦書きの帯／b 同じ場所のつまみ／c 細い見出し）は prototype で切り替えられる。採用案は ui.md「Chosen」。**採用が記録されるまで、この決定は空欄**。

### 決定5: 承認画面から `MarkdownEditor` を外す。編集が無いのは承認画面だけ

`approvals/[approvalId].vue` の `#preview` は `MarkdownView` だけを差し込む。`saveTargetOf` / `save` / `target` は消す。仕様書・ステアリングの画面の編集は変えない。`MarkdownEditor` の `framed` は承認画面のためだけの prop だったので使い手が居なくなる（prop 自体は残す。`modules/markdown/` は触らない）。

- **なぜ** — 本家に無い。承認画面は読んで判断し指摘を付ける場（ユーザー決定 2026-09-01）
- 直すのはその文書自身の URL。`document-editing`「編集は文書の URL の上で行う」は残り、「承認依頼の URL も同じ実体を直す場所」だけが落ちる

### 決定6: 一覧をしまっても、面の切替と差し戻しの口は失わない

面の切替（プレビュー／注釈／並列表示）は本文の上に在り、コメント欄をしまっても残る。差し戻しは一覧の中に在るので、しまっている間は押せない。**しまうことで失われる操作は無い** — 戻せば全部ある。

## Risks / Trade-offs

- **`create-module-annotation` と同じファイルを触る** → こちらが外側（列と開閉）、あちらが内側（面）。こちらを先に通す。あちらの「`MarkdownEditor` の口の素通し」は本 change で不要になる
- **掴んで引く操作が、中の選択操作（注釈の面で本文を選ぶ）と競合する** → 掴めるのは `aside` の上だけで、本文の列には手を出さない。`aside` の中でも `button, a, textarea, input, select` の上では掴まない
- **既存 E2E が承認画面の編集を前提にしている** → `document-editing.spec.ts:143-190` の3本は要件ごと落とす。`approval-annotation.spec.ts` / `upstream-style.spec.ts` は列の構造の変化に合わせる

## Migration Plan

1. 承認画面から `MarkdownEditor` を外し、`MarkdownView` だけにする（E2E の3本を落とす）
2. `ApprovalAnnotator.vue` の列を幅固定に替え、コメント欄の開閉と口4つを入れる
3. E2E を足す（しまう・戻す・左と非連動・幅固定・状態を保存しない）

戻すときは 2 → 1 の順に外す。データも設定も動かさない。

## Open Questions

- つまみに残すもの（a / b / c）の採用案。ui.md に記録されるまで決定4 は空欄
