## Context

動機は proposal.md「Why」を参照。要件は `specs/document-editing/spec.md` を参照。

**proposal.md は着手前に書かれ、4点が実測と食い違っていた。** 2026-09-01 に proposal 側を実測へ揃えた（tasks 1.1〜1.4）。実測の根拠を残す。以下のパス・行番号は 2026-09-01 に worktree `pre3`（develop へ rebase 済み）で取った。

- サイドバーの幅は **170px ではなく 256px**（畳むと 64px）。`app/assets/css/main.css:761-777`（`width: 256px` は `:764`、畳んだ `.sb-sidebar-collapsed` は `:775-777`）。170px は prototype が描いた値で、同ファイル `:750-754` が「prototype が決めたのは形であって寸法ではない」として明示的に破棄している。`test/e2e/design-token.spec.ts:385-392` が 256px を固定している
- 編集 UI は `app/components/workspace/DocumentEditor.vue` **ではない**。親 change `create-module-markdown` が `modules/markdown/runtime/edit/MarkdownEditor.vue` へ移設済みで、`app/components/` に markdown 系は1本も残っていない
- spec 名 `project-workspace` は存在しない。正しくは **`project/ui`**（`openspec/specs/project/ui/spec.md:19` 下層のナビは画面左の縦並び／`:28` 上層へ戻る導線はヘッダー左）
- `.sb-textarea` は `main.css` ではなく `modules/markdown/runtime/assets/markdown.css:321-336` にある。`width: 100%`（`:323`）なので、外側の箱が広がれば追従する。`main.css` に手を入れる必要は無い

実装を縛る条件は次の4つ。

1. **module はアタッチ先の内部を知れない**（`CONTEXT.md:60`、`openspec/specs/app-structure/spec.md:104-114` の Requirement「画面の階層に属さない機能は `modules/` に置く」の「どの階層から参照されても同じように働く」）。`MarkdownEditor` は `app/layouts/workspace.vue` の存在を前提にできない。トグルの見た目は編集の面にあるが、ナビゲーションを隠す判断は面の外にある
2. **アプリに UI 状態を共有する配線が無い**。Pinia は無い。`useState` の使用は本実装では0件で、あるのは prototype（throwaway）の `app/composables/usePrototypePanels.ts:43,56` の2件だけ。tasks 3章でこれを落とすと0件に戻る。持続している畳みの cookie も、実測では `usePrototypePanels.ts:32-36` が持ち `app/layouts/workspace.vue:70` はそれを受けているだけで、3章の撤去で `workspace.vue` の `useCookie` 1箇所に戻る。`app/composables/` は prototype 込みで10本（落とせば9本）で、いずれもデータ取得・WS・時刻整形・注釈で、表示状態を持つものは無い
3. **畳み（collapsed, 64px）は cookie で持続し、SSR が返す HTML の時点で確定している**（`test/e2e/workspace.spec.ts:148-166`）。これは「畳んでも消えない。帯としてアイコンが残る」（同 `:83-100`）という別の要件を持つ状態で、本 change が足す「隠す」とは別物
4. **直しかけは再読み込みで残らない**（`openspec/specs/document-editing/spec.md:71-74`）。編集そのものが再読み込みをまたがない

## Goals / Non-Goals

**Goals:**

- ナビゲーションを隠す判断を面の外に置き、`MarkdownEditor` を階層に依存しないまま保つ
- 幅の制御を CSS の追加なしで済ませる。既存の flex と `width: 100%` に任せる
- 畳みの状態を壊さず、元に戻したときに直前の見え方へ戻す

**Non-Goals:**

- ヘッダーを隠す手段は作らない
- サイドバーの寸法（256px / 64px）を変えない
- ストローク側の proposal 確認画面には出さない

## Decisions

### 決定1: 状態は面の外の共有状態が持ち、module は prop と emit だけを持つ

`MarkdownEditor` に `expanded?: boolean` を受け、トグルの操作で `update:expanded` を出す。**module 自身は何も隠さない。** 隠すのは `workspace.vue` の役目。

面の外の共有状態は `useState<boolean>('editor-expanded', () => false)` で持ち、3画面と `workspace.vue` がこれを**直接**呼ぶ。**composable は新設しない** — 真偽値1つの包みは関心単位の composable（`docs/specs/core/file-composables.md`）に当たらない。キー文字列が4箇所に並ぶが、揃っていないことは E2E（3画面でトグルが効く）で見つかる。

- **なぜ `useState` か** — layout と page は親子だが、page から layout へ props で降ろす経路が Nuxt には無い。`useState` は SSR をまたいで同じ値を指し、cookie（持続が要る場合の道具）を持続の要らない状態に使うより素直である
- **却下: provide/inject** — layout が provide し page 経由で module へ降ろす形になるが、`app.vue` → layout → page の順序に依存し、3画面それぞれで inject の受けを書くことになる。`useState` と手数が変わらないうえ、layout が居ない画面で壊れる
- **却下: module 側で `document.querySelector` して隠す** — module がアタッチ先の DOM を知ることになり、条件1に反する
- **却下: emit を3画面がそれぞれ layout へ中継** — 中継の実装が3箇所に散り、「画面ごとの分岐は作らない」（proposal.md:8）に反する

### 決定2: 広げた状態は持続させない

再読み込みでも、URL を共有しても、既定（広げていない）で開く。cookie にもローカルの保存先にも書かない。

