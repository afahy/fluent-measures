// AFA-246: opt-in local output. GitHub Pages uploads docs/ only.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

// The CLI always uses .docs-preview/. Tests supply a temporary repository root.
export function generatePreview(repository = root) {
  const output = join(repository, '.docs-preview');
  const assets = join(repository, '.github/docs-preview');
  const page = readFileSync(join(repository, 'docs/index.html'), 'utf8');
  const data = JSON.parse(readFileSync(join(assets, 'palettes.json'), 'utf8'));
  const script = readFileSync(join(assets, 'switcher.js'), 'utf8');
  const injection = `    <link rel="stylesheet" href="palette-preview.css" />
    <script src="palette-preview.js"></script>
  </head>`;
  if (!page.includes('</head>')) throw new Error('Docs page has no closing head');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output);
  cpSync(join(repository, 'docs'), output, { recursive: true });
  cpSync(join(assets, 'switcher.css'), join(output, 'palette-preview.css'));
  writeFileSync(
    join(output, 'palette-preview.js'),
    `(() => {\nconst { common, palettes } = ${JSON.stringify(data)};\n${script}\n})();\n`
  );
  writeFileSync(join(output, 'index.html'), page.replace('  </head>', injection));
  return join(output, 'index.html');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`Open ${pathToFileURL(generatePreview()).href}`);
}
