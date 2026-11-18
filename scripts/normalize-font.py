#!/usr/bin/env python3
"""固定中文字体glyf对齐；离线构建资产，不属于插件运行时。"""
from pathlib import Path
from io import BytesIO
import gzip,hashlib,json
import fontTools
from fontTools.ttLib import TTFont
root=Path(__file__).resolve().parent.parent;vendor=root/'vendor';file=vendor/'HetuExportSansSC-Regular.ttf.gz'
original=gzip.decompress(file.read_bytes());before=hashlib.sha256(original).hexdigest()
metadata=json.loads((vendor/'NotoSansSC-source.json').read_text())
assert before==metadata['derived_sha256'],'固定输入字体摘要不一致'
font=TTFont(BytesIO(original));font['glyf'].padding=4;font.recalcTimestamp=False
out=BytesIO();font.save(out);data=out.getvalue();check=TTFont(BytesIO(data))
assert all(offset%4==0 for offset in check['loca'].locations),'glyf字形必须四字节对齐'
file.write_bytes(gzip.compress(data,compresslevel=9,mtime=0))
metadata.setdefault('normalization_input_sha256',before);metadata['derived_sha256']=hashlib.sha256(data).hexdigest();metadata['normalization_fonttools_version']=fontTools.__version__
change='将glyf字形补齐四字节边界，保证旧版fontkit选择short loca子集时不截断奇数偏移；不修改字形轮廓和字符覆盖。'
if change not in metadata['modifications']:metadata['modifications'].append(change)
(vendor/'NotoSansSC-source.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
sources=json.loads((vendor/'sources.json').read_text())
for name in ['HetuExportSansSC-Regular.ttf.gz','NotoSansSC-source.json']:
 entry=next(e for e in sources['files'] if e['file']==name);entry['sha256']=hashlib.sha256((vendor/name).read_bytes()).hexdigest()
 if name.endswith('.gz'):entry['transform']='scripts/normalize-font.py：固定glyf四字节对齐后确定性gzip。'
(vendor/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'input_sha256':before,'output_sha256':metadata['derived_sha256'],'aligned_glyphs':len(check['loca'].locations)-1}))
