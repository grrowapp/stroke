# adr0016-sub-update-debug-log-per-session — design

## Context

動機は proposal.md の Why を参照。設計の前提になる事実は次の通り（すべて実装コード
`server/utils/stroke/claude.ts` と実測で確認したもの）。

- 書き出しの口は `runClaude` の `close` ハンドラ1箇所で、直前の change
  （`archive/2026-08-27-claude-debug-logging`）が作ったもの。出力先は
  `ClaudeRunOptions.debugLogDir` として端から渡り、`runClaude` は設定を引き直さない
  （`openspec/specs/agent/invocation`）。この線引きはこの change でも変えない
- 変更前の `stdout` は「届いた chunk を全部連結した1本の文字列」で、`readEnvelope` が
  それを `JSON.parse` して成否と会話 id を読む。**この読み取りが完了の検知である**
  （`openspec/specs/agent/invocation`「完了は output stream で検知して idle に変える」）
- 実測 2026-08-27: MCP ツールが 500 で失敗し続けたが、`--output-format json` は
  最終結果1件（`type: "result"` のエンベロープ）しか出さないため、ツールの呼び出しと
  結果がサーバーログにもデバッグログにも残らなかった。原因は claude 側の transcript を
  手掘りして初めて分かった。「transcript の手掘りに頼らない」という `debug/logging` の
  Purpose が、この出力形式のままでは成り立たない
- 実測 2026-08-28: 3往復のセッション1本で4ファイル（proposal.md 参照）

## Goals / Non-Goals

**Goals:**

- ログの単位をセッションへ移し、1ファイルを開けばそのセッションの全呼び出しが
  時系列で読める形にする（`specs/debug/logging/spec.md`）
- ツールの呼び出しと結果を生出力に残す。失敗したツール呼び出しがログに残ることが、
  この change のもう一方の狙いである
- 出力形式を増やしても、成否の判定（`readEnvelope`）と完了の検知に手を入れない

**Non-Goals:**

- ログのローテーション・保持期間・容量管理（前 change の Non-Goals を引き継ぐ。
  調査用の一時的な口であり、運用機能にしない）
- ログの整形・要約・ツール呼び出しの抽出。加工して情報を捨てるより、まず生を残す
- 出力形式を設定値として外に出すこと。`debugLogDir` の有無だけで決める
- 画面からのログ閲覧

## 流れ

```
runClaude
  │
  ├─ 起動時: debugLogDir があれば --output-format stream-json --verbose
  │          無ければ従来どおり --output-format json
  ▼
child.stdout ── 改行で1塊ずつ切り出す（'end' で残りも取り込む）
  │
  ├─→ events[]  … 届いた順に全塊。ログ用
  └─→ stdout    … 最後の1塊だけ（上書き）。判定用
                    stream-json の最終行 = json と同じ result のエンベロープ
  ▼
close ハンドラ
  ├─ writeDebugLog(dir, <session uuid>, formatDebugLog(events))
  │     └─ <debugLogDir>/<セッション uuid>.json へ **追記**
  │          `# <YYYY-MM-DD HH:mm:ss.SSS>` の見出し行 + 塊 + 改行
  └─ readEnvelope(stdout) で成否と会話 id（無変更）
```

## Decisions

### Decision 1: ファイル名は `<セッション uuid>.json` だけにし、書き出しは追記にする

**選択肢**: (a) 時刻を落として `<uuid>.json` に固定し `appendFile` で追記 /
(b) ファイル名は呼び出しごとのまま、別に索引ファイルを作る /
(c) セッションごとのディレクトリを掘り、その中に呼び出しごとのファイルを置く。

(a) を採る。調査の単位はセッションであり、「1つ開けばそのセッションの全呼び出しが
時系列で読める」が spec の要求（`specs/debug/logging/spec.md`「セッションで絞り込める」）。
(b) は開く先が増えるという問題そのものを解かない。(c) はファイル数を減らさず、
時刻順に並べ直す手間も残る。

上書き禁止（旧 spec の MUST NOT）は `writeFile` の `wx` フラグ＝機構で保証していたが、
追記では意図が「前の呼び出しの記録を失わない」に変わる。`appendFile` の `a` は
ファイルが無ければ作るので、初回と2回目以降を分岐せずに書ける。書き出しを呼び出しの
完了処理から切り離す（`await` しない）点、失敗を警告1行だけにして結果へ反映しない点は
前 change のまま変えない（`debug/logging`「ログの書き出し失敗は呼び出しへ影響しない」）。

ファイル名に使う id を `isSafeSegment` で通す扱いも変えない。落ちたら `unknown.json` へ
まとめて追記されることになるが、これは前 change から続く扱いで、この change では触らない。

### Decision 2: 呼び出しの区切りは `# <YYYY-MM-DD HH:mm:ss.SSS>` の見出し行にする

