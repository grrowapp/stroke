全ての群で守ること（design.md の Non-Goals）。

- **コードを変えない。** `server/` / `nuxt.config.ts` / `package.json` に手を入れない
- **資料が正である**（ADR 0004）。コードを写すのではなく、コードが従う姿を書く
- **自動生成しない。** 生成スクリプトも CI 検査も作らない
- **設定でないものを載せない。** `settings.ts` の固定値・schema に畳んだ閾値・ビルド時に決まる設定は資料に現れない

書き出し先は `docs/settings-reference.md` 1本（design.md 決定1）と `docs/adr/0004-settings-reference-is-authoritative.md`。

## 1. ADR

- [x] 1.1 `docs/adr/0004-settings-reference-is-authoritative.md` を作り、**資料が正である**ことを定める（design.md 決定2）
- [x] 1.2 3つを明示する。①設定の中身を変えるとき資料の編集を必ず伴う ②資料の編集は必ず change を起こす ③その change にユーザーの承認を得る
- [x] 1.3 退けた案（コードを正として資料を追随／自動生成／`.env.example` のみ）とその理由を Considered Options に置く
- [x] 1.4 `docs/adr/0003-settings-precedence.md` の冒頭に、0004 に取って代わられた旨と**判断の根拠に使わない**ことを置く。本文は記録として残す
- [x] 1.5 0004 から 0003 への参照を1行置き、対応関係を双方向にする

## 2. 骨格

- [x] 2.1 `docs/settings-reference.md` を作る
- [x] 2.2 セクションを `runtimeConfig` と `runtimeConfig.public` の2つにする。**設定はこの2つにしか無い**
- [x] 2.3 表の列を「キー / 既定値」に統一する。出どころのモジュール名は書かない（design.md 決定3）

## 3. `runtimeConfig`

- [x] 3.1 `### .env で差し替えられる` を置き、置き場2件（`sessionsRoot` / `projectsRoot`）を「キー / 環境変数 / 既定値」の3列で書く
- [x] 3.2 置き場だけを外に出す理由（**動かす機械ごとに変わる**）を1行添える
- [x] 3.3 `### 差し替えない` を置き、残り7件を「キー / 既定値」の2列で書く。**列の有無が差し替えられるかを表す**（design.md 決定3）

## 4. `runtimeConfig.public`

- [x] 4.1 `claude.command` / `claude.args` を表で書く
- [x] 4.2 `### claude の起動定義` を置き、`.mcp.json` の記述形式に倣った JSON をコードブロックで示す
- [x] 4.3 `--setting-sources` から `project` を外してはならないことを書き、理由は ADR 0001 を指す。書き写さない
- [x] 4.4 呼び出しごとに決まる引数（`-p` / `--output-format json` / `--session-id` / `--resume` / `--` 以降の prompt）が定義に含まれないことを書く

## 5. 載せないもの

- [x] 5.1 `settings.ts` の固定値を資料に書かない
- [x] 5.2 schema の定義に畳んだ閾値を資料に書かない
- [x] 5.3 ビルド時に決まる設定を資料に書かない
- [x] 5.4 対応表を持たない（design.md 決定5）
- [x] 5.5 **「これは設定ではない」という節も置かない**（design.md 決定4）。冒頭に**資料に無いものは設定ではない**の一文を置き、個別の列挙はしない

## 6. 参照の配線

- [x] 6.1 `docs/structure.md` に資料と ADR 0004 の置き場・役割を足す
- [x] 6.2 `CLAUDE.md` の Docs 一覧に1行足す
- [x] 6.3 `README.md` の設定に関する記述から、詳細をこの資料へ委ねる。**既定値の一覧を README に重ねない**
- [x] 6.4 `.env.example` の冒頭から資料と ADR 0004 を指す

## 7. 確認

- [x] 7.1 資料に載っている設定が、`align-settings-conventions` の 10 章が目指す姿と一致することを確認する

  **一致を確認した**（資料10項目 ↔ align のタスク）:

  | 資料の設定 | align 側 |
  |---|---|
  | `sessionsRoot` / `projectsRoot`（`.env` 可） | 10.13h が置き場2件を残す |
  | `claude.apiBaseUrl` / `workflowSchema` / `firstPrompt` / `continuePrompt` | 10.13h が `NUXT_*` を廃し `runtimeConfig` の値だけにする |
  | `openspec.bin` / `openspec.initArgs` | 同上 |
  | `wsPathPattern` | 同上 |
  | `claude.command` / `claude.args` | 10.13e が `runtimeConfig.public` に JSON で置く |

  資料に**載せない**ものも一致している。`settings.ts` の固定値（10.12 / 10.13 / 10.13a / 10.13l / 10.13m）、schema へ畳んだ閾値（10.13d）、廃した上限（10.13b）。

- [x] 7.2 資料に載っていない値をコードが設定として読んでいないことを、`grep -rn "NUXT_" .` で確認する（残るのは置き場2件だけ）

  **確認した**（`align-settings-conventions` の 10 章の実装後）。コードが `NUXT_*` を読むのは `settings.ts` の置き場2件のみ。資料に載っていて実装が持っていない設定、実装が読んでいて資料に無い設定、ともにゼロ
- [x] 7.3 `.openspec.yaml` に `skip_specs: true` を置く
- [x] 7.4 `openspec validate document-settings-reference` が通ることを確認する
- [ ] 7.5 コードに差分が出ていないことを `git diff --stat` で確認する（Non-Goals）

  **タスクが指定した方法では確認できていない。** 作業ツリーを `align-settings-conventions` と共有しているため、`git diff --stat` には両者の差分が混ざり、この change の分だけを切り分けられない。

  代わりに commit 単位で見ると、この change の commit（`207efe0`）が触ったのは `CLAUDE.md` / `README.md` / `docs/adr/0003` / `docs/adr/0004` / `docs/settings-reference.md` / `docs/structure.md` と change 自身の4ファイルだけで、`server/` / `scripts/` / `app/` / `shared/` / `nuxt.config.ts` / `package.json` の差分は0件だった。

  ```
  $ git show --stat 207efe0 -- server/ scripts/ app/ shared/ nuxt.config.ts package.json
  （出力なし）
  ```

  **ただしこれは `git diff --stat` ではない。** タスクの条件を満たしたことにはしない。確認の方法を決め直すか、タスクの書き方を直すかが要る

## 8. 完了

- [x] 8.1 変更を1つの commit にまとめる（`207efe0` 設定リファレンスを正に据え、ADR 0004 で扱いを定める）
