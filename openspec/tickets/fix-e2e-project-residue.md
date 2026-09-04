---
status: Open
change: fix-e2e-project-residue
origin: agent
order: -11.0
triage:
  - bug
date: 2026-09-04
---

# fix-e2e-project-residue

E2E が作った承認済みプロジェクトが `.e2e-tmp/projects/` に残り続け、**次の実行から
`projects.spec.ts` を壊す**。後始末のコードは既に在り、この失敗モードまでコメントで
予告されている。にもかかわらず残る——つまり掃除の書き忘れではなく、**後始末が効いて
いないのに失敗が握り潰されている**のが本体である。

## 事実（2026-09-04）

`test/e2e/proposal-persistence.spec.ts:82`「承認は proposal が無いことを理由に拒まない」が
`e2e-proposal-approved-${Date.now()}` という名前でプロジェクトを作る。固定名にすると2回目の
実行が名前衝突で落ちるため、走るたびに違う名前になる（同ファイル 85-87 行のコメント）。

後始末は同ファイルの `afterEach`（54-67 行）に在り、`promoted` に積んだ名前から `projectId` を
導出して `DELETE /api/projects/:projectId` を叩く。その直前のコメント（48-50 行）は、残した
場合に何が起きるかをそのまま書いている。

> 残すと、承認済み（`phase: 'approved'`）で `.spec-workflow` を持たないディレクトリが
> 保存先に居座り、**次の実行から一覧に「生成中」として出る**（specs/project/directory）。
> それが他の spec の行数を狂わせる。

**予告どおりのことが起きている。** 2026-09-04 時点で `.e2e-tmp/projects/` に2件が残っていた。

| 残っていたもの | 作られた run |
| --- | --- |
| `e2e-proposal-approved-1788352484619` | 2026-09-02 |
| `e2e-proposal-approved-1788498695889` | 2026-09-04 |

この2件が一覧に「生成中」として並び、`projects.spec.ts` の3件が落ちる。

| 落ちるもの | 期待 | 実際 |
| --- | --- | --- |
| `projects.spec.ts:11:3` 走査で見つかったプロジェクトが並ぶ | 3行 | 5行 |
| `projects.spec.ts:16:3` アクティブが上、未接続が下に並ぶ | `[active, active, disconnected]` | `disconnected` が2つ余る |
| `projects.spec.ts:24:3` 同じ区分の中では名前順に並ぶ | `[alpha, beta, idle-project]` | 同上 |

失敗時の DOM（`test-results/.../error-context.md`）に、余分な2行が
`cell "e2e-proposal-approved-1788352484619" / 状態 "生成中"` として並んでいることを確認した。
2件を手で消して再実行すると `projects.spec.ts` は 19 passed になる。

**full run のたびに1件ずつ増える。** 放置すると期待値との差が開き続ける。

## 見当をつけたところ（未確定）

- 削除口 `server/api/projects/[projectId]/index.delete.ts` は**実在する**。`projectId` の導出
  （sha1 → base64url → 先頭16文字）もテスト側と一致しており、口が無いわけではない
- その口は busy（`isRunning`）・phase・`.spec-workflow` の3条件で 409 / 404 を返しうる。
  `afterEach` の時点でセッションがまだ動いていれば `busy` で弾かれる筋がある
- `afterEach` の `request.delete(...).catch(() => undefined)` が**失敗を握り潰している**ため、
  弾かれた事実がログにもテスト結果にも出ない。今回の発覚が遅れた直接の原因はこれである
- `playwright.config.ts` の `refuseRealTargets()` は保存先が `.e2e-tmp` の外を指していないかを
  検査するだけで、中身は消さない（134-139 行）。全体の掃除役はどこにも居ない

## 畳む方向

1. `afterEach` の削除がなぜ効かないかを突き止めて直す（口が弾いているのか、届いていないのか）
2. **後始末の失敗を握り潰さない。** 消せなかったことが実行結果から分かる形にする
3. 既に残っている残骸を片付ける手立てを持たせる。1回の取りこぼしが以後の全 run を壊す作りを
   やめ、実行の前後どちらかで保存先が既知の状態から始まるようにする

## 経緯

[[fold-stroke-css]] の tasks 5.4（`yarn test:e2e` が通ること）で full run を回したときに発覚した。
その change は CSS の置き場を畳むだけで、プロジェクトの行数に関わらない。切り分けの結果、
失敗5件のうち3件がこの残骸、残り2件は flake（再実行で通過）であることが分かったため、
`fold-stroke-css` からは切り出してここへ置く。

`fold-stroke-css` の作業中に残骸2件は手で消してあるので、**今の `.e2e-tmp/projects/` は
きれいな状態**である。次に full run を回した時点でまた1件増える。

## 関連

- [[update-e2e-harness]] — E2E の遅さを土台の作りから直す ticket。保存先の扱いに触るなら
  範囲が重なる可能性がある
