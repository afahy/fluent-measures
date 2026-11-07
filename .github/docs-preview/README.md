# Local palette assets

`pnpm docs:preview` copies `docs/` to the ignored `.docs-preview/` directory, bundles
`palettes.json` with `switcher.js`, copies `switcher.css`, and adds only those two asset tags
to the copied page. Open `.docs-preview/index.html` directly; no server is required. Repeating
the command replaces that output. Never put these assets or a loader in `docs/`: the Pages
workflow uploads that entire directory.

Atlas is the production default. Its light tokens live in `docs/site.css` (built into
`tailwind.css`), and its dark tokens live in the existing media-controlled stylesheet in
`docs/index.html`. The Atlas manifest entry deliberately has no overrides: selecting or
resetting to it removes all preview overrides. Every other candidate combines the manifest's
common tokens with its family tokens. Original has complete legacy tokens of its own,
including the local note border, so it restores teal independently of the production palette.

The candidate values come from the judged implementation at
`ad4c5035e2c5746fab9eacf089ea658cef394aea` on `t3/explore-docs-palettes`; Original comes from
the production docs before Atlas (`bfac12a`). The manifest preserves the other nine candidate
families unchanged. AFA-246 adopts Atlas on the maintainer's explicit selection. Atlas scored
9/10 from each final independent judge; the collection's six-round experiment did not achieve
formal acceptance. Its evidence stays on the experiment branch and in the original evidence
directory. This is adoption, not another design-judging round.

`tests/docsPalettePreview.test.ts` exercises generated output, production isolation, intended
palette values, independent preferences and failure paths. The browser audit is
`pnpm exec node .github/scripts/docs-palettes.mjs`; it regenerates the preview, checks all
eleven choices in both themes, and verifies production and no-script Atlas separately.
It needs the same Chrome setup as the other docs tools. Follow any shared CPU hold before
running it or the repository's full checks. AFA-243 and AFA-245 remain separate baseline issues.
