---
status: ready-for-agent
change: adr0017-sub-create-reference-mdc
tags:
  - maintenance
---

# adr0017-sub-create-reference-mdc

`@nuxtjs/mdc` について調べて分かった事実が、change の中にしか無い。archive されると消える。

`docs/specs/reference/mdc-observations.md` を新設し、`upstream-observations.md` と同じ「調べて分かった事実」の枠で残す。決定ではないので ADR にしない。7件それぞれについて、**どのテストが固定しているか**を書く。踏んだときに落ちる先を示すためである。`CLAUDE.md` の Docs 節へ載せ、`docs/specs/reference/stroke-modules.md` から参照させる。

あわせて `test/` の置き場を写し元に合わせる。規範は「ソースの構造をそのまま写す」だが、写し元がモジュールへ移った。`markdown-roundtrip.test.ts` と `markdown-sanitize.test.ts`、および `markdown-fence-position.test.ts` が `test/app/components/workspace/` に残っている。移動のみで、テストの中身と結果は変えない。

`create-module-markdown` から分けた。`adr0017-sub-add-position-port-preview` の後続。「どのテストが固定しているか」は `adr0017-sub-add-detection-assumptions` が加える検知の名前を突き合わせる必要があるため、その完了後に一度だけ確認する。

**`adr0017-sub-update-docs-structure` と重なる。** あちらの「触るファイル」に `test/app/components/workspace/markdown-*.test.ts` が挙がっている。この change が引き取るので、あちらの行は落とす。
