# 书稿交付功能清单

本包拥有专业能力；宿主拥有正文、来源与作者决定。

| 动作 | 用途 | 必填参数 | 效果 |
| --- | --- | --- | --- |
| list_projects | 查找专业工程 |  | read |
| get_project | 读取固定专业工程 | object_id | read |
| save_project | 保存完整专业工程 | expected_revision, expected_sha256, operation_key, content | managed_write |
| put_chapter | 维护书稿章节 | object_id, expected_revision, expected_sha256, operation_key, chapter | managed_write |
| remove_chapter | 移除书稿章节 | object_id, expected_revision, expected_sha256, operation_key, chapter_id | managed_write |
| put_footnote | 维护脚注 | object_id, expected_revision, expected_sha256, operation_key, footnote | managed_write |
| remove_footnote | 移除脚注 | object_id, expected_revision, expected_sha256, operation_key, footnote_id | managed_write |
| put_illustration | 维护插图 | object_id, expected_revision, expected_sha256, operation_key, illustration | managed_write |
| remove_illustration | 移除插图 | object_id, expected_revision, expected_sha256, operation_key, illustration_id | managed_write |
| preflight_book | 预检正文、资源与编译损失 | object_id | read |
| compile_book | 编译HTML EPUB或PDF文件 | object_id, format | read |
| get_source | 读取固定来源 | object_id, source_index | read |
| get_basis | 读取固定上游专业依据 | object_id, basis_index | read |
| compare_versions | 比较专业修订 | object_id, from_revision, to_revision | read |
| export_project | 导出固定专业报告 | object_id, format | read |
| build_context | 准备有界专业上下文 | object_id, goal, max_chars | read |
| create_handoff | 生成固定专业交接 | object_id, goal | read |
| get_operation | 沿原键回读操作 | operation_key | read |

默认流程、边界及验收见 [docs](docs/README.md)。
