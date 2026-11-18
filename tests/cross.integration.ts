import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { start, host } from "./support/machine.ts";
import { importText } from "./support/import.ts";
import { candidate, managed } from "./support/creative.ts";
import {
  scenario,
  original,
  sha,
  selection,
  base,
} from "./support/scenario.ts";

test(
  "同一稳定Codex连接串联六插件、独立作品、真实声音与离线交付",
  { timeout: 1800000 },
  async (t) => {
    const c = await start(),
      peers = path.resolve(process.env.HETU_CROSS_ROOT ?? ".."),
      slugs = [
        "lorebook-bridge",
        "interactive-fiction",
        "series-organizer",
        "story-translation",
        "readthrough",
        "book-export",
      ];
    const clients = new Map<string, any>(),
      records = new Map<string, any>(),
      stages: string[] = [];
    let serial = 0,
      viewer: any;
    const fixed = (slug: string) => {
      const r = records.get(slug);
      return {
        owner_plugin_id: "org.wordflowlab." + slug,
        object_id: r.object.object_id,
        revision: r.object.revision,
        sha256: r.sha256,
      };
    };
    try {
      for (const slug of slugs) {
        let pkg: any;
        if (slug === "book-export") pkg = c.pkg;
        else {
          const source = process.env.HETU_CROSS_PACKAGES
              ? path.join(process.env.HETU_CROSS_PACKAGES, slug, "package")
              : path.join(peers, "hetu-" + slug, "dist"),
            directory = path.join(c.directory, "packages", slug);
          await cp(source, directory, { recursive: true });
          pkg = await c.ok("hetu_plugins_inspect_package", {
            package_directory: directory,
          });
          await c.ok("hetu_plugins_apply", {
            action: "install",
            plugin_id: "org.wordflowlab." + slug,
            package_directory: directory,
            package_sha256: pkg.package_sha256,
            expected_sha256: (await c.ok("hetu_plugins_inspect")).state_sha256,
            authorization_note: "本次C/D完整验收，仅操作隔离示例",
            operation_key: "install-" + slug,
          });
        }
        const binding = {
            management_ref: c.management,
            work_ref: c.work,
            plugin_id: "org.wordflowlab." + slug,
            package_sha256: pkg.package_sha256,
          },
          cap = await c.ok("hetu_plugins_capabilities", binding);
        const raw = async (action: string, input: any = {}) =>
          c.call("hetu_plugins_invoke", {
            ...binding,
            capabilities_sha256: cap.capabilities_sha256,
            action,
            arguments: input,
          });
        const invoke = async (action: string, input: any = {}) => {
          const r = await raw(action, input);
          assert.equal(r.status, "succeeded", JSON.stringify(r));
          assert.equal(
            r.data.result.status,
            "succeeded",
            JSON.stringify(r.data.result),
          );
          return r.data.result.data;
        };
        const fixture = await import(
          pathToFileURL(
            path.join(peers, "hetu-" + slug, "tests/support/scenario.ts"),
          ).href
        );
        clients.set(slug, { binding, cap, raw, invoke, fixture });
        const skill = await invoke("skills.read", { skill_id: slug });
        assert.ok(skill.content.includes("CLI/MCP"));
      }
      const refs = await importText(c, [original]),
        before = await c.ok("hetu_get_novel", { management_ref: c.management });
      const save = async (slug: string, p: any, bases: string[] = []) => {
        p.basis_refs = bases.map(fixed);
        const r = await clients
          .get(slug)
          .invoke("save_project", {
            content: p,
            source_refs: refs,
            expected_revision: 0,
            expected_sha256: "",
            operation_key: "save-" + slug,
          });
        records.set(slug, r);
        return r;
      };
      const artifact = async (slug: string, action: string, args: any = {}) => {
        const pieces: Buffer[] = [];
        let offset = 0,
          expected: string | undefined,
          total: number | undefined;
        do {
          const v = await clients
            .get(slug)
            .invoke(action, {
              ...selection(records.get(slug)),
              ...args,
              offset,
              max_bytes: 65536,
            });
          const b = Buffer.from(v.base64, "base64");
          assert.equal(sha(b), v.chunk_sha256);
          expected ??= v.sha256;
          total ??= v.total_bytes;
          assert.equal(v.sha256, expected);
          pieces.push(b);
          if (v.next_offset === null) break;
          assert.equal(v.next_offset, offset + b.length);
          offset = v.next_offset;
        } while (offset < 16 * 1024 * 1024);
        const b = Buffer.concat(pieces);
        assert.equal(b.length, total);
        assert.equal(sha(b), expected);
        return b;
      };
      await save(
        "lorebook-bridge",
        clients.get("lorebook-bridge").fixture.scenario(c.work),
      );
      assert.equal(
        (
          await clients
            .get("lorebook-bridge")
            .invoke("inspect_exchange", {
              ...selection(records.get("lorebook-bridge")),
              exchange_id: "lin",
            })
        ).character.name,
        "林溪",
      );
      stages.push("角色卡与世界书交换");
      const interactive = clients.get("interactive-fiction"),
        ip = interactive.fixture.scenario(c.work);
      await save("interactive-fiction", ip, ["lorebook-bridge"]);
      const route = await interactive.invoke("play_route", {
        ...selection(records.get("interactive-fiction")),
        choice_ids: ["follow", "meet"],
      });
      assert.equal(route.ending, true);
      stages.push("确定性分支试玩");
      const routeText =
        route.history
          .map((id: string) => ip.nodes.find((n: any) => n.id === id).text)
          .join("\n\n") + "\n";
      const draft = await candidate(c, routeText, "cross-route");
      refs.push(draft.source_ref);
      stages.push("固定路线成为宿主候选");
      const begin = await c.ok("hetu_begin_creation", {
        brief: "隔离系列番外",
        locale: "zh-CN",
        operation_key: "cross-side-begin",
      });
      const side = await c.ok("hetu_create_novel_from_project", {
        management_ref: begin.management_ref,
        project_id: begin.project.project_id,
        expected: { revision: begin.revision, sha256: begin.sha256 },
        target_path: begin.target_path,
        metadata: {
          title: "雨港番外",
          author_name: "隔离验收作者",
          synopsis: "寄信人视角",
          genre: "悬疑",
          language_tag: "zh-CN",
          status: "writing",
        },
        operation_key: "cross-side-create",
      });
      const otherWork = {
        workspace_id: side.workspace_management_ref.scope_ref.id,
        kind: "novel",
        object_id: side.novel.novel_id,
      };
      const currentView = await c.ok("hetu_read_work", {
          management_ref: c.management,
          work_ref: c.work,
        }),
        otherView = await c.ok("hetu_read_work", {
          management_ref: side.workspace_management_ref,
          work_ref: otherWork,
        });
      const sp = clients.get("series-organizer").fixture.scenario(c.work);
      sp.members[0].fixed_ref = currentView.summary.fixed_ref;
      sp.members[1].fixed_ref = otherView.summary.fixed_ref;
      await save("series-organizer", sp, ["interactive-fiction"]);
      assert.equal(
        (
          await clients
            .get("series-organizer")
            .invoke("check_series", selection(records.get("series-organizer")))
        ).shared_canon,
        false,
      );
      const denied = await c.call("hetu_read_work", {
        management_ref: c.management,
        work_ref: otherWork,
      });
      assert.notEqual(denied.status, "succeeded");
      stages.push("系列与独立作品隔离");
      const translated =
          "Lin Xi received an unsigned letter.\n\nFollowing the mark on the old key, she reached the quay.\n\nAt last she met the sender.\n",
        tp = clients.get("story-translation").fixture.scenario(c.work);
      tp.scope_indices = [1];
      tp.alignments = [
        {
          id: "route",
          title: "路线译稿",
          source_ranges: [
            {
              source_index: 1,
              byte_start: 0,
              byte_end: Buffer.byteLength(routeText),
              quote: routeText,
            },
          ],
          targets: translated.trim().split("\n\n"),
          status: "draft",
        },
      ];
      tp.terms = [];
      await save("story-translation", tp, [
        "interactive-fiction",
        "series-organizer",
      ]);
      assert.equal(
        (
          await clients
            .get("story-translation")
            .invoke(
              "check_translation",
              selection(records.get("story-translation")),
            )
        ).coverage[0].coverage,
        1,
      );
      const translatedDraft = await candidate(
        c,
        translated,
        "cross-translation",
      );
      refs.push(translatedDraft.source_ref);
      stages.push("固定源译对齐与译稿候选");
      const speechFile = process.env.HETU_TEST_SPEECH;
      assert.ok(
        speechFile,
        "请由外部工具先生成朗读样本，并通过HETU_TEST_SPEECH明确文件",
      );
      const speech = await readFile(speechFile),
        reader = clients.get("readthrough"),
        probe = await reader.invoke("inspect_wav", {
          file: {
            filename: "外部朗读.wav",
            base64: speech.toString("base64"),
            sha256: sha(speech),
          },
        });
      assert.ok(probe.duration_ms > 500 && probe.non_silent);
      const inline = {
          filename: "外部朗读.wav",
          base64: speech.toString("base64"),
          sha256: sha(speech),
        },
        scan = await c.ok("hetu_managed_assets_inspect", {
          management_ref: c.management,
          work_ref: c.work,
          inline_source: inline,
        });
      const asset = await managed(
        c,
        "assets.import",
        {
          work_ref: c.work,
          inline_source: inline,
          expected_file: { sha256: scan.sha256, size_bytes: scan.size_bytes },
          title: "实际英文朗读片段",
          source: {
            source_type: "author_supplied",
            creator_statement: "外部系统TTS生成的隔离声音样本",
          },
          rights_status: "unknown",
          redistribution_allowed: false,
          rights_statement: "不作为可分发声音授权证明",
          operation_key: "cross-voice-asset",
        },
        "cross-voice-asset",
      );
      refs.push({
        kind: "asset",
        work_ref: c.work,
        asset_id: asset.asset.asset_id,
        revision: asset.asset.revision,
        sha256: asset.sha256,
      });
      const rp = reader.fixture.scenario(c.work),
        quote = "Lin Xi received an unsigned letter.",
        range = {
          source_index: 2,
          byte_start: 0,
          byte_end: Buffer.byteLength(quote),
          quote,
        };
      rp.plans[0].ranges = [range];
      rp.recordings[0] = {
        ...rp.recordings[0],
        title: "外部工具实际朗读",
        audio_sha256: probe.audio_sha256,
        duration_ms: probe.duration_ms,
        sample_rate: probe.sample_rate,
        channels: probe.channels,
        bits: probe.bits,
        inline_wav: null,
        asset_source_index: refs.length - 1,
        speech_checked: false,
      };
      rp.mappings[0] = {
        ...rp.mappings[0],
        source_range: range,
        start_ms: 0,
        end_ms: probe.duration_ms,
        method: "segment_boundary",
        note: "单独生成这一固定句段，边界来自实际文件时长",
      };
      rp.notes[0].start_ms = 0;
      rp.notes[0].end_ms = Math.min(500, probe.duration_ms);
      await save("readthrough", rp, ["story-translation"]);
      assert.deepEqual(
        await artifact("readthrough", "export_audio", {
          recording_id: "voice",
        }),
        speech,
      );
      stages.push("真实声音与固定原文映射");
      const bp = scenario(c.work);
      bp.chapters = [
        {
          id: "original",
          title: "原稿依据",
          source_index: 0,
          volume: "依据",
          include: false,
        },
        {
          id: "route",
          title: "路线候选",
          source_index: 1,
          volume: "互动路线",
          include: true,
        },
        {
          id: "translated",
          title: "English route",
          source_index: 2,
          volume: "译稿",
          include: true,
        },
      ];
      bp.footnotes = [];
      bp.illustrations = [];
      await save("book-export", bp, [
        "lorebook-bridge",
        "interactive-fiction",
        "series-organizer",
        "story-translation",
        "readthrough",
      ]);
      const dest = path.resolve(
        process.env.HETU_RECEIPT_DIRECTORY ?? "docs/research",
      );
      await mkdir(dest, { recursive: true });
      for (const format of ["html", "epub", "pdf"]) {
        const bytes = await artifact("book-export", "compile_book", { format });
        await writeFile(path.join(dest, "cross-book." + format), bytes);
        assert.ok(bytes.length > 100);
      }
      stages.push("双语书稿HTML EPUB PDF交付");
      // 独立离线成果在真实Electron浏览器中试玩，业务创建仍全部走上面的机器入口。
      const file = path.join(c.directory, "互动叙事.html"),
        main = path.join(c.directory, "offline-viewer.cjs");
      await writeFile(
        file,
        await artifact("interactive-fiction", "export_player"),
      );
      await writeFile(
        main,
        'const {app,BrowserWindow}=require("electron");app.whenReady().then(()=>{const w=new BrowserWindow({width:1000,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true}});w.loadFile(process.argv[2]);});app.on("window-all-closed",()=>app.quit());',
      );
      const { _electron, expect } = createRequire(path.join(host, "package.json"))("@playwright/test");
      viewer = await _electron.launch({
        executablePath: createRequire(path.join(host, "package.json"))(
          "electron",
        ),
        args: [main, file],
        env: c.env,
      });
      const page = await viewer.firstWindow();
      await page
        .getByRole("button", { name: "循着记号出发", exact: true })
        .click();
      await page.getByRole("button", { name: "保存存档", exact: true }).click();
      await page
        .getByRole("button", { name: "在渡口等待", exact: true })
        .click();
      await expect(page.getByText("已到达结局", { exact: true })).toBeVisible();
      await page.reload();
      await page.getByRole("button", { name: "读取存档", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "渡口", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "在渡口等待", exact: true })
        .click();
      await expect(page.getByText("已到达结局", { exact: true })).toBeVisible();
      await page.screenshot({
        path: path.join(dest, "offline-player.png"),
        fullPage: true,
      });
      await viewer.close();
      viewer = undefined;
      const old = records.get("interactive-fiction"),
        next = {
          ...old.object.content,
          nodes: old.object.content.nodes.map((n: any) =>
            n.id === "mail" ? { ...n, text: n.text + "雨停了。" } : n,
          ),
        };
      const updated = await interactive.invoke("save_project", {
        ...base(old, "cross-new-story"),
        content: next,
      });
      assert.notEqual(updated.sha256, old.sha256);
      const basis = await clients
        .get("book-export")
        .invoke("get_basis", {
          ...selection(records.get("book-export")),
          basis_index: 1,
        });
      assert.equal(basis.basis.sha256, old.sha256);
      stages.push("新工程与旧书稿依据独立接续");
      const after = await c.ok("hetu_get_novel", {
        management_ref: c.management,
      });
      assert.deepEqual(after.novel.chapters, before.novel.chapters);
      assert.equal(after.sha256, before.sha256);
      await writeFile(
        path.join(dest, "cross-plugin-acceptance.json"),
        JSON.stringify(
          {
            date: "2026-11-18",
            host_version: c.coreVersion,
            platform: process.platform,
            architecture: process.arch,
            plugins: Object.fromEntries(
              [...clients].map(([s, v]) => [s, v.binding.package_sha256]),
            ),
            stages,
            stable_mcp_connections: 1,
            separate_work_authorization: true,
            original_manuscript_unchanged: true,
            offline_play_save_reload: true,
            actual_tts_audio: true,
            audio_sha256: sha(speech),
            audio_duration_ms: probe.duration_ms,
            complete_pcm_frames: true,
            speech_content_human_review: false,
            paid_model_calls: 0,
            limits: [
              "Windows/Linux专业旅程、声音权利、人工听读、文学质量、正文采纳与定稿未在此验收",
            ],
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      await viewer?.close();
      await c.client.close();
    }
  },
);
