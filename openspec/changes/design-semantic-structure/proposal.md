# design-semantic-structure

## Why

統合の手法は `git merge --allow-unrelated-histories` を採る。共通祖先を持たない2つのリポジトリを強引に3者比較させる方法で、同名ファイルが両方にあると add/add 衝突になる。

この衝突を避ける対応を、**今ぶつかっているファイルを個別に退かす**形で組んでしまった。現状のまま merge すると両方に在る同名ファイルが軒並みぶつかり、既存の change はそれを1件ずつ潰す形になっている——`app/pages/index.vue` を移す、`shared/types.ts` を改名する、というように。

これは今この瞬間のファイル一覧に対する最適化でしかない。どちらかに1ファイル増えれば対象が変わり、退かす理由も無いので、次に同じ名前が生まれればまた同じことをする。

さらに悪いことに、その先で「マージ先の構造に合わせる」方向へ進もうとした。**それも誤りである。** マージ先は今まさに構成を組み替えている最中で（43ファイルが未コミット、`components/ui/` と `components/notification/` を `components/shared/` へ、`composables/` を `shared/` と `workspace/` へ切り直している）、動いているものに合わせにいけば、合わせ先が動くたびに前提が壊れる。

**そもそも合わせにいく必要が無い。**

2つは意味的に別のものである。片方はユーザーと AI が往復して合意を作りプロジェクトを起こすもの、片方は起きたプロジェクトを本家越しに見張るもの。**意味が被っていないのだから、意味で切れば名前は自然に分かれる。** 衝突は、意味で切っていないから起きている。

こちらに無いのは、マージ先への追従ではなく**意味の構造**である。`server/utils/` は平置き15本で、名前は `ai.ts` `claude.ts` `project.ts` `question.ts` と機能名が並んでいるだけで、それぞれがどの意味に属するのかを示していない。`app/components/` も `stroke/` `review/` と直下混在で、区分の基準が無い。意味の区分も、そこから名前と置き場を導く戦略も、書かれたものが1つも無い。

意味の構造が資料としてあれば、**衝突チェックはファイル単位の突き合わせではなく「意味が被っているか」の判断で済む。** 被らないと分かっていれば、そもそも数える必要が無い。

## What Changes

- **領域名を1つ定め、資料に残す。** その語を使う限り相手と被らない、という形にする。資料が記すのは配置ではなく**なぜその配置なのか**である
- **衝突チェックを機械的な判断に落とす。** 資料があれば、統合時に確かめるのは「両者の名前空間が被っていないか」の1点になる。ファイルを1つずつ突き合わせる作業を無くす
- **席を奪い合っているものを、その名前空間の下へ移す。**
  - **画面と endpoint のパス。** 今は `/`（概要入力）と `/s/<uuid>` が席を占め、`server/api/[id]/…` が `/api/` 直下の動的セグメントを丸ごと占有している。WS のルートと、URL からセッション id を抜く正規表現も同じ範囲に入る。エージェント向けスキル6本（`assets/.claude/skills/`）の curl URL と `docs/api-contract.md` も追随する。**BREAKING**: 旧パスは残さず、互換のための転送も置かない
  - **同名で中身が違うもの。** `shared/types.ts`、`app/app.vue`（アプリの殻）、`app/assets/css/main.css`
  - **`server/utils/`。** 名前空間の下へ移すだけで、**中の並びは変えない**

**名前空間の内側は切らない**（design.md 決定2）。統合に要らないため、判断材料として現状の棚卸しだけを残す。

**地図（`docs/mainline-merge.md`）から移してきた5件の判断。** design で全て片付いている。

| | 結論 |
|---|---|
| 入口 | プロジェクト一覧の **作成** ボタン。`/` は持たない |
| 名前 | `frontier` は実行時にも文書にも残さない（`.scratch/decisions.md` の既決の延長） |
| セッションの寿命 | 変えない。承認後も残す（`.scratch/decisions.md` と `project-generation` の既決） |
| 実行時の同居 | spawn は非同期でイベントループを塞がないため、対応は要らない |
| 置き場 | **この change では扱わない。** 席の奪い合いではなく統合を妨げないため、`docs/known-issues.md` へ |

## Capabilities

この change が決めるのは意味の区分と、そこから導かれる名前・置き場である。ファイルの位置と名前は変わるが、公開する口の数も、何を受理して何を断るかも変わらない。

既存の仕様は endpoint を URL で書いていない。`agent-api` も `api/answer` も `api/overview` も `api/send-back` も `api/invoke-agent` も `api/session` も、一貫して「endpoint を1つ公開する SHALL」という形で口の数と受理・拒否の条件だけを規定している。画面についても `stroke-session` は「画面1」「画面2」と呼び、URL を書いていない。したがって spec の差分を持たない（`.openspec.yaml` に `skip_specs: true`）。

構造を決めた結果として既存 change のスコープが変わる場合は、各 change 側で扱う。

## Impact

- 意味の構造を記す文書 — 新規
- `app/pages/` 全部、`app/app.vue`、`app/composables/`（WS と endpoint の接続先）
- `server/api/` 全部、`server/routes/` の WS 2本（ルートと、URL からセッション id を抜く正規表現）
- `server/utils/` 15本 — 切り直し
- `shared/types.ts`
- `assets/.claude/skills/` — `get-overview` / `get-strokes` / `get-send-back` / `question` / `proposal` の curl URL、`guidance` の記述
- `docs/api-contract.md` / `docs/session-workflow.md`
- `openspec/changes/unify-agent-conventions` — 文書と設定ファイルの置き場
- `openspec/changes/align-coding-conventions` — アプリ全体に1つだけ在るもの（`package.json` / `nuxt.config.ts`）の位置づけ
- `docs/mainline-merge.md` — 地図が持つ「衝突をどう回避するか」の記述と、change 一覧・依存図

**前提**: なし。統合形態（単一 Nuxt アプリ）は `docs/adr/0002-merge-into-stroke-board.md` で確定済みで、その形の中身を決めるのがこの change である。道筋は `docs/mainline-merge.md`。

**他の change との順序**: **`align-coding-conventions` より前。** ファイルの置き場が決まってから import を書き換えるほうが二度書きにならない。

**マージ先の状態に依存しない**: マージ先が構成を組み替えている最中であっても、この change は進められる。合わせにいく設計ではないからである。統合時に確かめるのは、両者の意味区分が被っていないことだけになる。

**吸収した change**: `namespace-app-routes`（パスの名前空間化）を畳んで取り込んだ。パスを移すことは意味の区分から置き場を導いた適用結果そのもので、`server/utils` の層分けを個別 change にしないと決めたのと同じ理屈が当たる。パスだけ特別扱いする理由が無い。

**測ることについて**: 現状のまま merge して衝突を数える手順は再現できる（クローンを作り `--allow-unrelated-histories` で merge し `git diff --diff-filter=U` を見る）。ただしこれは**設計の確認手段**であって、設計の出発点ではない。数えた値を目標にしない。
