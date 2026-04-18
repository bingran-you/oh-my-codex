import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootAgents = readFileSync(join(__dirname, '../../../AGENTS.md'), 'utf-8');
const templateAgents = readFileSync(join(__dirname, '../../../templates/AGENTS.md'), 'utf-8');

function getAnalyzeRouteRow(content: string): string {
  const row = content
    .split('\n')
    .find((line) => line.includes('| "analyze", "investigate" |'));

  assert.ok(row, 'expected analyze keyword row to exist');
  return row;
}

describe('analyze routing contract', () => {
  it('routes analyze through the analyze skill file in root and template AGENTS', () => {
    const rootRow = getAnalyzeRouteRow(rootAgents);
    const templateRow = getAnalyzeRouteRow(templateAgents);

    assert.match(rootRow, /\.\/\.codex\/skills\/analyze\/SKILL\.md/i);
    assert.match(templateRow, /~\/\.codex\/skills\/analyze\/SKILL\.md/i);
    assert.match(rootRow, /read-only deep analysis with ranked synthesis, explicit confidence, and concrete file references/i);
    assert.match(templateRow, /read-only deep analysis with ranked synthesis, explicit confidence, and concrete file references/i);
  });

  it('does not leave analyze routed through debugger prompts or compatibility aliases', () => {
    const rootRow = getAnalyzeRouteRow(rootAgents);
    const templateRow = getAnalyzeRouteRow(templateAgents);

    assert.doesNotMatch(rootRow, /prompts\/debugger\.md/i);
    assert.doesNotMatch(templateRow, /prompts\/debugger\.md/i);
    assert.doesNotMatch(rootRow, /compatibility alias/i);
    assert.doesNotMatch(templateRow, /compatibility alias/i);
    assert.doesNotMatch(rootAgents, /\|\s*"analyze",\s*"investigate"\s*\|\s*`\$analyze`\s*\|\s*Read .*prompts\/debugger\.md/i);
    assert.doesNotMatch(templateAgents, /\|\s*"analyze",\s*"investigate"\s*\|\s*`\$analyze`\s*\|\s*Read .*prompts\/debugger\.md/i);
  });
});
