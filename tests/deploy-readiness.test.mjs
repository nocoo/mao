import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const workflowDir = new URL("../.github/workflows/", import.meta.url);
const pipeline = readFileSync(new URL("pipeline.yml", workflowDir), "utf8");

test("unified pipeline.yml replaces ci.yml and release.yml", () => {
  assert.equal(existsSync(new URL("ci.yml", workflowDir)), false);
  assert.equal(existsSync(new URL("release.yml", workflowDir)), false);
  assert.match(pipeline, /^name:\s*Pipeline$/m);
  assert.doesNotMatch(pipeline, /\btags:/);
  assert.match(pipeline, /uses:\s*\.\/\.github\/workflows\/quality-slots\.yml/);
});

test("deploy job reuses B1 artifact and pins base-ci v2026.24", () => {
  assert.match(
    pipeline,
    /nocoo\/base-ci\/\.github\/workflows\/deploy-worker\.yml@3703a073693d598159e87f77f99587e586c14cfe/,
  );
  assert.match(pipeline, /artifact-name:\s*mao-static-site/);
  assert.match(pipeline, /artifact-path:\s*dist/);
  assert.doesNotMatch(pipeline, /^\s+build-command:/m);
  assert.match(pipeline, /verify-command:\s*pnpm run verify:production/);
  assert.match(pipeline, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/);
});
