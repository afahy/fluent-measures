<!-- Rubric: v5. Shared by feedback, calibration and blind acceptance. -->

## Scoring

Score each criterion from 1 to 10. Compare the page with excellent, focused documentation sites
for a single library, such as the docs of small, well-regarded libraries, or a single page of the
Zod or Vite docs. Use this scale:

- 10 = exemplary: you would cite it as a reference.
- 9 = excellent: polished and clear, with only minor or subjective nits left. A page can be a 9
  while you still have suggestions.
- 8 = very good, but at least one specific, meaningful issue clearly holds it back.
- 7 and below = noticeable problems.

Respect the scope stated in the page description or product constraints. Judge observable effects
on readers, not the age of the implementation or a preference for a different visual style.
Missing optional icons or a dark theme are not defects unless the task requires them. Report
measured contrast failures as concrete defects. Overall is a judgment of the whole design within
scope, not the lowest sub-score: explain why a local problem materially lowers it. Do not force
a reference site to reach a particular score.

Separate design scoring from the workflow's mandatory accessibility and behavior gates.
Record every measured gate failure in a separate "Gate findings" list. Gate failures on the
candidate must be fixed before it ships, regardless of scores. Identify reference defects
separately; they do not block shipping the candidate.
Score the visual design system: its palette, hierarchy, rhythm and coherence. A local token,
focus rule or accessible-name repair does not by itself cap an otherwise excellent design at 8. Lower a design score when the visual problem needs a design decision, and explain the
effect on the reading experience. A repeated structural problem such as clipped navigation
or disconnected labels still affects the design score. Do not erase or relabel a gate failure
as a nit simply because the visual design scores 9.

Criteria:

1. Typography
2. Hierarchy
3. Spacing and density
4. Color and contrast
5. Iconography
6. Consistency and polish
7. Clarity
8. Overall
