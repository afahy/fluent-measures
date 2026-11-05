# Calibration

A calibration run tells you whether the judges and the rubric can give the target score at all.
In the docs redesign of AFA-185, a rubric where 9 meant "nothing left to improve" held both judges
at 8 for nine rounds. Nothing on the page could change that. A calibration run would have shown
it in the first round.

## When to calibrate

Calibrate before the first judging round of a run when one of these is true:

- The last row of the results table below is more than 90 days old, or the table is empty.
- The rubric version at the top of `judge-brief.md` isn't the version in the last row.
- A judge model isn't in the table.

## Reference sites

Use two sites: one that is close to our page in structure, and one with high polish. Add the low
anchor when a judge's scores look too high.

| Site                             | Role                                                |
| -------------------------------- | --------------------------------------------------- |
| https://gka.github.io/chroma.js/ | Close in structure: a single-page library reference |
| https://sonner.emilkowal.ski/    | High polish                                         |
| https://underscorejs.org/        | Low anchor                                          |

Before you use a site, load it and check that it is live and that it is a single page. If it
isn't, pick another site with the same role, and change this table.

## How to run it

For each judge model and each site, fill `judge-brief.md` with `fill.mjs`, as SKILL.md says, with
these values:

- `ROUND`: `calibration on a reference site, not the page under work`
- `ABOUT`: the site's name and what its library does, in one sentence.
- `PAGE_URL`: the site's URL.
- `PAGE_SOURCE`: `The page isn't in a local repository. Read its HTML, CSS and JavaScript from the browser.`
- `CONTENT_SPEC`: `There is no content spec. Judge the content only for clarity.`
- `HISTORY`, `CHANGELOG` and `DECISIONS`: `None. This is a calibration run.`
- `SCRATCH`: a new folder for each judge model and each site, such as
  `<run>/calibration/<model>-<site>/`, so that runs at the same time don't write over each other.
- `REPO` and `TARGET_SCORE`: as for a judging round.

Run the judges as "4. Judge" in SKILL.md says. Run the calibration judges in parallel with each
other, but not with the judges of the page.

## How to read the results

- The high-polish site should get an Overall score at or above the target. If a judge gives it
  less, that judge can't reach the target on our page either. Change the rubric, give it a new
  version, and calibrate again.
- When you use the low anchor, it should get an Overall score at least 3 points below the
  high-polish site. If it doesn't, the judge is too generous, and its score on our page means
  little.
- If the judges' Overall scores for the same site differ by more than 1, say so in the round's
  report.

On 2026-11-05, the NumberFlow reference had low-contrast navigation and code comments,
and no phone section navigation. Both judges scored it 8. The alternate reference URL redirected
to GitHub, so Sonner replaced it as the high-polish reference. These are reference defects,
not a reason to lower the contrast requirement. Rubric v3 clarifies scope and separates
observable problems from style preferences.

## Results

Add one row for each judge and each site. Commit the rows in the PR of the run.

| Date       | Rubric | Judge model     | Site       | Overall | Notes                                                                                    |
| ---------- | ------ | --------------- | ---------- | ------- | ---------------------------------------------------------------------------------------- |
| 2026-11-05 | v2     | GPT-6 Astra     | chroma.js  | 7       | Mobile overflow, editor behavior and secondary text contrast.                            |
| 2026-11-05 | v2     | Claude Opus 5.5 | chroma.js  | 7       | Mobile overflow and secondary text contrast.                                             |
| 2026-11-05 | v2     | GPT-6 Astra     | NumberFlow | 8       | Low-contrast comments and navigation; no phone section navigation.                       |
| 2026-11-05 | v2     | Claude Opus 5.5 | NumberFlow | 8       | Phone navigation, heading hierarchy and secondary text contrast.                         |
| 2026-11-05 | v3     | GPT-6 Astra     | chroma.js  | 8       | Repeated mobile grouping and contrast failures.                                          |
| 2026-11-05 | v3     | Claude Opus 5.5 | chroma.js  | 7       | Repeated mobile overflow, contrast and heading hierarchy.                                |
| 2026-11-05 | v3     | GPT-6 Astra     | Sonner     | 8       | Code contrast, keyboard focus and a missing accessible name.                             |
| 2026-11-05 | v3     | Claude Opus 5.5 | Sonner     | 8       | Selected states, code contrast and heading hierarchy.                                    |
| 2026-11-05 | v4     | GPT-6 Astra     | chroma.js  | 8       | Mobile layout and labeling still lower visual scores; gate failures listed separately.   |
| 2026-11-05 | v4     | Claude Opus 5.5 | chroma.js  | 7       | Mobile layout and navigation still lower visual scores; gate failures listed separately. |
| 2026-11-05 | v4     | GPT-6 Astra     | Sonner     | 9       | Visual target reached; local explanation and mandatory gate findings remain.             |
| 2026-11-05 | v4     | Claude Opus 5.5 | Sonner     | 9       | Visual target reached; local hierarchy and mandatory gate findings remain.               |

Rubric v4 keeps a separate list of mandatory gate failures and scores the visual design
system. The v3 Sonner reviews found local token and accessibility fixes in an otherwise
excellent visual system. These defects still block shipping; they no longer automatically
cap the visual score. Structural design problems still lower the score.
