// 差し戻しを受けて AI が返してきた問い。proposal を出し直す前に確認してくる場合。
// 複数返ってくることがあるので配列で持つ。
import type { StrokeQuestion } from '~/data/question'

export const followupQuestions: StrokeQuestion[] = [
  {
    question: '「二重に買う」を主題から外す場合、代わりに何を主題に置きますか？',
    background:
      '差し戻しのコメントで「二重に買うより、何があるか分からないが主題では」と指摘を受けました。主題が変わると Why だけでなく、賞味期限の扱い（Q3）と買い物リストの位置づけも変わります。ここを決めないと proposal 全体の筋が通りません。',
    options: [
      {
        label: '在庫が見えないこと',
        detail:
          '「何があるか分からない」を主題に置く。買い物リストは在庫を見た結果の副産物になり、二重購入の防止は効果のひとつとして残る。',
        recommended: true,
        rationale:
          '指摘の文言に最も近く、Q3（期限切れを消さずに残す）とも整合する。在庫が見えることが目的なら、消さずに残すのは自然な帰結になる。',
      },
      {
        label: '食材を無駄にすること',
        detail:
          '期限切れで捨てることを主題に置く。賞味期限まわりが中心になり、レシピは「使い切るための手段」として位置づけが変わる。',
      },
      {
        label: '主題は変えない',
        detail:
          '二重購入の防止のまま、指摘は表現の問題として Why の書き方だけ直す。capability の構成は変わらない。',
      },
    ],
  },
  {
    question: '主題を変えると、買い物リストの capability はどう扱いますか？',
    background:
      '主題が「在庫が見えないこと」になると、買い物リストは目的ではなく在庫を見た結果の副産物になります。capability として独立させ続けるかどうかで、What Changes の粒度が変わります。',
    options: [
      {
        label: '独立した capability のまま残す',
        detail: '`shopping-list` をそのまま置く。在庫から不足を組み立てる振る舞いは変わらない。',
        recommended: true,
        rationale:
          '振る舞いとしては独立して検証できる。主題が変わっても、この capability の spec は書き換えずに済む。',
      },
      {
        label: '在庫の capability に畳む',
        detail: '`stock-list` の一部にする。capability は2つに減るが、spec が1つに詰め込まれて長くなる。',
      },
      {
        label: 'MVP から外す',
        detail: '買い物リストを次の change に回し、まず在庫が見えることだけを作る。',
      },
    ],
  },
  {
    question: 'Why の書き出しは、どの立場から書きますか？',
    background:
      '主題が決まったので、あとは書き方だけです。差し戻しのコメントは表現にも触れていました。',
    options: [
      {
        label: '困っている場面から書く',
        detail: '「買い物中に、家に何があるか思い出せない」のように、具体的な場面から入る。',
        recommended: true,
        rationale: '元の Why も場面から入っており、書き換えの幅が小さい。',
      },
      {
        label: '欲しい状態から書く',
        detail: '「買い物前に在庫を見られる」という達成状態から入る。',
      },
    ],
  },
]
