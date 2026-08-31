import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initSessionOpenspec } from '../../../../server/utils/stroke/openspec';

/**
 * 初回の起動が掘る openspec ルート（`prepare`）。見るのは、**消えたセッションのために
 * 掘らないこと**である。
 *
 * `yarn check:stroke --cleanup` の片付けとこの初期化は競合する。片付けが
 * `/opt/projects/<uuid>` を消した直後に同じ uuid のディレクトリが `openspec/config.yaml`
 * だけを持つ殻として生まれていた（実測 2026-08-30・SIGINT）。殻は `state.json` を持たない
 * ので一覧にも巡回にも載らず、保存先に溜まるだけである。
 *
 * `openspec init` の代わりに `mkdir -p openspec` を起こす。ここで見たいのは掘る/掘らないの
 * 判断であって、openspec CLI の中身ではない。
 */

const INIT_BIN = 'mkdir';
const INIT_ARGS = '-p openspec';
const SCHEMA = 'flontier-strokeflow';

let root: string;
let cwd: string;

/** 呼ばれるたびに次の答えを返す `sessionExists`。掘る前と掘った後で答えを変えられる */
function existsReturning(...answers: boolean[]): () => Promise<boolean> {
  return async () => answers.length > 1 ? answers.shift()! : answers[0]!;
}

function init(overrides: { bin?: string, sessionExists: () => Promise<boolean> }) {
  return initSessionOpenspec({
    cwd,
    bin: overrides.bin ?? INIT_BIN,
    initArgs: INIT_ARGS,
    schemaName: SCHEMA,
    sessionExists: overrides.sessionExists,
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'openspec-init-'));
  cwd = join(root, '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607');
  await mkdir(cwd, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('initSessionOpenspec', () => {
  it('セッションが実在していれば掘って config.yaml をスキーマ名で書く', async () => {
    await init({ sessionExists: existsReturning(true) });

    expect(existsSync(join(cwd, 'openspec'))).toBe(true);
    expect(await readFile(join(cwd, 'openspec', 'config.yaml'), 'utf8')).toBe(`schema: ${SCHEMA}\n`);
  });

  it('セッションが実在しないときは openspec ルートを掘らない', async () => {
    await expect(init({ sessionExists: existsReturning(false) })).rejects.toThrow('セッションが無い');

    // 殻の芽を作らない。ディレクトリ自体もこちらでは触らない
    expect(existsSync(join(cwd, 'openspec'))).toBe(false);
  });

  it('掘っている間にセッションが消えたら、掘った分を埋め戻す', async () => {
    // 掘る前は在り、掘った後には消えている＝片付けとぶつかった状況
    await expect(init({ sessionExists: existsReturning(true, false) }))
      .rejects.toThrow('初期化の途中でセッションが消えた');

    expect(existsSync(join(cwd, 'openspec'))).toBe(false);
    // 空になったディレクトリは残さない（`--cleanup` の約束）
    expect(existsSync(cwd)).toBe(false);
  });

  it('埋め戻しで消すのは掘った分だけで、他に中身が残っていればディレクトリは残す', async () => {
    await writeFile(join(cwd, 'overview.txt'), 'のこす', 'utf8');

    await expect(init({ sessionExists: existsReturning(true, false) }))
      .rejects.toThrow('初期化の途中でセッションが消えた');

    expect(existsSync(join(cwd, 'openspec'))).toBe(false);
    expect(existsSync(join(cwd, 'overview.txt'))).toBe(true);
  });

  it('掘る前から openspec ルートが在ったなら、消えたと判定されても消さない', async () => {
    // `config.yaml` に `schema:` が無いと一覧の検査を通らず、ルートが在るまま prepare が
    // 走る。そこで埋め戻すと、他が作った成果物（`openspec/changes/…`）ごと消える。
    // `sessionExists` は `stat` の失敗を全部 false に畳むので、生きているセッションを
    // 消えたと誤認しうる——そのときに成果物を壊さないための守り
    await mkdir(join(cwd, 'openspec', 'changes', 'add-thing'), { recursive: true });
    await writeFile(join(cwd, 'openspec', 'changes', 'add-thing', 'proposal.md'), '# きえたら困る', 'utf8');

    await expect(init({ sessionExists: existsReturning(true, false) }))
      .rejects.toThrow('初期化の途中でセッションが消えた');

    expect(existsSync(join(cwd, 'openspec', 'changes', 'add-thing', 'proposal.md'))).toBe(true);
    expect(existsSync(cwd)).toBe(true);
  });

  it('初期化そのものの失敗は、そのまま呼び出し側へ届ける', async () => {
    await expect(init({ bin: 'false', sessionExists: existsReturning(true) })).rejects.toThrow();

    // セッションは在るままなので、埋め戻しは働かない
    expect(existsSync(cwd)).toBe(true);
  });
});
