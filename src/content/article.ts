import { Readability } from "@mozilla/readability";

export interface Article {
  title: string;
  text: string;
}

/**
 * 抽正文很贵（要 clone 整个 DOM），一个页面只做一次。
 * 用 location.href 做缓存键，顺带解决 SPA 路由切换失效的问题 ——
 * content script 在 isolated world，patch history.pushState 拦不到页面自己的调用。
 */
let cache: { href: string; article: Article } | null = null;

export function getArticle(): Article {
  const href = location.href;
  if (cache?.href === href) return cache.article;
  const article = extract();
  cache = { href, article };
  return article;
}

function extract(): Article {
  let title = document.title;
  let text = "";

  try {
    // Readability 会改写 DOM，必须在副本上跑
    const clone = document.cloneNode(true) as Document;
    const parsed = new Readability(clone, { charThreshold: 200 }).parse();
    if (parsed?.textContent && parsed.textContent.trim().length > 400) {
      title = parsed.title || title;
      text = parsed.textContent;
    }
  } catch {
    // 落到下面的兜底
  }

  // 兜底：Twitter / Reddit / 论坛这类非文章页 Readability 会返回空
  if (!text) text = document.body?.innerText ?? "";

  return { title, text: normalize(text) };
}

export function normalize(s: string): string {
  return s
    .replace(/[ \t ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
