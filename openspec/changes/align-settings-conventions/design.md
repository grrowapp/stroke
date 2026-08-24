## Context

proposal.md の Why を参照。ここでは、機構を決めるのに要る実測値だけを置く。

**既に外へ出ている2本**（この change が広げる先例）:

- `server/utils/stroke/api-base-url.ts` — `DEFAULT_API_BASE_URL` と `resolveApiBaseUrl()`
- `server/utils/stroke/workflow-schema.ts` — `DEFAULT_WORKFLOW_SCHEMA` と `resolveWorkflowSchema()`

どちらも同じ形をしている。**既定値をその値を使うモジュールに置き、`process.env.NUXT_*` があればそれを優先する解決関数を並べる。** `nuxt.config.ts` はその既定値を import して `runtimeConfig` に宣言する。endpoint は `useRuntimeConfig()` 経由、サーバを介さない CLI（`yarn session`、tsx）は `resolve*()` 経由で読み、**どちらも同じ解決順で同じ値になる**。

**まだ直書きのもの**（実測）:

| 置き場 | 直書き | 件数 |
|---|---|---|
| `paths.ts` | `SESSIONS_ROOT` / `PROJECTS_ROOT` | 2 |
| `session-core.ts` | セッション内のファイル名5種、`openspec` / `config.yaml` | 7 |
| `question.ts` | 問いの構造の閾値 | 5 |
| `request-schemas.ts` | リクエストの閾値（名前付き11 + インライン5） | 16 |
| `ai.ts` | `MAX_RETRIES`、ログの接頭辞 | 2 |
| `claude.ts` | バイナリ名、`SIGKILL`、`STROKE_BASEURL`、継続先喪失の判定文言 | 4 |
| `openspec.ts` | バイナリ名、サブコマンドとフラグ、書き込み先の相対パス | 3 |
| `project.ts` | `docs` / `proposal.md`、名前として許す文字の規則 | 3 |
| `routes/.../ws/*.ts` | セッション id を抜く正規表現 | 2 |
| `startup-checks.ts` | ログの接頭辞 | 1 |

**制約**:

- `session-core.ts` は「Nitro に依存しない」と自分で宣言していて、endpoint と CLI の両方から呼ばれる。`useRuntimeConfig()` は使えない
- `.gitignore` は既に `.env` / `.env.*` を無視し、`!.env.example` で例外にしている。置き場は用意済み
- `yarn session` は tsx で走り、`process.env` を直接読む。`.env` の自動読み込みは無い

## Goals / Non-Goals

**Goals:**

- 直書きの値を、外の定義から変えられる形にする
- ビルド時に決まるものと実行時に差し替えられるものを、読んで区別できる形に並べる
- 差し替えられた値が形をなしているかを起動の時点で確かめる

**Non-Goals:**

- **関数の引数を増やさない。** 値は使う場所で読む。引数で持ち回る形にすると、設定の話が呼び出し規約の話に化けて、外出しとは別の変更になる
- **新しいモジュールを作らない。** 値はそれを使うモジュールに置く。設定だけを集めた層を新設しない
- **呼び出し側を変えない。** 外出しは値の出どころを変えるだけで、誰が誰を呼ぶかは動かさない
- **振る舞いを変えない。** 既定値は現在の直書きと同じ値にする
- テストの整備（`align-coding-conventions`）
- 起動時チェックが `process.exit(1)` でプロセスごと落とす件（`docs/known-issues.md`）

## Decisions

### 決定1: 既存の2本と同じ形をそのまま広げる

新しい機構を考えない。`api-base-url.ts` / `workflow-schema.ts` が既に持っている形を、残りの値へ広げる。

```
export const DEFAULT_<名前> = <現在の直書きと同じ値>

export function resolve<名前>(): <型> {
  const env = process.env.NUXT_<名前>?.trim()
  return env || DEFAULT_<名前>
}
```

代替として「設定を1つのオブジェクトにまとめて全員がそれを読む」形も考えられるが、退ける。まとめる先が新しいモジュールになり、Non-Goals に反する。また `session-core.ts` のように Nitro に依存できないものと、`useRuntimeConfig()` を使える endpoint とで読み口が分かれている現状を、1つに揃える作業が別途要る。

### 決定2: 値は使う場所で読む。引数で渡さない

`sessionDir(sessionId)` は `sessionDir(sessionId)` のままとし、中で `resolveSessionsRoot()` を呼ぶ。呼び出し側は1箇所も変わらない。

