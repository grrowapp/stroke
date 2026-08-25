---
name: santa-ts-review
description: Santa Method（独立2体の敵対的レビュー + 収束ループ）で TypeScript/Nuxt のレビュー成果物を検証する。両者 PASS で初めて通す。レビュー対象は引数で指定する。
argument-hint: "レビュー対象（ブランチ名 / PR番号 / ファイルパス / レビュー報告書のパス）"
allowed-tools: Read, Grep, Glob, Bash, Agent, Skill
---

# Santa TS Review

`santa-method` を TypeScript / Nuxt 4 のレビューに特化させたもの。レビュアーは `typescript-reviewer` を2体、独立に走らせる。**両方が PASS したときだけ通す。**

単一のレビュアーは、成果物を作ったときと同じ盲点を持つ。独立2体はこの失敗モードを壊すためにある。片方だけが挙げた指摘も、それは実在する指摘として扱う。

## 引数

レビュー対象は `$ARGUMENTS` で受け取る。指定が無ければ**聞くこと。推測で対象を決めない。**

| 引数の形 | 対象の解決 |
|---|---|
| ブランチ名 / タグ / コミット | `git diff <arg>...HEAD` の差分 |
| `#123` / PR番号 | `gh pr view 123 --json baseRefName,mergeStateStatus,statusCheckRollup` → base との差分 |
| ファイル / ディレクトリのパス | そのパスの中身 |
| レビュー報告書のパス（`.md`） | **レビューのレビュー**。報告書の各指摘が実在するか、見落としが無いかを検証する |
| 指定なし | ユーザーに聞く |

## Phase 0: 対象と前提を固める

1. `$ARGUMENTS` から対象を解決する。解決できなければ**停止して聞く**
2. 差分が対象なら、範囲を確定させる。`main` を決め打ちしない（upstream / merge-base を使う）
3. 決定論的な検査を先に通す。**ここが赤なら Santa を回さない**

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/nuxt typecheck
```

`yarn` 経由が lockfile の不整合で落ちる場合は `node_modules/.bin/` を直接叩く。lockfile には触らない。

ビルド・型・テストで機械的に落ちるものを Santa に持ち込まない。Santa が見るのは**意味の側**（正しさ・見落とし・ハルシネーション）である。

## Phase 1: ルーブリックを組む

レビュアーは `Skill` ツールを持たない（`typescript-reviewer` の `tools` は `Read, Grep, Glob, Bash`）。**`Skill()` を呼ばせず、`SKILL.md` を直接 Read させる。**

各レビュアーに、レビュー前に必ずこの4本を読ませる。

| スキル | 見るもの |
|---|---|
| `.claude/skills/coding-standards/SKILL.md` | 命名・可読性・不変性の基準 |
| `.claude/skills/api-design/SKILL.md` | リソース名・ステータスコード・エラー応答・ページング |
| `.claude/skills/contract-first/SKILL.md` | 契約の drift、消費側と提供側の食い違い |
| `.claude/skills/nuxt4-patterns/SKILL.md` | hydration 安全性・SSR・`useFetch` / `useAsyncData`・route rules |

`nuxt4-patterns` は既定ではプロジェクトに登録されていない。実体は `~/.agents/skills/nuxt4-patterns`。
リンクが無い場合はそちらを直接読ませるか、先にリンクを張る（`.claude/` への書き込みはユーザーが行う）。

加えてリポジトリ固有の正を読ませる。

- `CONTEXT.md` — ドメイン用語。指摘は必ずこの語彙で書かせる
- `docs/specs/api/api-contract.md` — サーバ API の契約
- `docs/specs/core/system-structure.md` — 配置の規範
- `openspec/specs/<capability>/spec.md` — 対象が触れる capability の要件

**判定は本体だけを根拠にする。** `*.backup` / `archive/` / 退避先の記述を根拠に採用しない。

## Phase 2: 二重レビュー（並列・文脈隔離）

`typescript-reviewer` を**2体、1メッセージ内で同時に**起動する。守るべき不変条件は4つ。

1. **文脈隔離** — 互いの評価を見せない
2. **同一ルーブリック** — 同じ基準を渡す
3. **同一入力** — 対象と基準を両者に同じだけ渡す
4. **構造化出力** — 散文でなく型付きの判定を返させる

`typescript-reviewer` も既定では登録されていない。実体は `~/.agents/agents/typescript-reviewer.md`。

各レビュアーへ渡すプロンプトの骨子。

```
あなたは独立した品質レビュアーである。他のレビューは一切見ていない。

