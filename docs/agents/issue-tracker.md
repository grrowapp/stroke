# Issue tracker: OpenSpec

作業単位は OpenSpec の **change** で管理する。実体は `openspec/changes/<change-id>/` 配下のファイル。

## スキーマとツール

- CLI は `openspec`
- スキーマ指定は `openspec/config.yaml` の `schema` キー（現在 `specs-with-grill`）
- change 作成時に CLI が `<change-id>/.openspec.yaml` の `schema` へ同じ値を書く
- スキーマの実体は CLI 側の `~/.local/share/openspec/schemas/<スキーマ名>/schema.yaml`
- `openspec/schemas/` に置かれているのは `flontier-specs` / `flontier-steering` で、現行スキーマはここに無い

## 構成

```
openspec/
├── config.yaml              スキーマ指定とプロジェクト context
├── schemas/<スキーマ名>/    この repo に置かれたスキーマ
├── specs/                   change の delta を取り込んだ capability spec
├── tickets/                 ticket（<change-id>.md）
│   └── .archive/            archive 済み change の ticket
└── changes/
    ├── <change-id>/         進行中の change
    │   ├── .openspec.yaml   schema / created（必須）、skip_specs / note（任意）
    │   ├── proposal.md
    │   ├── specs/<capability-path>/spec.md
    │   ├── ui.md
    │   ├── design.md
    │   └── tasks.md
    └── archive/             完了した change（YYYY-MM-DD-<change-id>/）
```

## artifact を書く前に読むもの

