<!-- Fill with fill.mjs. This brief intentionally has no target or history placeholders. -->

Independently assess the visual design of this page:
{ABOUT}

The page: {PAGE_URL}

{PAGE_SOURCE}

{CONTENT_SPEC}

## Scope and access

This is a read-only assessment. Do not edit repository files or run git commands. Write only
in your scratch folder, `{SCRATCH}`. Do not start other agents.

Read only the page and its assets, the named content specifications, the supplied reference
images, and `CONTRIBUTING.md` for screenshot command arguments. Do not read skill files,
calibration records, run folders other than the supplied images and your scratch folder,
earlier reviews, git history, or ticket and PR discussions. Do not seek earlier scores or the
coordinator's desired score. If any appears in your context, report the exposure.

Product constraints:

{CONSTRAINTS}

## Inspect the page

Run `pnpm docs:shot` in `{REPO}`. Take and inspect screenshots at 1440px and 390px, in light
and dark, saving them to your scratch folder. Use normal viewport heights while scrolling;
full-page captures can misplace sticky elements. Read the page's HTML, CSS and JavaScript,
and check hover, keyboard focus and accessibility.

Compare the candidate with these fixed reference images at matching dimensions and themes:

{REFERENCES}

Use the references to ground your judgment of hierarchy, typography, spacing and coherence.
Respect differences in product purpose. Do not assume that the candidate or a reference
deserves a particular score or must rank first. Explain concrete differences you can see.

{RUBRIC}

## Reply with

A) A table of the candidate's criterion scores, each with a one-line justification and
observable evidence. Include a short comparison with the supplied reference images.

B) At most 3 meaningful design problems, ranked, with location, effect on readers and a
concrete repair. An empty list is valid. Report every measured accessibility or behavior gate
failure separately under "Gate findings", even when the design scores highly.

C) At most 5 optional nits. They do not lower scores. State whether you saw any prohibited
history, previous score or requested score.

D) End with this line, using your own assessment for every value:
SCORES: typography=X hierarchy=X spacing=X color=X iconography=X consistency=X clarity=X overall=X

Also save the complete assessment as `{SCRATCH}/review.md`.
