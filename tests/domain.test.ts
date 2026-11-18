import assert from "node:assert/strict";
import { test } from "node:test";
import {
  scenario,
  original,
  range,
  cardFile,
  cardJSON,
  wav,
  sha,
} from "./support/scenario.ts";
import {
  validateDomain,
  checkSources,
  preflight,
  bookHTML,
  epub,
  pdf,
  readProfessional,
} from "../src/domain/professional.ts";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
const sources = [{ content: original }];
test("目录缺失、空正文和重复来源拒绝", async () => {
  const p = scenario();
  p.chapters = [];
  assert.throws(() => preflight(p, sources));
  await assert.rejects(() => checkSources(scenario(), [{ content: "" }]));
  const q = scenario();
  q.chapters.push({ ...q.chapters[0], id: "repeat" });
  assert.throws(() => validateDomain(q));
});
test("脚注标记须唯一，纳入和排除明确", async () => {
  const p = scenario();
  await checkSources(p, sources);
  p.footnotes[0].marker = "不存在";
  await assert.rejects(() => checkSources(p, sources));
  const q = scenario();
  q.chapters[0].include = false;
  assert.throws(() => preflight(q, sources));
});
test("HTML原文转义、脚注链接与目录一致", () => {
  const p = scenario(),
    out = bookHTML(p, [{ content: original + "<script>bad()</script>" }]);
  assert.ok(!out.includes("<script>bad"));
  assert.match(out, /href="#chapter-0"/);
  assert.match(out, /chapter-0-note-0/);
});
test("EPUB首项mimetype不压缩，OPF nav spine和正文完整", () => {
  const b = Buffer.from(epub(scenario(), sources));
  assert.equal(b.toString("utf8", 30, 38), "mimetype");
  assert.equal(b.readUInt16LE(8), 0);
  const z = unzipSync(b);
  assert.equal(Buffer.from(z.mimetype).toString(), "application/epub+zip");
  assert.match(
    Buffer.from(z["OEBPS/content.opf"]).toString(),
    /<spine><itemref idref="chapter-0"/,
  );
  assert.match(Buffer.from(z["OEBPS/chapter-0.xhtml"]).toString(), /林溪/);
  assert.deepEqual(Buffer.from(epub(scenario(), sources)), b);
});
test("PDF真实中文字体内嵌、分页、固定输入可再生成", async () => {
  const p = scenario();
  const r = await pdf(p, sources),
    doc = await PDFDocument.load(r.bytes);
  assert.ok(doc.getPageCount() >= 2);
  assert.equal(r.pages, doc.getPageCount());
  assert.deepEqual(await pdf(p, sources), r);
});
test("PDF缺失字形失败，富文本损失显式披露", async () => {
  const p = scenario();
  await assert.rejects(() => pdf(p, [{ content: original + "\u{10ffff}" }]));
  assert.equal(
    preflight(p, [{ content: original + "\n# 原始标题" }]).losses[0].kind,
    "plain_text",
  );
});