性質は[各層の性質](#各層の性質)にある。

- `docs/`（`docs/specs/` / `docs/feature/` / `docs/agents/`）
- `docs/adr/`
- `CONTEXT.md`

`openspec/config.yaml` の `context` にも重なる必読が入っている。食い違ったら本節が勝ち、**本節に無い必読は取らない**（`.scratch/` を含む）。上書きされるのは必読リストだけで、config.yaml の `rules`（tasks に santa-method レビューとユーザー完了承認を必ず入れる）と `operations`（apply / archive の前に commit する）は change 作業への追加規定として有効である。

## change-id の命名

**先頭に動詞を置く。動詞は下表の5つから選ぶ。** kebab-case で `<動詞>-<対象>`、対象は「何を」→「何の」の順（`create-module-markdown` = module を作る、markdown の）。

| 動詞 | 使うとき |
| --- | --- |
| `create` | 完全な新規。その定義の塊がこのシステムに存在しなかった |
| `add` | 既存への機能追加。product が利用者に対してできることが1つ増える |
| `update` | バグではない既存の修正。機能への呼び口（押せる場所・ラベル・開き方・入力の取り方）が変わり、呼ばれる側は変わらない |
| `fix` | バグの修正。壊れているものを直す |
| `remove` | 削除 |

判定に迷ったときの見どころ。

- **利用者にとってできることが増えたか** — 増えていなければ `add` ではなく `update`
- **意図どおり動いているか** — 動いているなら `fix` ではなく `update`（分かりにくい・置き場が悪い・名前が悪いは `update`。動いていないものだけが `fix`）
- **何が新しく定義されたか** — `create` はこれで見る。コードの出どころでは見ない。既存コードを使い回していても、その定義の塊が無かったなら `create`

用語（product / 機能 / module）は `CONTEXT.md`。

### 例外と接頭辞

- archive から戻された feature を直す回は `update-<feature名>`（`docs/feature/overview.md`「archive からの戻しへの対応」）。feature 名は `__` を含むフラット名なので、この場合だけ change-id に `__` が入る（例: `update-api__session`）
- ADR に紐づく分割 change は `adr<4桁ゼロ埋めの ADR 番号>-sub-<動詞>-<対象>`（例: `adr0016-sub-fix-busy-response-handling`）。接頭辞の後ろで動詞始まりを満たす

### 適用範囲

本規約の採用は **2026-08-28**（起票日は `<change-id>/.openspec.yaml` の `created` で判定する）。

- それ以前に作られた change は改名しない（5つの動詞で始まらないものが多数ある。`full-width-markdown-editor` と `spec-document-management` は動詞すら持たないが、これも改名しない）
- 採用後にも規約から外れた起票が2件ある（`adr0016-sub-define-request-validation-messages` の `define`、`adr0017-sub-separate-approval-decision-from-promotion` の `separate`）。次に触るときに改名するか動詞を足すかを、ユーザーに確認する

## ticket の起票

change の起票と同時に `openspec/tickets/` に **ticket** を作る。

- ファイル名は change-id + `.md`（例: change `view-openspec-changes` → `openspec/tickets/view-openspec-changes.md`）。feature 名（spec 名）に適用される `/` ↔ `__` の置換ルール（`docs/feature/overview.md`「命名」）は、ticket 名には適用しない
- 中身は frontmatter（`status` 必須・`tags` 任意）＋本文の概要
- `status` の値は `docs/agents/triage-labels.md` の5つ（2026-08-29 時点で `Doing` / `Todo` の混入が5件ある。見つけたら5つのいずれかに直す）
- **本文は起票時点のもので、以後一切追記しない**

正の所在は分かれる。**1対1・ファイル名・後書き禁止**の正は `docs/feature/overview.md`「対応の定義」。**frontmatter・採用日・archive と削除の運用**は本節が正（overview.md には無い）。

> 2026-08-29 時点で17件の ticket に起票後の `## Triage Notes` が追記されている。これは上の後書き禁止に反する。例外として認めるなら overview.md の改訂が要る（[更新対応](#更新対応)）。それまでは追記しない。

### 適用範囲と片づけ

本規約の採用は **2026-08-28**。

- change との1対1はそれ以降に起票する change に掛かる。それ以前の ticket 無し change に遡って作らない
- change を archive したら同名 ticket を `openspec/tickets/.archive/` へ移す
- **change に先行する ticket（バックログ）は認める。** 対応する change が無いことを理由に ticket を消さない。削除するのは、起票の取り消しとユーザーが判断したときだけである

## artifact

### 順序と依存

`proposal → specs → ui → design → tasks` の順に作る。依存関係はスキーマの `requires` が持つ（`tasks` の `requires` は `[specs, design]`）。`ui` と `design` は条件付きで、**省いても tasks は作れる** — `requires` は生成順の助言であって CLI は強制しない（実測: requires を満たさない change が実在する）。

### 各 artifact が持つもの

- **proposal** — なぜこの変更が要るか。`Why` / `What Changes` / `Capabilities` / `Impact`
- **specs** — 何を満たすか。capability ごとに1ファイル
- **ui** — 画面をどうするか。画面を持つ change のみ。`/prototype` で変種を出して選んだ結果を記録する
- **design** — どう作るか。作る条件は下記
- **tasks** — 実装チェックリスト。`## <番号>. <見出し>` でグループ化し、各タスクを `- [ ] <グループ番号>.<連番> 説明` の形にする。この形でないと進捗が追跡されない。`openspec/config.yaml` の `rules` により、santa-method レビューとユーザー完了承認のタスクを必ず含める

design を作る条件は次のいずれか。いずれも無ければ省略する。

- (a) 横断的な変更・新しいアーキテクチャパターン・新しい依存・データモデルの変更
- (b) セキュリティ / 性能 / 移行の複雑さ、技術判断を先に要する曖昧さ
- (c) 上位資料への整合反映（[更新対応](#更新対応)）

(a)(b) はスキーマの design instruction の要約で、全量はそちらが持つ。**(c) は本書がこの repo 向けに足す条件**でスキーマには無い。

## 参照の方向

規範の序列は **docs（`docs/adr/` を除く `docs/` 全体）> ADR（`docs/adr/`）> specs（`openspec/specs/`）** の一列である。

- `docs/specs/` は docs 層であり、この「specs」ではない
- `docs/adr/` は `docs/` の下にあるが docs 層ではなく ADR 層である
- 序列が扱うのは規範の資料だけである。ツールの設定・スキーマ（`openspec/config.yaml`・CLI 側の `schema.yaml`）とコードは序列の外の実体であり、どの層からも事実として参照してよい

図に出る語の定義。

- **change の artifact** = proposal / specs（delta）/ ui / design / tasks
- **steering** = `.spec-workflow/steering/` に置く、change に属さない工程横断の指針文書

参照は次の方向にだけ張る。凡例: `A → B` = A が B を参照してよい／`A ← B` = A はどの層からも参照されてよい／`↔` = 相互に可／`×` = 禁止。

```
ticket             → docs > ADR > specs
steering           → docs > ADR > specs
change の artifact → docs > ADR > specs
ADR                → docs > specs
docs               → 参照しない（例外: specs のみ。specs が docs への追従制約を持つため）

CLAUDE.md          → すべて可（guidance と reference。序列の外）
CLAUDE.md          ← すべて可（序列の外なのでどの層からも引ける）
CONTEXT.md         → 参照しない（用語集。ルール・決めは持たない）
CONTEXT.md         ← すべて可（用語の定義としてのみ）

docs   ↔ docs      可
ticket ↔ ticket    可
ADR    ×  ADR      禁止
specs  ×  specs    禁止
```

逆流の意味 — docs・ADR・specs が ticket・change・steering を規範の根拠として参照することはない。これらは起票時・作業時の記録であり、決めの正にはならない。ここで禁じているのは**規範の根拠としての参照**であり、運用手順の案内として置き場や関連文書を指すことは含まない。

> この運用が要る理由 — 確定していない事項に参照が重なると、未確定が未確定を土台に枝葉を伸ばす。ADR 同士の参照禁止と[更新対応](#更新対応)の確定 → archive は、この連鎖を断つためにある。

### 各層の性質

- **docs（`docs/adr/` を除く `docs/`）** — 規範の正。**docs に記述があれば docs を拠り所にする**。ユーザー合意を経た確定であり、実装・作業の正しさはこことの整合でのみ担保される。docs は序列内の他層（ADR・specs）を参照しない。唯一の例外が specs への参照で、これは specs が docs に追従する制約（食い違えば specs を docs に合わせる）を表すためのもの
  - `docs/specs/plan/` は検討中の資料（「未決定」「未着手」等の状態表記を持つ）を含む。確定として引かない
  - 既存の docs には ADR を引いている箇所が20件以上ある。規範の根拠にはならないので、見つけたら[更新対応](#更新対応)で外す
- **ADR（`docs/adr/`）** — 決めの記録。docs に無いが ADR にある内容は、流動性が残っているものの、考え方や方向性を決める拠り所になる。ただしエージェントによる解釈が多分に含まれることがあるため**盲信厳禁** — 引くときは都度ユーザーに正しさを確認する。ADR が序列内で引けるのは docs と specs だけ（序列の外の CLAUDE.md・CONTEXT.md はどの層からも引ける）
- **specs（`openspec/specs/`）** — docs や ADR に付随し、その時点での決めに対するシステマチックな判断基準を提供する物差し。確定には入らない（序列の最下位）
- **CLAUDE.md** — guidance と reference。序列の外にあり、すべてを参照でき、どの層からも引ける
- **CONTEXT.md** — 用語集。序列の外にあり、ルール・決めは持たず、どの文書からも用語の定義としてのみ引ける

### ticket と change の間

- ticket と change の対応はファイル名（= change-id）だけが持つ
- ticket は change と並走する記録である
- 一覧の起点として ticket から change の artifact へ**辿る**のは可
- change の作業が ticket を**入力・規範として参照するのは不可**（ticket は決めを持たない。決めは proposal 以降の artifact が持つ）

## 更新対応

- specs に delta を入れるとき、それを規定する上位資料（docs・ADR）があるなら、**上位資料への整合反映までが change の責務範囲**である
- 上位資料への整合反映は design.md でユーザーへ提案し、承認を持って許可される。承認前に上位資料を書き換えない
- docs 単独の改訂（specs delta を伴わないもの）も、change を起こして design.md で提案し、ユーザー承認を得る
- specs の更新が追従できておらず docs 側と食い違いがあるときは、食い違いを**見つけた者が責任を持って**、docs または ADR（docs > ADR）の規定に沿った specs へ直す
- ADR を土台にさらに参照を重ねない（ADR ↔ ADR 禁止はこのため）。方向性の拠り所で足りず、決めとして固める必要が出たなら、会話で docs へ確定させてから docs を参照する

### ADR の archive

ADR の内容がユーザーとの会話を経て docs に確定したら、次を行う。

- 状態行を `archive` に書き換える
- ファイルは `docs/adr/` に置いたまま動かさない（change の `archive/` ディレクトリ、ticket の `.archive/` とは別の運用）
- 状態行に引き継ぎ先の docs と**節**を明示する。パスは相対 markdown リンクにする
- 引き継ぎ先の節には、その ADR の規約を**取りこぼさず**移す。移せない規約が残るなら archive にしない（archive 済み ADR は規範の参照先にならないため、取りこぼしたものは現行から引けなくなる）

状態行の書式。

```
単一の節: - **状態**: archive（2026-08-29。全貌は [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md) の「change-id の命名」に確定）
複数の節: - **状態**: archive（2026-08-29。全貌は [`docs/specs/plan/portal-stroke-exit.md`](../specs/plan/portal-stroke-exit.md) に確定。対応する節 — 自動開始の流れ:「承認ボタン → 一覧へ戻る」／起動の形:「起動は1系統」）
節でなく冒頭の規定を指すとき: …冒頭の規定に確定
取って代わられた場合: - **状態**: archive（2026-08-29。取って代わられ済み。現行は <docs path> の「<節名>」）
```

## 過去の記録

- archive された change・`openspec/tickets/.archive/` へ移された ticket・archive された ADR の**中身**は、当時の path・記述のまま残し、規範の参照先にしない
- archive された ADR で現行に繋がるのは、状態行に明示された引き継ぎ先（docs の節）だけである

## スキルからの呼ばれ方

- 「issue tracker に publish しろ」→ 新しい change を起こし、同時に ticket も作る（[ticket の起票](#ticket-の起票)）。artifact を1つずつ確認しながら進めるなら `/opsx:new`、まとめて用意してよいなら `/opsx:propose`
- 「該当チケットを取ってこい」→ `openspec/changes/<change-id>/` 配下の該当 artifact を読む。**ここでいう「チケット」は外部スキルの語彙で、本書の ticket（`openspec/tickets/<change-id>.md`）ではなく change を指す**。どこまで読むかは要求で決める（作業内容の把握なら proposal、実装なら全部）。change-id が渡されていないときは `openspec list` の一覧をユーザーに提示して選ばせる。推測で決めない

## 進捗と検証

- 進捗は `tasks.md` のチェックボックスで追う
- `openspec validate --all` で change と spec を検証する。capability を1つも宣言しない change は、その change の `.openspec.yaml` に `skip_specs: true` が無いと弾かれる

## ブランチの切りどころ

**planning の段階ではブランチを切らない。** `proposal` / `specs` / `ui` / `design` / `tasks` は、その worktree の親ブランチ上で作る（`ui` の prototype コード用ブランチは使い捨てで、この規則の対象外）。

理由は2つ。

- `openspec list` で全 change を横並びに読めなくなる。ブランチに分けると、そのブランチに切り替えない限り change が見えない
- planning の段階では隔離すべき成果物がまだ無い

**ブランチを切るのは apply（実装）に入るとき。** そこで初めてコードに触れ、壊れうる状態が生まれる。ブランチ名は change-id をそのまま使う。

実装が終わって archive するところまでをそのブランチで行い、親ブランチへマージする（main を直接の合流点にしない。合流点の特定は `CLAUDE.md`「Worktree 運用」）。