## 先に読むもの（Read で開くこと。Skill ツールは使わない）
.claude/skills/coding-standards/SKILL.md
.claude/skills/api-design/SKILL.md
.claude/skills/contract-first/SKILL.md
.claude/skills/nuxt4-patterns/SKILL.md
CONTEXT.md
<対象が触れる openspec/specs/*/spec.md>

## レビュー対象
<Phase 0 で解決した対象>

## 指示
上の基準の各項目に対して評価する。各項目に PASS / FAIL を付け、FAIL は問題を具体で挙げる
（ファイルパスと行番号を必ず添える）。

**推測で指摘するな。** 指摘の根拠はコードか上の資料に実在するものに限る。
呼び出し元が無いと言うなら grep で確かめてから言え。止まらないと言うなら止まらないことを示せ。

次の JSON で返せ:
{
  "verdict": "PASS" | "FAIL",
  "checks": [{"criterion": "...", "result": "PASS|FAIL", "file": "path:line", "detail": "..."}],
  "critical_issues": ["..."],
  "suggestions": ["..."]
}

問題を見つけるのが仕事であって、承認するのが仕事ではない。
```

対象が**レビュー報告書**の場合は、指示を差し替える。

```
## 指示
この報告書の指摘を1件ずつ検証する。各指摘に対して:
- 実在する: 該当箇所を file:line で示す
- 実在しない: 誤りである根拠を示す（grep 結果・実際の挙動）
- 過大/過小: 深刻度の判定が対象の実態と合っているか

加えて、報告書が**見落としている**問題を挙げる。
```

## Phase 3: 判定ゲート

```
B が PASS かつ C が PASS  →  NICE   ship
それ以外                  →  NAUGHTY
```

**両方 PASS が条件。部分点は無い。** 片方だけが挙げた指摘は、もう片方の盲点であって、Santa が潰しにきた当のものである。

NAUGHTY のときは両者の `critical_issues` を統合し、重複を落とす。

## Phase 4: 収束ループ（最大3周）

1. `critical_issues` のみ直す。`suggestions` は任意
2. 直すのは**指摘された箇所だけ**。ついでのリファクタ・整形・リネームを混ぜない
3. Phase 0 の決定論的検査を通し直す
4. **新しいレビュアー2体**で Phase 2 をやり直す（前周の記憶はアンカリングを生む）
5. 3周で NICE にならなければ**停止してユーザーへ上げる**。回し続けない

## 出力

```markdown
## 判定: NICE / NAUGHTY（n 周目）

### 対象
<解決した対象と、決定論的検査の結果>

### 両者が挙げた指摘（確度高）
- `file:line` — 内容

### 片方だけが挙げた指摘
- `file:line` — 内容（B のみ / C のみ）

### 提案（非ブロッキング）
- ...

### 直したもの
- ...

### 未解決（3周で収束せず）
- ...
```

## やらないこと

- **決定論的に判るものを Santa で見ない。** 型・lint・テストは Phase 0 で潰す
- **レビュアーに修正させない。** `typescript-reviewer` は "report findings only"。修正は Phase 4 で親が行う
- **合意が取れていない範囲へ広げない。** 指摘が対象外に及んだら、報告はするが直さない
- **3周を超えて回さない。** 収束しない事実ごとユーザーへ渡す
