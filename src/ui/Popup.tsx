import { autoUpdate } from "@floating-ui/dom";
import { useEffect, useRef } from "preact/hooks";
import { Markdown } from "./Markdown";
import { anchor, failure, placement, status, text, visible, word } from "./store";

interface Props {
  onClose(): void;
  onOpenOptions(): void;
  onRetry(): void;
}

/** 卡片与视口边缘留的空隙 */
const GAP = 16;
/** 卡片与选中词之间的间隙 */
const NUDGE = 8;
/** 宽度上限；右边空间不够就往下压 */
const MAX_W = 400;
/** 压到这个宽度就不再压了，再窄中文会挤得没法读，改为整体往左挤 */
const MIN_W = 300;
/** 卡片至少要留出这么高才不算憋屈；下方空间不够就整体上移 */
const MIN_H = 280;
/** 卡片高度上限 */
const MAX_H = 560;

/**
 * 正文第一行文字的上缘，距离卡片上缘有多远。
 *
 * 只用 .cl-body 自己的几何（顶部位置 + 内边距 + 半行距），不看里面装的是什么。
 * 早先版本量的是"第一个子元素"，于是骨架屏换成正文时这个值会变，
 * 卡片就会瞬移一下 —— 现在无论内容怎么变，这个数都是常量。
 */
function firstLineInset(card: HTMLElement, body: HTMLElement | null): number {
  if (!body) return 0;

  const cs = getComputedStyle(body);
  const padTop = Number.parseFloat(cs.paddingTop) || 0;
  const fs = Number.parseFloat(cs.fontSize) || 14;
  const lh = Number.parseFloat(cs.lineHeight);
  const halfLeading = Number.isFinite(lh) ? Math.max(0, (lh - fs) / 2) : 0;

  return body.getBoundingClientRect().top - card.getBoundingClientRect().top + padTop + halfLeading;
}

export function Popup({ onClose, onOpenOptions, onRetry }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const shown = visible.value;
  const range = anchor.value;
  const mode = placement.value;
  const st = status.value;
  const body = text.value;
  const err = failure.value;

  useEffect(() => {
    const el = cardRef.current;
    if (!shown || !el || !range) return;

    const reference = {
      getBoundingClientRect: () => range.getBoundingClientRect(),
      contextElement:
        (range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as Element)
          : range.startContainer.parentElement) ?? undefined,
    };

    /**
     * 一次算全：宽、高预算、位置。
     *
     * 关键是高度不由内容决定，而是先划定预算（到视口底部为止），
     * 正文在预算内涨、涨满就在卡片内部滚动。卡片本身自始至终不动，
     * 所以流式输出时不会一顿一顿地往上跳。
     */
    const update = () => {
      const rect = reference.getBoundingClientRect();

      // 宽：右边塞得下就用满，塞不下先压窄，压到 MIN_W 为止
      const spaceRight = window.innerWidth - rect.right - NUDGE - GAP;
      const w = Math.min(MAX_W, Math.max(MIN_W, spaceRight), window.innerWidth - 2 * GAP);
      el.style.width = `${w}px`;

      // 横：贴词右侧；再塞不下就整体往左挤，不翻到另一侧
      const left =
        mode === "right"
          ? Math.max(GAP, window.innerWidth - w - GAP)
          : Math.max(GAP, Math.min(rect.right + NUDGE, window.innerWidth - w - GAP));

      // 纵：正文首行对齐选中字的上缘。宽度变了文字要重排，必须在定宽之后再量
      const inset = firstLineInset(el, bodyRef.current);
      const floor = window.innerHeight - GAP;
      let top = rect.top - inset;
      if (top + MIN_H > floor) top = floor - MIN_H; // 下方憋屈才上移，且只在这里算一次
      top = Math.max(GAP, top);

      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.maxHeight = `${Math.max(MIN_H, Math.min(MAX_H, floor - top))}px`;
    };

    // elementResize 关掉：卡片自己长高不触发重算，只有滚动和窗口尺寸变化才跟
    return autoUpdate(reference, el, update, { elementResize: false });
  }, [shown, range, mode]);

  // 换一个词就把正文滚回顶部。生成过程中不自动跟到底 ——
  // 最要紧的词义和句义在最上面，跟着尾巴走反而把它顶出视野。
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [range]);

  if (!shown) return null;

  return (
    <div class="cl-card" ref={cardRef}>
      <div class="cl-head">
        <span class="cl-word">{word.value}</span>
        {st === "streaming" && <span class="cl-tag">生成中</span>}
        <button class="cl-x" onClick={onClose} title="关闭 (Esc)" type="button">
          ×
        </button>
      </div>

      <div class="cl-body" ref={bodyRef}>
        {st === "error" && err ? (
          <div class="cl-error">
            <strong>{errorTitle(err.code)}</strong>
            <p>{err.message}</p>
            {err.code === "no-key" ? (
              <button class="cl-btn" onClick={onOpenOptions} type="button">
                打开设置
              </button>
            ) : (
              <button class="cl-btn" onClick={onRetry} type="button">
                重试
              </button>
            )}
          </div>
        ) : body ? (
          <>
            <Markdown source={body} />
            {st === "streaming" && <span class="cl-caret" />}
          </>
        ) : (
          <div class="cl-skeleton">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
    </div>
  );
}

function errorTitle(code: string): string {
  switch (code) {
    case "no-key":
      return "尚未配置";
    case "unauthorized":
      return "认证失败";
    case "insufficient-balance":
      return "余额不足";
    case "rate-limited":
      return "请求过快";
    case "network":
      return "网络问题";
    default:
      return "出错了";
  }
}
