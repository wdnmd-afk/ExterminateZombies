import contextlib
import hashlib
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'scripts'))

import PIL
import process_prop_item_assets as pipeline

specs = json.loads(pipeline.SPEC_PATH.read_text(encoding='utf-8'))
entries = []
for item_id in ('firebomb', 'dust_canister', 'demo_charge', 'cryo_canister'):
    spec = next(entry for entry in specs['props'] if entry['itemId'] == item_id)
    source = pipeline.candidate_path(spec, 'v01')
    product = pipeline.OUTPUT_DIR / pipeline.output_name(item_id)
    report = io.StringIO()
    with contextlib.redirect_stdout(report):
        image = pipeline.build_icon(item_id, spec, specs['shared'], 'v01')
    if image is None:
        entries.append({'itemId': item_id, 'passed': False, 'diagnostics': report.getvalue()})
        continue
    memory = io.BytesIO()
    image.save(memory, format='PNG')
    derived = memory.getvalue()
    existing = product.read_bytes()
    entries.append({
        'itemId': item_id,
        'source': source.relative_to(ROOT).as_posix(),
        'sourceBytes': source.stat().st_size,
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'product': product.relative_to(ROOT).as_posix(),
        'productBytes': len(existing),
        'productSha256': hashlib.sha256(existing).hexdigest(),
        'derivedSha256': hashlib.sha256(derived).hexdigest(),
        'passed': derived == existing,
        'diagnostics': report.getvalue(),
    })

result = {
    'recordedAt': datetime.now(timezone.utc).isoformat(),
    'python': sys.version,
    'pillow': PIL.__version__,
    'runtimeFilesWritten': 0,
    'sourceFilesWritten': 0,
    'passed': all(entry['passed'] for entry in entries),
    'entries': entries,
}
Path(__file__).with_name('prop-source-reproduction-01.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8',
)
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if result['passed'] else 1)
