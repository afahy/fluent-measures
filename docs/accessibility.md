# Docs accessibility review

The documentation targets WCAG 2.2 AA. This records the evidence and remaining manual work;
it is not a conformance certification. Automated results cannot establish every success
criterion, as [W3C explains](https://www.w3.org/WAI/test-evaluate/tools/selecting/).

## Automated checks

Run `pnpm docs:audit` and `pnpm docs:sweep` from the repository root. `CONTRIBUTING.md` describes
their coverage, reports and deployment command. The audit requires four Lighthouse scores of
100 on every mobile and desktop sample, and zero axe violations in each tested state. Review
the `incomplete` entries in the accessibility JSON as well.

The audit does not waive the following manual checks just because Lighthouse passes.

## Review of the current page

Reviewed on 6 November 2026, using the page's markup, styles and Chrome layout/keyboard checks.

- **Text and non-text content (1.1.1, 1.3.1, 1.3.2):** examples, units and results are text.
  Decorative SVGs are hidden from assistive technology. Controls have names. Headings and
  landmarks organize the page. The units table has column headers, unit row headers and
  separate Height/Weight body groups with `scope="rowgroup"`. Axe flags this table for review
  because the Unit column contains row headers rather than data cells; those cells are
  intentionally headers. Confirm their associations in a screen reader, as described below.
- **Contrast (1.4.3):** axe checks the solid surfaces in both themes. It cannot evaluate the
  hero's gradient automatically. Using the WCAG relative-luminance calculation at the two
  gradient endpoints, the minimum ratios for heading, body and muted text are respectively
  15.83:1, 9.18:1 and 5.23:1 in light; 13.98:1, 10.31:1 and 6.21:1 in dark. The dark endpoint
  composites the 10% teal overlay over `--bg-tint`. All exceed 4.5:1. Recalculate if these
  colors, opacity or gradient layers change.
- **Color and controls (1.4.1, 1.4.11):** result text names the value and unit or says `null`;
  color is not its only distinction. Selected tabs use an underline and selected state.
  Links in prose are underlined, and keyboard focus has an outline in both themes. Review
  new controls against the 3:1 non-text contrast requirement.
- **Reflow and text spacing (1.4.10, 1.4.12):** the sweep checks 320–1600 CSS pixels. The audit
  applies line height 1.5, paragraph spacing 2em, letter spacing 0.12em and word spacing 0.16em
  together. The header wraps instead of pushing controls offscreen; anchor spacing follows
  its actual height. With scripts disabled, the header scrolls away from anchor destinations.
- **Keyboard and focus (2.1.1, 2.1.2, 2.4.1, 2.4.3, 2.4.7, 2.4.11):** the skip link, native
  disclosures, tab arrow keys, copy actions and menu dismissal remain keyboard accessible.
  The sweep checks focus leaving the phone menu and backward focus beneath the sticky header,
  including reduced motion and no-script navigation. Check the complete reading and focus
  order when adding or moving sections.
- **Names, states and feedback (2.4.2, 2.4.4, 2.4.6, 2.5.3, 4.1.2, 4.1.3):** the page has a
  descriptive title, labeled controls and links, selected/expanded states, and live messages
  for copy outcomes and example expansion. Tabs and copy actions become interactive only
  after initialization. The no-script page presents static examples instead.
- **Other applicable behavior:** the page declares English, does not change context on focus,
  has no timed task, autoplay, flashing content, dragging, multipoint gestures, authentication
  or user data submission. Media-specific captions and audio-description criteria do not
  apply because there is no audio or video. Pointer controls use ordinary click activation.

## Manual checks before a conformance claim

These require human review; no automated result in this repository marks them complete.

- Use VoiceOver with Safari and NVDA with Firefox or Chrome. Read the heading and landmark
  lists, follow the skip link, navigate both tables, select every tab and theme, expand the
  examples, and copy code. Confirm useful names, correct table associations, logical reading
  order and announcements that are understandable and not repeated unnecessarily.
- Use browser zoom at 200% and 400%, and enlarged text settings. Confirm that content and
  controls remain readable, focus stays visible and the menu remains usable. The automated
  viewport checks cover reflow geometry, not every browser's zoom or text-size behavior.
- Apply the text-spacing settings above and read the whole page, including open disclosures.
  The automated check catches page overflow and header/anchor obstruction; a person still
  needs to check for clipped or overlapping text elsewhere.
- Inspect focus outlines, pointer target sizes and their spacing, hover states, forced colors
  and link recognition. Test with touch as well as a keyboard. Axe's target-size checks help
  but do not replace this review.
- Review whether headings, links, labels, error feedback and instructions make sense in
  context. Test with people who use assistive technologies where possible.

Record the date, browser/assistive-technology versions, tested states, findings and fixes for
that review before publishing a WCAG conformance statement.
