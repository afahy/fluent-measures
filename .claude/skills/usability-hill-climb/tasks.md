<!-- Reviewer-facing task cards, protocol v3. Don't put answers, option names or section names
here: the cards say what the user wants, not how the page says to do it. Change the version
when you change a card, and pilot it again (SKILL.md, "4. Pilot"). -->
<!-- cspell:ignore inchs -->

# Tasks

Do the tasks in order. Each task is something a developer who just found this library wants to do.
Use only the docs page and the pages that it links to, through `browse.mjs`. Use your sandbox
project to try code. Put each answer in `answers.json` as the schema at the end says.

When a task is done, or you give up, write its entry in `answers.json` before you start the next
task. Don't go back and change an earlier answer. If a later task shows you that an earlier
answer was wrong, say so in that later task's `notes`.

## T1. Install it and read a first value

You've just found this library and want to try it in your Node project. Find the command that
adds the package, and write it in your answer. Don't run it: the sandbox already has the package
installed, as the docs describe it. Then write `t1.mjs`, which reads the text `6 ft` with the
library and prints the whole result. Run it with `try.mjs`.

## T2. Store a weight in kilograms

Your sign-up form has a free-text weight field. A user typed `165 pounds`. Your database stores
kilograms. Write `t2.mjs`, which gets the weight in kilograms from that text and prints it.
Report the call that you used and the number that it gives.

## T3. Store a height in centimeters, and show what was read

A user typed `5 ft 10 in` in a height field. You store centimeters. You also want to show the
user the feet and inches that the library read, so that they can confirm them. Write `t3.mjs`.
Report the call, the number of centimeters, and the name of the field in the result that holds
the feet and inches.

## T4. Don't crash on text that isn't a weight

Write `t4.ts`, which exports a function `toKg(text: string): number | undefined`. It returns the
weight in kilograms, or `undefined` when the text doesn't give one weight. It must never throw.

Before you run anything, predict what the library itself returns for each of these inputs, from
the docs alone, and write your predictions in `answers.json`:

- `12st 4lb`
- `150-180 lbs`
- `not a measurement`
- `70 kg (154 lbs)`
- `210 lbs to 180 lbs`

Then test your function with `try.mjs`, for example with a small `t4-check.ts` that imports it.

## T5. Read a height field that holds only a number

A metric form has a height field labeled "Height (cm)". Users type only the number, such as
`180`. Write `t5.mjs`, which reads that field as a height, and report the call and its result.
Then predict, from the docs alone, what the same call gives for `1.8`, and write down how sure
you are.

## T6. Handle typing mistakes in unit names

Users type things like `5 fet 11 inchs`. Find out from the docs whether a setting makes the
library read this text as it is. Write `t6.mjs`, which passes the text unchanged with the options
that you chose, or with none. Report the options, the result's value and unit, and what the
library returns for this text with no options. Write `null` for a value or unit that the library
doesn't return.

## T7. Get the weight from a message that also has a height

A chat message says `80 kg, 5 ft 11 in`. You need only the weight. Write `t7.mjs`, and report
the call and its result. Before you run anything, also predict what the library returns for this
text with no options, and say which part of the docs your prediction comes from.

## answers.json

```json
{
  "reviewer": "<your reviewer id>",
  "tasks": {
    "T1": {
      "status": "done | gave-up",
      "confidence": 1,
      "installCommand": "",
      "importLine": "",
      "file": "t1.mjs",
      "printed": "",
      "helped": "",
      "misled": "",
      "notes": ""
    },
    "T2": {
      "status": "",
      "confidence": 1,
      "file": "t2.mjs",
      "input": "165 pounds",
      "options": {},
      "value": 0,
      "unit": "",
      "helped": "",
      "misled": "",
      "notes": ""
    },
    "T3": {
      "status": "",
      "confidence": 1,
      "file": "t3.mjs",
      "input": "5 ft 10 in",
      "options": {},
      "value": 0,
      "unit": "",
      "partsField": "",
      "parts": [],
      "helped": "",
      "misled": "",
      "notes": ""
    },
    "T4": {
      "status": "",
      "confidence": 1,
      "file": "t4.ts",
      "predictions": {
        "12st 4lb": "",
        "150-180 lbs": "",
        "not a measurement": "",
        "70 kg (154 lbs)": "",
        "210 lbs to 180 lbs": ""
      },
      "helped": "",
      "misled": "",
      "notes": ""
    },
    "T5": {
      "status": "",
      "confidence": 1,
      "file": "t5.mjs",
      "input": "180",
      "options": {},
      "value": 0,
      "unit": "",
      "predict1_8": "",
      "predict1_8Confidence": 1,
      "helped": "",
      "misled": "",
      "notes": ""
    },
    "T6": {
      "status": "",
      "confidence": 1,
      "file": "t6.mjs",
      "input": "5 fet 11 inchs",
      "options": {},
      "value": 0,
      "unit": "",
      "withoutSetting": "",
      "helped": "",
      "misled": "",
      "notes": ""
    },
    "T7": {
      "status": "",
      "confidence": 1,
      "file": "t7.mjs",
      "input": "80 kg, 5 ft 11 in",
      "options": {},
      "value": 0,
      "unit": "",
      "predictNoOptions": "",
      "predictionSource": "",
      "helped": "",
      "misled": "",
      "notes": ""
    }
  }
}
```

- `confidence` is how sure you are that the answer is right, from 1 (a guess) to 5 (certain).
- `input` and `options` are the exact first and second arguments of your final call. If you
  changed the text before you passed it, put the text that you passed in `input`.
- A prediction or a result is `null`, or an object such as `{ "value": 70, "unit": "kg" }`.
  Replace each `""` in the template with one of these.
- `parts` is a list such as `[{ "value": 1, "unit": "ft" }]`.
- `helped` and `misled` name the section of the page (the `Section:` that `browse.mjs` prints)
  and say in one sentence what it did. Write `none` when nothing did.