これは**モジュール評価時に決まっていた値が、呼び出し時に決まるようになる**という変更である。振る舞いの差は「起動後に環境変数を書き換えると次の呼び出しから変わる」点だけで、運用上そうする経路は無い。

### 決定3: 新しく外に出す値を `runtimeConfig` に足さない

`runtimeConfig` に並ぶのは `useRuntimeConfig()` から読まれる値だけとする。今回外に出す値は、どれも endpoint と CLI の両方から読まれる。CLI は Nitro の外で動くので `useRuntimeConfig()` を使えず、`resolve*()` から読む。したがって `runtimeConfig` に宣言しても**読み手がいない**。

**実測で分かった制約**: `nuxt.config.ts` は Nuxt のエイリアスがまだ存在しない時点で評価・型検査される。`#shared/*` を import しているモジュール（`session-core.ts` / `question.ts`）を import すると `error TS2307: Cannot find module '#shared/stroke'` になる。`api-base-url.ts` / `workflow-schema.ts` が何も import しない単独モジュールなのは、これが理由である。

つまり「全ての既定値を `nuxt.config.ts` が import して `runtimeConfig` に並べる」形は**成立しない**。一部だけ並べれば、読み手のいない宣言と、`.env.example` との二重管理が同時に生まれる。

機構は1本に統一する。

| | 出どころ | 読み口 | 一覧 |
|---|---|---|---|
| AI の起動設定（既存の `claude.*`） | `nuxt.config.ts` の `runtimeConfig` | `useRuntimeConfig()` | `README.md` / `.env.example` |
| **今回外に出すもの** | 各モジュールの `DEFAULT_*` | `resolve*()`（`NUXT_*` の環境変数） | `.env.example` |

`claude.*` を後者へ寄せる作業はしない。読み口の統一はこの change の目的ではなく、動いているものを触る理由が無い。

### 決定4: 検証は値の定義と同じ場所に置き、起動時チェックが集める

`claude-config.ts` が既に持っている形——検査する関数を値の定義と同じモジュールに置き、`describeClaudeConfigError()` を起動時チェックが呼ぶ——を、外に出す値の全体へ広げる。**各モジュールが自分の値を検査する `describe*Error(): string | null` を持ち、`00.startup-checks.ts` がそれを集める。**

値の定義が各モジュールに散る以上（決定3）、検査を1箇所に集めると、検査だけが値から離れる。新しいモジュールも作れない。集約点は既に存在する起動時チェックである。

**解決関数は投げない。** `resolve*()` は `question.ts` / `request-schemas.ts` のモジュール評価時に呼ばれるので、そこで投げるとスタックトレースだけが出て理由が読めない。不正な値は既定へ倒し、**不正であることは起動時チェックが示す**。これで「不正なまま走り出さない」（`configuration`）を、読める形で満たす。

環境変数は必ず文字列で来る。検査するのは次の3種である。

- **数値**: 与えられていて整数として成立しないもの、範囲外のもの
- **正規表現**: コンパイルできないもの
- **置き場**: 絶対パスでないもの

### 決定5: ビルド時に決まるものは `nuxt.config.ts` の中で区別して並べ、理由を添える

`nitro.experimental.websocket` / `devtools` / `ignore` / `css` / `modules` は、ビルドが消費するので `runtimeConfig` に置けない。同じファイルに並ぶ以上、**どちらなのかを注記で示す**。

「これも外に出せるのでは」と再検討させないため、理由（ビルドが消費する）を1行ずつ添える。環境ごとに切り替えたいものがこの側にあるなら、切り替えにはビルドを分ける必要があることも書く。

### 決定6: 環境変数の名前は `NUXT_` 接頭辞に揃える

Nuxt が `runtimeConfig` のキーから導く名前と、`resolve*()` が読む名前を同じにする。既存の2本（`NUXT_CLAUDE_API_BASE_URL` / `NUXT_CLAUDE_WORKFLOW_SCHEMA`）がその形になっている。

`STROKE_BASEURL` は**この規則の外**である。これは子プロセスへ渡す環境変数の名前であって、こちらが読む設定ではない。名前自体を設定値として外に出す。

### 決定7: `.env.example` を置く

`.gitignore` が既に `!.env.example` で例外にしている。外に出した値の名前と既定値を並べる。`configuration` の「差し替えられる設定の一覧が運用者に見える」はこれで満たす。

### 決定8: `yarn session` には `--env-file-if-exists=.env` を付ける

CLI（tsx）は `.env` を自動で読まない。放っておくと、サーバ側だけ差し替わって CLI が既定のまま動き、`configuration` の「実行経路が違っても同じ値に解決される」に反する。

