export const config = {
  fields: {
    chapter: "chapters",
    footnote: "footnotes",
    illustration: "illustrations",
  },
  defaults: {
    chapters: [],
    footnotes: [],
    illustrations: [],
    author: "",
    language: "zh-CN",
    identifier: "urn:hetu:book",
    page_size: "A5",
    font_size: 12,
  },
  tabs: ["书稿目录", "版式与脚注", "编译预检", "交付文件", "接续创作"],
} as const;