- **なぜか** — 条件4のとおり直しかけ自体が再読み込みをまたがない。編集に付随する一時的な見え方を、編集より長く生かす理由が無い。`document-editing` の「編集の状態は URL に含めない」とも揃う
- **副次の利点** — `workspace.vue:56-64` が cookie を選んだ理由（localStorage は SSR で読めず、畳んだまま読み込み直すと 200ms のちらつきが出る）に、そもそも当たらない
- **却下: 畳みと同じく cookie に持つ** — 同じ SSR ちらつきの設計判断を繰り返すことになり、得るものが「再読み込み後も広いまま」だけ。編集が続いていないのだから要らない

### 決定3: 広げる＝`nav` を出さない。畳みの状態には触れない

`workspace.vue` の `nav.sb-sidebar` を `v-if` で出し分ける。`collapsedStore`（cookie）は読み書きしない。

- 元に戻すと `nav` が再び描かれ、cookie が持っていた畳み状態のまま出る。「戻る先は開いた 256px か、直前の畳み状態か」は**直前の畳み状態**で決まる
- 畳み（64px の帯が残る）と広げる（`nav` ごと出さない）は直交する2状態として扱う。`test/e2e/workspace.spec.ts:83-100`「畳んでも消えない」は広げていない状態の要件なので、抵触しない

### 決定4: 幅を足す CSS を書かない

`main` は `min-w-0 flex-1` なので、兄弟の `nav` が消えれば残り全部を取る。`.sb-textarea` は `width: 100%` で追従する。**`max-width` も桁幅の指定も足さない**（`docs/adr/0017-delegate-create-module-markdown.md` の「固定幅の指定はしない（MUST NOT）」）。

`main` の `px-6 py-6`（左右 24px）は残す。固定の padding であって固定幅ではなく、これが「左右の隙間はある程度あってよい」の実体になる。

- **却下: 広げたときだけ `max-w-screen-2xl` などで行長を抑える** — ADR が明示的に却下している

### 決定5: トグルは編集中だけ出し、編集を抜けたら自動で戻す

`MarkdownEditor` の `mode === 'edit'` のときだけトグルを描く。編集を抜けたら `update:expanded` に `false` を出す。

**編集を抜ける経路は2つで、「保存後に読みへ戻る経路」は存在しない**（実測）。

- `discard()`（`MarkdownEditor.vue:130-135`。「やめる」ボタン `:219-226` から呼ばれ `mode` を `'read'` に戻す）
- `props.content` の差し替えを見る `watch`（`:107-117`）。別の文書へ移ったら広げた状態を引きずらない。`editOnOpen` が立っていると `:112` は `mode` を `'edit'` のままにする（承認画面がこれ）ので、**mode が戻らない経路でも `expanded` は戻す**
- **`submit()`（`:137-157`）は `mode` を触らない。** 保存しても編集の面に留まるので、ここで戻すと保存のたびにナビゲーションが復帰する。保存では戻さない

- **なぜ自動で戻すか** — 広げたまま編集を抜けると、トグルが消えてナビゲーションも無い状態になり、戻す手段がヘッダーの導線しか残らない
- 置き場は既存の操作の帯（`MarkdownEditor.vue:178-236`）。`aria-pressed` を使ったトグルの先例が同ファイルのプレビューボタン（`:200-209`）にある

### 決定6: 離脱の引き止めには手を入れない

`onBeforeRouteLeave`（`MarkdownEditor.vue:170-173`。`:159-168` は `beforeunload` の別物）はどの導線から遷移しても発火する。サイドバーが隠れて押せなくなるのはリンクの一つであって、ガードそのものではない。ヘッダーの「上層へ戻る」導線は広げている間も残る（`project/ui:26-40`、決定3で `header` は触らない）ので、遷移の経路も引き止めも生きている。**広げた状態で引き止めが働くことをテストで固定する。**

## Risks / Trade-offs

- **`useState` を直接呼ぶ前例を作る** → 本実装として残る最初の `useState` になる。真偽値1つなので composable に包まない。同じ形の状態が増えて関心として立ったときに初めて composable を切る
- **広げた状態で `nav` が DOM から消える** → ナビゲーションのリンクを指すテストが、広げた状態では取れなくなる。既存 E2E は広げていない状態で走るので影響しないが、新規テストは前後を明示する
- **承認画面は「全幅」にならない** → 右の指摘一覧（`aside`）は残す（実装判断。指摘一覧の常時表示を定めた規範は無く、隠す/隠さないを Non-Goals で縛ることもやめた — tasks 2.2。残すのは、prototype の「しまう」機構を本実装に持ち込まない・`ApprovalAnnotator` を本 change で触らない、という最小の形を採るため）。広がるのはサイドバーぶんだけ。ADR-0017 が「全幅は雰囲気であって厳密な寸法の要件ではない」と定めたのでこれで満たす。3画面で見え方が揃わない点は承知のうえ
- **編集を抜けると自動で戻る**（決定5） → 読む↔直すを往復するとナビゲーションが出たり消えたりする。戻す手段を失うほうが害が大きいと判断した

## Migration Plan

1. `workspace.vue` が `useState('editor-expanded')` を読んで `nav` を出し分ける（この時点では誰も立てないので動作不変）
2. `MarkdownEditor` に `expanded` / `update:expanded` とトグルを足す
3. 3画面を配線する
4. テストを足す（広げる・戻す・ビューポート追従・直しかけの保持・引き止め・URL に出ない）

1 と 2 は互いに独立していて、どちらの時点でも既存の動作は変わらない。戻すときは 3 の配線を外せば足りる。