**選択肢**: (a) `#` で始まる1行の見出し / (b) 区切りを JSON の1行（`{"type":"stroke-entry",…}`）
として混ぜる / (c) 区切り文字列（`---` など）だけを置く。

(a) を採る。中身は1行1イベントの JSON で、JSON の行は必ず `{` で始まる。見出しを `#` で
始めれば中身と混ざらず、`grep -n '^# '` で呼び出しの頭だけを拾える。日時をそのまま
見出しに入れるので「何回目か」と「いつか」が同時に読める
（`specs/debug/logging/spec.md`「呼び出しの区切りが分かる」）。

(b) は読む側に JSON のパースを強いる割に、得られるのは同じ情報である。(c) は何回目かは
分かっても、いつの呼び出しかが分からない。

時刻の表記は、ファイル名から人が読む見出しへ移ったので、名前順ソートのための
`YYYYMMDD-HHmmss-SSS` をやめて区切り記号を入れた形（`2026-08-29 10:12:40.915`）にする。
ファイル名に使わないので、コロンを避ける理由はもう無い。

### Decision 3: デバッグログを取るときだけ `--output-format stream-json --verbose` にする

**選択肢**: (a) `debugLogDir` があるときだけ `stream-json` /
(b) 常に `stream-json` / (c) 出力形式を設定値として外に出す。

(a) を採る。`json` は最終結果1件しか出さないので、ツールの呼び出しと結果がどこにも
残らない（Context の実測 2026-08-27）。`stream-json` は `assistant` の `tool_use` と
`user` の `tool_result` を1行ずつ流すので、失敗したツール呼び出しがログに残る
（実測 2026-08-29: 1ファイル2往復で `tool_use` 11 / `tool_result` 11 / `assistant` 9 /
`system` 37 / `result` 2）。

(b) は、ログを取らない平常時にも出力量を増やす。得るものが無い。(c) は設定を1つ増やし、
「ログは取るが形式は json」という、狙いを外した組み合わせを作れてしまう。有効/無効を
出力先の設定1つで表す（`debug/logging` の最初の Requirement）のと同じ考え方で、
形式も `debugLogDir` の有無から導く。

`--verbose` は `--print` と併用する `stream-json` の要件（`claude --help`）。省くと起動が
通らないので、`stream-json` と対で足す。

### Decision 4: 判定用の `stdout` は最後の1塊だけを持ち、全塊は `events` に溜める

**選択肢**: (a) `stdout` を最後の1塊で上書きし、ログ用に `events` を別に持つ /
(b) `stdout` は全塊の連結のまま、`readEnvelope` に最終行の切り出しを足す /
(c) `stdout` は全塊の連結のまま、書き出す前にログ側で分解する。

(a) を採る。`stream-json` の最終行は `json` と同じ `type: "result"` のエンベロープである。
最後の1塊だけを `stdout` に残せば、`readEnvelope` は今までどおり「JSON 1件を読むだけ」で
済み、成否の判定と完了の検知に手を入れずに出力形式を増やせる。`--output-format json` では
塊が1つしか来ないので、値は変更前と同じになる。

(b) は判定側に出力形式の知識を持ち込む。完了の検知は `agent/invocation` の Requirement が
かかっている経路であり、ログのために触りたくない。(c) は分解の責務が2箇所（判定側と
ログ側）に散る。

### Decision 5: 塊への切り出しは改行で行い、`end` で残りを取り込む

