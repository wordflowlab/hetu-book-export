# 专业流程

1. 读取固定目录与每章真实正文，按作者目标登记chapters顺序、卷名与include。重复来源、缺章、空正文必须处理，不能静默跳过。

2. 登记layout；脚注标记必须在对应章节唯一出现，插图须提供有摘要的真实PNG。核对插图来源及需要的分发权，不能把占位图冒充作品成果。

3. preflight_book 先列纳入／排除、脚注、插图和格式损失。当前以纯文本为准，Markdown／富文本不会自动升级成完整出版排版。

4. compile_book 选择html、epub或pdf，沿同一对象修订连续取全部分块，核对chunk_sha256、总长度和完整sha256。不能把首块当完整书稿。

5. HTML实际离线阅读；EPUB解包核对mimetype首项不压缩、container、OPF、nav、spine及每章资源；PDF用实际字体检查字形，再全页渲染核对分页、标题、脚注和插图。

6. PDF含随包OFL中文字体；缺字形直接失败，不能交付方框字。保留专业工程、固定来源与编译配置供再生成。文件生成不是作品定稿或外部发布。

## 发现、保存与接续

先读本包Skill及operations，再从实际Schema组装输入。新建预期修订为0；已有工程先读get_project，再提交expected_revision、expected_sha256与原operation_key。保存后get_project回读固定成果。使用get_basis/get_source读取确切依据，build_context控制上下文预算且披露省略，create_handoff固定专业引用。

停用或升级后重新发现。响应未知先get_operation；明确not_found才沿原输入原键恢复。作者在GUI修改导致CAS冲突时保留自己的输入，读取新基线并比较，不覆盖作者新稿。

跨插件接续使用固定basis_refs；上游新修订不会改写旧依据。专业状态、解析成功、文件解码及自动检查均不等于内容认可、正式设定、正文采纳或定稿。