**実測**（Node v22.22.2 / tsx 経由、2026-08-22）:

- `tsx --env-file=<path>` は Node のフラグとしてそのまま通り、`.env` の値が `process.env` に入る
- 指したファイルが**無いと `node: <path>: not found` で落ちる**
- `--env-file-if-exists=<path>` は無ければ「Continuing without it.」と出して続行する

`.env` は `.gitignore` で無視されており、存在しないほうが通常である。落ちてはならないので `--env-file-if-exists` を使う。

### 決定9: 外に出さないものを決めて書く

全部を出すのではない。次は出さない。

- **ドメインの語彙そのもの**（`phase` の3値、`invocation` の3値、`kind` の2値、ハイライトの5色）。これらは `shared/stroke.ts` の型であり、画面とサーバの契約である。設定で増減できてはならない
- **セッション id の形**（uuid の正規表現）。ディレクトリ名として使う以上、緩めれば置き場の外へ出られる

## Risks / Trade-offs

- **値の決まる時点がモジュール評価時から呼び出し時に移る** → 起動後に書き換わる経路が無いことを確かめる。`SESSIONS_ROOT` は起動時チェックが見ているので、チェック時と使用時で同じ値になることを確認する
- **環境変数は文字列で来る** → 数値・真偽値は変換と検証を通す。通らない値で走り出さない（決定4）
- **`yarn session`（tsx）は `.env` を自動で読まない** → `--env-file-if-exists=.env` で読ませる（決定8）。`--env-file` は `.env` が無いと落ちるので使わない
- **検証を増やすと起動が落ちる経路が増える** → 起動時チェックは今 `process.exit(1)` でプロセスごと落とす。`docs/known-issues.md` の項目であり、この change では直さない。ただし**検証の追加によって落ちやすくなる**ので、追加する検証は既定値で必ず通ることを確かめる
- **テストが無い状態で 40 箇所前後を書き換える** → 型は通ったまま値だけが変わる書き換えなので、`yarn typecheck` では捕まらない。`align-coding-conventions` のテストが先にあるのが本来の順である。無いまま進めるなら、既定値のまま動かして通し確認を1度行う

## 未解決: `master` との分岐

**この design は `plan-mainline-merge` の作業ツリー（HEAD `5e91a20`）だけを見て書いている。`master` に未取り込みのコミットがあり、そこと食い違う。**

2つのブランチは `e15494d`（2026-08-21 12:07）で分岐し、双方に相手の持たないコミットがある。`master` 側の `1a28b90`（同 22:06）が次を済ませている。

- 起動時チェックの `process.exit(1)` を廃止した。プロセスは落とさず、欠けをログに出して終わる
- `server/utils/readiness.ts` を新設し、前提の判定を1つの口にまとめた
- `invoke-agent` が前提の欠けを 503 で返すようにした
- 新 capability `startup-readiness` を追加した
- `docs/known-issues.md` から当該項目を消した

**spec 同士は衝突しない。** `startup-readiness` が禁じているのは「**サービスの起動**を中断すること」で、`configuration` が要求しているのは「**その値を使う動作**を始めないこと」である。後者は操作を断る形で満たせるので、`master` の方針と両立する。

**食い違うのは実装と実測の取り方だけである。**

1. **Non-Goals の「起動時チェックが `process.exit(1)` で落とす件はこの change では直さない」は、この作業ツリーでは正しいが `master` では既に解決済みである。** 取り込めば前提が変わる
2. **検査の集約点が変わる。** こちらは `00.startup-checks.ts` に7つの `describe*Error()` を集めた。`master` では `readiness.ts` の `missingPrerequisites()` がその役目を持つ。**移すのはこの配線だけで、検査そのものは各モジュールに置いたまま（決定4）で変わらない**
3. **実測の期待値が変わる。** こちらは「プロセスが止まる」ことを確かめた。`master` の下では「起動は完了し、その値を使う操作が断られる」を確かめることになる

**取り込む場合の手戻りは小さい。** `00.startup-checks.ts` の配線を `readiness.ts` へ移し、7.4・7.5 の実測を取り直す範囲である。spec と、値の外出しそのもの（グループ1〜6・8）は影響を受けない。

**どちらへ寄せるかは決めていない。** ブランチの扱いを決める側の判断である。

## Migration Plan

既定値を現在の直書きと同じにするため、何も設定しなければ振る舞いは変わらない。

- 運用者が値を変えたい場合は `.env` か環境変数で与える。`.env.example` が一覧になる
- 戻す場合は commit 単位で revert できる。値の群ごとに段階を分けて進める

## Open Questions

無い。