chunk はイベントの境界で届く保証が無い。行の途中で切れた分は `pending` に残し、次の
chunk と繋いでから塊にする。

**末尾に改行が来ない場合がある。** 区切りだけを待つと最後の塊を落とす（実測: 改行を
付けずに終わる出力で `stdout` が空になり、成否の判定が丸ごと壊れた）。`stdout` の
`'end'` で `pending` の残りを取り込むことで、`--output-format json`（改行なしの1件）でも
`stream-json`（最終行に改行が付く場合も付かない場合もある）でも同じ結果になる。
空行は塊にしない。

### Decision 6: 書き出す中身の組み立てを `formatDebugLog` に閉じ込める

出力形式を増やすときや、ツール呼び出しの要約を足したくなったときに、触るのを1箇所に
するための口である。今は届いた塊を改行で繋ぐだけ（`events.join('\n')`）。

**末尾に改行を足さない。** 足すと生出力と1文字違いになり、書き残したものを元の出力と
突き合わせられなくなる。呼び出しの区切りとしての改行は `writeDebugLog` 側で付ける。

### Decision 7: タイムアウトを 10分から 3分へ戻す

この change のコミット（`e4fc81f`）で併せて行われた変更である。proposal.md にも
`specs/` にも現れないが、実装に入っているので設計判断として記録する。

`CLAUDE_TIMEOUT_MS` を 180000 にする。180秒で初回が必ず時間切れになったのは、claude が
スキルをロードし `!` フェンスの中で curl を往復させて概要を取っていた頃の実測
（2026-08-25）である。操作が MCP ツールへ移って所要が大きく減った（実測 2026-08-28:
8回の呼び出しで 28.5〜64.7 秒、turns は 4〜15。最大でも 3分の半分以下）ため、10分を
保つ理由が無くなった。長すぎるタイムアウトは、詰まった呼び出しを掴むまでの待ちを
そのまま伸ばす。

## Risks / Trade-offs

- [1ファイルが伸び続け、開くのが重くなる] → ローテーションは作らない（Non-Goals）。
  セッション単位なので上限は1セッションの往復数で決まる。実測 2026-08-29: 2往復で
  74KB・3往復で 108KB（1呼び出しあたり 35〜40KB 程度）。調査が終わったら設定を外して
  手で消す運用を引き継ぐ
- [`stream-json` で1回ぶんの出力量が増える] → 増える分がまさに残したかったツールの
  呼び出しと結果である。ログを取らない平常時（`debugLogDir` 未設定）は `json` のまま
  なので、通常運用の出力量は変わらない
- [継続先の無いセッションの判定（`sessionMissing`）が見る `stdout` が、最後の1塊だけに
  狭まる] → 判定は `${stderr}${stdout}` を見ており、この文言は stderr 側に出る。ただし
  「stdout 全文を走査する」性質は失われた。`stream-json` の途中の行にだけ現れる文言は
  拾えない
- [ログに会話本文・ツールの引数・コストが残る] → 既定 OFF（`debugLogDir` 未設定）。
  残る情報は `stream-json` にした分だけ増える。運用者が明示して初めて有効になる点は
  前 change のまま
- [拡張子は `.json` のままだが、中身はもう単一の JSON ではない（見出し行 + 1行1 JSON）]
  → 出力先も読み手も調査者だけであり、機械が拡張子で解釈する経路は無い。名前を変えると
  前 change のログと見分けが付かなくなる副作用のほうが大きい

## Migration Plan

既存の `<YYYYMMDD-HHmmss-SSS>-<uuid>.json` は残したままにする。読み替えの手当ては不要で、
新しい呼び出しから `<uuid>.json` へ追記されるだけである。ロールバックは
`server/utils/stroke/claude.ts` の revert で足りる（設定・データ構造の変更が無いため）。

`docs/specs/core/settings-reference.md` の `claude.debugLogDir` の説明は
「`--output-format json` の stdout 全文」と書いており、Decision 3 の後は実装と食い違う。
設定の正への追記・修正にはユーザー承認が要る（ADR-0004）ので、tasks の側に分けて置く。
