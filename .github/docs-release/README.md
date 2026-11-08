# Release presentation migration

`0.2.0.patch` restyles the documentation from release commit
`c37308d0586332f593aec6df4704d11475e59a42` using the design, navigation, accessibility fixes and
SEO metadata of the current docs. It is a frozen migration, applied only to that verified
revision after its package and original examples have passed verification. It is not applied
to future releases and never reads main's documentation at build time.

The release's README and parsing specification remain the content sources. The patch keeps the
release examples and their results, ports the four teaching paragraphs directly from its HTML,
and omits the unreleased `cms` and `kgs` unit aliases. The compact summaries reorganize examples
already present in the release. The property descriptions summarize the same release API;
no parser or specification result changes. All original release examples and the final HTML
examples are checked against the exact installed npm package, through both ESM and CommonJS.
The patch also freezes the additional compact-row tests for this presentation, so a change to
main's examples cannot alter the release's expectations on a retry. Later releases run their own
example tests before and after rendering.
The CSS changes and script changes preserve the current palettes, layout, controls, keyboard
navigation, progressive enhancement and no-JavaScript access.

Review this patch as documentation, including its prose. A later edit to the source preview
must not update this snapshot implicitly. Once promoted, the version directory is immutable;
reruns that would change it fail. New releases obtain HTML and Markdown from their own verified
revision, so new API content must be committed before the normal authorized package release.

Historical tags 0.1.0 and 0.1.1 lack the parsing reference and have package metadata mismatches.
They are not migrated or advertised as complete verified sets. Tags are never rewritten.
