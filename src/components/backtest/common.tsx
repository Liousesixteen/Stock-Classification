import type { ReactNode } from "react";
export type UiLanguage = "zh" | "en";
export const useUiLanguage = () => ({ language: "zh" as UiLanguage });
export const formatUiText = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
export type ParsedApiError = { message: string };
export const getParsedApiError = (error: unknown): ParsedApiError => ({ message: error instanceof Error ? error.message : "回测请求失败，请重试" });
export function ApiErrorAlert({ error, className = "" }: { error: ParsedApiError; className?: string }) { return <div role="alert" className={`bt-error ${className}`}>{error.message}</div>; }
export function Card({ children, className = "" }: { children: ReactNode; className?: string; variant?: string; padding?: string }) { return <article className={`bt-card ${className}`}>{children}</article>; }
export function Badge({ children, variant = "default" }: { children: ReactNode; variant?: string; glow?: boolean }) { return <span className={`bt-badge bt-${variant}`}>{children}</span>; }
export function EmptyState({ title, description, className = "", icon }: { title: string; description: string; className?: string; icon?: ReactNode }) { return <div className={`bt-empty ${className}`}>{icon}<b>{title}</b><p>{description}</p></div>; }
export function Pagination({ currentPage, totalPages, onPageChange }: { currentPage: number; totalPages: number; onPageChange: (page: number) => void }) { return <nav className="bt-pagination" aria-label="回测结果分页"><button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>上一页</button><span>{currentPage} / {Math.max(1, totalPages)}</span><button disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>下一页</button></nav>; }
export function StatusDot({ tone, className = "" }: { tone: string; className?: string }) { return <i aria-hidden="true" className={`bt-dot bt-${tone} ${className}`} />; }
export function Tooltip({ children, content, focusable }: { children: ReactNode; content: string; focusable?: boolean }) { return <span title={content} tabIndex={focusable ? 0 : undefined} className="bt-tooltip">{children}</span>; }
