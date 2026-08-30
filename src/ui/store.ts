import { signal } from "@preact/signals";
import type { ErrorCode, Settings } from "../shared/types";

export type Status = "loading" | "streaming" | "done" | "error";

export const visible = signal(false);
/** 卡片停靠方式，跟设置页同步 */
export const placement = signal<Settings["placement"]>("follow");
export const word = signal("");
/** 保留 Range，浮层用它跟随滚动 */
export const anchor = signal<Range | null>(null);
export const status = signal<Status>("loading");
export const text = signal("");
export const failure = signal<{ code: ErrorCode; message: string } | null>(null);
