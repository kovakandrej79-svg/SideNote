import { normalize } from "./article";

export interface Pick {
  word: string;
  sentence: string;
  paragraph: string;
  /** 保留 Range 而非快照 rect：浮层要能跟随页面滚动 */
  range: Range;
}

const PREFERRED_BLOCKS = "p,li,td,th,dd,dt,blockquote,figcaption,h1,h2,h3,h4,h5,h6";

export function readSelection(): Pick | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const word = sel.toString().trim().replace(/\s+/g, " ");
  if (!word) return null;
  if (!/[A-Za-z]/.test(word)) return null; // 纯数字/标点/中文不触发
  if (word.length > 120 || word.split(" ").length > 12) return null; // 误选整段

  const range = sel.getRangeAt(0);
  const block = nearestBlock(range.startContainer);
  const rawParagraph = block?.textContent ?? word;

  const sentence = sentenceAt(rawParagraph, offsetInBlock(range, block)) || rawParagraph;

  return {
    word,
    sentence: normalize(sentence),
    paragraph: normalize(rawParagraph).slice(0, 2000),
    range: range.cloneRange(),
  };
}

/** 选区起点在 block 的 textContent 中的字符偏移 */
function offsetInBlock(range: Range, block: HTMLElement | null): number {
  if (!block) return 0;
  try {
    const pre = range.cloneRange();
    pre.selectNodeContents(block);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  } catch {
    return 0;
  }
}

/**
 * 找"选中处所在的段落"。不能直接 closest('div') —— 可能命中整个页面容器。
 * 先找语义块级元素，不行再往上走到文本量合适的祖先。
 */
function nearestBlock(node: Node): HTMLElement | null {
  const start =
    node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  if (!start) return null;

  const preferred = start.closest<HTMLElement>(PREFERRED_BLOCKS);
  if (preferred && (preferred.textContent?.length ?? 0) > 20) return preferred;

  let el: HTMLElement | null = start;
  while (el) {
    const len = el.textContent?.length ?? 0;
    if (len >= 60 && len <= 4000) return el;
    if (len > 4000) break;
    el = el.parentElement;
  }
  return preferred ?? start;
}

/**
 * 切句。Intl.Segmenter 用的是 ICU 规则，默认不启用缩写抑制表 ——
 * "e.g. Dr. Hinton" 会被切成三段。所以要再合并一次：
 * 上一段以缩写结尾、或短得不像一个句子时，并入下一段。
 */
const ABBREV_END =
  /(?:\b(?:[A-Za-z]\.){1,3}|\b(?:mr|mrs|ms|dr|prof|sr|jr|st|fig|eq|no|vs|etc|al|inc|ltd|co|cf|approx|ch|pp|vol|ref|dept|univ|est)\.)\s*$/i;

interface Sentence {
  index: number;
  text: string;
}

function segment(text: string): Sentence[] {
  const raw: Sentence[] = [];

  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    try {
      for (const s of new Segmenter("en", { granularity: "sentence" }).segment(text)) {
        raw.push({ index: s.index, text: s.segment });
      }
    } catch {
      // 落到下面的正则兜底
    }
  }

  if (raw.length === 0) {
    const re = /[^.!?]*[.!?]+\s*|[^.!?]+$/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (!m[0]) break;
      raw.push({ index: m.index, text: m[0] });
    }
  }

  const merged: Sentence[] = [];
  for (const s of raw) {
    const prev = merged[merged.length - 1];
    if (prev && (ABBREV_END.test(prev.text) || prev.text.trim().length < 20)) {
      prev.text += s.text;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

export function sentenceAt(text: string, offset: number): string {
  const sentences = segment(text);
  for (const s of sentences) {
    if (offset >= s.index && offset < s.index + s.text.length) return s.text;
  }
  return sentences.at(-1)?.text ?? text;
}
