import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const block = workflow.match(/        run: \|\n((?:          .*\n)+)/)?.[1];
assert.ok(block, '发布凭据检查步骤不存在');
const command = block.replace(/^          /gm, '');

function check(token, account, trigger) {
  const directory = mkdtempSync(join(tmpdir(), 'mao-release-readiness-'));
  const output = join(directory, 'output');
  const summary = join(directory, 'summary');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  try {
    const process = spawnSync('bash', ['-e', '-c', command], {
      env: { ...globalThis.process.env, CF_TOKEN: token, CF_ACCOUNT: account, TRIGGER: trigger, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
      encoding: 'utf8',
      timeout: 5000,
    });
    const log = `${process.stdout}${process.stderr}`;
    assert.ok(!log.includes('dummy-token') && !log.includes('dummy-account'), '日志不应包含凭据');
    return { status: process.status, output: readFileSync(output, 'utf8'), summary: readFileSync(summary, 'utf8') };
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.match(basename(directory), /^mao-release-readiness-/);
    rmSync(directory, { recursive: true });
  }
}

test('自动部署在凭据缺失时跳过，且明确标记未发布', () => {
  for (const [token, account] of [['', ''], ['dummy-token', ''], ['', 'dummy-account']]) {
    const result = check(token, account, 'workflow_run');
    assert.equal(result.status, 0);
    assert.match(result.output, /ready=false/);
    assert.match(result.summary, /未发布/);
  }
});

test('凭据齐全才允许部署；手动触发缺凭据必须失败', () => {
  const ready = check('dummy-token', 'dummy-account', 'workflow_run');
  assert.equal(ready.status, 0);
  assert.match(ready.output, /ready=true/);
  const manual = check('', '', 'workflow_dispatch');
  assert.equal(manual.status, 1);
  assert.match(manual.output, /ready=false/);
});
