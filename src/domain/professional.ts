import { zipSync, strToU8 } from "fflate";
import { PDFDocument, PageSizes, rgb } from "pdf-lib";
import { wrapLine } from "./typography.ts";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { requireValue as need } from "../../vendor/project-store.ts";
import { sourceText } from "./text.ts";
import {
  artifact,
  decode64,
  hash,
  escapeHTML as esc,
  htmlPage,
} from "./artifact.ts";

export function validateDomain(p: any) {
  const chapters = new Set(p.chapters.map((c: any) => c.id));
  need(
    new Set(
      p.chapters.filter((c: any) => c.include).map((c: any) => c.source_index),
    ).size === p.chapters.filter((c: any) => c.include).length,
    "同一固定正文不能重复编入书稿。",
  );
  need(
    /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(p.language),
    "书稿语言标记无效。",
  );
  for (const f of [...p.footnotes, ...p.illustrations])
    need(chapters.has(f.chapter_id), "书稿附件引用的章节不存在。");
  need(
    new Set(p.footnotes.map((f: any) => f.chapter_id + "\0" + f.marker))
      .size === p.footnotes.length,
    "同章脚注标记重复。",
  );
  for (const img of p.illustrations) {
    const b = decode64(img.base64, 90000);
    need(hash(b) === img.sha256, "插图摘要不一致。");
    need(
      img.media_type === "image/png"
        ? b
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : b[0] === 255 && b[1] === 216 && b.at(-2) === 255 && b.at(-1) === 217,
      "插图类型与实际文件不一致。",
    );
  }
}
export async function checkSources(p: any, sources: any[], _request?: any) {
  for (const c of p.chapters)
    if (c.include) {
      const text = sourceText(sources[c.source_index]);
      need(text.trim(), "纳入编译的正文为空。");
      for (const f of p.footnotes.filter((f: any) => f.chapter_id === c.id))
        need(
          text.split(f.marker).length === 2,
          "脚注标记须在固定正文中唯一出现。",
        );
    }
}
export function preflight(p: any, sources: any[]) {
  const included = p.chapters.filter((c: any) => c.include);
  need(included.length, "至少选择一章固定正文。");
  return {
    chapters: included.map((c: any) => ({
      id: c.id,
      title: c.title,
      volume: c.volume,
      source_index: c.source_index,
      characters: [...sourceText(sources[c.source_index])].length,
    })),
    excluded_chapter_ids: p.chapters
      .filter((c: any) => !c.include)
      .map((c: any) => c.id),
    losses: included.flatMap((c: any) => {
      const t = sourceText(sources[c.source_index]);
      return /<(?:[A-Za-z][^>]*|\/[A-Za-z][^>]*)>/.test(t) ||
        /^#{1,6}\s/m.test(t)
        ? [
            {
              chapter_id: c.id,
              kind: "plain_text",
              message:
                "原稿中的HTML或Markdown语法按字面文字排版，未自动解释富文本。",
            },
          ]
        : [];
    }),
    footnotes: p.footnotes.length,
    illustrations: p.illustrations.length,
    note: "编译固定选中目录；排版完成不代表作者定稿或公开发布。",
  };
}
function chapterHTML(p: any, c: any, sources: any[], epub = false) {
  let text = esc(sourceText(sources[c.source_index]));
  const notes = p.footnotes.filter((f: any) => f.chapter_id === c.id);
  notes.forEach((f: any, index: number) => {
    text = text.replace(
      esc(f.marker),
      '<a href="#note-' +
        index +
        '" id="ref-' +
        index +
        '"><sup>' +
        esc(f.marker) +
        "</sup></a>",
    );
  });
  return (
    "<h1>" +
    esc(c.title) +
    "</h1>" +
    text
      .split(/\r?\n\s*\r?\n/)
      .map((v: string) => '<p style="white-space:pre-wrap">' + v + "</p>")
      .join("") +
    p.illustrations
      .filter((im: any) => im.chapter_id === c.id)
      .map((im: any) => {
        const src = epub
          ? "images/" +
            p.illustrations.indexOf(im) +
            (im.media_type === "image/png" ? ".png" : ".jpg")
          : "data:" + im.media_type + ";base64," + im.base64;
        return (
          '<figure><img src="' +
          src +
          '" alt="' +
          esc(im.caption) +
          '"/><figcaption>' +
          esc(im.caption) +
          "</figcaption></figure>"
        );
      })
      .join("") +
    (notes.length
      ? "<aside><h2>注释</h2>" +
        notes
          .map(
            (f: any, index: number) =>
              '<p id="note-' +
              index +
              '"><a href="#ref-' +
              index +
              '">' +
              esc(f.marker) +
              "</a> " +
              esc(f.text) +
              "</p>",
          )
          .join("") +
        "</aside>"
      : "")
  );
}
export function bookHTML(p: any, sources: any[]) {
  const chapters = p.chapters.filter((c: any) => c.include);
  return htmlPage(
    p.title,
    "<header><h1>" +
      esc(p.title) +
      "</h1><p>" +
      esc(p.author) +
      "</p></header><nav><h2>目录</h2><ol>" +
      chapters
        .map(
          (c: any, i: number) =>
            '<li><a href="#chapter-' + i + '">' + esc(c.title) + "</a></li>",
        )
        .join("") +
      "</ol></nav>" +
      chapters
        .map(
          (c: any, i: number) =>
            '<section id="chapter-' +
            i +
            '">' +
            (c.volume ? "<p>" + esc(c.volume) + "</p>" : "") +
            chapterHTML(p, c, sources)
              .replaceAll('id="note-', 'id="chapter-' + i + "-note-")
              .replaceAll('id="ref-', 'id="chapter-' + i + "-ref-")
              .replaceAll('href="#note-', 'href="#chapter-' + i + "-note-")
              .replaceAll('href="#ref-', 'href="#chapter-' + i + "-ref-") +
            "</section>",
        )
        .join(""),
  );
}
export function epub(p: any, sources: any[]) {
  const chapters = p.chapters.filter((c: any) => c.include),
    xml = '<?xml version="1.0" encoding="UTF-8"?>';
  const entries: Record<string, any> = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
  };
  entries["META-INF/container.xml"] = strToU8(
    xml +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  entries["OEBPS/nav.xhtml"] = strToU8(
    xml +
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="' +
      esc(p.language) +
      '"><head><title>目录</title></head><body><nav epub:type="toc" id="toc"><h1>' +
      esc(p.title) +
      "</h1><ol>" +
      chapters
        .map(
          (c: any, i: number) =>
            '<li><a href="chapter-' +
            i +
            '.xhtml">' +
            esc(c.title) +
            "</a></li>",
        )
        .join("") +
      "</ol></nav></body></html>",
  );
  chapters.forEach((c: any, i: number) => {
    entries["OEBPS/chapter-" + i + ".xhtml"] = strToU8(
      xml +
        '<html xmlns="http://www.w3.org/1999/xhtml" lang="' +
        esc(p.language) +
        '"><head><title>' +
        esc(c.title) +
        "</title></head><body>" +
        chapterHTML(p, c, sources, true) +
        "</body></html>",
    );
  });
  p.illustrations.forEach((im: any, i: number) => {
    entries[
      "OEBPS/images/" + i + (im.media_type === "image/png" ? ".png" : ".jpg")
    ] = decode64(im.base64);
  });
  entries["OEBPS/content.opf"] = strToU8(
    xml +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="' +
      esc(p.language) +
      '"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">' +
      esc(p.identifier) +
      "</dc:identifier><dc:title>" +
      esc(p.title) +
      "</dc:title><dc:language>" +
      esc(p.language) +
      "</dc:language><dc:creator>" +
      esc(p.author) +
      '</dc:creator><meta property="dcterms:modified">2000-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
      chapters
        .map(
          (c: any, i: number) =>
            '<item id="chapter-' +
            i +
            '" href="chapter-' +
            i +
            '.xhtml" media-type="application/xhtml+xml"/>',
        )
        .join("") +
      p.illustrations
        .map(
          (im: any, i: number) =>
            '<item id="image-' +
            i +
            '" href="images/' +
            i +
            (im.media_type === "image/png" ? ".png" : ".jpg") +
            '" media-type="' +
            im.media_type +
            '"/>',
        )
        .join("") +
      "</manifest><spine>" +
      chapters
        .map((c: any, i: number) => '<itemref idref="chapter-' + i + '"/>')
        .join("") +
      "</spine></package>",
  );
  return zipSync(entries, {
    level: 6,
    mtime: new Date("2000-01-01T00:00:00Z"),
  });
}
let fontBytes: Uint8Array | undefined;
export async function pdf(p: any, sources: any[]) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(p.title);
  doc.setAuthor(p.author);
  doc.setSubject("河图固定书稿");
  doc.setProducer("Hetu Book Export 0.1.0");
  doc.setCreator("Hetu Book Export");
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  fontBytes ??= gunzipSync(
    await readFile(
      new URL("./fonts/HetuExportSansSC-Regular.ttf.gz", import.meta.url),
    ).catch(() =>
      readFile(
        new URL(
          "../../dist/fonts/HetuExportSansSC-Regular.ttf.gz",
          import.meta.url,
        ),
      ),
    ),
  );
  const face = (fontkit as any).create(fontBytes),
    font = await doc.embedFont(fontBytes, { subset: true }),
    size = p.font_size,
    leading = size * 1.8,
    [width, height] = PageSizes[p.page_size as "A4" | "A5"],
    margin = 42,
    usable = width - 2 * margin;
  const all = [
    p.title,
    p.author,
    ...p.chapters
      .filter((c: any) => c.include)
      .flatMap((c: any) => [
        c.title,
        c.volume,
        sourceText(sources[c.source_index]),
      ]),
    ...p.footnotes.map((f: any) => f.marker + " " + f.text),
    ...p.illustrations.map((im: any) => im.caption),
  ].join("\n");
  const missing = [
    ...new Set(
      [...all].filter(
        (ch) => !/\s/.test(ch) && !face.hasGlyphForCodePoint(ch.codePointAt(0)),
      ),
    ),
  ];
  need(
    !missing.length,
    "PDF字体缺少字形：" +
      missing.slice(0, 20).join("") +
      "；请先处理字体或原文。",
    "hetu.unsupported_format",
  );
  let page = doc.addPage([width, height]),
    y = height - margin;
  function next() {
    page = doc.addPage([width, height]);
    y = height - margin;
  }
  function line(t: string, bold = false) {
    if (y < margin + leading) next();
    page.drawText(t, {
      x: margin,
      y,
      size: bold ? size + 2 : size,
      font,
      color: rgb(0.12, 0.14, 0.13),
    });
    y -= leading;
  }
  function paragraph(t: string, bold = false) {
    for (const raw of t.replace(/\r\n?/g, "\n").split("\n")) {
      for (const row of wrapLine(raw.replace(/\t/g, "    "), usable, (value) =>
        font.widthOfTextAtSize(value, bold ? size + 2 : size),
      ))
        line(row, bold);
    }
    y -= leading / 3;
  }
  paragraph(p.title, true);
  if (p.author) paragraph(p.author);
  paragraph("目录");
  for (const c of p.chapters.filter((c: any) => c.include)) paragraph(c.title);
  for (const c of p.chapters.filter((c: any) => c.include)) {
    next();
    if (c.volume) paragraph(c.volume);
    paragraph(c.title, true);
    paragraph(sourceText(sources[c.source_index]));
    for (const f of p.footnotes.filter((f: any) => f.chapter_id === c.id))
      paragraph(f.marker + " " + f.text);
    for (const im of p.illustrations.filter(
      (im: any) => im.chapter_id === c.id,
    )) {
      const image =
          im.media_type === "image/png"
            ? await doc.embedPng(decode64(im.base64))
            : await doc.embedJpg(decode64(im.base64)),
        scale = Math.min(
          usable / image.width,
          (height - 2 * margin - leading) / image.height,
          1,
        ),
        w = image.width * scale,
        h = image.height * scale;
      if (y - h < margin) next();
      y -= h;
      page.drawImage(image, { x: margin, y, width: w, height: h });
      y -= leading;
      paragraph(im.caption);
    }
  }
  // 页码使用同一字体；写入时不改变分页。
  doc
    .getPages()
    .forEach((pg, index) =>
      pg.drawText(String(index + 1), { x: width / 2, y: 20, size: 10, font }),
    );
  return {
    bytes: await doc.save({ useObjectStreams: false }),
    pages: doc.getPageCount(),
  };
}
export function pureAction(_action: string, _i: any) {
  return undefined;
}
export async function readProfessional(
  action: string,
  p: any,
  sources: any[],
  i: any,
  _request?: any,
) {
  if (action === "preflight_book") return preflight(p, sources);
  if (action === "compile_book") {
    const report = preflight(p, sources);
    await checkSources(p, sources);
    let bytes: string | Uint8Array, pages: number | undefined;
    if (i.format === "html") bytes = bookHTML(p, sources);
    else if (i.format === "epub") bytes = epub(p, sources);
    else {
      const r = await pdf(p, sources);
      bytes = r.bytes;
      pages = r.pages;
    }
    return {
      ...artifact(
        bytes,
        p.title + "." + i.format,
        (
          {
            html: "text/html",
            epub: "application/epub+zip",
            pdf: "application/pdf",
          } as Record<string, string>
        )[i.format],
        i,
      ),
      preflight: report,
      ...(pages ? { pages } : {}),
    };
  }
}
