import { names } from "../domain/report.ts";
const label = (v: string) => names[v] ?? v;
export function rowTitle(field: string, v: any, p: any): string {
  return v.title ?? v.name ?? v.source ?? v.label ?? v.marker ?? "记录";
}
export function rowContent(field: string, v: any, p: any): any {
  if (field === "chapters")
    return { 卷名: v.volume || "未分卷", 纳入书稿: v.include };
  if (field === "footnotes")
    return {
      所属章节:
        p.chapters.find((c: any) => c.id === v.chapter_id)?.title ??
        "未找到章节",
      注释: v.text,
    };
  const { id, title, name, ...rest } = v;
  return rest;
}
export function panelContent(action: string, v: any, p: any): any {
  if (action === "preflight_book")
    return {
      纳入章节: v.chapters.map((c: any) => ({
        章节: c.title,
        卷名: c.volume,
        字符数: c.characters,
      })),
      未纳入章节: v.excluded_chapter_ids.map(
        (id: string) =>
          p.chapters.find((c: any) => c.id === id)?.title ?? "未找到章节",
      ),
      脚注: v.footnotes,
      插图: v.illustrations,
      转换说明: v.losses.map((x: any) => x.message),
      说明: v.note,
    };
  return v;
}
