# Human first-use sessions

The AI reviewers give simulated observations. They read the page as text and screenshots, they
don't skim like people, they never get tired, and their times are agent wall-clock. Use them to
find and rank problems quickly. Only sessions with people are human usability evidence. Every
report keeps the two apart.

## Who

3 to 5 JavaScript or TypeScript developers who have never used fluent-measures. Five sessions
find most of the large problems. Three are enough to confirm or reject what the AI rounds found.
Don't use people who worked on the library or read its docs before.

## Setup (moderator)

1. Make a reviewer folder as for an AI reviewer (`setup.sh reviewer`), so that the participant
   gets the same sandbox and the same package. The participant uses a normal browser, not
   `browse.mjs`, on the same page URL. Use a desktop window of about 1440px for this round.
2. Record the screen and the voice, with consent. Write the consent in the session notes.
3. Give the participant `tasks.md`, one task at a time. Don't show the answer key.

## Script

- Before: "We're testing the page, not you. Please think aloud: say what you look for, what you
  expect and what surprises you. I can't help with the tasks, but you can stop any task."
- For each task: start a timer when they finish reading the task. Stop it when they say that
  they are done or give up, or at 10 minutes.
- Don't answer questions about the library. Answer only questions about the tools ("how do I
  run the file?"). Reply to "is this right?" with "what do you think?".
- After each task: "How sure are you, from 1 to 5?" and "Where did the page help or get in the
  way?"
- After all tasks: "What would you change first?"

## Record

Write `answers.json` with the participant, in the same format as an AI reviewer, and fill in
`trace.md` by hand from the recording:

| Task | Start | End | Sections visited, in order | Wrong turns (what and why) | Runs that failed | Quotes |
| ---- | ----- | --- | -------------------------- | -------------------------- | ---------------- | ------ |

A wrong turn is the same as for an AI reviewer: a visit to a section off the task's path
(`answer-key.json` `path`), an off-page visit that the task doesn't need, or a run that failed.
Then grade `answers.json` with `grade.mjs reviewer` for correctness. The wrong-turn and time
columns come from `trace.md`, not from the grader.

## Report

Report human sessions in their own table. Never average them with AI results. Note where people
and AI reviewers agreed and where they didn't. A problem that only people hit is S2 or worse by
default.
