import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (path: string): string => readFileSync(path, 'utf8');

describe('release documentation workflow', () => {
  it('gates upload and deployment on verification and durable ordering in the same retryable job', () => {
    const workflow = read('.github/workflows/deploy-docs.yml');
    expect(workflow).not.toContain('branches: [main]');
    const dispatch = read('.github/workflows/release-docs.yml');
    expect(dispatch).toContain("tags: ['v*']");
    expect(dispatch).toContain('gh workflow run deploy-docs.yml --ref main --field');
    expect(dispatch).not.toMatch(/npm publish|changeset publish|environment:/);
    expect(workflow).not.toContain('  push:');
    expect(workflow).not.toMatch(/branches:|npm publish|changeset publish|release:publish\s*$/m);
    expect(workflow).toContain('required: true');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(
      workflow
        .match(/^[ ]{2}[\w-]+:\n/gm)
        ?.filter(line => !line.includes('push') && !line.includes('workflow_dispatch'))
    ).toEqual(['  release-docs:\n']);
    expect(workflow).toContain("group: 'pages'");
    expect(workflow).toContain('cancel-in-progress: false');
    const verification = workflow.indexOf(
      'node .github/scripts/docs-release.mjs "$REQUESTED_VERSION"'
    );
    const promotion = workflow.indexOf('run: node .github/scripts/docs-promote.mjs');
    expect(verification).toBeGreaterThan(0);
    expect(promotion).toBeGreaterThan(verification);
    expect(workflow.indexOf('uses: actions/upload-pages-artifact@v3')).toBeGreaterThan(promotion);
    expect(workflow.indexOf('uses: actions/deploy-pages@v4')).toBeGreaterThan(
      workflow.indexOf('uses: actions/upload-pages-artifact@v3')
    );
    expect(workflow.indexOf('node .github/scripts/docs-verify-public.mjs')).toBeGreaterThan(
      workflow.indexOf('uses: actions/download-artifact@v4')
    );
  });
});
