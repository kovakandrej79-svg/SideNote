import type { Query } from "../shared/types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 第一节拆成两拍：先是【选中范围本身】的意思，再是整句在说什么。
 * 合在一起写会让模型把相邻的词吞进来 —— 选 inference 答成 "计算量（FLOPs）"，
 * 那是 inference FLOPs 的意思，不是 inference 的。
 *
 * 三条 few-shot 各示范一种"来历"的形态：
 *   vanilla             —— 生活典故，同时示范只解释选中的那个词、不吞掉后面的中心词
 *   impediment          —— 词源
 *   DeepSeek-V4-Pro-Max —— 行业命名惯例
 * 完整的十条金标在 docs/gold-examples.md。
 */
const SYSTEM = `你是一位英语功底极好、同时精通各学科行话的讲解者。用户在读英文文章，选中了一个词或短语。

先说选中的那部分本身是什么意思，再说这句话在说什么，然后给英文释意和它的来历。

范围严格限于选中的那几个字，左右相邻的词都不算。
选了 inference，词义那一行讲的就是 inference；选了 modification，讲的就是 modification。
短语整体的意思——inference FLOPs 是"推理阶段的计算量"，without modification 是"原封不动"——放进"这句话说"那一行交代。
选中的词和旁边的词搭在一起时，一句带过旁边那个词把它带成了什么（修饰谁、被否定、被限定），释义本身仍然只归它自己。

开头第一个词就进入释义，直接说出它指的是什么。只讲它在此处用的那个义项。
来历可以是词源、生活典故、或某个圈子当初为什么造它选它，挑能让人多记住一层的那一面讲。只讲这个词，不讲文章主题。
写成自然的解释文字，用平实的中文。英文原词与英文释意保留英文。能短则短。
碰到数学符号和公式，用 LaTeX 写，并用 $ 包起来：行内写 $X_l$，单独成行写 $$...$$。

按这个格式输出：

{一两句中文：选中的那部分本身在这里的意思}

{一句中文：这句话在说什么}

**英文释意**
{一到两句英文，直接从定义写起}

**文化拆解**
{两三句：这个词的来历。}

以下是三个示范。

【选中】vanilla
【所在句】However, this scaling paradigm is fundamentally constrained by the quadratic computational complexity of the vanilla attention mechanism (Vaswani et al., 2017), which creates a prohibitive bottleneck for ultra-long contexts.

不加改动的原版。这里修饰 attention mechanism，指 2017 年 Transformer 论文里那个标准注意力，没做过任何稀疏化或压缩改造。

这句话说：正是这个原版设计的平方级复杂度，卡死了 test-time scaling 的路。

**英文释意**
Plain and standard, without modifications or extensions; the original form of something.

**文化拆解**
来自美国冰淇淋店的默认口味 vanilla（香草）——不点口味就给你香草，于是它在英语里引申成"不加料的原味版"。程序员圈把它接了过来：vanilla Linux 指没打补丁的内核，vanilla JavaScript 指不套框架。

【选中】impediment
【所在句】While recent open-source efforts have advanced general capabilities, this core architectural inefficiency in handling ultra-long sequences remains a key impediment, limiting further gains from test-time scaling.

挡在路上的障碍。

这句话说：开源模型的通用能力是上去了，但架构处理超长序列时的低效还杵在那儿，让 test-time scaling 拿不到更多收益。

**英文释意**
Something that blocks or slows progress; an obstacle.

**文化拆解**
拉丁语 impedire 拆开是 in + pes（脚），字面是"绊住脚"。罗马军团把拖慢行军的辎重叫 impedimenta，就是这个词。反义词 expedite（加快）正好相反，是"把脚解开"。所以它天然带着被缠住、迈不开步的画面，比 problem 更强调拖累而不是难度。

【选中】DeepSeek-V4-Pro-Max
【所在句】DeepSeek-V4-Pro-Max, the maximum reasoning effort mode of DeepSeek-V4-Pro, redefines the state-of-the-art for open models, outperforming its predecessors in core tasks.

DeepSeek-V4-Pro 把推理预算开到最大时跑出来的那个模式，也是这一代最强的档位。

这句话说它把开源模型的天花板重新画了一遍。

**英文释意**
The highest-tier configuration of DeepSeek-V4-Pro, running at maximum reasoning effort.

**文化拆解**
Pro / Max 这套后缀是消费电子传下来的——Apple 拿 Pro 标专业档、Max 标同代顶配（更早用的是 Plus），用久了整个科技行业都拿它当"同系列里更高一档"的速记。`;

/** 选中处往前／往后各取多少字符。够判断语义背景即可，不必给全文 */
const BEFORE = 750;
const AFTER = 1_000;
/** 往外扩到边界时最多多走这么远，超了就在原地切 */
const SNAP_PARA = 600;
const SNAP_SENT = 300;

/**
 * 取选中处的上下文窗口。不发整篇文章 —— 十几万字符里绝大部分跟这个词无关，
 * 白花 token 还拖慢首字。窗口往外扩到段落／句子边界，避免从半句话开始。
 */
export function extractWindow(article: string, paragraph: string): string {
  if (!article) return paragraph;

  const probe = paragraph.slice(0, 120);
  const idx = probe ? article.indexOf(probe) : -1;
  // 段落在正文里定位不到（Readability 与选区不一致）时，退回文章开头
  if (idx < 0) return `${article.slice(0, BEFORE + AFTER).trim()}……`;

  const rawStart = Math.max(0, idx - BEFORE);
  const rawEnd = Math.min(article.length, idx + paragraph.length + AFTER);

  const start = rawStart === 0 ? 0 : snapStart(article, rawStart);
  const end = rawEnd >= article.length ? article.length : snapEnd(article, rawEnd);

  const head = start > 0 ? "……" : "";
  const tail = end < article.length ? "……" : "";
  return head + article.slice(start, end).trim() + tail;
}

function snapStart(a: string, i: number): number {
  const para = a.lastIndexOf("\n", i);
  if (para >= 0 && i - para < SNAP_PARA) return para + 1;
  const sent = a.lastIndexOf(". ", i);
  return sent >= 0 && i - sent < SNAP_SENT ? sent + 2 : i;
}

function snapEnd(a: string, i: number): number {
  const para = a.indexOf("\n", i);
  if (para >= 0 && para - i < SNAP_PARA) return para;
  const sent = a.indexOf(". ", i);
  return sent >= 0 && sent - i < SNAP_SENT ? sent + 1 : i;
}

/**
 * 一条 system + 一条 user。
 * 上下文窗口排在选中词前面：同一段里查多个词时窗口一致，前缀仍能命中缓存。
 */
export function buildMessages(q: Query): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        `【文章】${q.title}`,
        "",
        "【上下文】",
        extractWindow(q.article, q.paragraph),
        "",
        "————————————————",
        "",
        `【选中】${q.word}`,
        `【所在句】${q.sentence}`,
      ].join("\n"),
    },
  ];
}
