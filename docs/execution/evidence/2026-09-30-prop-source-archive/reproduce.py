import argparse
import contextlib
import hashlib
import io
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import PIL

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'scripts'))

import process_prop_item_assets as pipeline


def fingerprint(path: Path) -> dict:
    content = path.read_bytes()
    return {
        'path': path.relative_to(ROOT).as_posix(),
        'bytes': len(content),
        'sha256': hashlib.sha256(content).hexdigest(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='复用现有道具管线，在内存核对采用原图与成品')
    parser.add_argument('--source-dir', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    source_dir = (ROOT / args.source_dir).resolve()
    source_dir.relative_to(ROOT)
    report_path = Path(__file__).resolve().parent / args.report
    if report_path.parent != Path(__file__).resolve().parent or report_path.exists():
        raise SystemExit('报告只能新建在当前证据目录，不能覆盖已有证据')

    pipeline.TEMP_DIR = source_dir
    specs = json.loads(pipeline.SPEC_PATH.read_text(encoding='utf-8'))
    by_id = {entry['itemId']: entry for entry in specs['props']}
    results = []
    for item_id in ('firebomb', 'dust_canister', 'demo_charge', 'cryo_canister'):
        spec = by_id[item_id]
        source = pipeline.candidate_path(spec, 'v01')
        product = pipeline.OUTPUT_DIR / pipeline.output_name(item_id)
        diagnostics = io.StringIO()
        with contextlib.redirect_stdout(diagnostics):
            icon = pipeline.build_icon(item_id, spec, specs['shared'], 'v01')
        result = {
            'itemId': item_id,
            'source': fingerprint(source),
            'product': fingerprint(product),
            'gatePassed': icon is not None,
            'identical': False,
            'diagnostics': diagnostics.getvalue().splitlines(),
        }
        if icon is not None:
            buffer = io.BytesIO()
            icon.save(buffer, format='PNG')
            rebuilt = buffer.getvalue()
            result['rebuilt'] = {
                'bytes': len(rebuilt),
                'sha256': hashlib.sha256(rebuilt).hexdigest(),
                'size': list(icon.size),
                'mode': icon.mode,
            }
            result['identical'] = rebuilt == product.read_bytes()
        results.append(result)
        print(f"{item_id}: gate={result['gatePassed']} identical={result['identical']}")

    passed = all(result['identical'] for result in results)
    report = {
        'recordedAt': datetime.now(timezone.utc).isoformat(),
        'python': platform.python_version(),
        'pillow': PIL.__version__,
        'sourceDirectory': source_dir.relative_to(ROOT).as_posix(),
        'runtimeFilesWritten': False,
        'passed': passed,
        'inputs': [fingerprint(ROOT / path) for path in (
            'scripts/prop_item_specs.json',
            'scripts/process_prop_item_assets.py',
            'scripts/inspect_weapon_side_candidates.py',
            'scripts/process_weapon_side_assets.py',
            'scripts/process_zombie_sprites.py',
        )],
        'results': results,
        'exitCode': 0 if passed else 1,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    raise SystemExit(report['exitCode'])


if __name__ == '__main__':
    main()
