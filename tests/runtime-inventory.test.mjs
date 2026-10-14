import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditRuntimeInventory, parseInventory } from '../scripts/audit-runtime-assets.mjs';

describe('运行时资产闭环清单', () => {
  it('226 个文件指纹、尺寸及九个 UI 加载入口一致', () => {
    const report = auditRuntimeInventory();
    assert.deepEqual(report.issues, []);
    assert.equal(report.files, 226);
    assert.equal(report.uiKeys, 9);
    assert.equal(report.bytes, 90810951);
  });
  it('表头或列数损坏不能静默通过', () => {
    assert.throws(() => parseInventory('path,bytes\nx,12'), /表头/);
    assert.throws(() => parseInventory('category,loader_key,path,bytes,width,height,sha256,source_id,load_status\na,b,c'), /列数/);
  });
});
