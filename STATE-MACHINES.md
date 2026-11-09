# Library state machines

<!-- cspell:ignore NFKC apfahy meterrs kilogramme kilogrammes -->

Audit baseline: `b79eae0` (`main`), 2026-11-06. Tracking: [AFA-235][audit].
Scope: every runtime module in `src/`, reached through `parseMeasurement`. The docs website,
release scripts, PR stewardship and their asynchronous state machines are outside this library
audit. This file describes the implementation at that revision, including its defects; it is
not a replacement for the public specification in README.md and PARSING.md. Follow-up sections
name later implementation revisions; the original failure outputs remain historical evidence.

There is no persistent parser object or declared state enum. Explicit state consists of token
flags, label kinds, number-grammar flags, the selected measurement type, and local collections.
The control flow creates the implicit machines below. Every parse allocates its own mutable
state. No runtime module schedules work, performs I/O, retries a call, or awaits another task.

## Inventory and invariants

| Machine                                  | State carried by the implementation                                                           | Source at the audit baseline                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| M0: call lifecycle                       | Input, options, selected type, current type pass, terminal result                             | `src/parseMeasurement.ts`, `parseMeasurement`                                                                     |
| M1: text normalization                   | Current text; numeric-comma `valid` flag; quote/minus context                                 | `src/tokenize.ts`, `normalizeForms`, `normalizeNumericCommas`, `normalizeFractions`, `writeFraction`, `normalize` |
| M2: token emission                       | Marker text, pending `label`, pending `startsField`, token list                               | `src/tokenize.ts`, `tokenize`, `tokenizeNormalized`, `trimTrailing`                                               |
| M3: ranges and shorthand                 | Range boundaries, surrounding unit ownership, rewritten token array                           | `src/parseMeasurement.ts`, before the type loop                                                                   |
| M4: number grammar                       | `hasHundred`, `hasThousand`, `current`, `total`, previous word                                | `src/wordsToNumber.ts`, `wordsToNumber`                                                                           |
| M5: phrase scanning                      | Start/end index, direction, accumulated phrase, last valid value, sign, half/multiplier state | `src/parseMeasurement.ts`, `readNumberPhrase`, `readSignedPhrase`, `skipSemicolons`                               |
| M6: unit recognition                     | Exact/fuzzy candidate, closest distance budget; edit-distance working row                     | `src/matchUnit.ts`, `src/levenshtein.ts`                                                                          |
| M7: token ownership                      | `used`, unit scan index, proposed match interval, label ownership, matches                    | `src/parseMeasurement.ts`, `remainingWords`, `readValueAfter`, `labelHasValue`, type loop                         |
| M8: invalid fields and unsupported parts | `fieldOf`, `signedFields`, `matchFields`; original and remaining token views                  | `src/parseMeasurement.ts`, `isUnsupportedUnit`, `hasUnsupportedPart`, type loop                                   |
| M9: measurement assembly                 | Part groups, counted nonzero groups, target unit, totals, agreement threshold                 | `src/parseMeasurement.ts`, `combineParts`, `total`; `src/units.ts`                                                |
| M10: unqualified fallback                | No surviving explicit match; whole-input number; inferred unit                                | `src/parseMeasurement.ts`, end of the type loop                                                                   |
| M11: call isolation                      | Fresh local state per call; shared lookup tables and regular expressions                      | All `src/`; exports in `src/index.ts`, contract in `src/types.ts`                                                 |

The intended invariants, and their limits, are:

1. **Meaning survives normalization.** Field boundaries, negative signs, fractions and quotations
   must not create a different measurement. F1–F4 below show violations.
2. **One token has one owner per type pass.** Once consumed it is invisible through
   `remainingWords`. Original text remains available for unsupported-part detection. Ownership
   must be decided before rejecting a field; F5 and F7 expose mistakes in those decisions.
3. **Signed parts invalidate their measurement fields.** They are never returned as positive
   magnitudes. Semicolons delimit fields, although the grammar deliberately permits a number and
   its unit to span a semicolon.
4. **A compound measurement has only valid adjacent unit steps.** Only integral feet followed by
   inches below 12, or integral meters followed by centimeters below 100, combine. Adjacency here
   means adjacency in the accepted match list, not necessarily in the original text. Do not
   silently strengthen this into a punctuation rule; the public range examples allow joining
   parts across discarded text.
5. **All counted measurements agree with the first within 1%.** Zero-only groups are ignored;
   the result reports the first counted group's matches, not all agreeing alternatives.
6. **Results have a finite positive value and a unit of the reported type.** F8 violated the
   positive-value invariant at baseline. The correction at `7426e3e` rejects inferred zero totals
   and strengthens `tests/invariants.test.ts` to reach conversion underflow. Exported types allow
   `unit: null`, but no successful typed-input path currently emits it.
7. **Finite conversions must not fail because of an avoidable intermediate overflow.** F9
   reaches the overflow rejection state with a mathematically finite target value.
8. **Retrying cannot inherit tokens, matches or fuzzy budgets.** Returned objects belong to the
   caller; mutating one must not affect another call. M11 gives evidence and concurrency limits.

## Transition tables

### M0 — public call lifecycle

Source: `parseMeasurement.ts:341–611`. The order matters: some early returns precede option
validation. `null`, an internal `undefined`, and a thrown error have different meanings.

| From           | Event / guard                                                  | Action                                                                                        | To               |
| -------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| Entered        | Runtime input is not a string                                  | Return `null` without reading options                                                         | Rejected         |
| Entered        | `maxLength` is not a number >= 1                               | Throw the documented length error                                                             | Error            |
| Length checked | Raw UTF-16 length exceeds limit                                | Return `null` before trimming                                                                 | Rejected         |
| Length checked | Within limit                                                   | Trim and normalize with M1                                                                    | Normalized       |
| Normalized     | Empty result, including invalid numeric commas                 | Return `null`                                                                                 | Rejected         |
| Normalized     | Nonempty text                                                  | Emit tokens; preprocess ranges (M2/M3)                                                        | Tokens ready     |
| Tokens ready   | At least one token; `allowUnqualified` without explicit `type` | Throw                                                                                         | Error            |
| Tokens ready   | At least one token; `type` contradicts valid `normalizedUnit`  | Throw                                                                                         | Error            |
| Tokens ready   | Otherwise                                                      | Select explicit type, normalized unit's type, or height then weight                           | Type selected    |
| Type selected  | Bare shorthand recognized                                      | Require explicit height and inches < 12; synthesize feet/inch tokens, otherwise return `null` | Scan or Rejected |
| Scan           | Beginning of each type pass                                    | Reset every `used` flag; allocate matches and field rejection sets                            | Scanning         |
| Scanning       | Connected unsupported weight part                              | Return `null` immediately                                                                     | Rejected         |
| Scanning       | End of token scan                                              | Remove matches touching signed fields; optionally infer (M10)                                 | Assemble         |
| Assemble       | No matches, or M9 returns `undefined` for a zero total         | Try next type, if any                                                                         | Scan or Rejected |
| Assemble       | M9 returns `null`                                              | Return `null`; do not try the next type                                                       | Rejected         |
| Assemble       | M9 returns an object                                           | Return immediately                                                                            | Success          |

For consistent typed options there is no intended throw path. Runtime `null` options are outside
the type: the length guard tolerates them, but a nonempty input then throws on `options.fuzziness`.
This behavior is explicitly preserved by `features/input-limits.md`; it is not a newly found bug.
Likewise, unknown runtime units/types are not silently treated as valid contract inputs.

### M1 — ordered normalization and lexical context

Source: `tokenize.ts`, normalization functions and quote patterns. F2 transitions include
`95a5a54` and its review corrections; F4 fraction boundaries are updated in
[PR #232](https://github.com/afahy/fluent-measures/pull/232). F3 now stops the earlier-number
search at a comma or semicolon directly after a numeric label. This is a pipeline with implicit
context states, rather than one scanner.
Later passes cannot recover characters discarded by earlier ones.

| From                | Input / guard                                                                       | Action                                                                                     | To                                 |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| Raw                 | Full-width character or supported compatibility unit                                | Convert that character with NFKC                                                           | Forms normalized                   |
| Raw/forms           | Unicode minus before a number; no earlier number since a numeric label separator    | Preserve it as ASCII minus                                                                 | Signed number text                 |
| Raw/forms           | Unicode minus after a number in the same context (including separators after units) | Leave it for later punctuation removal/range handling                                      | Unsigned/joining context preserved |
| Raw/forms           | ASCII opener and ASCII/curly closer before a named unit                             | Remove both quotation marks; retain the quantity and named unit                            | Named-unit text                    |
| Raw/forms           | Curly closer before a named unit                                                    | Remove closing quote; retain unquoted feet before `in` and paired apostrophes for M2       | Named-unit text                    |
| Raw/forms           | Prime, modifier-letter prime or acute accent                                        | Convert to ASCII feet/inch mark                                                            | Mark text                          |
| Raw/forms           | Curly closer after digits, fraction or number words; spaces allowed                 | Preserve quotation context except compact digits or a following inch component after feet  | Quote or mark; F2 corrected        |
| Forms normalized    | Complete compact feet/meter token followed by digits or a Unicode fraction          | Separate the smaller part before comma/fraction normalization (F6)                         | Compact boundary retained          |
| Forms normalized    | Supported numeric comma group                                                       | Convert last 1–2 digits to decimal part and remove thousands commas                        | Numeric text                       |
| Forms normalized    | Numeric group matches comma-size detection but fails grammar                        | Set `valid = false`; entire normalized input becomes empty                                 | Rejected text                      |
| Forms normalized    | Comma is not such a numeric group, or belongs to attached label                     | Leave it for tokenization                                                                  | Punctuation text                   |
| Numeric text        | Proper integer fraction, representable without exponent notation                    | Replace whole-plus-fraction with decimal text                                              | Fraction normalized                |
| Numeric text        | Improper/decimal/exponent-producing fraction                                        | Write `x` boundary                                                                         | Invalid numeric fragment           |
| Numeric text        | Unicode fraction with integer whole and no trailing digit                           | Decode numerator/denominator and apply the numeric writer                                  | Fraction normalized                |
| Numeric text        | Unicode fraction with decimal whole or trailing digits                              | Consume the malformed fragment and write `x.`                                              | Invalid numeric fragment           |
| Numeric text        | Range with any invalid fraction endpoint                                            | Normalize complete ranges first; keep invalid ones as non-shorthand numeric ranges         | Range evidence for M3              |
| Numeric text        | Slash after feet/marks without punctuation; two slashes                             | Retain existing separators and range context; either slash blocks a partial fraction match | Separate numeric text              |
| Fraction normalized | Pipeline complete                                                                   | Pass text to tokenization/range detection                                                  | M2/M3                              |

For F3, a comma or semicolon directly after digits, a Unicode fraction or a number word
resets earlier-number context, including spaces before the separator. A value with a unit before
it or across its separator retains joining context, as does a separator after a unit. Thus
`ft 5, −11 in`, `5;ft −11 in` and `5 ft, −11 in` remain 71 in. Digits after a decimal/thousands comma
still count as an earlier number. M8 receives the preserved ASCII sign and rejects its field;
a separate semicolon-delimited positive field remains eligible.

Comma rejection is absorbing. Fraction rejection is local: `x` is a non-number, so later valid
measurements can still be read. At baseline that replacement destroyed range evidence in
`5/2-180 lbs`, and a rewrite next to a digit manufactured `5.52` from `5½2`. The F4 correction
normalizes complete fraction ranges before replacing individual fractions. An invalid endpoint
becomes a three-endpoint numeric range, which M3 omits without admitting shorthand. Outside
ranges, it consumes the entire malformed Unicode fragment as `x.`. The period blocks letter
ownership of a following proper fraction, while keeping an adjacent decimal tail within the
invalid token; M2 trims the terminal period. A terminal period after a range endpoint is
punctuation, while a period followed by a digit still continues a decimal.
A proper fractional shorthand such as `5-1/2` retains its existing 60.5-inch result with height
type. Brackets and commas break slash ownership: `5 ft (1/2 lbs)` and `weight (1/2 lbs)`
retain a proper half pound. This follows the maintainer’s explicit 2026-11-06 policy decision.
Range normalization retains preceding feet/mark context, so `5'10/180-190 lbs` keeps its
70-inch height when M3 omits the weight range, including a fractional upper endpoint. If a
separate explicit inch component follows a fractional range, that component owns the height;
`6 ft 1/2-3/4 11 in` retains 83 in.

### M2 — token construction and pending label state

Source: `tokenize.ts`, `tokenizeNormalized` and token splitting. The F1 boundary is updated
in `cbf94c1`, and the F2 paired-apostrophe rule in `95a5a54`. The order is:
two-apostrophe handling; capital `G` protection;
lowercase; numeric-range markers; label markers; pound signs; word-comma boundaries; punctuation;
unit-prefix sign handling; splitting; trailing-period trimming; marker decoding.

| From                    | Token/event                                           | Action                                                                                   | To                              |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| Ordinary text           | Two apostrophes directly after a digit, no third mark | Write an inch mark unless an earlier pair opened this quotation, including across spaces | Inch mark or retained quotation |
| Ordinary lowercase text | Numeric range and `rangeBoundaries` requested         | Write internal `RANGE` marker                                                            | Boundary pending                |
| Ordinary text           | Supported label punctuation/context                   | Write `FIELD` if separated; then `NAME` or `UNIT`; expand short `in`/`m` aliases         | Label markers pending           |
| Ordinary text           | Number word + comma + spaced digits                   | Preserve `COMMA` non-number token                                                        | Phrase boundary                 |
| Ordinary text           | Comma between number words                            | Preserve `COMMA` non-number token (F1 fix)                                               | Phrase boundary                 |
| Split word              | Trailing periods, before marker decoding              | Remove them with `trimTrailing`, a backward linear scan                                  | Trimmed word, possibly empty    |
| No pending metadata     | `FIELD`                                               | Set pending `startsField = true`                                                         | Field pending                   |
| Any pending state       | `NAME` / `UNIT`                                       | Set pending label kind                                                                   | Label pending                   |
| Pending state           | `RANGE`                                               | Emit `{ text: 'RANGE', range: true }`; clear pending metadata                            | No pending metadata             |
| Pending label           | Ordinary token                                        | Emit label kind and `startsField`; clear metadata                                        | No pending metadata             |
| No pending label        | Ordinary token                                        | Emit `{ text }`; clear metadata                                                          | No pending metadata             |

The F1 fix also looks past an opening curly quote (`“` or `‘`) before the next number word or
spaced digits, so `phase twenty, “5” cm` retains the boundary. No space is needed between a
comma and a number word; digits keep the existing space requirement. Numeric comma groups
are still normalized in M1. This is a targeted boundary change, not the tokenizer refactor.

Input is lowercased before uppercase markers are inserted; users cannot inject marker words by
typing their names. The decoder resets pending flags after every ordinary/range token. At this
revision, range tokens cannot simultaneously be labels. `startsField` is emitted only with a
label. `used` is assigned later by the parser. F6 now separates compact feet/meter parts in
M1, before numeric commas and fractions; M2 retains its ordinary digit-to-unit split. Attached
identifier prefixes block the compact split. Empty tokens remain harmless non-number boundaries.

AFA-248 extends the existing range-marker transition to numeric endpoints joined by `to`,
`from ... to`, or `between ... and`. Number-word endpoints stay outside that grammar: neither
end may be removed from a mixed phrase such as `1 to 2 hundred lbs`. The range replacement
also retains slash-separated inches owned by preceding feet, as in `5'10/180 to 200 lbs`
(70 in with the height selector). Terminal periods are consumed with a range so an empty
punctuation token cannot detach its unit; decimal tails and attached number words keep the
complete endpoint intact. A following explicit inch component instead owns the height
in `6 ft 1/2 to 3/4 11 in` (83 in). These transitions reuse fraction ownership and feed the
existing M3 range rules; the historical findings below remain unchanged. Regression evidence:
`tests/parseMeasurement.wordedRangeBoundaries.test.ts` and the AFA-248 corpus entries.

Third-round review of `4428859593593e2963c77c50606da4737f11d49f` found three additional
preservation gaps. Focused public-input reproduction compared that exact head with main
`24add56d3beda40627314b91fed3ab361fbe8995`:

| Input / options                    | Main `24add56` | Head `4428859` | Approved complete-entry result |
| ---------------------------------- | -------------- | -------------- | ------------------------------ |
| `5'10/180 to 190 11 in`, height    | `null`         | 71 in          | `null`                         |
| `1 to 2; hundred lbs`              | 200 lb         | 100 lb         | `null`                         |
| `1 to 2; and a half lbs`           | 2.5 lb         | `null`         | `null`                         |
| `150 to 180-200 lbs,70kg`          | 70 kg          | `null`         | `null`                         |
| `between 150 and 180–200 lbs,70kg` | 70 kg          | `null`         | `null`                         |

These new literals are absent from the existing example/test/ticket failure inputs; no throw,
security issue or required-check failure was found. Under the three-round rule they are
recorded on the existing [complete-entry ticket](https://linear.app/afahy/issue/AFA-250),
comment `d3c1509e-3bdb-4a0c-bd0b-222d6c7fc797`. The approved policy retires ranges and
fragment recovery, so its later range slice owns the null results. This is a deferred
limitation of the narrow AFA-248 change, not a fixed finding or a revision of historical
baselines. Reproduction: `/tmp/afa248-third-review-results.json` and
`/tmp/afa248-third-review.log`. Source, tests and corpus remain unchanged from `4428859`.

AFA-248 closed out through [PR #239](https://github.com/afahy/fluent-measures/pull/239):
reviewed audit head `d82108cee21ff16259a00a3dbb63a45ca872121d` merged normally as
`042624855225c2ab55d2d7639058069e4cd90c17`. All 18 PR checks and exact-head Codex review
passed; final and immediate post-merge comment audits found no new finding. All 12 exact-merge
main CI jobs passed in run `42381121659`, with
[ci-ok](https://github.com/afahy/fluent-measures/actions/runs/42381121659/job/128430299153)
successful at 2026-11-07 14:27:00 UTC. Root main was pulled and only the merged worktree/local
branch removed. The source-validation baseline remains `4428859`; the five deferred rows
above remain unfixed and assigned to AFA-250.

### M3 — range ownership and shorthand

Source: `parseMeasurement.ts:361–453`.

| From                  | Guard at a range                                                                                                              | Action                                                               | To                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| Range boundary        | No following unit, or following unit starts a new field/owns a label value                                                    | Keep boundary and independent unit                                   | Continue                                    |
| Range boundary        | Intervening semicolons; unrelated prefix field without surrounding measurement                                                | Keep independent prefix                                              | Continue                                    |
| Range boundary        | Following feet unit, integral unowned preceding feet, following inches < 12 with explicit inch unit, no competing field owner | Mark only range boundary used, then remove it                        | Surrounding feet/inches remain              |
| Range boundary        | Other attached following unit                                                                                                 | Blank that unit's text                                               | Range and its unit cannot steal later value |
| All ranges visited    | Temporary used boundaries                                                                                                     | Filter them from tokens                                              | Ownership preprocessing done                |
| Whole normalized text | Numeric `N-M`, or permitted two-word shorthand                                                                                | Require `type: 'height'` and `M < 12`; replace tokens with N/ft/M/in | Ordinary type scan                          |
| Whole normalized text | Recognized shorthand with failed guard                                                                                        | Return `null`                                                        | Rejected                                    |

Preprocessing changes token text before the height/weight passes. The per-type reset restores
consumption flags, not erased range-unit text. This is deliberate, not leaked state from a prior
call. The public example `6 1-2 ft 3 in` permits dropping the range to retain 75 inches.
With F4, invalid slash fractions on either endpoint reach this same range machine; M3 itself
is unchanged. The range unit cannot claim the later 70 kg in `180-5/2 lbs; 70 kg`.

### M4 — number grammar accumulator

Source: `wordsToNumber.ts:16–72`. State is `(current, total, hasHundred, hasThousand, previous)`.
The numeric domain is unbounded at this stage: syntactically valid digits can evaluate to
`Infinity`; final result validation belongs to M9.

| From                 | Word / guard                                    | Action                                                                                               | To              |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------- |
| Start                | Lowercase words split; `and` removed            | Initialize both totals to 0 and both flags false                                                     | Empty group     |
| Empty group          | Number word or valid decimal digits             | Add number to `current`                                                                              | Number group    |
| Number group         | Tens word followed by value between 0 and 10    | Add ones value                                                                                       | Number group    |
| First ones word      | Second word is a tens word >= 20                | Multiply first value by 100; add tens; set `hasHundred`                                              | Spoken hundreds |
| Multiplier just read | Next number smaller than that multiplier        | Add number                                                                                           | Number group    |
| Number group         | Another number without an allowed relation      | Return `null`                                                                                        | Invalid phrase  |
| Any group            | `hundred`, not yet used in this group           | Set flag; multiply nonzero current, or use implicit 100                                              | Hundred group   |
| Any group            | `thousand`, not yet used                        | Set thousand flag, reset hundred flag; multiply or use implicit 1000; add to total and clear current | New group       |
| Group                | Repeated disallowed multiplier, or unknown word | Return `null`                                                                                        | Invalid phrase  |
| End                  | At least one non-`and` word                     | Return total + current, including zero or overflow                                                   | Number          |
| End                  | No words                                        | Return `null`                                                                                        | No number       |

The accumulator itself accepts no sign or fraction slash. A leading `a`/`an` is dealt with by
phrase traversal, not by this function. The code uses `current === 0` for implicit multipliers;
this audit does not assert a new grammar rule for unusual phrases such as `zero hundred`.

### M5 — directional phrase reading and signed retry

Source: `parseMeasurement.ts:32–148`. The F5 caller correction at `938c2ff` reuses this
signed reader for every backward supported-weight lookup in M8; the reader itself is unchanged.

| From             | Event / guard                                                                    | Action                                                                              | To                              |
| ---------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| Start            | Backward read with half support                                                  | Scan semicolons/multipliers; track product, decreasing order and nearest multiplier | Half candidate or ordinary scan |
| Half candidate   | `whole and a half`, ordered multipliers, integral whole below nearest multiplier | Return `(whole + 0.5) * product` and boundary                                       | Number                          |
| Half candidate   | Signed whole                                                                     | Return rejection positioned so outer signed reader sees sign                        | Signed candidate                |
| Ordinary scan    | `and`, or semicolon in backward direction                                        | Advance cursor without adding word                                                  | Scan                            |
| Scan             | Appended/prepended word gives a complete valid M4 number                         | Save candidate; advance                                                             | Scan                            |
| Scan             | Candidate is invalid                                                             | Stop at boundary; retain previous valid value                                       | Number or no number             |
| Forward boundary | Integral value followed by `and a half`                                          | Add 0.5; advance beyond half                                                        | Number                          |
| Signed check     | Relevant first word starts with minus signs                                      | Remove signs in a local word view and retry number read                             | Signed retry                    |
| Signed retry     | Stripped word joins the phrase                                                   | Return unsigned magnitude plus `signed = true`                                      | Signed number                   |
| Signed check     | Signed `a`/`an` followed by number word/multiplier                               | Attribute sign to following phrase                                                  | Signed number                   |
| Signed check     | Sign does not own the phrase                                                     | Keep original number/boundary                                                       | Unsigned or no number           |

The sign retry neither changes token text nor creates a second public invocation. A failed
longer candidate returns the shorter valid phrase by design. Forward reads stop at semicolons;
backward reads can cross them. `skipSemicolons` advances only across literal semicolon tokens.
Half handling limits nested reads so repeated `and a half` does not create unbounded recursion.
The `COMMA` token is not a number: both reading directions stop at it. With the F1 fix, this
also separates number words and quoted numbers. M8 can still cross the token between weight
parts to reject unsupported units, while M10 rejects two separated unqualified phrases.

The [spoken-decimal correction](https://linear.app/afahy/issue/AFA-247) extends M4/M5 to read
the integer part and decimal digit sequence together. M5 keeps the first integer stopping point,
but a phrase containing `point` is accepted or rejected as a whole. A trailing `and` can introduce
the next field; unsupported `oh`/`o` words and a separated minus stay in the malformed phrase.
M2 preserves a bracket boundary after a spoken decimal, so a parenthesized conversion cannot
become extra decimal digits. Label ownership uses the same complete M5 reader.

The second review correction extends that same M2 pass to comma-and-space boundaries and
bracketed leading decimals (`.5` and `point five`). It does not add a normalization scan.
In M5, the bare-inch read (and the F6 bare-centimeter integration below) retains the saved
integer stopping point before a separate spoken-decimal weight, as in `5 ft 11 two hundred point five pounds` (71 in). A malformed
phrase whose first invalid token is `point` cannot become a partial inch value; other phrase
reads still consume and validate the whole decimal. `tests/parseMeasurement.spokenDecimalReview.test.ts`
covers the three review findings and their comma, bracket, sign and number-phrase routes.
The published `fb272e1` returned 20.58 kg for `age twenty point 5, 80 kg`, null for
`kg zero point five (.5 kg)`, and 5 ft for the bare-inch/weight case. The focused correction
returns 80 kg, 0.5 kg and 71 in. Final combined-source validation is recorded below;
prior `fb272e1` validation is historical.
The existing fragment result for `5 ft one point twenty in` (main null, `fb272e1` 5 ft)
is recorded on AFA-250 for its approved whole-entry rejection, not treated as valid inches.

The first review-correction check at `14efcd3` passed 4,162 tests, 100% coverage,
TypeScript, fresh 99.61% mutation and build, then stopped at size: ESM was 5,528 bytes,
28 above its 5,500-byte limit. API/package stages did not run. Separate changed-line analysis
found two equivalent survivors: a successful forward decimal necessarily stopped at `point`,
making its extra non-null check redundant, and the half-reading flag has no effect on a
forward read. The correction removes the redundant condition/read and uses the existing
default for that inapplicable flag, without adding mutation ignores. All 321 focused number,
fraction, bare-inch and corpus checks pass. The simplified build measures 5,522 ESM / 5,577
CommonJS bytes. The repository's standing 0.5 kB allowance raises the ESM limit to 6.0 kB;
CommonJS remains at its previously approved 6.0 kB. The matching footprint documentation is
updated. These measurements precede the final main integration; the `14efcd3` report is preserved at
`/tmp/afa247-mutation-14efcd3.json` and is not final evidence for this simplification.

The fresh `873530f` check passed unit coverage and TypeScript but was interrupted during
mutation after AFA-248 merged as `042624855225c2ab55d2d7639058069e4cd90c17` and GitHub
reported a base conflict. It is partial evidence only. Normal main integration preserves
AFA-248's range scan, M2 audit and deferred AFA-250 findings, both feature lists, all 800
main corpus rows and the 59 decimal additions. The combined 859-row score is specified by
adding the independently reviewed branch additions, not by copying a new parser result.
All 489 focused decimal, range, F3, calculator, feature-map and corpus tests pass together.
The uppercase `RANGE` distinction below remains intact.

Final combined source `af45a8934a54827cc7ce6ebfee83d5ea2c557504` passed one fresh full
`pnpm check`: 4,298 unit tests, 100% coverage, TypeScript, fresh mutation 99.74%
(1,491 killed, 25 timeouts, four unchanged-line survivors, zero uncovered/errors, 32 ignored),
build/API/size and 5,210 ESM/CommonJS package tests. Every changed-line mutant is killed
against exact main `0426248`; all eight committed source hashes and six report source bodies
match. Report SHA256: `2679da3fa11f4d5b37274bcc92c4cb7d4989148f2171b3e55363feb42091e6db`.
The 120 public regression cases give 76 failures / 44 controls on that exact main and all pass
on the combined source. Final Brotli sizes are 5,626 ESM / 5,709 CommonJS bytes, versus
main's 5,401 / 5,455 (runtime/build inputs unchanged from validated `4428859`); both limits
are 6,000 bytes under the standing allowance. Logs and source manifest:
`/tmp/afa247-review-final-check-3.log`, `/tmp/afa247-review-final-changed-lines-3.log`,
`/tmp/afa247-review-source-manifest-integrated.json`. No new mutation exclusion or relaxed
test threshold was added. The following audit-only commit does not change these source/test trees.

A later exact-head review found that M5 could skip a semicolon after a spoken decimal and
join the next field: published `db846777` reads `age twenty point five; 80 kg` as 20.58 kg
and `age twenty point five; 1.8 m` as null; exact main `0426248` reads 80 kg and 1.8 m.
The focused correction adds the semicolon to the existing M2 boundary character class only
when another number follows. It preserves `80;kg`, `seventy point five;kg` and explicit
unit-label fields. No scan or parser branch is added, and uppercase `RANGE` is unchanged.
`tests/parseMeasurement.spokenDecimalSemicolons.test.ts` has 22 independently specified cases:
nine fail on published `db846777`, eight fail on exact main, and all pass with this correction.
The 22 new corpus rows add 22 agreements without changing previous rows or outcomes.
One initial proposed control, `age twenty point five; kg 80`, lacked an explicit unit-label
separator. Its 80-kg draft expectation was not adopted: the existing semicolon rule permits
20.5 to attach to `kg`. The original draft and reasoning remain in
`/tmp/afa247-semicolon-oracle-review.json`; `kg=80` and `kg: 80` are explicit-label controls.
Focused preparation passed 619 tests and scoped static checks. Correction source
`e69d59428d3a4d6a2e80a3959f2240d0237fb7d1` then passed one fresh full `pnpm check`:
4,320 unit tests, 100% coverage, TypeScript, mutation 99.74% (1,492 killed, 24 timeouts,
four unchanged-line survivors, zero uncovered/errors, 32 existing ignores), build/API/size
and 5,254 ESM/CommonJS package tests. Every changed-line mutant is killed against `0426248`.
All eight selected committed source hashes and six report source bodies match; report SHA256
is `4f79385d896705663bc0fbce811659a167d92eb651144277ec165e4a58147745`.
Source/test trees are `4f45dc7c8de99e37549b6920a65cc97664fba33a` /
`70e7fa3469cde1c20fe11dc7541633951bbf1f6b`. Final Brotli is 5,623 ESM / 5,684 CommonJS
bytes, below unchanged 6,000-byte limits. Logs: `/tmp/afa247-review-final-semicolon-check.log`,
`/tmp/afa247-semicolon-changed-lines.log`; report and verification:
`/tmp/afa247-mutation-e69d594.json`, `/tmp/afa247-semicolon-mutation-verification.json`.
The earlier `af45a89` full check remains historical. This evidence-only audit update leaves
the validated source and test trees unchanged; no second unchanged-source mutation run occurs.

Final-head review of `51e084c` found two additional decimal-boundary interactions.
M2's decimal-boundary normalization must preserve a semicolon's field identity as well as
M5's numeric stopping boundary: later signed-field ownership must not discard a separate
valid field. `kg -seventy point five; 80 kg` was `null` on that head versus 80 kg on main;
the correction retains the captured semicolon beside the existing non-number marker.
M4/M5's unsigned feet-prefix reader must also retain its first component's integer stop:
`ft 5 eleven point five` is 71.5 in (5 × 12 + 11.5), and
`ft 5 11 two hundred point five pounds` keeps the independent 71-in height. The existing
integer-stop mode is forwarded to the unsigned feet-prefix read; signed phrases keep their
whole-phrase ownership behavior. No extra scan, grammar, public type, or policy is added.

`tests/parseMeasurement.spokenDecimalFields.test.ts` has 32 independent cases covering plain
and labeled prefixes, explicit and bare fractional inches, signed/Unicode-signed fields,
semicolon number/unit joins, full decimal scalars, half phrases, and both explicit selectors.
The same assertions fail 14 cases and pass 18 controls on published `51e084c`, and fail 14
and pass 18 on exact main `0e0284d`; all 32 pass the focused correction. Final focused
checks passed 1,044 cases in 22 files, including resource bounds, F3, calculator, range,
feature-map and generated-result controls; scoped ESLint/format/spelling checks pass. Thirty-two corpus additions all agree; all 881 prior rows and outcomes are retained.
The generated result snapshot is unchanged. These are focused observations, not final
full-check, mutation, build, size, or package validation of the uncommitted correction.

Two exploratory expectations were not adopted as a new recovery contract. Unmarked
`kg -seventy point five; ft 5 11` can attach `ft` to the preceding signed number under the
existing semicolon rule (main 65 in; published/focused `null`); the positive independent-label
control uses `ft:`. Weight-selected `ft 5 11 two hundred point five pounds` has no explicit
boundary before its weight phrase (main 5 lb; published/focused `null`); its proposed 200.5-lb
oracle remains separate from the documented height/default preservation. The positive weight
control uses `pounds:` after a semicolon. Approved AFA-250 owns rejection of the malformed
signed entry and whitespace-only pair. Original trial expectations, exact observations, and
reasons remain in `/tmp/afa247-field-prefix-exploratory-dispositions.json` and the failing-first
logs; no committed assertion was deleted or loosened. The historical `e69d594` full-check
and report evidence above does not validate this later source correction.

Committed correction `2367ef86468fde32f62c7c373bd16faae9015f56` passed one full
`pnpm check`: 4,352 unit tests, 100% coverage, TypeScript, fresh mutation 99.67%
(1,496 killed, 24 timeouts, five survivors, 32 unchanged ignores), build/API/size and
5,318 package tests. All eight selected sources and six report bodies match that commit;
the report is retained at `/tmp/afa247-mutation-2367ef8.json`, SHA256
`04faa74cb42fbf0ef22aaf5279f02705046c3ccb23d4fa30a65ac4dcb6cced75`.
The separate changed-line gate found a real surviving default-argument mutant: setting
M5's compound-stop default to true changes `-one two point five kg` from null to 2.5 kg.
The signed/malformed rule requires null; exact main gives 5 kg. One strict regression and
corpus row now cover that path, without source edits, ignores, or threshold changes.
The 33-case file passes on the correction; exact main fails 15 / preserves 18, published
`51e084c` fails 14 / preserves 19, and the isolated mutant fails precisely the new case.
The focused four-file run passes 126 tests. Final fresh mutation with this added assertion
and package/push validation remain separate from the preceding full-check evidence.

The same exploratory probe reproduced these fragment-recovery observations; the approved
AFA-250 complete-entry contract requires null for each. They are historical observations,
not newly adopted success assertions or further production changes in this review round.
They are recorded in AFA-250 comment `edaeebbb-dc1c-461e-8030-a71e50391124` and the PR inventory.

| Input                             | Main `0e0284d` | Source `2367ef8` |
| --------------------------------- | -------------- | ---------------- |
| `m: one cm: one two point five`   | 101 cm         | 1 cm             |
| `m: one cm: zero five point five` | 1 m            | 1 cm             |
| `5 kg: one two point five`        | 1 kg           | 5 kg             |
| `5 kg: zero five point five`      | null           | 5 kg             |
| `kg 5 lbs: one two point five`    | null           | 5 kg             |
| `1 m cm: one two point five`      | 101 cm         | 1 m              |
| `5 ft in: one two point five`     | 61 in          | 5 ft             |
| `stone 12 lb: one two point five` | null           | 12 lb            |
| `6 1-2 ft one two point five in`  | 5 in           | null             |

The first eight retain/reassign an earlier explicit fragment; their removal belongs to
AFA-250's already-approved shared grammar, including unsupported-part ownership. The last
row already rejects the malformed phrase. Exact observations and independent null expectations
remain in `/tmp/afa247-default-mutant-dispositions.json` and the triage logs. No existing
committed assertion is changed to pin these incidental outputs.

Final test-only commit `9284e40303021b555f5a7f4b18a70f8970d13fd4` retains the exact
`2367ef8` runtime source tree `338424673c2c947e807a170839b4b33899b0af3e`.
Its necessary fresh mutation run, without incremental reuse, passes 99.74% (1,500 killed, 21 timeouts,
four unchanged-line survivors, zero uncovered/errors, 32 existing ignores); every changed-line
mutant is killed. All eight selected sources and six report bodies match the committed source.
Report SHA256: `b769407c9da78010845202aee85c8c0bd84ec4af87bba3d94642da0abbab8de5`;
archive `/tmp/afa247-mutation-9284e40.json`, verification
`/tmp/afa247-field-prefix-final-mutation-verification.json`. The final test tree
`b187e699d4f241f46df571faecc84b71b4d89592` passes 5,320 ESM/CommonJS package tests;
the prior full coverage check stays pinned to `2367ef8` rather than being relabeled.
Brotli is 5,641 ESM / 5,694 CommonJS bytes, versus main's 5,401 / 5,455,
within unchanged 6,000-byte limits. Corpus is 914 total / 893 agree / six wrong / 15 missed;
all 881 prior rows and outcomes remain. Logs:
`/tmp/afa247-review-final-field-prefix-final-mutation.log`,
`/tmp/afa247-field-prefix-final-changed-lines.log`,
`/tmp/afa247-review-final-field-prefix-final-package.log`.
This following audit-only commit changes no runtime or test content.

AFA-247 closed out through [PR #238](https://github.com/afahy/fluent-measures/pull/238):
reviewed `2559c6c` merged as `44135485609e80c1bc07fee26481d7c609fb58be`.
All 20 PR checks, exact-head review and final/late comment audits passed. All 12 exact-merge
main CI jobs passed in run `42390017577`, with
[ci-ok](https://github.com/afahy/fluent-measures/actions/runs/42390017577/job/128456781936)
complete at 2026-11-07T16:16:39Z. The two earlier `51e084c` field/prefix findings were fixed
before that reviewed head and their threads are resolved. The source-validation `2367ef8`
and final-test `9284e40` records above remain distinct historical evidence.

The final review also recorded three additional separator observations on the already approved
[AFA-250 complete-entry ticket](https://linear.app/afahy/issue/AFA-250), comment
`776f700f-bb9c-4404-a263-c83c72cd444d`. They remain unfixed by this narrow decimal change:

| Input                           | Main before decimals `0e0284d` | Reviewed `2559c6c` | Approved complete-entry result |
| ------------------------------- | ------------------------------ | ------------------ | ------------------------------ |
| `age twenty point five & 80 kg` | 80 kg                          | 20.58 kg           | `null`                         |
| `age twenty point five: 80 kg`  | 80 kg                          | 20.58 kg           | `null`                         |
| `age twenty point five / 80 kg` | 80 kg                          | 20.58 kg           | `null`                         |

The three explicit-label controls (`& kg=80`, `: kg=80`, `/ kg=80`) remain 80 kg on both
sources. Twelve narrow comparisons produced three expected failures on the published source;
expectations and observations remain at `/tmp/afa247-other-separators-expectations.json`
and `/tmp/afa247-other-separators-results.json`. The approved complete-entry parser must retain
these separators and reject unrelated prose. No new punctuation recovery is added here, and
20.58 kg is not adopted as a desired result. The missing legacy check was a cross-separator
number-phrase field matrix; AFA-250 owns that acceptance coverage. Earlier deferred findings
and all source-validation records remain unchanged.

M2 now retains `RANGE` as the token's text instead of writing `-`. This keeps M3's discarded
ranges distinct from literal minus signs in M5. The existing recovery contract still applies:
`6 ft 1-2 eleven point five in` is 83.5 in (6 × 12 + 11.5), and `kg seventy point five 1-2`
is 70.5 kg. The first decimal implementation instead returned 6 ft and `null`; the original
main revision returned 77 in and 70 kg. `tests/parseMeasurement.spokenDecimalBoundaries.test.ts`
and the `spoken-decimal-range-height` / `spoken-decimal-range-prefix` corpus entries preserve
these results. `tests/parseMeasurement.spokenDecimals.test.ts` covers both scanning directions,
labels, signs, fractions, normalization and unqualified values.

### M6 — exact and fuzzy unit matching

Source: all of `matchUnit.ts` and `levenshtein.ts`; aliases in `units.ts`.

| From              | Event / guard                                                                        | Action                                         | To                  |
| ----------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------- |
| No candidate      | Fuzziness is positive infinity                                                       | Disable fuzzy matching locally                 | Exact-only search   |
| Searching aliases | Exact alias                                                                          | Return its canonical unit immediately          | Matched             |
| Searching aliases | No fuzzy budget, excluded prose, British exact-only alias, or different first letter | Skip fuzzy comparison                          | Next alias          |
| Searching aliases | Edit distance <= budget and distance \* 3 < alias length                             | Save unit; reduce local budget to distance - 1 | Candidate           |
| Candidate         | Later strictly closer alias                                                          | Replace candidate                              | Candidate           |
| End               | Candidate / no candidate                                                             | Return canonical unit / `null`                 | Matched / unmatched |

Tie order is alias iteration order. Exact matches still win after a fuzzy candidate. The budget
is local; it cannot carry into a later call. NaN and negative budgets do not admit a typo.

Edit distance is a supporting dynamic-programming machine: initialize row `0..b.length`; for
each character of `a`, save the old diagonal, set row[0] to the row index, then replace each
cell with the unchanged diagonal for equal characters or `min(above, left, diagonal) + 1`.
Advance the saved diagonal to the old `above`; finish with the last cell. The row is freshly
allocated and represents only the preceding/current prefix distances. This source has no
cross-call cache.

### M7 — ownership and consumption

Source: `remainingWords`, `readValueAfter`, `labelHasValue`, and the type loop in
`parseMeasurement.ts`; F7 ownership correction at `1eb0a1b`.

| From                     | Guard / event                                                                                      | Action                                                                   | To                 |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| Unused token             | Not a unit of this pass                                                                            | Inspect unsupported weight relationship if applicable                    | Next token         |
| Unit candidate           | Label owns following value, or starts a field                                                      | Suppress backward number read                                            | Forward candidate  |
| Unit candidate           | Otherwise                                                                                          | Read preceding signed phrase                                             | Backward candidate |
| Forward signed candidate | Unmarked prefix before a signed value with its own other-type unit                                 | Leave the prefix field valid; do not consume the value                   | Next token         |
| Candidate                | Owned signed phrase                                                                                | Record rejected fields; do not consume match                             | Next token via M8  |
| Candidate                | No preceding number, or eligible zero; raw alias is not bare `in`/`m`                              | Read following signed/unsigned value                                     | Forward candidate  |
| Forward candidate        | Label/zero value has its own unit (except next compound part or separate label with its own value) | Reject ownership of that number                                          | No match           |
| Candidate                | No number                                                                                          | Leave tokens available                                                   | Next token         |
| Candidate                | Number accepted                                                                                    | Append match and its field endpoints; set `used` over its token interval | Consumed           |
| Feet/meters accepted     | Explicit inches after feet, or bare smaller part inside its bounds without another unit            | Append smaller part; consume number and explicit unit if present         | Compound candidate |
| Feet/meters accepted     | Isolated zero without a smaller part                                                               | Remove isolated zero match                                               | Next token         |
| End of pass              | All candidates visited                                                                             | Apply signed-field filter                                                | M8 then M9/M10     |

`readValueAfter` checks the next unit across semicolons but not across a new field label. F6
reuses that ownership check for bare centimeters, with an immediate unsigned number read so
`1 m -80` and `1 m; 80` do not acquire a smaller part. An explicit suffix still owns the number
in `1 m 80;kg` and `1 m 80 (m)`. Short
aliases expanded to label words retain their label metadata. A zero is a recognized candidate,
not simply a missing value, although several branches use falsy checks with special zero rules.
The `used` flag moves false → true monotonically within a pass; it is reset at the next type
pass. Rejected signed matches do not become accepted positive matches. The F5 correction at
`938c2ff` uses those original signed tokens in M8: rejecting a signed supported field
does not disconnect its separately numbered unsupported weight part.

### M8 — field rejection and unsupported-part relationships

Source: `parseMeasurement.ts`, field indexing, `hasUnsupportedPart` and the type loop;
F5 correction at `488bced`, F7 correction at `1eb0a1b`.

| From                 | Event / guard                                                                 | Action                                                                       | To                              |
| -------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------- |
| Token indexing       | Semicolon                                                                     | Increment field number                                                       | New field                       |
| Type pass begins     | Any input                                                                     | Allocate empty signed-field set and match-field map                          | Clean pass                      |
| Backward signed part | Signed first word and unit may span semicolon                                 | Mark first-word and unit fields invalid                                      | Rejected fields                 |
| Forward signed part  | Prefix owns signed value                                                      | Mark unit and following-value fields invalid                                 | Rejected fields                 |
| Unsigned match       | Accepted interval                                                             | Record its endpoint fields (bare inches record their starting field)         | Pending match                   |
| Backward adjacency   | Checking a supported unit-first weight before an unsupported part             | Read the signed phrase; cross internal semicolons to find its supported unit | Supported owner found or absent |
| Weight scan          | Stone/ounce/gram has separately numbered adjacent supported part              | Return `null`, using original text to find already consumed supported units  | Whole parse rejected            |
| Weight scan          | Unsupported unit is unrelated, ordinal `st`, or excluded bare prefix `st`/`g` | Continue                                                                     | Scan                            |
| End of pass          | Match has any recorded field in signed-field set                              | Remove match                                                                 | Rejected match                  |
| End of pass          | Recorded fields all valid                                                     | Keep match                                                                   | Assembly candidate              |

Unsupported-part adjacency can cross semicolons or retained comma boundaries, as documented.
At baseline the backward ownership helper used the signed reader only at a retained `COMMA`
boundary, missing the supported prefix elsewhere (F5). At `938c2ff`, `partEndsAt` always uses
`readSignedPhrase` after skipping the existing semicolon/comma separators. The review correction
at `488bced` also crosses semicolons immediately before the sign to find the owning unit;
commas at that internal boundary remain unchanged. Thus `kg -20 5 grams`
retains two connected parts even though the signed kg field was rejected. The unsigned and
unsupported-prefix ownership guards stay unchanged: `stone -5 lb; actual 70 kg` still has only
the independent 70 kg match. At baseline a bare supported prefix rejected its field before
applying the other-type ownership exception used for labels (F7). At `1eb0a1b`, a signed
forward candidate first uses the existing label ownership check. An unmarked prefix leaves
its field valid only when the signed value has its own unit of the other type; that unit
still rejects the signed value's field in its type pass. Unsigned, same-type and unsupported-part
ownership keep their earlier behavior. F10 prefix ownership remains separate.

### M9 — grouping, conversion, agreement and terminal result

Source: `parseMeasurement.ts`, `total` and `combineParts`, after the F8 correction at
`7426e3e`; conversions in `units.ts` retain the F9 correction at `ecf7a2e`.

| From                 | Event / guard                                                                          | Action                                                                   | To                   |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------- |
| No group             | First match                                                                            | Start group                                                              | Group open           |
| Group open           | Previous value integral, unit step in `NEXT_PART`, smaller value below one larger unit | Append part                                                              | Compound group       |
| Group open           | Any other match                                                                        | Start independent measurement                                            | New group            |
| Groups complete      | Group contains only zero parts                                                         | Exclude from counted groups                                              | Counted groups ready |
| Counted groups ready | Choose first nonzero group, or first group if all zero                                 | Choose requested unit or last part's unit                                | Convert              |
| Convert              | Zero part                                                                              | Skip it                                                                  | Next part            |
| Convert              | Same unit                                                                              | Add original value                                                       | Next part            |
| Convert              | Same-type conversion exists                                                            | Evaluate the established conversion arithmetic                           | Converted part       |
| Converted part       | Finite result                                                                          | Keep its value and rounding; add to total                                | Next part            |
| Converted part       | Non-finite result through centimeters (ft/in → m or m → ft/in)                         | Use the direct factor for the same target unit; add to total             | Next part            |
| Converted part       | Any other non-finite result                                                            | Add unchanged value                                                      | Next part            |
| Convert              | No conversion exists (out-of-contract unit/type)                                       | Throw                                                                    | Error                |
| First total          | Zero, explicit or inferred                                                             | Return internal `undefined`                                              | Try next type        |
| First total          | Non-finite                                                                             | Return `null`                                                            | Rejected             |
| First total          | Finite and positive                                                                    | Calculate 1% threshold with rounding margin `1 + 1e-9`                   | Compare              |
| Compare              | Any counted total differs more than threshold                                          | Return `null`                                                            | Rejected             |
| Compare              | All agree                                                                              | Return first group's matches, total, unit, type and exact original input | Success              |

This machine keeps the requested target unit. At baseline, F9 rejected finite targets because
the intermediate centimeter value overflowed. The correction preserves every finite result of
the established arithmetic and uses 0.3048 m/ft or 0.0254 m/in only after a non-finite conversion.
A truly infinite target still returns `null`. After F8, every zero total returns internal
`undefined`. Explicit zero fragments can still fall through to another measurement type.
Inference requires an explicit type, so an inferred zero exhausts its only pass and returns
`null`. Positive subnormal totals continue to comparison and success without a minimum cutoff.

### M10 — complete-input unqualified inference

Source: `parseMeasurement.ts`, complete-input inference at the end of the type loop (`7426e3e`).

| From                   | Guard / event                          | Action                                                             | To                  |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------ | ------------------- |
| Explicit scan finished | Surviving matches exist                | Do not infer                                                       | M9                  |
| No matches             | `allowUnqualified` and explicit `type` | Join all token text except semicolons and parse complete M4 phrase | Inference candidate |
| Candidate              | Not a number, or number <= 0           | Add nothing                                                        | Next type / null    |
| Positive candidate     | Weight                                 | Infer kg for metric, otherwise lb                                  | One match           |
| Positive candidate     | Height, imperial/default               | Infer inches                                                       | One match           |
| Positive candidate     | Height, metric, value < 3              | Infer meters                                                       | One match           |
| Positive candidate     | Height, metric, value >= 3             | Infer centimeters                                                  | One match           |
| One match              | Requested normalization                | Use the same M9 result handling as explicit units                  | Result / rejection  |

Inference reads complete token text, not a surviving numeric prefix and not just unused tokens.
It cannot retry arbitrary trailing garbage as a bare number. `normalizedUnit` chooses the target
unit but does not replace the explicit-type requirement for this feature. A positive candidate
can become zero during conversion; after F8, M9 rejects that result as it does for explicit units.

### M11 — retries, repeated calls and concurrency

| From                    | Event                                         | Action                                                                        | To                      |
| ----------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| Idle module             | Call starts                                   | Allocate text, tokens, maps, sets, arrays and scalar cursors                  | Independent invocation  |
| Invocation              | Success, `null`, or throw                     | Discard internal state; expose only newly allocated result/matches on success | Idle module             |
| Idle module             | Caller retries same input/options             | Re-run from M0; no saved progress                                             | Independent invocation  |
| Caller owns result      | Mutates result or matches                     | No shared parser object is changed                                            | Later call unaffected   |
| Same JavaScript isolate | Several Promise callbacks call parser         | Synchronous calls complete serially; no internal suspension point             | Independent invocations |
| Worker threads          | Concurrent calls in separate module instances | Each worker has its own ordinary heap and lookup state                        | Independent invocations |

Shared module values are unit/number tables, Sets/Maps and RegExp instances. Public parsing never
mutates the tables. Global regular expressions are used by string replacement, not a retained
`exec` cursor loop; repeated probes found no `lastIndex` leakage. There is no public singleton
session, lock, retry budget, transaction or cancellation state.

The audit ran 100 mixed sequences in a Promise batch: rejected range → expected option error →
fuzzy parse → mutate a successful result → parse again using frozen options → height fallback.
All passed. Four workers concurrently ran 200 rejection/error/success cycles each against the
built ESM API; all passed. This is genuine worker concurrency, but not concurrent access to one
parser heap. Promise batching alone is not evidence of parallel execution.

At baseline, three retries of F1 returned `[230, 230, 230]` instead of `[30, 30, 30]`:
retrying preserves the deterministic bug rather than repairing it. The tests establish isolation for these sequences,
not a proof over hostile option getters, monkey-patched built-ins, private-module mutation,
resource exhaustion, or every JavaScript engine. No retry/concurrency-specific bug was confirmed.
The F1 regression now returns `[30, 30, 30]` on `cbf94c1`; the correction is to the boundary,
not to call isolation.

## Confirmed failures, ranked by impact

All rows were reproduced through `pnpm test:unit` at the audit baseline. The embedded harness
below has **22 tests: 18 failing probes and 4 passing controls**. A failed intended-behavior
assertion is evidence here, not a failing test committed into the normal suite. Multiple rows in
one group share a ticket; existing issues were reused. Priorities weigh silent corruption and
ordinary input frequency above extreme-number rejection.

| Finding / priority | Reachable input and options                                                                                     | Actual at baseline                              | Required result and source                                                                             | Invalid transition / issue                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| F1 / High          | `my son is two, thirty pounds`; `twenty, one hundred pounds`                                                    | 230 lb; 2100 lb                                 | 30 lb; 100 lb, specified by [AFA-75][commas]                                                           | Baseline M2 boundary loss; correction in [PR #229](https://github.com/afahy/fluent-measures/pull/229)           |
| F2 / High          | `he said “about 180” lbs`; `5 ’11”`                                                                             | 180 in (height); 11 in                          | 180 lb; 71 in, [AFA-78][quotes]                                                                        | M1 quotation → unit, or omitted feet → partial success                                                          |
| F4 / High          | `5/2-180 lbs`; `5½2 lb`; `5.5 ½ ft`; `5 ft (10/180 lbs)` with weight type                                       | 180 lb; 5.52 lb; 0.5 ft; 0.05555555555555555 lb | `null`; `null`; `null`; 180 lb, [AFA-74][fractions]                                                    | Baseline M1 boundary/ownership loss; correction in [PR #232](https://github.com/afahy/fluent-measures/pull/232) |
| F3 / Medium        | `phase 20, −5 cm`; `phase twenty, −5 cm`                                                                        | 5 cm; 25 cm                                     | `null`, negative-field rule and [AFA-202][signs]                                                       | Baseline M1 sign loss; targeted F3 correction below                                                             |
| F6 / Medium        | `5ft11`                                                                                                         | `null`                                          | 71 in, [AFA-62][compact] and 5 × 12 + 11                                                               | Baseline M2 leaves `ft11` indivisible; targeted correction below                                                |
| F5 / Low           | `kg -20 5 grams; actual 70 kg`                                                                                  | 70 kg                                           | `null`, Unsupported Units specification and [AFA-203][unsupported]                                     | M8 unsigned backward lookup misses the supported prefix; incomplete weight bypasses rejection                   |
| F7 / Low           | `kg -6 ft, 70 kg`                                                                                               | `null`                                          | 70 kg, [AFA-116][ownership]                                                                            | M7/M8 rejects kg field for a signed value owned by ft                                                           |
| F8 / Low           | `0.` + 322 zeros + `1`, height + allowUnqualified + normalized ft                                               | Successful result with value 0                  | `null`, [AFA-107][underflow], maintainer's 2026-10-08 “option 1” comment                               | M9 inferred-zero exception violates intended positive-result invariant                                          |
| F9 / Low           | `1` + 307 zeros + ` ft`, normalized m; same digits + ` m`, normalized ft; `1` + 308 zeros + ` in`, normalized m | `null` in all three cases                       | Approximately 3.048e306 m; 3.280839895013123e307 ft; 2.54e306 m, independently calculated unit factors | M9 intermediate overflow falsely rejects finite target; [AFA-236][overflow], fix below                          |

At baseline, F8 was intentionally retained by one existing test. The maintainer approved
changing it to `null` on 2026-10-08. The correction below updates that expectation and
strengthens the positivity invariant; the original zero output above remains historical evidence.

The corpus's existing “wrong” classification is not enough by itself to establish a bug:
`5.11 ft` is a documented decimal grammar, and fuzzy prose such as `2 ponds` is admitted by the
documented edit-distance rules. Those rows are not additional confirmed defects in this audit.
At baseline, the structural invariant generator missed positive subnormal values. F8 adds these
values and deterministic conversion examples. Structural invariants still miss ordinary semantic
errors: a finite positive 230 lb can still be the wrong reading of 30 lb.

### F1 correction — comma boundaries

Implemented in `cbf94c1`; [PR #229](https://github.com/afahy/fluent-measures/pull/229) tracks
review and merge status. Against baseline
`b79eae0`, the exact ticket inputs change from 230 to 30 lb (`my son is two, thirty pounds`),
2100 to 100 lb (`twenty, one hundred pounds`), and 120 to 20 lb (`age one, twenty pounds`).
The related independent quote-review input `phase twenty, “5” cm` changes from 25 to 5 cm
at the same boundary check. Three consecutive retries now give `[30, 30, 30]`.

Permanent regressions: `tests/parseMeasurement.commaBetweenWords.test.ts`, run through source,
ESM and CommonJS. The three original cases, retry case and six quoted variants were verified
failing on baseline and passing with the fix. Four ticket-sourced entries in
`tests/corpus/measurements.jsonl` and the affected feature maps retain the evidence.
Existing corpus outcomes and the generated result snapshot are unchanged. Numeric commas,
semicolons, supported/unsupported part ownership, public types and examples keep their rules.
F10 remains separately tracked; the general tokenizer refactor is outside this correction.

### F2 resolution — quotation context and spaced marks

Status: merged in [PR #231](https://github.com/afahy/fluent-measures/pull/231) as `ef39a7b`,
from reviewed head `0b7f4d2`; all 19 PR checks and all 12 exact-merge main CI jobs passed.
Before: `b79eae0`; audit publication integrated from `527f7b5` and F1 from `fa73fd5`.
F2 implementation after: `95a5a54`; final combined validation at `133aac5` includes F9 from `b74d185`.
The baseline row above remains historical: its two failures now return 180 lb and 71 in.

`tests/parseMeasurement.quoteContext.test.ts` covers the ticket's description and comments,
including words/signs within quotations, mixed and full-width quotes, spaced feet marks,
number-word and fractional-inch components, modifier-letter primes and spaces after paired apostrophes. It also
preserves the required quotation and unit-mark controls. The same tests run through source,
ESM and CommonJS. Ticket-sourced corpus rows have the `quote-context-` and `quote-review-` prefixes.

The independent session specified 122 probes before running them. Four quote findings were
fixed here. The baseline `phase twenty, “5” cm` comma-boundary failure was recorded on
[AFA-75][commas] and fixed separately in `fa73fd5`. After merging that revision, all 122 probes
agree, including that exact corpus case. It remains separate from F2.
The choice for quoted feet followed by inches is the complete compound (71 in), including
`‘5’ eleven”`, `‘five’ 11”` and `‘five’ eleven”`, rather than dropping the feet.

Round-two Codex review found three quotation regressions. The steward's correction limits
spaced quotation overrides to actual inch components, keeps intra-word apostrophes within a
single quotation, and retains unquoted feet before the preposition `in`. The added controls
preserve `“72” 180 cm` as 180 cm, `he said ‘it’s five’` as a quotation and `6’ in shoes` as 6 ft.
Genuine quoted inch values and named or paired-mark inch components remain supported.

Recognizing previously omitted marks also changes 157 generated option results across 31 inputs.
These can expose disagreeing heights, select height before weight, override inferred units, or
change compound ownership. The complete before/after list is recorded on the ticket and in the
PR description; the result snapshot records those transitions. No previous corpus agreement,
public example or exported type changes. Paired-apostrophe quotations retain their required
`null` result. The tokenizer refactor remains separate.

### F3 correction — Unicode signs after numeric labels

Status: complete. [PR #236](https://github.com/afahy/fluent-measures/pull/236) merged reviewed
`c819c48e907a00bac38e21aa4b218397ab6c8051` as
`e1d3a457c1aa5f8dd613f06b7205d5f25fc68f61`. All 19 PR checks, exact-head review and the late
comment audit passed. All 12 exact-merge main CI jobs passed, including
[ci-ok at 2026-11-07T05:08:57Z](https://github.com/afahy/fluent-measures/actions/runs/42340992416/job/128309873762).
The completed predecessor is recorded in the session ledger below. Source `f50c9c5` passed full
validation and fresh changed-line mutation, including the later
quadratic prefix-guard correction below. Earlier source `d6e2ce7` passed its checks before that
automatic-review finding. Earlier source
`93c7c72` passed validation at `b80d68a` before the round-one preservation correction. Before: current main `bfac12a943720390c60afd26a522cb67dfa20fa3`. The original
`b79eae0` audit row and embedded 22-test harness remain historical evidence.

| Input                              | Before (`bfac12a9`) | After  |
| ---------------------------------- | ------------------- | ------ |
| `phase twenty, −5 cm`              | 25 cm               | `null` |
| `phase 20, −5 cm`                  | 5 cm                | `null` |
| `phase twenty, ﹣5 cm`             | 25 cm               | `null` |
| `phase 20, ﹣5 cm`                 | 5 cm                | `null` |
| `phase twenty; −5 cm`              | 25 cm               | `null` |
| `phase 20; −5 cm`                  | 5 cm                | `null` |
| `phase twenty; ﹣5 cm`             | 25 cm               | `null` |
| `phase 20; ﹣5 cm`                 | 5 cm                | `null` |
| `phase twenty, −5 cm; actual 6 cm` | `null`              | 6 cm   |

M1 keeps its existing sign-before-number guard and earlier-number policy. Only commas and
semicolons directly after numbers, optionally separated by spaces, end the preceding label's
context. Values with their units before them or across the separator, and commas after units,
retain joining behavior. This avoids a broad sign conversion or tokenizer rewrite. The semicolon cases use the same guard and fix location as the ticket's
comma cases and are included under decision rule 2, with a ticket comment. A signed field
followed by `; actual 6 cm` now leaves that independent positive field intact, for digit/word
labels and both signs. These changed results are disclosed in the ticket and PR.

An unavoidable signed-zero change is recorded under decision rule 3:
`phase 20, −0 kg, 80 lb`, weight type, changes 80 lb to `null`, as does the small-minus form.
Preserving the sign invokes AFA-80's existing signed-part field rejection, matching the ASCII
form and leading `−0 kg, 80 lb`. No special exception discards only signed zero after labels.
The independent review's 80 lb expectation assumed unsigned-zero behavior; that expectation
was rejected for this signed syntax, with the decision disclosed on the ticket. The source is
AFA-80's merged decision: [comment 4f633231](https://linear.app/afahy/issue/AFA-80#comment-4f633231-1d2c-4892-a709-06d201a8aa7d)
explicitly keeps `-0 kg, 70 kg` null; [comment cd62c97b](https://linear.app/afahy/issue/AFA-80#comment-cd62c97b-0789-48a4-bb22-faa187473aa9)
also keeps `-0 feet, actual 1.8 meters` null because `-0` counts as signed. Six independent
controls exercise those exact inputs and both Unicode forms. The coordinator confirmed retaining
the disclosed rule-3 results after the first Claude review; no signed-zero exception is added.

Permanent regressions: `tests/parseMeasurement.unicodeMinusLabels.test.ts`, reused through ESM
and CommonJS. They cover exact ticket inputs, both signs, digit/word/full-width labels, spaces,
fractions, decimal/thousands commas, article-led words, unit labels, marks, fuzzy units,
explicit type, normalized unit and unqualified options. Preservation cases include the ticket's
ranges/multipart values, commas after units, positive comma boundaries, F1 quoted digits and
the approved F4 proper fractions. A minor changeset records the changed non-null results.
Sixty-two new ticket-sourced correction/control rows agree; the existing F3 row also becomes an
agreement. Two additional rows sourced to AFA-244 record its existing signed-prefix failures.
No prior row or expected result is edited, and the generated result inventory is unchanged.

Independent review specified 126 probes before testing `eb5da21` and main `bfac12a9`.
Ten introduced multipart failures (five inputs with both signs) were reproduced through
source/ESM/CommonJS: `ft 5, −11 in`, height-typed `ft: 5, −11 in`, height-typed
`m: 1, −80 cm`, `5;ft −11 in` and `5, ft −11 in`. The corrected guard retains their units
and original 71-inch/180-centimeter values. Four additional word-form assertions failed on the
initial correction too. Parent replay now gives 124 of 126 agreements in each format after the
signed-zero judgment; both remaining failures are the separate AFA-244 cases below.

Round-one Codex review found numeric commas missing from the unit-prefix joining guard.
`m: 1,8, −180 cm` and its small-minus form returned `null` at reviewed head `ed5c111`,
versus the required 1.8 m on main `bfac12a9`. The same cause affected leading decimal commas,
thousands groups, mixed thousands/decimal commas and feet-to-inch equivalents. Ten assertions
failed on the reviewed source and twenty through ESM/CommonJS; all pass after allowing a comma
before a digit inside that existing guard. Numeric-comma grammar remains validated by the next
normalization pass. Decimal-point and semicolon controls retain their results. The expanded
158-case suite still fails 56 source/112 package assertions on main, with 102 controls per format.
Ten additional ticket-sourced corpus rows agree; no original corpus row changes.

Round-two Codex review found prefix punctuation missing from the same joining guard:
`(ft.) 5, −11 in` and `ft;5, −11 in`, and both small-minus forms, return `null` at reviewed
head `49ecd4a` versus 71 in on main `bfac12a9`. The same cause also affects `ft!5, −11 in`,
`ft & 5, −11 in` and `(m.) 1, −80 cm` (71 in, 71 in and 180 cm), with both signs.
Ten source/twenty ESM/CommonJS assertions fail on that head. The guard now crosses prefix
punctuation without crossing words, quotes or signs. Ten more controls cover periods, commas,
slashes, braces and the `in.` label. All 178 focused source cases pass; main still fails the
same 56 assertions and passes 122 controls. Ten additional ticket-sourced corpus rows agree.
The 715-row corpus has 694 agreements, 6 wrong, 15 missed and no throws; its original 651 rows
remain byte identical. Final package checks pass, including all 178 cases in each format. The expanded suite has
112 expected ESM/CommonJS failures on main, with 244 preservation controls passing.
Final `pnpm check` at `d6e2ce7` passed 3,990 unit tests, 100% coverage, TypeScript, fresh
mutation (99.65%; 1,416 killed, 12 timed out, five unchanged-line survivors), build/API/size
and 4,666 ESM/CommonJS tests. Fresh changed-line validation kills every mutant on the changed
lines. Bundles are 5.29 kB ESM / 5.32 kB CommonJS, within the unchanged 5.5 kB limits.
Git-isolation passed in 98,446 ms. The five survivors are the unchanged zero-part skip,
two zero-inference gates, numeric-comma rejection marker and fuzzy-unit regex. Zero-part
skipping is redundant for valid units, later validation rejects inferred zero, and malformed
commas discard the rejection marker. The fuzzy-unit anchor variant affects only
fuzziness above the documented 1–2 examples; it is outside this correction. No suppression is added.
Focused source CPU probes with `maxLength: Infinity` include 1,000/10,000 prefix punctuation
and period characters; the largest new-prefix cost was 7 ms, with the earlier repeated-context
probes also passing (largest 95 ms at 10,000 repeats). No production scope is added.

Round-three Codex review of `bf6e4b8` found one remaining fuzzy-prefix joining regression,
filed as [AFA-249](https://linear.app/afahy/issue/AFA-249). With `{ fuzziness: 2 }`:

| Input                | Main `bfac12a9` / expected | Reviewed `bf6e4b8` |
| -------------------- | -------------------------- | ------------------ |
| `foots 5, −11 in`    | 71 in                      | `null`             |
| `foots 5, ﹣11 in`   | 71 in                      | `null`             |
| `meterrs 1, −80 cm`  | 180 cm                     | `null`             |
| `meterrs 1, ﹣80 cm` | 180 cm                     | `null`             |

Source/ESM/CommonJS reproduce all four rows: main passes six source/twelve package assertions;
the reviewed branch fails four/eight, with two/four exact public-example controls still passing.
The expected values follow fuzzy matching and unit-first multipart rules: 5 × 12 + 11 = 71 in
and 100 + 80 = 180 cm. M1's exact-alias joining guard misses fuzzy units accepted later by M7.
This is a valid result-preservation defect, deferred under the three-round rule: no existing
public-example, test or original-ticket input fails, no probe throws, and existing build/package
checks pass. The single finding/four rows remain **unfixed, Medium, unassigned and in Backlog**,
outside the active queues. Reproduction logs are `/tmp/afa202-r3-fuzzy-*.log`; the retained probe
is `/tmp/parseMeasurement.afa202FuzzyReview.test.ts`. The ticket specifies the missing fuzzy-prefix
composition checks. This audit-only addition changes no production code, regression expectations,
corpus row, original probe count or numbered group. Earlier F3 correction/validation remains
at source `d6e2ce7`; the limitation is disclosed in the PR and ticket.

Automatic review of audit-only head `50ba961` added six accepted Unicode-mark prefix cases to
the same [AFA-249](https://linear.app/afahy/issue/AFA-249) follow-up. With no options:

| Input         | Main `bfac12a9` / expected | Reviewed `50ba961` |
| ------------- | -------------------------- | ------------------ |
| `´5, −11 in`  | 71 in                      | `null`             |
| `´5, ﹣11 in` | 71 in                      | `null`             |
| `ʹ5, −11 in`  | 71 in                      | `null`             |
| `ʹ5, ﹣11 in` | 71 in                      | `null`             |
| `ʺ72, −6 ft`  | 72 in                      | `null`             |
| `ʺ72, ﹣6 ft` | 72 in                      | `null`             |

All six fail in source and both package formats, while main passes. The expected values follow
unit marks and unit-first multipart/equal-measurement rules: 5 × 12 + 11 = 71 in and 6 × 12 = 72 in.
The guard omits marks accepted later by M1, just as it omits fuzzy names accepted by M7. These
non-showstopper preservation findings are deferred under the review cap. AFA-249 now holds two
findings/ten rows; its original four-row `bf6e4b8` comparison stays intact. It remains Medium,
unassigned and in Backlog outside active queues; no production mark fix, numbered group or new
successor is added. Logs: `/tmp/afa202-late-{source,package,main-source,main-package}.log`.

The same automatic review confirmed a separate **merge-blocking performance regression** in
the new guard. With `{ maxLength: Infinity }`, `'.'.repeat(n) + '5, −11 in'` costs 29/85 ms
of source CPU time at 2,000/4,000 periods, versus 6/1 ms on main `bfac12a9`; ESM/CommonJS cost
29–34/86–88 ms versus 6/1 ms. The punctuation prefix and numeric text can both consume periods
and slashes, so a missing unit prefix makes the old lookbehind reconsider their splits.
This synchronous backtracking is a security/showstopper finding and is corrected in this PR
despite the review cap. The correction captures the maximal numeric text once inside the
existing backward guard and then consumes that exact capture, preventing those splits. It
does not add unit forms or change the parser's result policy.

`tests/parseMeasurement.unicodeMinusCost.test.ts` uses `parseWithin` for 16,000 periods/slashes
and both signs, with `{ maxLength: Infinity }`. All four timing cases fail on reviewed source
`50ba961` at 1,306–1,366 ms and all eight ESM/CommonJS cases fail at 1,358–1,373 ms, above the
500 ms CPU budget. Focused corrected source takes 3–9 ms. The budget must be checked against
both hosted coverage jobs before merge. Four short counterparts still exercise the guard under
Stryker; only the new large cases use the timing helper's prescribed Stryker exclusion.
Their expected `null` follows the comma boundary and negative-measurement rule; the short
period/slash forms change main's 11 in to `null` as already done by the earlier F3 source.
Four ticket-sourced short corpus rows make 719 rows, 698 agreements, 6 wrong, 15 missed and no
throws; all original rows remain intact. The combined 186-case suites fail 64 source and 128
ESM/CommonJS assertions on main, with 122 controls passing per format. Independent focused
review found no new actionable issue; its 461 tests across eight files passed, including the
178 preservation cases and new timing cases. Final `pnpm check` at committed source `f50c9c5`
passed 3,998 unit tests, 100% coverage (457 statements, 428 branches, 71 functions, 391 lines),
TypeScript, fresh 99.65% mutation (1,416 killed, 13 timed out and the same five unchanged-line
survivors explained above), build/API/size and 4,682 ESM/CommonJS tests. Fresh changed-line
validation kills every mutant on changed lines 194–212, 217 and 255–256. Bundles are 5.29 kB
ESM / 5.33 kB CommonJS, within unchanged 5.5 kB limits. Focused package replay passes all 372
assertions and its eight timing cases take 3–9 ms CPU. Git-isolation passed in 98,603 ms.
Logs: `/tmp/afa202-cost-check.log`, `/tmp/afa202-cost-changed-lines.log`,
`/tmp/afa202-cost-fixed-package.log`; fresh report: `/tmp/afa202-mutation-f50c9c5.json`.
Earlier full results stay attributed to `d6e2ce7`, and the audit-only `50ba961` hooks remain
separate. The new guard's backtracking defect is separate from the original audit's library
concurrency/isolation evidence.

Self-review reproduced a distinct pre-existing M3/M7 ownership limitation:
`phase 20, kg−70.5` returns **20 kg** on main `bfac12a9`, expected **`null`**.
The prefix takes the unrelated label number rather than its signed value. This survives the
targeted sign-boundary fix. [AFA-244](https://linear.app/afahy/issue/AFA-244) records all three
signed/ranged-prefix cases with source/ESM/CommonJS evidence, preservation requirements and the
missed label/range composition checks. It is Medium, unassigned and in Backlog, outside the
active queue. No production expansion, new numbered finding group or successor is assigned.
The eleven tracked groups, original 18 failing/4 control probes and separate F10/F11 counts
remain unchanged.

### F4 correction — fraction and slash boundaries

Status: complete. [PR #232](https://github.com/afahy/fluent-measures/pull/232) merged reviewed
head `70419bd84b916baeef96d5128f17234531477bbf` as
`bfac12a943720390c60afd26a522cb67dfa20fa3`. All 19 PR workflow checks, `pr:status`, exact-head
Codex review and final late-comment audits passed. All 12 exact-merge main CI jobs passed in
run 42322049791; [ci-ok](https://github.com/afahy/fluent-measures/actions/runs/42322049791/job/128250608743)
completed at 2026-11-07T01:11:17Z. Root main pull and removal of only the merged worktree/local
branch are complete. The predecessor session is recorded in the ledger below.

The initial implementation `1e1a23b` was validated against main `b74d185`;
[PR #232](https://github.com/afahy/fluent-measures/pull/232) includes review corrections and
the maintainer’s approved preservation policy. The initial failing-first baseline was `fa73fd5`.
The original audit baseline remains `b79eae0`. All six original ticket expectations failed before
production edits through source, ESM and CommonJS. The approved policy now retains two of those
main results; the other four remain corrections:

| Input / options                  | Before (`fa73fd5`)      | After (approved policy) |
| -------------------------------- | ----------------------- | ----------------------- |
| `5/2-180 lbs`                    | 180 lb                  | `null`                  |
| `5 ft (10/180 lbs)`, weight type | 0.05555555555555555 lb  | 0.05555555555555555 lb  |
| `5 ft, 10/180 lbs`, weight type  | 0.05555555555555555 lb  | 0.05555555555555555 lb  |
| `5.5 ½ ft`                       | 0.5 ft                  | `null`                  |
| `5½2 lb`                         | 5.52 lb                 | `null`                  |
| `1⁄2/180 lbs`                    | 0.011111111111111112 lb | 180 lb                  |

Permanent regressions: `tests/parseMeasurement.fractionBoundaries.test.ts`; the package runner
reuses the same assertions through ESM and CommonJS. Sixty-three ticket-sourced corpus entries and
the affected feature maps record the paths. The original fractions, numeric commas, valid
shorthand, range ownership and F1 quoted-digit boundary remain covered. No exported type or
public example changes, and no tokenizer refactor is included.

The same cause at a right endpoint changed `180-5/2 lbs; 70 kg` from 70 lb to the independent
70 kg; this input also failed first against both baseline package builds. Generated evidence
changes `5/2 ½6 centimeter` from 0.56 cm to `null` with default, height, normalized cm,
fuzziness 2 and height/unqualified options, as required by the trailing-digit correction.
Independent probes also exposed three same-cause failures on main `b74d185`: `kg 5/2-180`
changes from 5 kg to `null`, `5/2-1/2 lb` from 0.5 lb to `null`, and
`6 ft 1/2-3/4 11 in` from `null` to 83 in. Eleven regressions found on the initial fix were
corrected before review; all fourteen range cases failed first on that implementation.
The separate unit-prefix fraction failure is filed as [AFA-238][prefix-fraction].
One induced change beyond the exact ticket inputs is recorded under decision rule 3:
`six kg 1.75´,5½-centimeter` changes from `null` to 6 kg with default options or fuzziness 2.
Rejecting the decimal-whole Unicode fragment permits the existing weight fallback; height-only
still returns `null` and weight-only still returns 6 kg. No existing corpus agreement is lost.

Review follow-up on `d182e37`: the first bot round reproduced thirteen preservation regressions.
Closing prose quotes such as `"weight" (1/2 lbs)` must retain 0.5 lb; extracting
`10/180-190` from `5'10/180-190 lbs` must retain the preceding height context and 70 in;
explicit inch fractions such as `5' (1/2 in)` and `6 ft, 1/2 in` must retain 60.5 in and
72.5 in. These thirteen assertions pass on main `b74d185`, failed on the reviewed branch in
source and both package formats, and pass with local corrections in the same regression file.

The maintainer explicitly selected **preserve fractions** on 2026-11-06. Both `1/2` and
`10/180` remain proper fractions after feet/comma/bracket context: weight type returns 0.5 lb
and 0.05555555555555555 lb. This revises the two original bracket/comma ticket expectations;
the historical F4 table and 22-test harness retain the original requested 180 lb result
as evidence of the audit at that time, not the final approved parsing rule. The height/weight slash rules without
punctuation stay unchanged. No magnitude/denominator heuristic or
public-example change is introduced. Fifteen assertions covering this policy failed against
the prior local implementation and now pass. The extra punctuation guard and special inch
exception were removed; quoted prose and explicit inch fractions retain the original boundary.
Main `ef39a7b` was merged while preserving the F2 quote corrections and the F1 quoted-digit
boundary. The approved-policy suite still fails 19 source and 38 package assertions on that
main revision. Passing source/ESM/CommonJS revision: `cb1bf60`, with the combined full
validation recorded below.
The combined builds measure 5.11 kB ESM and 5.17 kB CommonJS, versus 4.93 kB and 5.00 kB
on `ef39a7b`. The smallest targeted fix exceeds the previous 5 kB budget, so AGENTS.md’s
standing approval raises each limit by 0.5 kB to 5.5 kB; all published budget notes match.

Round-two Codex review of `2041d2a` found three more boundary failures. All five exact
examples pass on main `ef39a7b` and fail in source/ESM/CommonJS on the reviewed head:

| Input / options                     | Reviewed head | Required / main result |
| ----------------------------------- | ------------- | ---------------------- |
| `5'10/180-190½ lbs`, height type    | 5 ft          | 70 in                  |
| `5'10/180-190 1/2 lbs`, height type | 5 ft          | 70 in                  |
| `5.5 ½-180. lbs`                    | 180 lb        | `null`                 |
| `5½2-180. lbs`                      | 180 lb        | `null`                 |
| `5.5½ 1/2 lb`                       | 2 lb          | 0.5 lb                 |

The correction at `83b505f` retains slash ownership for fractional weight endpoints, uses a
following separate inch component to identify an intervening height range, distinguishes final
periods from continuing decimals, and keeps generated rejection markers from acting as source
letters. The approved punctuation policy is unchanged. Main `b76070d` was merged at `1150bf8`,
preserving F8 and its corpus/invariant/ledger updates. The current regression file has 96 tests
and 63 corpus entries. Main `77bd5ce` was merged after the first full round-two run, preserving
F5’s source, regressions, corpus and audit evidence. Final full validation and fresh changed-line mutation validation pass at `82cad31`,
as recorded below.

Seven additional current-main corrections follow the same causes: five variants of the
83-inch intervening-range case (`6 ft 1/2-1 1/2 11 in`, `6 ft 1/2-3/4 eleven in`,
`6 ft 1/2-3/4 ELEVEN INCHES`, `6 ft 1/2-3/4 11"`, and `6 ft 1/2-3/4 11''`) change
`null` to 83 in; `5/2-180. lbs` changes 180 lb to `null`; and `5.5 ½ 1⁄2 lb` changes
`null` to 0.5 lb. These are disclosed with regression/corpus coverage. Generated snapshot
changes remain limited to the two inputs already listed above.

### F4 follow-up — repeated normalization and exposed slash tails

[AFA-242][fraction-follow-up] (Medium) records two new findings from the third Codex review
of [PR #232](https://github.com/afahy/fluent-measures/pull/232), head `0729f0e`. Both are
**unfixed, unassigned and in Backlog**, deferred under AGENTS.md’s three-round rule. The four
exact inputs are absent from the existing public examples, tests and ticket; no throw,
build/check failure or security issue was reproduced. This follow-up is outside both active
successor queues and does not expand the production fix.

| Input, default options | Main `77bd5ce` / expected | Reviewed `0729f0e` |
| ---------------------- | ------------------------- | ------------------ |
| `1/2-3/4 1/2 lb`       | 0.5 lb                    | `null`             |
| `1/2-3/4 ½ lb`         | 0.5 lb                    | `null`             |
| `5½2/3 lb`             | `null`                    | 3 lb               |
| `5½2⁄3 lb`             | `null`                    | 3 lb               |

The first pair follows PARSING.md’s range omission rule and 1 / 2 = 0.5. M1 normalizes the
range substring, then processes the completed decimal endpoint again as the apparent whole
part of the following fraction. The second pair must retain main’s rejection of an invalid
Unicode fragment with attached digits/slash: replacing only its prefix leaves `x./3 lb`,
and M2/M7 accepts the exposed denominator. Neither case is the unit-prefix defect in F11.

A temporary public-API test reproduced four source failures and eight ESM/CommonJS failures
on the reviewed head, with two/four passing standalone fraction controls. All six source and
twelve package assertions pass on main `77bd5ce`. Source and logs are retained locally as
`/tmp/parseMeasurement.fractionRoundThreeAudit.test.ts` and `/tmp/afa74-round3-*.log`;
the temporary failing test was removed from the checkout. The fraction-boundary suite,
generated result snapshot and semantic properties missed these adjacent-fragment combinations.
AFA-242 requires failing-first source/ESM/CommonJS regressions, corpus entries and stronger
coverage for both forms. The PR and ticket disclose all four changed results and link both
review replies. The reviewed findings are now carried into merge `bfac12a9`. This table retains the
original four-row comparison against main `77bd5ce`, rather than replacing its baseline.
It is a follow-up within F4: the eleven finding groups, historical
`b79eae0` baseline and original 22-test embedded harness/counts remain unchanged.

The later review of documentation-only head `11affc0` adds two rows to the same AFA-242
follow-up, without changing the original four rows or their baseline:

| Input / options                | Main `b90ea36` / expected | Reviewed `11affc0` |
| ------------------------------ | ------------------------- | ------------------ |
| `cm 180/70-80 kg`, height type | 180 cm                    | `null`             |
| `kg 70/180-190 cm`, default    | 70 kg                     | `null`             |

M1 retains feet/mark context for a range substring but loses other unit-prefix letters.
The isolated slash expression is then rejected or converted, swallowing the independent
measurement with the range. Units Before a Number and Ranges require preserving 180 cm
or 70 kg. Exact reviewed/main production comparisons reproduce two source and four package
failures, with two/four passing standalone-prefix controls; main passes all four/eight.
Evidence is retained in `/tmp/parseMeasurement.fractionOwnerFollowupAudit.test.ts` and
`/tmp/afa74-owner-followup-*.log`. This new non-showstopper is deferred under the same review
rule. AFA-242 now has six exact rows across three causes; its status and queue exclusion are
unchanged. These later two reviewed findings are also carried into merge `bfac12a9`; their original
comparison against main `b90ea36` remains intact. The six rows/three causes remain unfixed.

### F2 follow-up — quote pairs, low quotations and compound marks

[AFA-239][quote-follow-up] (Medium) is **unfixed, unassigned and in Backlog**. It groups three
findings deferred under AGENTS.md’s three-review-round rule. This is an audit-only follow-up;
it is not an AFA-74 production change and is outside both active successor queues.

The AFA-78 owner reproduced all six input/option rows with `parseMeasurement` and
`pnpm test:unit` on reviewed [PR #231](https://github.com/afahy/fluent-measures/pull/231)
head `0b7f4d2c2553c9cdf967663d4e4497e4837b7d72`, compared with main `b74d185`:

| Input                               | Options     | Main `b74d185` / expected | Reviewed #231 head |
| ----------------------------------- | ----------- | ------------------------- | ------------------ |
| `72 ’’`                             | default     | `null`                    | 72 ft              |
| `five’’`                            | default     | `null`                    | 5 ft               |
| `he said „five” and weighs 180 lbs` | default     | 180 lb                    | 5 in               |
| `he said ‚five’ and weighs 180 lbs` | default     | 180 lb                    | 5 ft               |
| `5’11” kg 80`                       | default     | 71 in                     | 5 ft               |
| `5’11” kg 80`                       | weight type | 80 kg                     | 11 kg              |

PR #231 subsequently merged as `ef39a7b5fde9a33fd10789a2f25365fed30d0d43` from that reviewed
head, carrying these six regressions into main. The comparison above retains the original
`b74d185` baseline. All 19 PR checks and all 12 exact-merge main CI jobs passed. The expected values follow paired-apostrophe rejection,
quotations having no measurement unit, and 5 × 12 + 11 = 71 in with a separate 80 kg weight.
ASCII and prime controls retained the expected results on both revisions.

The M1 causes are partial conversion of paired curly marks; failure to recognize low opening
quotation marks `„` and `‚`; and removal of a compound height’s inch mark before a separate
prefix-unit weight. The quote-context regressions and generated result snapshot missed these
combinations. AFA-239 requires extending that coverage with failing-first source/ESM/CommonJS
regressions and ticket-sourced corpus entries. No fix or assignment is claimed here. The
original `b79eae0` baseline, 22-test embedded harness/counts and historical F2 evidence remain
unchanged; this note is a follow-up within F2, not a replacement baseline.

### F5 correction — signed supported weight ownership

Status: complete. [PR #234](https://github.com/afahy/fluent-measures/pull/234) merged reviewed
head `0a33c40cae92536b69dcf961349ece4ec5ac5c2f` as
`77bd5ce63549ca25c4bdb6a425add7f0c5687787`. All 19 PR checks and final pre/post-merge
comment audits passed. All 12 exact-merge main CI jobs passed in
[run 42314274182](https://github.com/afahy/fluent-measures/actions/runs/42314274182);
`ci-ok` completed at 2026-11-06T23:54:24Z. Implementation remains `938c2ff`, with the review
correction at `488bced`, full validation at `9030111` and fresh merged-main validation at
`5c9eab1`. Before: `ef39a7b5fde9a33fd10789a2f25365fed30d0d43` (main).
The original `b79eae0` audit row and 22-test evidence remain historical.

All four ticket inputs now return `null`, with default options and with `type: 'weight'`:
`kg -twenty five 5 grams; actual 70 kg`, `kg -20 5 grams; actual 70 kg`,
`kg -twenty five,5 grams; actual 70 kg`, and `kg -twenty five; 5 grams; actual 70 kg`.
Previously each returned 70 kg. The single backward ownership lookup now reads signed phrases
at every existing separator; no tokenizer or other-type ownership code changes.

Permanent regressions: `tests/parseMeasurement.signedWeightOwnership.test.ts` and the explicitly
authorized preservation-assertion corrections in `tests/parseMeasurement.commaWeightOwnership.test.ts`.
Expectations come from the ticket, public unsupported-unit rules and hand calculations.
The new suite covers supported aliases, labels, decimals, fractions, words, separators, fuzzy
units, normalization, independent fields and height selection. `stone -5 lb; actual 70 kg`
retains exactly one 70 kg match. Public examples and generated result snapshots are unchanged.

The four existing ticket-sourced corpus rows now agree; fourteen new rows cover explicit weight
selection, related supported-prefix forms and internal semicolons. No previous corpus agreement is lost.
Other-type signed ownership, Unicode sign normalization, unsupported-prefix ownership and
quotation regressions remain separate. The independently reproduced `kg 1/2` numerator bug
is already AFA-238; its evidence was added there, and the AFA-74 session owns the audit follow-up.

The independent review found one additional on-main F5 failure among 100 probes:
`kg; -20 5 grams; actual 70 kg` returned 70 kg on both `fd990ba` and main `ef39a7b`.
The signed reader ends immediately before its sign, so an internal semicolon still hid the
supported prefix. The correction at `488bced` skips those semicolons at the same backward
lookup. It also changes `kg;; -twenty five 5 grams; actual 70 kg` and
`kg; -two and a half 5 grams; actual 70 kg` from 70 kg to `null`, each with default and weight
options. These follow PARSING.md's existing semicolon and unsupported-unit rules. Decision
rule 2 keeps the same-location finding here, with a ticket comment and PR scope disclosure.
No existing semicolon-field, cross-type or Unicode-sign assertion changes.

### F6 correction — compact heights and bare centimeters

Status: complete. [PR #242](https://github.com/afahy/fluent-measures/pull/242) squash-merged
reviewed head `efc60dbd749dd0b11af2592b15a9b5c7222b51c6` as
`70f31690c4835ab97d60bf4af9c7a48d2f57d878` at 2026-11-07T17:17:33Z. All 19 PR checks,
exact-head Codex review, final whole-diff review and pre/post-merge comment audits passed.
All 12 jobs in exact-merge main CI run `42395577155` passed;
[ci-ok](https://github.com/afahy/fluent-measures/actions/runs/42395577155/job/128473657888)
succeeded at 2026-11-07T17:23:48Z.

Combined source `2c3c6931a08ce71eafa8d997db5a906404f3fc66` normally merged selected main
`c670d12eadcd81a58e184236b3169e6d20ea5c72`; its full check, fresh mutation,
changed-line/source-byte and package evidence below remains the validation baseline. Later
`c7e3f1fa` and `efc60db` commits changed only this audit. The merged source tree
`4a722807146f3a92ca07da493426ebbeaee46a6e` and tests tree
`95806a5f77cbceee2ffe647f0565199bae221fa7` match that validated source.

Only the merged worktree and local branch were removed. Evidence is archived at
`/Users/afahy/.t3/artifacts/fluent-measures/afa-62-efc60db/`; its `closeout.json`, CI proof,
cleanup record and preservation list retain all three AFA-62 stashes:
`6a09864090c14d25baba2141a4f0222d4ceb8c5f`,
`1cc769e26022b41e2b2ecef711360a2f12e79d67` and
`b7c47c50f14efdfb2af0f041021eebeab75b0e01`. Root main is synchronized; the unrelated docs
edit remains separately archived and stashed by its owner. No local allocation remains.
The late comma/zero-sign findings and earlier separator findings remain explicitly unfixed
under AFA-250; completion of F6 does not claim their resolution. Historical baselines below
and deferred AFA-242/244/249 evidence are unchanged.

Historical pre-integration status: final material-guard source was
`512cb75f393db54f938cdcea62023e22eb09c9a8` on the same branch.
The committed source passes the full check, fresh mutation, changed-line/source-byte and
package validation recorded below. Hosted checks/review and integration remain with the
existing parent; this is not a merge-completion claim. The branch normally integrated test-only
main `b632655431b674e921cb5170b16bdf8840d7245a`. Initial implementation
`8660ec630e723645e67db20467aec760189fea9e`, independent-probe corrections and earlier
`fccf4a7`/`a6cb36a` reports remain historical evidence below.
The base runtime source matches `e1d3a457c1aa5f8dd613f06b7205d5f25fc68f61`. Initial failing-first evidence remains at
`bfac12a943720390c60afd26a522cb67dfa20fa3`: the 15 ticket cases fail there and the 15 original
preservation controls pass. The expanded 84-case focused suite fails 46 assertions and passes 38 preservation controls on
exact main `e1d3a457`, then passes all 84 with the correction. This is not a completed PR or
full-validation claim.

M1 now splits compact feet/meter units before numeric commas and fractions, after form
normalization. The same boundary recognizes existing Unicode fractions on either side of the
unit, preserving `5ft½` and `½ft0` when fraction normalization turns them into digits. No
second compact scan was added; the old M2 location was removed. Complete token boundaries keep decimal identifiers such
as `abc1.5ft11` intact. The same guard excludes Unicode combining marks, preserving
`e\u03011m80` and `e\u03015ft11` as identifiers alongside `é1m80`. M6 recognizes the exact short aliases `kgs` and `cms`; their length keeps
them outside fuzzy acceptance. M7 reuses `NEXT_PART` and the existing conversion factor for
bare centimeters instead of adding a second number reader. Explicit centimeters retain the
ordinary unit scan and its zero-ownership rules: `1 m 0 cm 80 kg` still returns 1 m. A
word-comma boundary also retains its metric label rule: `1 m seventy, 5 cm` is still 105 cm.
The existing explicit-inch and bare-inch comma paths remain unchanged. The zero larger-part
guard now uses `NEXT_PART` too, so `zero meters eighty` is 80 cm rather than 80 m. Bare smaller
parts still need a positive value below one larger unit.

| Ticket input                               | Before (`e1d3a457`) | Focused implementation |
| ------------------------------------------ | ------------------- | ---------------------- |
| `5ft11`, `5ft11in`, `5ft11"`, `5ft.11in.`  | `null`              | 71 in                  |
| `6ft2`, `6foot2`                           | `null`              | 74 in                  |
| `6ft1in`                                   | `null`              | 73 in                  |
| `1m75`, normalized cm                      | `null`              | 175 cm                 |
| `1m80`, including normalized cm            | `null`              | 180 cm                 |
| `70kgs`                                    | `null`              | 70 kg                  |
| `175cms`                                   | `null`              | 175 cm                 |
| `1 m 80`, `1 meter 80`, `one meter eighty` | 1 m                 | 180 cm                 |
| `6 1-2ft3in`                               | `null`              | 75 in                  |
| `0m80`, `0meter80`                         | `null`              | 80 cm                  |
| `0 meter 80`, `zero meters eighty`         | 80 m                | 80 cm                  |
| `0 meter 100`, `zero meters one hundred`   | 100 m               | `null`                 |

The last row is an additional result change under decision rule 3. Treating zero meters as the
larger part removes its unit-prefix recovery for an oversized bare smaller part. Preserving
that recovery would need another distinction/number read; the correction instead applies the
existing feet rule through `NEXT_PART`. This decision is disclosed to the parent and ticket.

Regression path: `tests/parseMeasurement.compactUnits.test.ts`. The initial 21 ticket-sourced
corpus additions cover the failures and zero-part boundaries; nine probe/invalid-comma rows
bring the additions to 30. All 719 main rows remain byte identical;
the new score is 749 rows, 740 agreements, 6 wrong, 3 missed and no throws. Only the 12 old
compact misses change category, all to agreement. The minor changeset records the non-null metric shorthand changes.
Bare `1 m`, public examples, exported types, signs, range ownership and the prior F1–F9
corrections are preserved. No existing corpus row or expectation is edited. The F3 normalization
and backtracking correction merges unchanged; the uppercase internal `RANGE` marker remains
unchanged for later integration with the separate spoken-decimal work. AFA-242, AFA-244 and
AFA-249 remain separate, with their historical comparisons and ownership intact.

The independent probe compared `8660ec6` with exact main `24add56`: 129/136 agreed on the
branch and 68/136 on main. Its seven findings were reproduced before correction; expectations
were authored before execution. The corrected source replays all 136 successfully, changing
exactly those seven branch results in this corpus. M7 now calls the existing suffix-ownership
reader for bare centimeters instead of duplicating its semicolon/label rules. Its bare mode
retains the existing immediate, unsigned read; the feet path is unchanged.

| Input and options                                       | Main `24add56` | Branch `8660ec6` | Corrected source |
| ------------------------------------------------------- | -------------- | ---------------- | ---------------- |
| `5ft11,5in`                                             | 5 in           | `null`           | 71.5 in          |
| `1m80,5`, normalized cm                                 | `null`         | 180 cm           | 180.5 cm         |
| `1 m 80;kg`, `1 m 80;kgs`, `1 m 80 (kg)`, normalized cm | 100 cm         | 180 cm           | 100 cm           |
| `1 m 80 (m)`, `1 m 80;in`, height type                  | `null`         | 180 cm           | `null`           |

The same comma correction also changes `5FT11,05in` from 5 in on main to 71.05 in,
`5ft.11,5in.` from 5 in to 71.5 in, `1m80,05` from `null` to 180.05 cm, and
`1m80,5cms` from `null` to 180.5 cm. Invalid `5ft11,12,345in` changes from 12345 in
on main to `null`; `1m80,12,345` stays `null` on main but corrects the initial branch's
180 cm. These follow the documented decimal-comma and malformed-group rules in compact
parts. Unit-prefix `ft11,5` changes from `null` on main (137 in on the initial branch) to
11.5 ft through that same boundary. The earlier zero-meter decision-rule-3 changes remain
listed above. No previous corpus agreement is lost.

Seven fraction controls preserve the initial branch while moving the boundary, including
`5ft½` = 60.5 in and `½ft0` = 0.5 ft. Self-review caught and corrected those ordering
regressions before handoff. Complexity added is one bare-read mode in the existing ownership
reader and fraction characters in the relocated compact boundary, with no new parser pass.
The obscure `1 m seventy, 5 cm` recovery remains a separate simplification candidate; no
AFA-250–254 policy/API change is included. Later bundle measurements are recorded below;
focused test elapsed time is not a benchmark and no performance improvement is claimed.

Final-validation follow-up at source commit `03609786b2bb26c3ab825d50b594625c00e2846d`:
the first complete coverage attempt stopped with 4,138 passing tests and seven failures
before mutation/build/package stages. One rejection assertion contradicted the ticket's exact
`kgs` alias, five compact mark/hyphen assertions reflected previously unreadable heights,
and the generated snapshot had 160 changed rows across 33 unchanged inputs. This is partial
validation evidence, not a completed coverage/check result.

The parent confirmed the ticket-directed compact-to-spaced migrations. Each original literal
is retained with a strict result, with height/weight selectors added. Exact-main `24add56`
spaced counterparts passed four tests (the two spellings `5ft` and `5 ft` share one counterpart):

| Original input                      | Main   | Final  | Exact-main spaced counterpart / rationale                                      |
| ----------------------------------- | ------ | ------ | ------------------------------------------------------------------------------ |
| `5ft11"-185 lbs`, `5 ft11"-185 lbs` | 185 lb | 71 in  | `5 ft 11"-185 lbs`: 5 × 12 + 11 = 71 in; weight selector stays 185 lb          |
| `five ft11"-185 lbs`                | 185 lb | 71 in  | `five ft 11"-185 lbs`: same arithmetic; weight selector stays 185 lb           |
| `5;ft11"-185 lbs`                   | 185 lb | 71 in  | `5;ft 11"-185 lbs`: existing semicolon ownership; weight selector stays 185 lb |
| `1m80"-5 in`                        | 5 in   | `null` | `1 m 80"-5 in`: 1 meter, 80 inches and 5 inches disagree                       |

The exact `kgs`/`cms` aliases are asserted even with fuzziness enabled; independent `kgg`
and `fts` typo rejections remain. No mark/hyphen exception was added. Thirteen corpus rows
pin the five original literals and both explicit selectors, bringing the corpus to 762 rows:
753 agree, 6 wrong, 3 missed, no throws. All former agreements remain, and the 719 baseline
rows remain unchanged. The strict semantic assertions passed before refreshing the generated
snapshot; its generator and option sets are unchanged. Full inventory:

<details>
<summary>All 160 generated result changes (33 inputs)</summary>

<!-- Intentional typo inputs from the fixed generator. cspell:ignore poundz feetlbs -->

Options: `-` default; `h` height; `w` weight; `cm` normalized centimeters; `f2` fuzziness 2; `hu` unqualified metric height. Inputs and option sets are unchanged. These rows arise from the same compact unit splitting and bare-centimeter rules; fractional larger parts expose conflicting measurements, and explicit unit ownership/type selection applies to newly readable compact units.

| Input                                      | Options                    | Before                                              | After                                       |
| ------------------------------------------ | -------------------------- | --------------------------------------------------- | ------------------------------------------- |
| `hundred,m-1/2`                            | `-`, `h`, `f2`, `hu`       | 100 m height                                        | 10000.5 cm height = 100 m + 0.5 cm          |
| `hundred,m-1/2`                            | `cm`                       | 10000 cm height = 100 m                             | 10000.5 cm height = 100 m + 0.5 cm          |
| `1/2,metres,11 2 ounces`                   | `-`, `h`, `f2`, `hu`       | 0.5 m height                                        | null                                        |
| `1/2,metres,11 2 ounces`                   | `cm`                       | 50 cm height = 0.5 m                                | null                                        |
| `10/180 m-80`                              | `-`, `h`, `f2`, `hu`       | 0.05555555555555555 m height                        | null                                        |
| `10/180 m-80`                              | `cm`                       | 5.555555555555555 cm height = 0.05555555555555555 m | null                                        |
| `.5-meter6-kilograms`                      | `-`, `h`, `hu`             | null                                                | 0.5 m height                                |
| `.5-meter6-kilograms`                      | `w`                        | null                                                | 6 kg weight                                 |
| `.5-meter6-kilograms`                      | `cm`                       | null                                                | 50 cm height = 0.5 m                        |
| `5 ¼-m 2`                                  | `-`, `h`, `f2`, `hu`       | 5.25 m height                                       | null                                        |
| `5 ¼-m 2`                                  | `cm`                       | 525 cm height = 5.25 m                              | null                                        |
| `in,eighty meter1,8 #`                     | `-`, `h`, `cm`, `hu`       | null                                                | 8001.8 cm height = 80 m + 1.8 cm            |
| `in,eighty meter1,8 #`                     | `f2`                       | 80 m height                                         | 8001.8 cm height = 80 m + 1.8 cm            |
| `;180.0-meters.5 lbs`                      | `-`, `h`, `f2`, `hu`       | null                                                | 180 m height                                |
| `;180.0-meters.5 lbs`                      | `w`                        | null                                                | 5 lb weight                                 |
| `;180.0-meters.5 lbs`                      | `cm`                       | null                                                | 18000 cm height = 180 m                     |
| `72,5-meters5G`                            | `f2`                       | 72.5 m height                                       | null                                        |
| `150 meter12 pounds 5.5 centimeter`        | `-`, `h`, `cm`, `f2`, `hu` | 5.5 cm height                                       | 15005.5 cm height = 150 m + 5.5 cm          |
| `150 meter12 pounds 5.5 centimeter`        | `w`                        | 5.5 lb weight                                       | 12 lb weight                                |
| `180 feet6`                                | `-`, `h`, `hu`             | null                                                | 2166 in height = 180 ft + 6 in              |
| `180 feet6`                                | `cm`                       | null                                                | 5501.639999999999 cm height = 180 ft + 6 in |
| `180 feet6`                                | `f2`                       | 180 ft height                                       | 2166 in height = 180 ft + 6 in              |
| `m-hundred,meters5.5`                      | `-`, `h`, `cm`, `f2`, `hu` | null                                                | 10005.5 cm height = 100 m + 5.5 cm          |
| `five pounds 72 meter eleven`              | `-`, `h`, `f2`, `hu`       | 72 m height                                         | 7211 cm height = 72 m + 11 cm               |
| `five pounds 72 meter eleven`              | `cm`                       | 7200 cm height = 72 m                               | 7211 cm height = 72 m + 11 cm               |
| `feet1/2 #`                                | `-`, `h`, `hu`             | null                                                | 14 in height = 1 ft + 2 in                  |
| `feet1/2 #`                                | `cm`                       | null                                                | 35.56 cm height = 1 ft + 2 in               |
| `feet1/2 #`                                | `f2`                       | 2 ft height                                         | 14 in height = 1 ft + 2 in                  |
| `1/2meter1/2-stone-5.11centimeters`        | `-`, `h`, `cm`, `hu`       | 5.11 cm height                                      | null                                        |
| `6,kilogram 12 m1′`                        | `-`, `f2`                  | 6 kg weight                                         | null                                        |
| `.5 metres,eleven ''`                      | `-`, `h`, `f2`, `hu`       | 0.5 m height                                        | null                                        |
| `.5 metres,eleven ''`                      | `cm`                       | 50 cm height = 0.5 m                                | null                                        |
| `1000 m5.11-lbs-180.0`                     | `-`, `f2`                  | 180 lb weight                                       | 1000 m height                               |
| `1000 m5.11-lbs-180.0`                     | `h`, `hu`                  | null                                                | 1000 m height                               |
| `1000 m5.11-lbs-180.0`                     | `w`                        | 180 lb weight                                       | 5.11 lb weight                              |
| `1000 m5.11-lbs-180.0`                     | `cm`                       | null                                                | 100000 cm height = 1000 m                   |
| `180.0,kg-5.5metres-12`                    | `-`, `h`, `f2`, `hu`       | 5.5 m height                                        | null                                        |
| `180.0,kg-5.5metres-12`                    | `cm`                       | 550 cm height = 5.5 m                               | null                                        |
| `5-pounds 5.5,meters 80,poundz`            | `-`, `h`, `hu`             | 5.5 m height                                        | null                                        |
| `5-pounds 5.5,meters 80,poundz`            | `cm`                       | 550 cm height = 5.5 m                               | null                                        |
| `2 ft½ kilo`                               | `-`, `h`, `f2`, `hu`       | null                                                | 2 ft height                                 |
| `2 ft½ kilo`                               | `w`                        | null                                                | 0.5 kg weight                               |
| `2 ft½ kilo`                               | `cm`                       | null                                                | 60.96 cm height = 2 ft                      |
| `1,234.5,feet180.0,kilogram-72 centimeter` | `w`                        | null                                                | 180 kg weight                               |
| `six,feet5.5,feetlbs`                      | `-`, `h`, `f2`, `hu`       | null                                                | 77.5 in height = 6 ft + 5.5 in              |
| `six,feet5.5,feetlbs`                      | `cm`                       | null                                                | 196.85 cm height = 6 ft + 5.5 in            |
| `180.0meter70 kg`                          | `-`, `h`, `f2`, `hu`       | null                                                | 180 m height                                |
| `180.0meter70 kg`                          | `w`                        | null                                                | 70 kg weight                                |
| `180.0meter70 kg`                          | `cm`                       | null                                                | 18000 cm height = 180 m                     |
| `in=1,8-meter0-′`                          | `-`, `h`, `f2`, `hu`       | 1.8 in height                                       | 1.8 m height                                |
| `in=1,8-meter0-′`                          | `cm`                       | 4.572 cm height = 1.8 in                            | 180 cm height = 1.8 m                       |
| `1,8 m,eighty,12,kilogram`                 | `-`, `h`, `f2`, `hu`       | 1.8 m height                                        | null                                        |
| `1,8 m,eighty,12,kilogram`                 | `cm`                       | 180 cm height = 1.8 m                               | null                                        |
| `one meters 80`                            | `-`, `h`, `f2`, `hu`       | 1 m height                                          | 180 cm height = 1 m + 80 cm                 |
| `one meters 80`                            | `cm`                       | 100 cm height = 1 m                                 | 180 cm height = 1 m + 80 cm                 |
| `1,8,m70,kg`                               | `-`, `h`, `f2`, `hu`       | null                                                | 1.8 m height                                |
| `1,8,m70,kg`                               | `w`                        | null                                                | 70 kg weight                                |
| `1,8,m70,kg`                               | `cm`                       | null                                                | 180 cm height = 1.8 m                       |
| `foot1`                                    | `-`, `h`, `f2`, `hu`       | null                                                | 1 ft height                                 |
| `foot1`                                    | `cm`                       | null                                                | 30.48 cm height = 1 ft                      |
| `10/180,kilograms 11 feet12pounds`         | `-`, `f2`                  | 0.05555555555555555 kg weight                       | 11 ft height                                |
| `10/180,kilograms 11 feet12pounds`         | `h`, `hu`                  | null                                                | 11 ft height                                |
| `10/180,kilograms 11 feet12pounds`         | `w`                        | 0.05555555555555555 kg weight                       | null                                        |
| `10/180,kilograms 11 feet12pounds`         | `cm`                       | null                                                | 335.28000000000003 cm height = 11 ft        |
| `72m72 kilo`                               | `-`, `h`, `f2`, `hu`       | null                                                | 72 m height                                 |
| `72m72 kilo`                               | `w`                        | null                                                | 72 kg weight                                |
| `72m72 kilo`                               | `cm`                       | null                                                | 7200 cm height = 72 m                       |
| `5 meters80,′-tall`                        | `-`, `h`, `cm`, `f2`, `hu` | null                                                | 580 cm height = 5 m + 80 cm                 |
| `six meters2`                              | `-`, `h`, `cm`, `hu`       | null                                                | 602 cm height = 6 m + 2 cm                  |
| `six meters2`                              | `f2`                       | 6 m height                                          | 602 cm height = 6 m + 2 cm                  |
| `meters,5 2`                               | `-`, `h`, `f2`, `hu`       | 5 m height                                          | 502 cm height = 5 m + 2 cm                  |
| `meters,5 2`                               | `cm`                       | 500 cm height = 5 m                                 | 502 cm height = 5 m + 2 cm                  |

</details>

A separate serialized build measured exact `b632655` and restored source `0360978` byte for
byte: ESM 5,294 → 5,371 bytes (+77), CJS 5,329 → 5,427 bytes (+98), both below the
5,500-byte limits. The API report passes. No size allowance, parser compression or performance
claim is needed. Logs: `/tmp/afa-62-size-base.json`, `/tmp/afa-62-size-head.json`, and
`/tmp/afa-62-mark-spaced-main.log`. The final committed-test validation will follow the normal
correction hooks; the failed check remains separately recorded.

Committed validation at `fccf4a765e28183e9902afc6c1993c98b9f4c43b`: `pnpm check` passed
4,153 tests with 100% statement/branch/function/line coverage, TypeScript, a fresh non-incremental
mutation score of 99.66% (1,436 killed, 13 timed out, 5 surviving, 34 ignored), build, size,
API and all 4,990 ESM/CommonJS package tests. All eight selected source files match the
committed source bytes; report SHA-256
`0b03e84996d081b656b3b36c62c929bed6fff8d1b338b92a87c534d21b8a87cf`.
The separate changed-line check found one equivalent BooleanLiteral mutant on the meters-only
`readValueAfter` call: its label flag cannot affect ownership because `m` is already in
`LABEL_ALIASES`. A one-line explanation disables only that argument's mutant; the separate
bare-read argument remains under mutation testing. The original report is preserved at
`/tmp/afa-62-mutation-fccf4a7.json`. Fresh final-source mutation verification follows that
annotation; the previous full-check result is preserved separately.

The subsequent narrow mutation annotation at `a6cb36a64b5f5c00c4dc16be1ef21f0ef5753e31`
passed a fresh non-incremental run: 99.72%, 1,431 killed, 18 timed out, four survivors outside
changed lines and 35 ignored (one more than the preserved `fccf4a7` report). Changed-line and
exact source-byte verification passed. Report SHA-256:
`cc02ef7551d7986811cf9719b19c044e3cb6c15e4f8ddd2573d787cc79a93b63`.
Its normal first push hook passed; the branch was pushed without opening a PR yet.

Final guard review then reproduced two identifier regressions: `e\u03011m80` and
`e\u03015ft11` (literal `e`, U+0301 combining acute accent, then the digits/unit) returned
180 cm and 71 in at `a6cb36a`. Both return `null` in the exact-main `b632655` build.
The single-character accented `é1m80` control already returns `null`. The parent confirmed that preserving
these decomposed identifiers is required by the ticket. The correction adds `\p{M}` to the
existing compact-prefix exclusion, with no new normalization pass. Both exact escaped spellings
are regression/corpus cases; ordinary compact and Unicode-fraction positives remain.
The corpus now has 764 rows, 755 agree, 6 wrong, 3 missed, no throws. Prior source evidence is
historical; this material guard change requires its own committed full check and fresh mutation,
changed-line/source-byte/package/size evidence. Reproduction logs:
`/tmp/afa-62-identifier-review.log` and `/tmp/afa-62-identifier-review-main.log`.
The corrected source passes 453 focused tests, including 108 compact cases, and replays all
136 independently specified inputs. Logs: `/tmp/afa-62-combining-focused.log` and
`/tmp/afa-62-combining-probe-replay.log`. The temporary replay harness was removed; its
results remain in `/tmp/afa-62-combining-probe-replay.json`.

Final material-guard validation is pinned to committed source
`512cb75f393db54f938cdcea62023e22eb09c9a8`. `pnpm install --frozen-lockfile` had already
passed with unchanged manifests. One fresh `pnpm check` passed all stages: lint, 4,155 tests
in 111 files, 100% statements (459/459), branches (436/436), functions (71/71), lines
(393/393), TypeScript, fresh non-incremental mutation, build, size, exported API and 4,994
ESM/CommonJS package tests in 112 files. The two pre-existing ESLint return-type warnings in
`tests/docsMenus.test.ts` and `tests/evidence.test.ts` remain; no warning was added.
Log: `/tmp/afa-62-final-check-512cb75.log`.

The same full check supplied the final mutation report; no duplicate mutation run was needed.
It scores 99.72%: 1,432 killed, 17 timed out, four surviving outside changed lines and 35 ignored
among 1,488 mutants. The four survivors match the preserved `a6cb36a` report. The explained
label-flag annotation accounts for the increase from the historical 34 ignored mutants;
the distinct bare-read flag remains under mutation testing. The changed-line command
`node .github/scripts/mutation-check.mjs --base b632655 --report reports/mutation/mutation.json`
passes. The source inventory contains eight files, all matching the committed bytes. The
mutation JSON contains six source-file records (`index.ts` and `types.ts` contain no mutants);
all six report source bodies match byte-for-byte.

- Source tree: `6bec6b8ca9790f917223ccc2ecefa1072f00932d`.
- Tests tree: `0890eb11276a8f288d91b555c0502e02591bc805`.
- Report SHA-256: `e78dfce3c4ef5663a89f187b25c9b00b72a6f8d5cdcc7c0c84f8d095df7e5dd9`.
- Preserved report: `/tmp/afa-62-mutation-512cb75.json`.
- Exact source manifest: `/tmp/afa-62-check-source-512cb75.json`.
- Verification: `/tmp/afa-62-mutation-512cb75-verification.json` and
  `/tmp/afa-62-changed-lines-512cb75.log`.

Final minified/Brotli sizes against exact base `b632655`: ESM 5,294 → 5,365 bytes (+71),
CommonJS 5,329 → 5,418 bytes (+89), both below the unchanged 5,500-byte limits. No performance
improvement is claimed. Sizes are preserved in `/tmp/afa-62-size-base.json` and
`/tmp/afa-62-size-512cb75.json`. Normal correction commit and source push hooks passed; the
push log is `/tmp/afa-62-source-push-512cb75.log`. This audit-only follow-up adds the actual PR
link and final evidence while preserving the validated source/tests trees. The parent owns
subsequent hosted checks, review, merge and exact-main CI; the existing child does not watch or
merge. Both preservation stashes remain. The unrelated scheduling overlap was resolved by the
coordinator before this final check began; no unrelated process was changed by this owner.

The earlier full-coverage attempt was interrupted with exit 130 during the coordinator hold;
it supplies no completed coverage evidence. The failed `0360978` coverage and successful
`fccf4a7`/`a6cb36a` runs remain tied to their original source; only the fresh `512cb75` full
check validates the material combining-mark correction. The completed predecessor's
validations do not validate this fix.

First hosted review at `512cb75` reported `1.8 m 25 years`: exact main `24add56` returns
1.8 m, while this branch returns `null` (also with a height or centimeter selector). Ten
focused public-input checks reproduced that change and its controls. The parser does not
combine the fractional meter value with centimeters: the unchanged whole-number compound
condition leaves two disagreeing readings, just as `1.8 m 25 cm` and the existing
`5.5 ft 2 years` feet rule return `null`. This is a consequence of the ticket's bare-centimeter
rule, recorded alongside the earlier fractional-part result inventory; no compatibility
exception was added. `1.8 m` remains unchanged. The same probe records `1 m 25 years`
(1 m to 125 cm) and `10m2` (`null` to 1,002 cm), which follow the bare/compact rule without
adding age or area-unit interpretation. AFA-250 separately rejects unrelated prose.
Expectations, results and the removed temporary harness are preserved in
`/tmp/afa62-parent-review-expectations.json`, `/tmp/afa62-parent-review-results.json` and
`/tmp/afa62-parent-review.test.ts.txt`. The compact-mark expectation migrations follow the
ticket's explicit compact-to-spaced requirement, as recorded in comment
`b2b95c57-5bb2-4fc4-bf8d-83f34dac0d50`; all original literals and strict selector assertions
remain. The follow-up public documentation lists `kgs`/`cms` and the compact/bare-meter rules;
it changes no source, test, corpus or previously documented result.

At the focused preparation handoff, integration retained the same F6 owner and PR, with HEAD at
`19611675174e4515ecc35d380b2de7b44d6ce776` and a normal, uncommitted merge of main
`c670d12eadcd81a58e184236b3169e6d20ea5c72`. The selected base includes reviewed/merged
PRs #239 and #238 plus the later documentation changes. Its exact-main CI also passed in
run `42390133306`, with
[ci-ok](https://github.com/afahy/fluent-measures/actions/runs/42390133306/job/128457575824)
complete at 2026-11-07T16:19:52Z. This does not validate the combined branch.

The parent-reviewed README/PARSING/audit delta (+34/-2) was archived and stashed as
`b7c47c50f14efdfb2af0f041021eebeab75b0e01`, then reapplied without dropping it. The earlier
`1cc769e26022b41e2b2ecef711360a2f12e79d67` and `6a09864090c14d25baba2141a4f0222d4ceb8c5f`
stashes remain. The merge stopped before committing; no commit/post-merge hook or install
ran. Main's `package.json` adds a documentation script; its normal post-merge hook would
install when that path runs. Required install and merge-completion hooks remain for the later
coordinator grant.

The bounded conflict resolution retains M1's compact split before numeric commas/fractions,
including Unicode letter/number/combining-mark identifier exclusion. M2 keeps the merged
range endpoint/slash ownership, uppercase `RANGE`, decimal boundary and semicolon field
metadata. M4/M5/M7 compose the existing flags: bare centimeters read immediately without
skipping a semicolon or accepting a sign, and use the same saved integer stop as bare inches.
The unsigned feet-prefix read keeps main's stop; signed re-reads consume the complete phrase.
No extra normalization pass, grammar, type or policy is introduced.

Fourteen strict combined cases were specified before testing, from shorthand arithmetic and
explicit ownership. They fail ten assertions (four controls pass) on branch `1961167` and
seven assertions (seven controls pass) on main `c670d12`; all fourteen pass on the integration.
The expanded compact suite has 122 passing tests. Five rows in the combined corpus have
results different from both parent sources; all five are newly added integration cases:

| Input / options                   | Branch `1961167` | Main `c670d12` | Combined |
| --------------------------------- | ---------------- | -------------- | -------- |
| `1 m eighty point five`, cm       | 180 cm           | 100 cm         | 180.5 cm |
| `one meter eighty point five`, cm | 180 cm           | 100 cm         | 180.5 cm |
| `1m80 point five`, cm             | 180 cm           | `null`         | 180.5 cm |
| `5ft11 point five`, height        | 71 in            | `null`         | 71.5 in  |
| `ft5 eleven point five`, height   | 71 in            | `null`         | 71.5 in  |

The other nine cases preserve a result from at least one parent, including the 180-cm bare
part before a separate spoken weight, explicit suffix ownership, signed/semicolon/invalid
smaller parts, and compact range/slash heights of 70 and 83 inches. All 914 main corpus rows
and 45 original branch additions remain byte-identical; fourteen new ticket-sourced rows
bring the total to 973. The expected snapshot was derived from the two committed scores plus
these independently specified additions: 964 agree, six wrong, three missed, no throws.
The public-input inventory loses no former agreement from either parent. The 136 original
independent probes replay successfully. The generated input/options/result snapshot remains
unchanged from `1961167`; no integration-only generated result migration was needed.

Evidence is under `/tmp/afa-62-main-integration.99ezq0m0/`: the original docs patch and hash,
source snapshots (not worktrees), `integration-expectations.json`, `integration-baselines.json`,
`integration-only-results.json`, `corpus-inventory.json`, and `independent-probe-replay.json`.
An initial 646-test selected run passed. Feature-map validation then found the new public
`Compact Heights` heading lacked its map link; the feet/inches feature now links it. Final
selected validation passes 1,064 tests in 21 files, with scoped ESLint, formatting, spelling
and diff checks passing. Log: `/tmp/afa-62-main-integration.99ezq0m0/focused-final.log`.
The staged source tree is `4a722807146f3a92ca07da493426ebbeaee46a6e`;
the staged tests tree is `95806a5f77cbceee2ffe647f0565199bae221fa7`.
The complete staged tree and exact diff hashes are recorded in the focused handoff manifest.
At that handoff, no full check, coverage, mutation, build, API/package, size or push validation
had run for the combined source. Earlier full-check/report/size evidence above remains historical.
The separately granted committed validation follows.

Combined validation completed under the explicit coordinator grant at normal merge commit
`2c3c6931a08ce71eafa8d997db5a906404f3fc66`. Normal commit hooks preserved the exact reviewed
tree `9e80cbbab4908f7d47fec3a21528f220c2183102`; `pnpm install --frozen-lockfile` passed.
One fresh `pnpm check` passed lint, 4,483 source tests in 119 files, 100% statements (481/481),
branches (476/476), functions (73/73), lines (413/413), TypeScript, fresh non-incremental
mutation, build, size, unchanged exported API and 5,580 ESM/CommonJS package tests in 126 files.
The same two pre-existing ESLint return-type warnings remain; no warning was added.

That check's mutation report scores 99.74%: 1,516 killed, 25 timed out, four surviving and
33 ignored among 1,578 mutants. All four survivors have the same original source span,
mutator and replacement as the historical `512cb75` survivors, outside this PR's changed lines.
`node .github/scripts/mutation-check.mjs --base c670d12eadcd81a58e184236b3169e6d20ea5c72 --report reports/mutation/mutation.json`
passes: 115 changed-line mutants are killed and four are explained ignores, with no surviving
or uncovered changed-line mutant. All eight selected source files match the commit; all six
mutation-report source bodies match byte-for-byte (`index.ts`/`types.ts` have no mutants).
No duplicate mutation run was needed. The total ignored count is now 33 rather than the old
35: main's revised phrase reader removed two historical ignored mutations; no ignore directive
was added during integration. The explained meters label flag remains ignored, while its
separate bare-read flag remains tested.

- Validated source tree: `4a722807146f3a92ca07da493426ebbeaee46a6e`.
- Validated tests tree: `95806a5f77cbceee2ffe647f0565199bae221fa7`.
- Report SHA-256: `c828f6dd9243ed3ee6fa0cd07c38889a9548da3d2e57e493634846f21d9c9823`.
- Evidence directory: `/tmp/afa-62-main-integration.99ezq0m0/`.
- Full check: `check-2c3c693.log`; source manifest: `committed-source.json`.
- Preserved fresh report: `mutation-2c3c693.json`; byte verification: `mutation-verification.json`.
- Survivor/changed-line inventory: `mutation-analysis.json`; required check: `changed-lines.log`.

Exact selected-main versus combined minified/Brotli sizes are ESM 5,641 → 5,736 bytes (+95)
and CommonJS 5,694 → 5,795 bytes (+101), within main's unchanged 6,000-byte limits.
The main measurement uses an exact Git-blob source/config fixture with the identical frozen
dependencies, not a worktree or source swap; its manifest verifies every copied byte before
and after the build. The final checkout source/build stays intact. Evidence: `size-main.json`,
`size-final.json`, `main-size-fixture-manifest.json` and `build-2c3c693.json` in the directory
above. No performance improvement is claimed. The integration reuses the existing read flags;
there is no extra normalization pass. The preserved `1 m seventy, 5 cm` recovery remains a
separate simplification candidate.

This follow-up changes only the audit; source and test trees remain identical to validated
`2c3c693`. All three preservation stashes and the original audit/deferred findings remain.
The normal mandatory push hooks and exact published head are recorded separately in the PR,
ticket and parent handoff after they finish. Hosted lifecycle stays with the parent.

Third-round Codex review of `c7e3f1fa` reported two further families. Both reproduce and remain
unfixed here, filed with the existing AFA-250 complete-entry owner in comment
[`685016b0`](https://linear.app/afahy/issue/AFA-250#comment-685016b0-2653-43a4-af7c-a7c141f0be3a).
These are new late inputs, not failures of an existing example/test, a throw, security issue or
required check. The three-round rule defers them; the successful source validation above does
not imply these inputs are correct.

| Input and selector                            | Main `c670d12` | PR `c7e3f1fa` | Current contract           | Approved AFA-250 contract |
| --------------------------------------------- | -------------- | ------------- | -------------------------- | ------------------------- |
| `one meter eighty, 5ft11`                     | 1 m            | null          | 180 cm (agreeing readings) | null (duplicate readings) |
| `one meter eighty, seventy kilograms`, height | 1 m            | 1 m           | 180 cm                     | 180 cm (selected pair)    |
| `0 meters -80, 180 cm`                        | null           | 180 cm        | null                       | null                      |
| `zero meters -eighty, 180 cm`                 | null           | 180 cm        | null                       | null                      |

The comma exclusion preserves `1 m seventy, 5 cm` but drops other spoken smaller parts; the
zero-meter compound path bypasses signed-prefix field rejection. Fourteen public-input checks
were specified before execution: four fail and ten controls pass, using the repository's narrow
unit script and the verified exact-main build. The controls retain explicit centimeter ownership,
digit counterparts, independent semicolon fields, other-type signed ownership, Unicode signs,
zero-meter shorthand and `kg-70.5` rejection. Evidence remains outside the checkout in
`/tmp/afa62-late-review-c7e3f1f/`; no parser, test, corpus or snapshot changes accompany this
disposition. AFA-250 must distinguish its intentional duplicate/prose policy migration from
these historical failures. This is deferred evidence, separate from the F6 fixes completed here.

### F7 correction — signed values with their own other-type unit

Status: complete. [PR #235](https://github.com/afahy/fluent-measures/pull/235) merged reviewed
head `28c3d21deb7b9e90964c00b465c6b15f234a74ea` as
`b90ea362408c5f7023d4878a760a208f014c75a6`. All 19 PR checks, exact-head Codex review and
final pre/post-merge audits passed. All 12 exact-merge main CI jobs passed in run 42319687195;
[ci-ok](https://github.com/afahy/fluent-measures/actions/runs/42319687195/job/128242976006)
completed at 2026-11-07T00:47:02Z. The
[final lifecycle record](https://github.com/afahy/fluent-measures/pull/235#issuecomment-6699839912)
records the ticket Done and removal of only its merged worktree/local branch; original audit
`513b4c3` remains preserved. Implementation remains `1eb0a1b`, with final validation at
`f80b4be`. Before: main `77bd5ce63549ca25c4bdb6a425add7f0c5687787`. The original
`b79eae0` finding and 22-test baseline remain historical evidence.

Both `kg -6 ft, 70 kg` and `kilograms -6 ft, 70 kg` change from `null` to 70 kg.
The forward signed branch now decides ownership before recording invalid fields. It reuses
`readValueAfter`'s existing label/own-unit rules, applying the new exception to unmarked
prefixes only for an own other-type unit. The same-type, unsupported-part and unsigned paths
retain their previous rejection/ownership behavior. No tokenizer, Unicode sign, public type
or public-example change is included.

Permanent regressions: `tests/parseMeasurement.signedOtherTypeOwnership.test.ts`, through
source, ESM and CommonJS. They cover the two exact inputs, explicit type and normalized-unit
selection, aliases, words, fractions, marks, semicolons, reversed types, fuzziness and
conversion. All existing `signedParts` rows are retained; its three duplicated tables now
have distinct named groups for marked other-type labels, semicolon joins and signed words.
The ticket's unsigned 6 ft result, marked-label results and `-5 ft, 150 lbs` → 150 lb remain.

The generated inventory also reaches the same defect through a repeated prime:
`1000,' ′-11pound` changes `null` → 1000 ft for default, height, fuzziness 2 and height with
unqualified metric inference; normalized cm changes `null` → 30480 cm (1000 × 30.48).
Weight-only remains `null`. Five explicit assertions and two corpus rows independently
cover these changes, disclosed on the ticket under decision rule 3.

Retaining a later field also preserves disagreements with earlier independent fields:
`70 kg; kg -6 ft, 80 kg` changes 70 kg → `null` (default and weight-only), and
`180 cm; centimeters -180 lbs, 190 cm` changes 180 cm → `null` (default and height-only).
Both pairs differ by more than 1%, so rejection follows the public agreement rule. Four
failing-first assertions and four corpus rows cover these unavoidable changes, disclosed on
the ticket under decision rule 3. The changeset is therefore minor, superseding the initial
patch choice. All 22 new ticket-sourced correction rows agree; no prior input, expectation,
option or source is changed.

The independent review specified 126 probes before running them on branch `2f26777` and
main `77bd5ce`: 125 agree on the branch, with no newly introduced failure. The sole remaining
case, `kg -6 (ft), 70 kg`, returns `null` on both revisions. Parent probes reproduce the same
failure with a marked `kg:` prefix and with the final `kg` in brackets, in default and explicit
weight modes. This is filed separately as [AFA-241][following-label]: the existing M7 helper
assumes `(ft)` owns the following 70 without checking that 70 has its own kg unit. Fixing that
helper would change existing marked-label behavior, outside this bounded F7 correction.
The ticket records the missed label/property composition and preservation requirements;
no implementation successor is assigned. Three new corpus rows preserve the intended 70 kg
result and record the existing missed outcomes; no prior agreement is lost. Parent replay
confirms 125 agreements and the same one disagreement in each of source, ESM and CommonJS.
M7/M8 still have this distinct known limitation.

### F8 correction — inferred conversion underflow

Implemented at `7426e3e` against current main `b74d185`;
[PR #233](https://github.com/afahy/fluent-measures/pull/233) merged at `b76070d`; exact-merge
[main ci-ok passed](https://github.com/afahy/fluent-measures/actions/runs/42311844267/job/128216783563).
The approved result is `null` when the total after conversion is zero. `combineParts` now
uses the existing zero-total path for both explicit and inferred matches, with no inferred
flag. The finite-overflow fallback in `units.ts` is unchanged.

Permanent regressions: `tests/parseMeasurement.conversionUnderflow.test.ts`, the approved
expectation in `tests/parseMeasurement.unqualifiedNormalization.test.ts`, and the strengthened
`tests/invariants.test.ts`. The new suite checks default and imperial inference for both ticket
heights and the same zero-total case in pounds to kilograms. Controls preserve the ticket's
1e-323 inches and 2.5e-323 centimeters, the smallest positive converted results, metric
inference, explicit-unit rejection, and zero-height fallback to a weight. Expected values come
from the approved ticket and binary64 rounding of exact unit factors, not parser output.

On `b74d185`, the three suites fail 12 tests in source and 24 across ESM/CommonJS; 17 controls
pass in each format. At `7426e3e`, all 29 tests pass in each format. The invariant includes
positive subnormal values in its vocabulary and three deterministic examples so that both normal
and reduced mutation runs reach conversion underflow rather than an input already parsed as zero.
Seven corpus entries with source `AFA-107` all agree; existing corpus outcomes are unchanged.
A minor changeset records the approved change to a previously non-null result.

### F9 correction — finite conversion after intermediate overflow

Status: corrected in [PR #230](https://github.com/afahy/fluent-measures/pull/230), with
implementation at `ecf7a2e` and full checks passed. Failing revision: `b79eae0`; passing source/ESM/CJS revision: `ecf7a2e`.
The published audit was merged into the fix branch from `527f7b5` before this update.

`tests/parseMeasurement.conversionOverflow.test.ts` contains 14 tests. All three historical F9
inputs now return the finite target values listed above. The same cause also affected
`2` + 306 zeros + ` m` normalized to inches (approximately 7.874015748031496e307), and default
or imperial inferred inches to meters. These six cases fail on the baseline and pass with the
fix through source, ESM and CommonJS. Expectations come from the exact unit definitions,
with relative-error tolerance for the large results. The remaining tests check rejection of
truly infinite targets and exact preservation of ordinary conversion rounding.

Six corpus entries with source `AFA-236` cover the four explicit conversions, default inference
and infinite-target rejection. The conversion, units and unqualified feature maps include the
regression suite. An independent failing-input review found 121/121 probes agree on the fix
through source/ESM/CommonJS; 71 disagree on baseline main. No additional finding was reported.
Public examples/types, tokenization and the separately tracked F8 inferred-zero behavior remain
unchanged. This is a bounded arithmetic correction for extreme values, not a tokenizer change.

### Follow-up finding F10 — earlier number hides an unsupported prefix

[AFA-237][prefix-ownership] (Low) was discovered during the F1 fix's self-review and independently
reproduced by the audit coordinator on unchanged `b79eae0` source on 2026-11-06. Both
`twenty, stone 12, 4 lb` and `age twenty, stone 12, 4 lb` return 4 lb instead of `null`.
The documented control `stone 12, 4 lb` still returns `null`.

This is a distinct M8 transition defect: `hasUnsupportedPart` finds the unrelated preceding
`twenty`, chooses its number-before-unit branch, and never follows the valid unit-first stone
amount through to the pounds part. An incomplete weight then reaches M9 success. The expected
rejection follows PARSING.md's Unsupported Units example and the ticket's preservation list.
It is separate from F1's comma-between-number-words boundary and F5's signed backward lookup.
No production change or new fix session has been started for this follow-up ticket.

Evidence: a separate `pnpm test:unit tests/stateMachineOwnershipAudit.test.ts` run produced two
failing assertions and one passing control. The original 22-test audit and its reported counts
above remain the historical baseline. At that stage, ten finding groups were tracked. Reproduce
in a disposable checkout with this temporary test file:

```typescript
import { expect, it } from 'vitest';
import { parseMeasurement } from '../src';

it.each(['twenty, stone 12, 4 lb', 'age twenty, stone 12, 4 lb'])(
  'rejects the incomplete weight in %s',
  raw => {
    expect(parseMeasurement(raw)).toBeNull();
  }
);

it('keeps the documented unsupported-part control', () => {
  expect(parseMeasurement('stone 12, 4 lb')).toBeNull();
});
```

### Follow-up finding F11 — a unit prefix hides its own fraction

[AFA-238][prefix-fraction] (Medium) is filed in Backlog, outside both active fix queues.
The independent F4 probes found it on current main `b74d185` and the fix branch; the audit
coordinator independently reproduced it on unchanged root main `b74d185` on 2026-11-06:

| Input    | Expected | Actual on main | Source of expectation                          |
| -------- | -------- | -------------- | ---------------------------------------------- |
| `kg 1/2` | 0.5 kg   | 1 kg           | PARSING.md, Units Before a Number; 1 / 2 = 0.5 |
| `1/2 kg` | 0.5 kg   | 0.5 kg         | Fraction control; 1 / 2 = 0.5                  |
| `kg 70`  | 70 kg    | 70 kg          | Public Units Before a Number example           |

M1's slash guard declines fraction normalization after the unit-prefix letter and leaves the
slash for punctuation removal. M5/M7 then accepts the numerator alone as the whole value.
The existing fraction and semantic property suites missed the combination of unit prefix and
slash fraction. The follow-up ticket requires strengthening that coverage. AFA-74 does not
change this production behavior, and no fix session has been launched for AFA-238.

Evidence: `pnpm test:unit tests/stateMachinePrefixFractionAudit.test.ts` produced **one failing
probe and two passing controls**. The temporary test was removed; its source and log were retained
locally as `/tmp/fluent-state-machine-prefix-fraction.test.ts` and
`/tmp/fluent-state-machine-prefix-fraction.log`. This is separate from F10's two failures and one
control. There are now **eleven tracked finding groups**; the original `b79eae0` baseline,
22-test harness, 18 failing probes and 4 passing controls remain unchanged. Reproduce this
follow-up separately on `b74d185` with the temporary test below:

```typescript
import { expect, it } from 'vitest';
import { parseMeasurement } from '../src';

it('AFA-238 reads the complete fraction after its unit', () => {
  expect(parseMeasurement('kg 1/2')).toMatchObject({ value: 0.5, unit: 'kg' });
});

it('preserves the suffix-fraction control', () => {
  expect(parseMeasurement('1/2 kg')).toMatchObject({ value: 0.5, unit: 'kg' });
});

it('preserves the public unit-prefix control', () => {
  expect(parseMeasurement('kg 70')).toMatchObject({ value: 70, unit: 'kg' });
});
```

## Fix groups, dependencies and document ownership

Keep one ticket per PR. F1, F2 and F4 remain their existing grouped issues; do not duplicate them
or fold all tokenizer behavior changes into a single refactor. F3, F5 and F7 share broad ownership
concerns but have different failure causes and existing preservation requirements.

| Work stream                   | Tickets / order                    | State and required handoff                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Publish this audit            | [AFA-235][audit]                   | [PR #228](https://github.com/afahy/fluent-measures/pull/228) merged at `527f7b5`; main CI passed                                                                                                                                                                                                                                                                                                                                                 |
| Separate tokenizer refactor   | [AFA-88][refactor]                 | In Progress; preserve existing remote branch `apfahy/afa-88-read-every-number-form-in-one-tokenizer-pass`, last observed `ded9ee0`; requires maintainer merge                                                                                                                                                                                                                                                                                    |
| Boundary and number fixes     | AFA-75 → AFA-74 → AFA-202 → AFA-62 | Complete through AFA-62: reviewed `efc60db`, merge `70f3169`; all 12 exact-merge main CI jobs passed; no successor                                                                                                                                                                                                                                                                                                                               |
| Quote and ownership fixes     | AFA-78 → AFA-203 → AFA-116         | F2, F5 and F7 complete; F7 merged as `b90ea36` from reviewed `28c3d21`; all 12 exact-merge main CI jobs passed; no successor                                                                                                                                                                                                                                                                                                                     |
| Inferred conversion underflow | [AFA-107][underflow]               | Pulled forward independently; [PR #233](https://github.com/afahy/fluent-measures/pull/233) merged at `b76070d`; main ci-ok passed; no successor assigned                                                                                                                                                                                                                                                                                         |
| Numeric conversion            | [AFA-236][overflow]                | Complete: [PR #230](https://github.com/afahy/fluent-measures/pull/230), reviewed `144c62338b742add6737a790f0a7a88567334658`, merged `b74d185efd9cd1383a9252b151131bcdad5a3d59` at 2026-11-06T21:00:58Z. Original `ecf7a2e` source/full-validation baseline retained; all 12 exact-merge CI jobs passed (run `42293173800`, [ci-ok](https://github.com/afahy/fluent-measures/actions/runs/42293173800/job/128154030833) at 2026-11-06T21:06:07Z). |

The maintainer explicitly lifted the AFA-88 pause for these eight confirmed targeted fixes on
2026-11-06. Their AFA-88 blocker relations were removed. Other dependencies remain; the tokenizer
refactor is separate and is not part of these fix sessions. AFA-107 was pulled forward into
[PR #233](https://github.com/afahy/fluent-measures/pull/233); it is no longer in the queue after
AFA-203. AFA-74 completed [PR #232](https://github.com/afahy/fluent-measures/pull/232), merge `bfac12a9`,
and all 12 exact-merge main CI jobs. AFA-202 then completed PR #236 at merge `e1d3a457`,
with all 19 PR checks and all 12 exact-merge main CI jobs passed. The coordinator released the
implementation hold for the already assigned AFA-62 owner after that gate passed. AFA-62 is the
final ticket in this targeted queue and has completed merge, exact-main CI and scoped cleanup;
no duplicate or successor session is assigned.

Each fix session must:

- Re-read its ticket and applicable feature files; reproduce the exact failure inputs.
- Add regression tests with ticket/specification/hand-calculated expectations. Verify failure on
  `main` and success on the fix; include source, ESM and CommonJS coverage as appropriate.
- Add ticket-sourced corpus entries and feature-map references; run mutation testing and
  `pnpm check`; preserve unrelated results and follow changeset rules.
- Update this file in the same PR: affected machine/table, finding status, before/after revision,
  regression-test path, PR link, and any remaining limitation. Keep the historical baseline
  output. Do not mark a finding fixed merely because a ticket was filed or a session started.
- Merge latest `main` when needed and retain other sessions' document updates. No force pushes.
  Any later refactor must update the machine map when the implementation changes.

### Session ledger

<!-- cspell:ignore Amcp Adelegate -->

| Session                                                                                                                                                                                 | Assigned work                                                       | Launch state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:ab3e225544f4690efa2764d0a191792e86a687eff06d7b4e3bb8c5380b1b736d>                                                       | AFA-235 publication and review of this document                     | [PR #228](https://github.com/afahy/fluent-measures/pull/228) merged at `527f7b5`; main CI passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:9df9034c3ce42adbebf696dd9b9d990bec04b84a9494a53e3c9bf77d6c1fc1d4>                                                       | AFA-75, then fresh successor sessions for AFA-74, AFA-202, AFA-62   | [PR #229](https://github.com/afahy/fluent-measures/pull/229) merged at `fa73fd5`; all 12 main CI jobs passed; AFA-74 successor launched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:1a5f5b908ee23500b3eab3c85521ed6236b310c0f375af966f353457aef7d25e>                                                       | Original AFA-78 implementation and recorded successor queue         | Stopped for the maintainer-requested takeover; clean history preserved through `02d463a`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/thread:delegated-task:command%3Amcp%3A07e37d08-94dc-4f21-9274-996c2a7a8c00%3Adelegate-task%3A632fca4a-3251-4d46-b64c-68aa393e85be> | AFA-78 implementation takeover, final validation and PR preparation | Validated at `133aac5`; [PR #231](https://github.com/afahy/fluent-measures/pull/231) prepared for parent stewardship; no successor work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/b61ed010-1655-4d08-b5ee-8c6e4d3e7ad4>                                                                                              | AFA-78 PR steward                                                   | [PR #231](https://github.com/afahy/fluent-measures/pull/231) merged at `ef39a7b`; all 12 main CI jobs passed; separate AFA-203 session launched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:437846f95d8fc1b59e8b6aed92f360110a4df975347393dec096581adc8de82f>                                                       | AFA-236 finite conversion overflow                                  | F9 validated; [PR #230](https://github.com/afahy/fluent-measures/pull/230) merged at `b74d185`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:e814642ff8608ad682438ef18ee4080fc919744b9ea078fd9ad8e24e7597c9b4>                                                       | AFA-74; fresh AFA-202 then AFA-62 sessions after each merge/main CI | Complete: [PR #232](https://github.com/afahy/fluent-measures/pull/232), reviewed `70419bd`, merge `bfac12a9`; 19 PR checks, exact-head Codex review, final audits and all 12 exact-merge main CI jobs passed (run 42322049791, ci-ok 2026-11-07T01:11:17Z). Merged worktree/local branch removed; fresh AFA-202 successor launched. Earlier validation and AFA-242 comparisons retained                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:461b3a6bdd48f18b59aa264dedf46356fae143e0f5f4b90936f49716e134a37a>                                                       | AFA-107 inferred conversion underflow; no successor                 | [PR #233](https://github.com/afahy/fluent-measures/pull/233) at `7426e3e` implementation; full checks and independent probes pass; merged at `b76070d`; exact-merge main ci-ok passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:1e5640d2dbe8ef251e2bb479d46cc5f4fc59c1597ecd270e7941a88df6893b76>                                                       | Fresh AFA-203 implementation, review and PR stewardship             | Complete: [PR #234](https://github.com/afahy/fluent-measures/pull/234), reviewed head `0a33c40`, merge `77bd5ce`; 19 PR checks, pre/post-merge audits and all 12 exact-merge main CI jobs passed (run 42314274182, ci-ok 2026-11-06T23:54:24Z). Earlier validation at `9030111` and `5c9eab1` retained                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:2d4a60308bdfb6191174b5f92be891f2f90bd42e44ea1218e394ed52840c6148>                                                       | Fresh AFA-116 signed other-type ownership and named test groups     | Source `1eb0a1b`; focused checks passed against `77bd5ce`. Independent review complete (125/126 agree; existing finding filed as AFA-241); full check and fresh changed-line mutation validation passed at `f80b4be`; [PR #235](https://github.com/afahy/fluent-measures/pull/235) merged as `b90ea36` from reviewed `28c3d21`; all 19 PR checks, exact-head Codex review, final audits and all 12 exact-merge main CI jobs passed (run 42319687195, ci-ok 2026-11-07T00:47:02Z). Ticket Done; merged worktree/local branch removed; audit `513b4c3` preserved. No successor assigned                                                                                                                                                                                                                                                                                                                                                                   |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:462bb758094ab0a59a27217f4fb643589704bceca25e2bf1c7aba94be4f52c28>                                                       | AFA-202 Unicode-minus correction; handoff to existing AFA-62 owner  | Complete: [PR #236](https://github.com/afahy/fluent-measures/pull/236), reviewed `c819c48`, merge `e1d3a457`; 19 PR checks, exact-head review/late audit and all 12 exact-main CI jobs passed (run 42340992416, ci-ok 2026-11-07T05:08:57Z). Earlier source `93c7c72`/validation `b80d68a`, round-one `ac4970d`, round-two `d6e2ce7`, final backtracking correction `f50c9c5` and their full-check/mutation records remain above. Handoff goes to the existing AFA-62 owner; no duplicate session.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/thread:delegated-task:command%3Amcp%3A18aad716-812d-4b59-b64d-35f626938eb1%3Adelegate-task%3Ae40d7c32-82cc-465c-b9b7-71af5f3f983d> | Existing AFA-62 compact heights and metric shorthand owner          | Work preserved during the AFA-202 hold. Normal fast-forward to exact main `e1d3a457` completed with the unchanged post-merge hook and no install; local changes reapplied from retained stash `6a09864090c14d25baba2141a4f0222d4ceb8c5f`. Then integrated test-only main `b632655` normally, retaining all nine calculator feature links; 342 focused tests pass. Initial commit `8660ec6` passed normal hooks and released the slot. Parent-arranged independent probe completed (129/136); focused corrections replay 136/136. `512cb75` and `2c3c693` validated; Complete: [PR #242](https://github.com/afahy/fluent-measures/pull/242), reviewed `efc60db`, merge `70f3169`; all 19 PR checks, exact-head review/final audits and all 12 exact-main CI jobs passed (run 42395577155, ci-ok 2026-11-07T17:23:48Z). Merged worktree/local branch removed; all three stashes and archive retained. Late AFA-250 findings remain unfixed; no successor. |

AFA-202's third-round and late findings remain recorded above, including the separate deferred
AFA-249 fuzzy-name and Unicode-mark cases. The fixed backtracking defect is included in
`e1d3a457`; it is not part of AFA-249. The existing AFA-62 owner above completed the preserved
work after the AFA-202 merge/main-CI gate, followed by its own final merge/main-CI closeout. No replacement implementation owner was launched;
the required independent probe was arranged by the parent.
AFA-249 remains Medium, unassigned and in Backlog, without a successor or queue assignment.
All original session assignments remain historical.

Sessions use isolated prepared worktrees. Full checks, mutation runs and mandatory push hooks
have one shared execution slot. AFA-74 released its integration window after `70419bd`.
The coordinator previously granted the exclusive check/mutation/push-hook window to AFA-202.
AFA-62 received a commit-hook-only grant after focused preparation, including normal integration
of test-only main `b632655`. Heavy validation and push hooks need separate grants; the earlier
advisory lock does not allocate that slot.
AFA-88's preserved historical branch is not imported or overwritten; no active rewrite session
or PR overlaps this targeted tokenizer work. Release the grant immediately after local heavy
checks and the final push hook, before hosted waiting. The former AFA-78 session is stopped; parent
<t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/b61ed010-1655-4d08-b5ee-8c6e4d3e7ad4>
owns its replacement stewardship. AFA-203 merged after F2 and its exact-merge main CI passed; the coordinator launched AFA-116
which has now completed its merge, exact-merge main CI and cleanup. The F7 changes and separate
AFA-241 follow-up are preserved in this integration.
The F5 source, regression, corpus and ledger updates are preserved. AFA-107 has been pulled forward into its own fresh session; preserve its F8 update when
merging main. AFA-237 is not part of either active fix queue. Focused tests
can run while another session holds the slot. Successor sessions inherit the regression, corpus,
mutation, PR-lifecycle and document-update requirements. Launch status is not fix completion.

## Validation record

F6 focused continuation on `e1d3a457`: the 84-case compact suite has 46 expected failures and
38 passing preservation controls against exact main, and all 84 pass with the uncommitted
correction. `pnpm test:unit` over 16 named feature suites passes 970 tests, including the full
186-case F3 label/backtracking suites plus F1/F2/F4/F5/F7/F8/F9 preservation coverage. Logs:
`/tmp/afa-62-e1d3a457-final-regressions.log` and `/tmp/afa-62-final-focused.log` (the latter
records the exact selected files). Targeted ESLint, formatting and spelling checks pass.
No full coverage, package, mutation, build or size result is claimed for this continuation;
those runs and push hooks await their own coordinator grant. The interrupted prior
coverage attempt remains incomplete, not a passing check.

The next commit-hook-only window integrated exact test-only main
`b632655431b674e921cb5170b16bdf8840d7245a` by a normal fast-forward and the unchanged post-merge
hook, with no install. All calculator fixtures, tests and nine feature links remain intact.
The 84 compact regressions, 186 F3 sign/backtracking cases, 40 calculator checks and 32 corpus
checks pass together (342 tests); log: `/tmp/afa-62-b632655-focused.log`. Runtime source is
unchanged from the preceding 970-test focused run. Both preservation stashes are retained:
`6a09864090c14d25baba2141a4f0222d4ceb8c5f` and `1cc769e26022b41e2b2ecef711360a2f12e79d67`.
The initial branch commit exposes this fix for the parent's new independent probe; the grant
does not authorize full checks, mutation, build/size/package runs or push hooks.

F6 independent-probe continuation: original evidence is preserved under
`/tmp/afa-62-probe.0VOz6y/`. All seven reported cases fail on the initial branch; the
corresponding main check confirms both decimal-comma failures and all five height-ownership
controls (an additional weight assertion for the ticket's `kgs` alias also fails on main).
The expanded 106-case suite fails 61 cases and passes 45 on exact main `24add56`, and all
106 pass with the correction. Logs include `/tmp/afa-62-probe-before-fix.log`,
`/tmp/afa-62-probe-expanded-main.log` and `/tmp/afa-62-probe-replay.log`. The old branch/main
comparison of the 136 independent inputs is retained in `/tmp/afa-62-probe-committed-changes.json`
and `/tmp/afa-62-probe-main-changes.json`; additional comma results are in
`/tmp/afa-62-extra-inventory.json`. No install, commit/push hook, full suite, coverage, mutation,
build or package run was started during this focused-only correction. Both stashes remain.
Final focused replay passes 1,350 checks across 27 selected files, including the 136 independent
inputs, all 186 F3 sign/backtracking cases, the 40 calculator checks and the corpus snapshot.
Log: `/tmp/afa-62-probe-focused-final.log`. The temporary replay test was removed after saving
the final results in `/tmp/afa-62-probe-corrected-final.json`.

F3 focused validation against exact main `bfac12a9`: `pnpm install` passed. The first reviewed 138-case
regression/control suite fails 56 source assertions and 112 assertions across ESM/CommonJS on
main, with 82 controls passing per format. All cases pass with the targeted correction.
The 695-row corpus preserves every previous row, with 674 agreements, 6 wrong, 15 missed and
no throws. The existing F3 failure improves, all 42 correction/control additions agree, and
two AFA-244 additions record unchanged pre-existing wrong results. The generated result inventory
is unchanged. The independent review and parent replay are recorded in F3 above. The initial full run passed
lint, 3,924 unit tests with 100% coverage and TypeScript; its mutation phase was interrupted
when independent findings required a correction. The first corrected-source full run passed 3,949 of 3,950 tests but the unchanged Git-isolation
subprocess timed out at 180,054 ms while another worktree ran mutation testing. Its log is
retained for the existing AFA-224 tooling issue; no assertion or timeout is relaxed. The
coordinator confirmed the competing processes had ended and explicitly cleared an unchanged
rerun. No success is claimed for either incomplete run.

The first reviewed F3 `pnpm check` passed on corrected source `93c7c72` (head `b80d68a`) on 2026-11-07:
3,950 unit tests with 100% statement/branch/function/line coverage, TypeScript, 99.65% fresh
mutation score (1,416 killed, 12 timed out, five unchanged-line survivors), build, size,
exported-API checks and 4,586 ESM/CommonJS tests. Fresh changed-line validation with
`node .github/scripts/mutation-check.mjs --base origin/main --report reports/mutation/mutation.json`
passes: every mutant on an added or changed line is killed. No mutation suppression is added.
The five survivors are the unchanged zero-part skip, two zero-inference gate variants, numeric
comma rejection marker and fuzzy-unit regex; none belongs to this fix. Bundle sizes are
5.28 kB ESM / 5.34 kB CommonJS versus main's 5.17 / 5.24 kB, within unchanged 5.5 kB limits.
Lint has only the two existing warnings in unchanged test files. The unchanged rerun's
Git-isolation subprocess passed in 100,276 ms; the failed-overlap and successful rerun evidence
is recorded on AFA-224. Whole-diff self-review preserves all predecessor source/tests/corpus
and the complete historical audit harness. The initial mandatory push hook passed all 3,950
unit tests, TypeScript, build and size checks at `7a28e88`; Git-isolation passed in 100,025 ms.
Hosted review and exact-head lifecycle checks continue on PR #236.

Round-one correction validation: the 158-case source/ESM/CommonJS suite passes. Corpus now
has 705 rows: 684 agreements, 6 wrong, 15 missed and no throws; all 651 original rows are byte
identical. Fresh `pnpm check` at `ac4970d` passed 3,970 unit tests, 100% source coverage,
TypeScript, mutation (99.72%; 1,416 killed, 13 timed out, four unchanged-line survivors),
build/API/size and 4,626 ESM/CommonJS tests. Fresh changed-line validation kills every mutant
on the added/changed lines. The four survivors are the two unchanged zero-inference gate
variants, numeric-comma rejection marker and fuzzy-unit regex; no suppression is added.
Final bundles are 5.28 kB ESM / 5.35 kB CommonJS, within the existing 5.5 kB limits.
Git-isolation passed in 99,010 ms; the successful run log and fresh mutation report are retained.
Temporary CPU-cost probes used `parseMeasurement` with `maxLength: Infinity` through all three
formats: 1,000 and 10,000 repeats of numeric/word labels, units, signed label fields and numeric
comma prefixes. The largest observed 10,000-repeat cost was 111 ms CPU, versus 23 ms for
1,000 repeats across the formats. These are observations, not a new timing threshold; the
existing timing tests remain unchanged. The temporary probe is retained outside the repository.

The parent audit passed `pnpm install`, `pnpm build`, and the unchanged invariant, semantic
property, corpus, README and parsing-example suites: 361 tests across five files.

The fresh publication session rechecked all runtime source files and passed `pnpm install` and
`pnpm check` on 2026-11-06: 3,385 unit tests with coverage, TypeScript, mutation testing (99.78%),
build, bundle-size and API checks, and 3,456 package tests. It reran the embedded harness against
the unchanged baseline implementation: exactly 18 expected failing probes and 4 passing controls,
including retries and four workers. The separate F10 harness also reproduced its two expected
failures and one passing control. Both temporary probe files were removed. Final documentation
edits passed Prettier and CSpell. No production code or permanent test file was changed by this
audit. Each fix session remains responsible for its own regression tests and full checks.

The F1 fix at `cbf94c1` passed `pnpm check` on 2026-11-06: 3,429 unit tests, 100% source
coverage, TypeScript, 99.78% mutation score, build/size/API checks and 3,544 package tests.
The changed-lines mutation check confirms every mutant on the changed source lines was killed.
An independent failing-input session tested 92 predefined probes on the initial boundary fix,
all agreeing through source/ESM/CommonJS; the related quoted-number finding received six more
failing-first regressions. Brotli sizes are 4.65 kB ESM and 4.69 kB CommonJS, within the unchanged
5 kB limits. The published audit was merged from `main` at `527f7b5` before this targeted update.

AFA-78 validation: 42 of the 71 new regression/control tests fail on baseline; all 71 pass
on the fix. The full
`pnpm check` at `d850230` passed 3,449 source tests with 100% coverage and 3,584 package tests,
with unchanged exported types and bundles below 5 kB. Its 99.56% mutation result exposed three
survivors on changed lines: an unnecessary preceding-number guard was removed, and uppercase
and repeated-quotation tests now fail when either regex loses its flags.

The implementation takeover preserved that history and added two controls for quoted number
words touching their named unit: `“seventy”kg` and `‘seventy’kg` both retain 70 kg. Removing the
space inserted for a closing curly quote makes exactly these two tests fail. The resulting
73-test suite fails 42 cases on latest baseline `b74d185`, with 31 preservation cases passing;
all 73 pass with the fix. No further parser implementation change was needed during takeover.

Final `pnpm check` passed at merged revision `133aac5` on 2026-11-06: 3,516 source tests,
100% statement/branch/function/line coverage, TypeScript, 99.78% mutation score, build, size,
exported-API checks and 3,718 ESM/CommonJS tests. The fresh report passes
`node .github/scripts/mutation-check.mjs --base origin/main`: every mutant on changed source
lines is killed. The remaining three survivors are the unchanged baseline option-contract
cases described in the F9 validation below. Brotli sizes are 4.80 kB ESM and 4.86 kB CommonJS,
within unchanged 5 kB limits. All 484 corpus rows from `b74d185` are preserved exactly, with
33 additions; the resulting corpus has 517 rows, 496 agreements and no new disagreements.

The round-two review correction adds 25 regression/control tests and 25 corpus rows. The
98-test quotation suite fails 12 cases on reviewed head `7a6654f` and 50 cases on main
`b74d185`; all 98 pass on the correction. The corpus has 542 rows and 521 agreements,
preserving every previous agreement, and the generated result snapshot is unchanged. All
122 saved independent probes agree when replayed through source, ESM and CommonJS.

`pnpm check` passed on the final source with 3,537 source tests, 100% coverage, TypeScript,
build, API/size checks and 3,760 package tests. That run exposed six changed-line mutation
survivors, so four additional preservation controls now catch each directly applied mutant.
No implementation changed after that full check. Fresh mutation validation with those controls
passes at 99.78%, leaving only the three unchanged baseline survivors described above; all
3,768 ESM/CommonJS tests pass. The fresh report passes the changed-line mutation check at
`9c76e9`: no changed-line mutant survives or lacks coverage. Brotli sizes remain
4.93 kB ESM and 5.00 kB CommonJS, passing the unchanged 5 kB limits; exported types are unchanged.

The F4 session installed dependencies and reproduced the six exact failures on `fa73fd5`:
6 failing source tests and 12 failing ESM/CommonJS tests before production edits. The initial expanded
41-test boundary suite had 29 failing cases per baseline package format. Fourteen independent
range findings were then reproduced as failures on the initial fix and corrected in `fa607f3`;
that initial boundary suite had 55 tests, passing through source, ESM and CommonJS. After merging
`b74d185`, a fresh comparison against its tokenizer failed 32 source assertions and 64 package
assertions; restoring the fix passed all 55 in each format. Re-running the 102 independent
probes passed 101 through each API; only the separately filed AFA-238 remains. The combined
F4/F1/F9 package suites passed 226 tests. At `1e1a23b`, `pnpm check` passed on 2026-11-06:
3,498 unit tests with 100% source coverage, TypeScript, mutation testing (99.78%; 1,352 killed,
13 timed out, 3 pre-existing survivors), build, size/API checks, and 3,682 package tests.
The fresh changed-lines mutation check confirms every mutant on changed lines was killed.
Redundant range splitting was removed after mutation testing exposed equivalent mutations in
its whitespace pattern; no mutant was suppressed. Brotli sizes are 4.78 kB ESM and 4.83 kB
CommonJS, within the unchanged 5 kB limits. Predecessor main CI passed all 12 CI jobs at `fa73fd5`, confirmed by
[workflow run 42290644313](https://github.com/afahy/fluent-measures/actions/runs/42290644313),
completed 2026-11-06 20:48:38 UTC; its paginated late-comment audit found no unhandled findings.

After the approved preservation policy, the F4 regression suite has 72 tests. Against main
`b74d185`, 19 source and 38 ESM/CommonJS assertions fail; the other 53 per format are
preservation controls. All 72 pass with the updated implementation. Self-review also preserves the same range context
when the feet use a number word (`five'10/180-190 lbs`) or uppercase unit alias. Thirteen independent-probe
expectations were revised only for the approved punctuation policy; re-running all 102 probes
passes 101 per format, with only the separately filed AFA-238 still failing. All 39 new corpus
entries agree. Main `ef39a7b` was then merged; its 542 corpus entries and the original embedded
audit harness are preserved exactly. The resulting corpus has 581 rows and 560 agreements,
with no new disagreement. The same 19 source and 38 package failures reproduce on `ef39a7b`.

Final `pnpm check` passed at `cb1bf60` on 2026-11-06: 3,613 unit tests, 100% source coverage,
TypeScript, 99.79% mutation score (1,397 killed, 10 timed out, 3 unchanged-line survivors),
build, size/API checks and 3,912 ESM/CommonJS tests. The fresh changed-line mutation check
against `ef39a7b` passes: every changed-line mutant is killed. A redundant regex Unicode flag
and temporary empty-string prefix were removed after the previous run exposed equivalent
mutations; no new mutation suppression was added. Final sizes are 5.11 kB ESM and 5.17 kB
CommonJS, within the authorized 5.5 kB limits. Whole-diff self-review found no remaining
in-scope issue; F11/AFA-238 and the F2/AFA-239 follow-up remain separate and unfixed.

Round-two focused validation after merging `b76070d`: 378 source tests and 430 ESM/CommonJS
checks pass, including all 95 boundary assertions. The reviewed `2041d2a` tokenizer fails 18
source / 36 package assertions in that expanded suite; current main fails 26 / 52, with 69
preservation controls passing per format. All 62 added corpus cases agree, retaining every one
of main’s 549 entries. There are 611 total rows and 590 agreements. The 102 independent probes
still have 101 agreements per format; only F11/AFA-238 remains. TypeScript, focused ESLint and
build/size checks pass; sizes are 5.15 kB ESM and 5.21 kB CommonJS. The next full run and fresh
changed-line mutation validation follow below; the preceding full
run applies to `cb1bf60`, not these later source corrections.

The first round-two full run at `2e7f6c3` passed 3,658 unit tests with 100% source coverage
and 4,002 package tests. Changed-line validation identified a surviving range-guard mutant.
The added public-input control `5'10/180-190 11 in` returns `null` on main and the fix,
but 71 in with that mutant. It is now the 96th boundary test and 63rd corpus entry; no
mutation suppression or production change was needed. Final combined validation includes F5
from `77bd5ce`.

Final combined F4 validation at `82cad31` on main `77bd5ce`: `pnpm check` passed 3,746
unit tests, 100% source coverage, TypeScript, fresh mutation testing at 99.65% (1,402 killed,
13 timed out, 5 survivors on unchanged lines), build/size/API and 4,178 package tests.
Fresh changed-line validation confirms every mutant on an added or changed line is killed.
No mutation suppression was added. The unchanged survivors are `parseMeasurement.ts`’s
condition at line 155 and two guards at line 596, the numeric-comma fallback string in
`tokenize.ts`, and the existing `matchUnit.ts` regex. Whole-diff self-review found no remaining
in-scope finding. All three second-round review corrections have regression evidence.

The final 96-test boundary suite fails 26 source and 52 ESM/CommonJS assertions on current
main `77bd5ce`, retaining 70 passing controls per format; every case passes with the fix.
All 563 current-main corpus entries remain intact, plus 63 agreeing F4 entries: 626 total,
609 agreements, 5 wrong, 12 missed and no throws. The original embedded audit harness is
unchanged. Builds measure 5.14 kB ESM / 5.19 kB CommonJS, versus 4.92 / 4.97 kB on that
main revision, within the authorized 5.5 kB limits. F5/F8 source and regression updates are
preserved; F11/AFA-238 and the F2/AFA-239 follow-up remain separate and unfixed.

F7 conflict integration at `60a398d`: main `b90ea36` was merged after documentation push
`11affc0`. F7 source, regression groups, corpus/result snapshot, feature links and audit evidence
remain intact, including the F5 completion record and separate AFA-241 finding. The F7 source
and test groups match main byte for byte; the F4 tokenizer and its 96 boundary tests are
unchanged from validated `82cad31`. The combined focused source run passes 430 tests; all
588 main corpus entries are preserved with the 63 F4 entries (651 total, 631 agreements,
5 wrong, 15 missed, no throws). The original embedded audit harness remains unchanged.

Fresh tokenizer mutation passes at 99.69% (315 killed, 3 timeouts, one survivor on the unchanged
numeric-comma fallback string). Fresh changed-line validation against `b90ea36` confirms every
mutant on an added or changed line is killed. The full combined ESM/CommonJS suite passes
4,310 tests across 104 files. Build, exported-API and size checks pass at 5.17 kB ESM / 5.24 kB
CommonJS, within the authorized 5.5 kB limits; main `b90ea36` measured 4.93 / 4.99 kB.
Mandatory push hooks run the full combined unit/TypeScript suite, build and size checks;
their result is recorded on the PR after the push. The coordinator explicitly limited this
unchanged-source integration to these checks; no additional all-files mutation or full
`pnpm check` is required. No additional production fix or mutation suppression is introduced.

F9 focused validation at `ecf7a2e`: 14 conversion-overflow tests, 104 tests across the conversion,
inference, units and corpus suites, 488 tests for the other affected feature routes/public
examples, and 1,092 ESM/CommonJS checks passed. Lint, TypeScript, build, size and exported-API
checks passed. Baseline `b79eae0` failed the six intended regression cases in source and each
package format. Full `pnpm check` passed at `6b58f92` on 2026-11-06: 3,399 unit tests,
100% statement/branch/function/line coverage, TypeScript, 99.78% mutation score, build, size,
exported-API checks, and 3,484 ESM/CommonJS tests. All 96 `units.ts` mutants were killed;
`node .github/scripts/mutation-check.mjs --base origin/main` also passed. The three surviving
mutants are in unchanged source lines. ESM size is 4.64 kB (baseline 4.62 kB); CommonJS remains
4.70 kB when rounded, both under the unchanged 5 kB limit.

After merging `main` at `fa73fd5`, the six regression cases still fail without the conversion
fix and all 14 tests pass with it. The combined corpus/conversion/comma suite passes 90 tests,
and the rebuilt ESM/CommonJS suites pass 3,572 tests. Build, exported-API and size checks pass;
combined sizes are 4.67 kB ESM and 4.71 kB CommonJS. The F1 corpus and audit updates are retained.
A fresh `pnpm test:mutation --mutate src/units.ts` run after this merge killed all 96 mutants
(100%), and the changed-lines mutation check passed again.

F5 focused validation at `938c2ff`: `pnpm install` passed. Against main `ef39a7b`, 36 of the
121 checks in the signed-weight/comma-ownership suites fail, including every exact ticket input;
85 controls pass. The same 36 fail in each of ESM and CommonJS (72 failures, 170 passes).
With the correction, all 121 pass in source and both package formats. The combined signed-part
and unsupported-unit run passes 344 source tests; 465 further public-example, label, fraction,
comma, unit and multiple-measurement checks pass. The 550-row corpus has 533 agreements and
retains every previous agreement. Bundles shrink from 4.93/5.00 kB to 4.92/4.97 kB (ESM/CommonJS),
within the unchanged 5 kB limits. At this initial validation stage, full checks awaited the
explicitly allocated CPU slot; the final results are recorded below.

F5 independent-review correction at `488bced`: six added regression assertions fail on both
main `ef39a7b` and the initial correction in each of source, ESM and CommonJS; two further
signed-article controls already pass. The final 129-test regression/control suite fails 42 cases
on main (87 controls pass), with 84 failures and 174 passes across the two package formats.
All 129 pass with the correction in each format; the combined signed/unsupported-unit source
suite passes 352 tests. The parent replayed all 100 saved independent probes through source,
ESM and CommonJS, with no remaining disagreement. Another 559 source checks preserve semicolon
fields, other types, Unicode signs, labels and public examples; exported types are unchanged.
The corpus has 556 rows and 539 agreements, preserving every previous agreement. Final focused
bundle sizes are 4.96/4.98 kB (ESM/CommonJS); the 5 kB limits remain unchanged. The coordinator
then granted the full-check/mutation/push slot after AFA-107 explicitly released it.

F5 full validation at `9030111` (source `488bced`) on 2026-11-06: `pnpm check` passed
3,628 unit tests with 100% statement/branch/function/line coverage, TypeScript, 99.78% fresh
mutation score, build, size, exported-API checks and 3,942 ESM/CommonJS tests. The fresh report
passes `node .github/scripts/mutation-check.mjs --base origin/main`: all seven mutants in the
changed lookup were detected (six killed and one timeout); none survives or lacks coverage.
The three survivors are unchanged baseline option-contract cases: omitting the zero-conversion
skip, returning a nonnumeric rejection marker, and broadening the prose-exclusion regex only
outside the documented fuzziness range. Their out-of-contract behavior belongs to AFA-178.
No public type or example changes, and no bundle-limit increase, are needed. Lint reports only
the two existing warnings in unchanged test files. Self-review confirms the original audit
harness and every previous corpus input, expectation, option and source are preserved.

F5 merged-main validation at `5c9eab1` preserves F8 source `7426e3e` from main
`b76070d7f26a3972c93b8b821e04c95952e0feff`. All 655 focused source checks and 3,986
ESM/CommonJS package checks pass; all 100 independent probes again agree in each format.
Rechecking the 129 regressions/controls against that exact main still gives 42 failures and
87 passes in source, and 84 failures and 174 passes across the package formats. The merged
corpus has 563 rows and 546 agreements; every existing input, expectation, option and source
is retained. Build, size and API checks pass at 4.92/4.97 kB under unchanged 5 kB limits.
A fresh `pnpm test:mutation --mutate src/parseMeasurement.ts` scores 99.75% (802 killed,
8 timed out, 2 survived), and the changed-line check passes again: the seven lookup mutants
are detected, with no survivor or uncovered mutant. Both survivors relax the unchanged
inference gate to admit zero, which F8's terminal zero-total rejection now rejects anyway.
The production diff against merged main remains confined to F5's backward ownership lookup.

F8 validation at `7426e3e` on 2026-11-06 passed `pnpm install` and `pnpm check`:
3,465 unit tests, 100% source coverage, TypeScript, 99.63% mutation score (1,342 killed,
11 timed out, 5 survived), build, size, API and 3,616 ESM/CommonJS tests. Fresh changed-lines
validation with `node .github/scripts/mutation-check.mjs --base origin/main --report
reports/mutation/mutation.json` confirms every mutant on changed lines was killed. The two
additional survivors relax the earlier inference gate to admit zero; they cannot change a
result now that M9 rejects zero totals. The other three survivors are the previously recorded
zero-part skip, numeric-comma rejection string and fuzzy-unit regex. No mutation suppression
was added. Sizes are 4.67 kB ESM and 4.70 kB CommonJS, under unchanged 5 kB limits.
The independent input review at `4191746` found all 92 predefined probes agree through
source, ESM and CommonJS. Ten reproduce the inferred-zero defect on `b74d185`; positive
boundary controls remain positive. No new finding was reported. Required push hooks pass;
[PR #233](https://github.com/afahy/fluent-measures/pull/233) tracks hosted validation and merge.

Reconciliation with main `ef39a7b` retains the F2 source, generated results and complete
ownership/session history. The corpus combines all 58 F2 entries with the seven F8 entries:
549 total, 528 agreements, no new disagreement. The underflow source is unchanged from
`7426e3e`. Restoring main's parser reproduces 12 source and 24 ESM/CommonJS failures, with
17 controls passing per format; restoring the fix passes 225 focused source tests and 436
ESM/CommonJS tests across F1, F2, F8, F9, invariants, corpus and result snapshots. Build and
TypeScript also pass. A fresh `pnpm test:mutation --mutate src/parseMeasurement.ts` run
at `2c0f762` scores 99.63% (802 killed, 7 timed out, 3 equivalent survivors described above).
The changed-lines mutation check passes again after this merge.

F7 focused validation at `1eb0a1b`: `pnpm install` passed. The initial 61-test suite fails
39 assertions on current main `77bd5ce` in source and in each package format (78 package
failures), with 22 controls passing per format. Both exact ticket inputs fail for default,
weight and normalized-kg options. A further fuzzy signed-value control catches an eager
missing-unit lookup found during local self-review; that suite has 62 tests. With the
fix, all 942 focused source and 1,884 ESM/CommonJS feature checks pass, including every
existing signedParts row, public examples, Unicode signs, ownership and unsupported parts.
The targeted corpus initially had 581 entries, 564 agreements, 5 wrong, 12 missed and no throws.
Adding the three existing AFA-241 failures and four disagreement cases makes 588 entries,
568 agreements, 5 wrong, 15 missed and no throws; all 563 prior entries and their outcomes
remain intact. The generated snapshot changes only the five
other-type prime results recorded above. Independent review and parent replay found 125/126
agreements per format; the single disagreement is filed as AFA-241.

F7 full `pnpm check` at `2f26777` (source `1eb0a1b`) passed 3,712 unit tests with 100%
statement/branch/function/line coverage, TypeScript, 99.64% fresh mutation score (1,375 killed,
13 timeouts, five unchanged-line survivors), build, size, API and 4,110 ESM/CommonJS tests.
Fresh changed-line validation passes: every mutant on the changed ownership lines is killed.
The five survivors are the existing zero-part skip, inferred-zero gate variants, numeric-comma
rejection marker and out-of-contract fuzzy prose exclusion; no new suppression is added.
Sizes are 4.93 kB ESM / 4.99 kB CommonJS, below unchanged 5 kB limits, versus main's
4.92 / 4.97 kB. Lint has only the two existing warnings in unchanged tests.

After this full check, final self-review added the four disagreement assertions without any
production change. The final 66-test suite fails 43 cases on main `77bd5ce` in source, and
86 across ESM/CommonJS, with 23 controls passing per format. All 66 pass with source
`1eb0a1b` in each format; the package regression/corpus/generated-result run passes 198 checks.
A fresh `pnpm test:mutation --mutate src/parseMeasurement.ts` run with these additional
assertions passes at 99.76% (809 killed, 11 timeouts, two survivors). The fresh changed-line
check passes again; all changed ownership mutants are killed. The two survivors only relax
the earlier inferred-zero gate; M9 still rejects a zero total, so neither changes behavior.
No source or mutation suppression changed. At `f80b4be`, all 21 changed-line mutants are
killed; mandatory push hooks pass 3,716 unit tests, TypeScript, build and the unchanged size
limits. [PR #235](https://github.com/afahy/fluent-measures/pull/235) subsequently merged reviewed
`28c3d21` as `b90ea36`; its source remains `1eb0a1b`. All 19 PR checks, exact-head Codex review,
final audits and all 12 exact-merge main CI jobs passed. The F7 correction section records the
completed lifecycle and exact CI link; the separate AFA-241 finding remains unfixed.

## Reproducing the audit

Use a disposable checkout of `b79eae0`. Run `pnpm install` and `pnpm build`. Save the following
code as `tests/stateMachineAudit.test.ts` and run:

```sh
pnpm test:unit tests/stateMachineAudit.test.ts
```

The intended-behavior probes are expected to fail on the baseline. Do not add skips, expected
failures or snapshots of incorrect behavior to make this probe suite green. Fix PRs should turn
their relevant cases into permanent regression tests. The test code is retained here so the
single audit file contains its evidence; it is not a second, automatically run test suite.

[audit]: https://linear.app/afahy/issue/AFA-235
[commas]: https://linear.app/afahy/issue/AFA-75
[quotes]: https://linear.app/afahy/issue/AFA-78
[signs]: https://linear.app/afahy/issue/AFA-202
[fractions]: https://linear.app/afahy/issue/AFA-74
[fraction-follow-up]: https://linear.app/afahy/issue/AFA-242
[unsupported]: https://linear.app/afahy/issue/AFA-203
[prefix-ownership]: https://linear.app/afahy/issue/AFA-237
[prefix-fraction]: https://linear.app/afahy/issue/AFA-238
[quote-follow-up]: https://linear.app/afahy/issue/AFA-239
[compact]: https://linear.app/afahy/issue/AFA-62
[ownership]: https://linear.app/afahy/issue/AFA-116
[following-label]: https://linear.app/afahy/issue/AFA-241
[underflow]: https://linear.app/afahy/issue/AFA-107
[overflow]: https://linear.app/afahy/issue/AFA-236
[refactor]: https://linear.app/afahy/issue/AFA-88

```typescript
import { describe, expect, it } from 'vitest';
import { Worker } from 'node:worker_threads';
import { parseMeasurement, type ParseOptions } from '../src';

// Temporary audit probes. Expectations come from named tickets, public examples,
// or the international unit definitions, never from observed parser output.
describe('state machine audit', () => {
  it.each([
    ['AFA-75 comma boundary', 'my son is two, thirty pounds', {}, 30, 'lb'],
    ['AFA-75 multiplier', 'twenty, one hundred pounds', {}, 100, 'lb'],
    ['AFA-116 signed ownership', 'kg -6 ft, 70 kg', {}, 70, 'kg'],
    ['AFA-78 quoted words', 'he said “about 180” lbs', {}, 180, 'lb'],
    ['AFA-78 spaced marks', '5 ’11”', {}, 71, 'in'],
    ['AFA-62 compact', '5ft11', {}, 71, 'in'],
    ['AFA-74 slash ownership', '5 ft (10/180 lbs)', { type: 'weight' }, 180, 'lb'],
  ] as const)('%s', (_, raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it.each([
    ['AFA-202 digit label', 'phase 20, −5 cm'],
    ['AFA-202 word label', 'phase twenty, −5 cm'],
    ['AFA-203 unsupported part', 'kg -20 5 grams; actual 70 kg'],
    ['AFA-74 fraction range', '5/2-180 lbs'],
    ['AFA-74 fraction boundary', '5½2 lb'],
    ['AFA-74 decimal whole', '5.5 ½ ft'],
  ])('%s', (_, raw) => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('AFA-107 inferred underflow is rejected', () => {
    expect(
      parseMeasurement(`0.${'0'.repeat(322)}1`, {
        type: 'height',
        allowUnqualified: true,
        normalizedUnit: 'ft',
      })
    ).toBeNull();
  });

  it.each([
    ['ft', 'm', 3.048e306],
    ['in', 'm', 2.54e305],
    ['m', 'ft', 3.280839895013123e307],
    ['m', 'in', 3.937007874015748e308],
  ] as const)('finite conversion of 1e307 %s to %s', (from, to, expected) => {
    const value = parseMeasurement(`1${'0'.repeat(307)} ${from}`, { normalizedUnit: to });
    if (Number.isFinite(expected)) {
      expect(value?.value).toBeGreaterThan(0);
      expect(Math.abs(value!.value / expected - 1)).toBeLessThan(1e-14);
    } else {
      expect(value).toBeNull();
    }
  });

  it('finite conversion of 1e308 inches to meters', () => {
    expect(parseMeasurement(`1${'0'.repeat(308)} in`, { normalizedUnit: 'm' })).toMatchObject({
      value: 2.54e306,
      unit: 'm',
      type: 'height',
    });
  });

  it('repeating a failing input does not repair the comma transition', () => {
    const actual = Array.from(
      { length: 3 },
      () => parseMeasurement('my son is two, thirty pounds')?.value
    );
    expect(actual).toEqual([30, 30, 30]);
  });

  it('retries after null, throws, fuzzy matches and mutated results are isolated', async () => {
    const options: ParseOptions = Object.freeze({ type: 'weight', normalizedUnit: 'kg' });
    expect.hasAssertions();
    await Promise.all(
      Array.from({ length: 100 }, async () => {
        expect(parseMeasurement('150-180 lbs')).toBeNull();
        expect(() => parseMeasurement('72', { allowUnqualified: true })).toThrow('requires type');
        expect(parseMeasurement('5 foots 10 inc', { fuzziness: 2 })?.value).toBe(70);
        const first = parseMeasurement('70 kg', options)!;
        first.value = -1;
        first.matches[0].value = -1;
        expect(parseMeasurement('70 kg', options)).toEqual({
          value: 70,
          unit: 'kg',
          type: 'weight',
          raw: '70 kg',
          matches: [{ value: 70, unit: 'kg' }],
        });
        expect(parseMeasurement('0 feet; actual 1.8 meters')?.value).toBe(1.8);
      })
    );
  });

  it('four independent workers each repeat public API calls 200 times', async () => {
    const modulePath = new URL('../dist/index.js', import.meta.url).href;
    const results = await Promise.all(
      Array.from(
        { length: 4 },
        () =>
          new Promise((resolve, reject) => {
            const worker = new Worker(
              `
        const { parentPort, workerData } = require('node:worker_threads');
        (async () => {
          const { parseMeasurement } = await import(workerData);
          for (let i = 0; i < 200; i++) {
            if (parseMeasurement('150-180 lbs') !== null) throw new Error('range');
            try { parseMeasurement('72', {allowUnqualified:true}); throw new Error('missing throw'); }
            catch (error) { if (!error.message.includes('requires type')) throw error; }
            const result = parseMeasurement('70 kg');
            if (result.value !== 70 || result.unit !== 'kg') throw new Error('state leak');
          }
          parentPort.postMessage('ok');
        })().catch(error => { throw error; });
      `,
              { eval: true, workerData: modulePath }
            );
            worker.once('message', resolve);
            worker.once('error', reject);
            worker.once('exit', code => {
              if (code !== 0) reject(new Error(`worker ${code}`));
            });
          })
      )
    );
    expect(results).toEqual(['ok', 'ok', 'ok', 'ok']);
  });
});
```

## Approved policy revision: duplicate readings (AFA-250, 2026-11-07)

This section describes the local, uncommitted first implementation slice based on
`bfac12a943720390c60afd26a522cb67dfa20fa3`, not a merged revision. Approval is recorded in
AFA-250 comment `fcdbc8e5-5ac2-4f00-9f0d-d15d41e74fa2`. The original b79eae0 inventory,
M9 table, F1–F11 findings and harness above remain historical evidence.

For this slice M9 no longer collects independent groups, discards zero groups, selects the
first, or compares converted totals within 1%. Every adjacent part must satisfy the existing
integral-larger/next-smaller/part-limit predicate; otherwise assembly returns null. One scalar
or compound keeps its unit selection, conversion arithmetic and finite-result checks. The
upcoming AFA-51 integration must also retain its `canJoin` boundary predicate.

Thus `70 kg (154 lbs)` changes from 70 kg to null, and `100 cm (101 cm)` changes from 100 cm
to null by explicit policy, not by correcting an old bug. AFA-170's recovered
`5 ft 5 1-2 ft 0 in` and `inches 6 1-2 ft 6 in` likewise change from 65 in and 6 in to null
because they depended on reconciliation. Their historical expectations remain recorded in
`design/afa-250/corpus-before-duplicate-policy.jsonl`.

Earlier M3/M7/M8 recovery still exists in this partial branch; zero-fragment omission,
signed-field recovery, arbitrary prose and unselected height/weight pairs are not yet migrated.
The full approved complete-entry policy will revise those transitions in later slices.
Focused duplicate assertions fail on bfac12a (19 failures, seven valid controls pass) and pass
on the local edit. Focused source/spec/corpus validation is recorded in
`design/afa-250/implementation-slice.md`; 35 reviewed result-snapshot lines migrate to null.
Parent integration and full checks remain pending a coordinator grant. No performance or size improvement is asserted.

## AFA-250 full complete-entry preparation (2026-11-07, uncommitted)

This appendix records an approved intentional policy revision at base
`bfac12a943720390c60afd26a522cb67dfa20fa3`. It does not revise the historical b79eae0 audit,
F1–F11 observations, harness, or the first duplicate-only preparation above. Maintainer approval
is AFA-250 comment `fcdbc8e5-5ac2-4f00-9f0d-d15d41e74fa2`; the private numeric result seam was
approved in `ef823540-ac68-4301-985f-8a19c8fe4982` after bounded draft-only failure reproduction.

The prepared active transitions replace M3/M7/M8/M9 recovery and ownership policies: retain
punctuation/unknown tokens, consume one whole scalar/compound or one valid selected height/weight
pair, and reject any remaining fragment. There is no first-result/1% reconciliation, range
reconstruction, field skipping, unsupported-unit adjacency scan, used-token pass, or fallback to
an earlier label. Finite wrappers and complete forward numeric phrases are explicit grammar.
Written zero parts stay in positive compounds; standalone zero never disappears to save a field.

AFA-51's canJoin intent is preserved through allowed local joins: no arbitrary words, semicolon,
range or other measurement can bridge compound parts. Its old callback/field machinery no longer
exists in this prepared parser. This is deliberate supersession under the approved contract,
not an assertion that the historical boundary bug or AFA-51 correction was unnecessary. Its
AFA-88 draft gate is not waived. Existing attached ASCII height-unit hyphens and approved Unicode
height joins remain distinct from spaced ASCII negative parts. Commas/brackets require explicit
smaller units; future stone negative joins remain invalid.

The shared number reader returns a complete value or null plus the first invalid supplied-token
index, retaining skipped conjunction positions. A null value is never a recovered prefix. The
ordered grammar may validate exactly one complete compound split or conjunction-separated pair
at that boundary. The string adapter retains its existing signature. Six small resource tests
first exposed repeated draft reads, then passed the existing parsed-character bound after the
correction with nonzero shared-reader call counts. This is bounded evidence, not a general
performance claim or a substitute for future full resource/mutation checks.

See `design/afa-250/implementation-handoff.md` and its migration ledgers for current behavior,
source seams, baseline failures, pending owner composition, and unblessed snapshot candidates.
AFA-247 decimal/conjunction semantics, AFA-62's single compact split/aliases, AFA-251 early option
validation/defaults, and AFA-254 units remain parent-owned composition. No AFA-88/140/141 rewrite
or additional ticket is started. Historical contract-preserving fixes remain valid evidence.

### Later AFA-247 numeric composition in AFA-250 (2026-11-07)

The same uncommitted complete-entry branch now composes merged AFA-247 decimal semantics from
`44135485609e80c1bc07fee26481d7c609fb58be` into its single private numeric-token reader. Original
token indices, including skipped conjunctions, remain intact; failed whole phrases return null,
and a compound may use only one validated boundary. The string adapter keeps its compatibility,
while the complete-entry grammar still rejects incomplete conjunctions, unknown prose and signed
fragments. No old ownership/range marker or backwards parser scan returns. Historical outputs,
including deferred `age twenty point five: 80 kg` -> 20.58 kg, remain observations; the approved
whole-entry expectation is null. Exact source hashes, bounded-work results and migration evidence
are in `design/afa-250/decimal-composition/HANDOFF.md`. Other owner composition and final allocated
validation remain pending; this appendix does not revise the earlier historical audit.

### AFA-250 current-main composition — publication pending

The same AFA-250 owner normally merged exact `70f31690c4835ab97d60bf4af9c7a48d2f57d878`
with `--no-ff --no-commit`; no commit or hook ran. The original uncommitted implementation and
all earlier design evidence are retained in stash `1f95af34f1edb8c001b9591ec4eb34aee0eb046f`
and `/Users/afahy/.t3/artifacts/fluent-measures/afa-250-pre-main-70f3169/`. Publication remains
pending the eventual AFA-250 PR; this is focused preparation, not a full-validation or merge claim.

The coordinator-approved F6 closeout patch is incorporated above, preserving its original
SHA256 `d31abc54fb61b36d990126e9518570c6cebb0a3f1c458abc65da1e5d198cea98`. The separately
identified F9 ownership-row correction records verified #230 merge/main-CI completion while
retaining the `ecf7a2e` source/validation baseline. Exact layer evidence is in
`design/afa-250/main-composition/historical-closeout-proof.json`, `F6-closeout.original.patch`
and `F9-ownership-closeout.patch`. The original main audit was an exact prefix before those
approved closeout edits. Original harness, 22 probes, 11 groups and deferred findings remain.
In particular, the late #242 findings remain historical unfixed findings at its merge.

Under the separately approved AFA-250 policy, current transitions now use the existing ordered
complete-entry cursor. AFA-62 contributes its single compact split before comma/fraction
normalization, with Unicode letter/number/mark identifier guards, and cms/kgs aliases.
Bare metric parts obey the cursor's integral/size/positive bounds and explicit suffix ownership;
written zero larger parts stay in matches. Invalid remaining parts reject the entry. F3's
existing Unicode height connectors after a comma, including prefix labels, join only an
explicit eligible smaller part. Literal ASCII signs, ineligible compounds and stone signs are
not reinterpreted. No old field/used-token/range-reconstruction scan was restored. The reviewed
private number reader and its supplied-token coordinates remain byte-identical.

The composition baseline had 61 failures and 463 controls across the explicitly selected
complete-entry/compact/F3-label suites; after the two bounded source changes all 524 passed.
The selected eleven number/decimal suites passed 410 tests, including non-vacuous actual-reader
work bounds. All 14 archived late #242 inputs now satisfy independently specified AFA-250
outcomes: valid selected metric pairs retain 180 cm; duplicate heights, signs and fragment
recovery reject. Twenty-six additional connector/selector controls preserve explicit smaller
units, signs, bounds, both pair orders and type/normalizedUnit selection. These are semantic and
work-count checks, not timing or user-accuracy measurements.

The final authored corpus contains 2,007 rows: 2,006 agree with their independent labels, no
misses or throws, and the previously recorded `5.11 ft` label mismatch remains. Its committed
report snapshot is intentionally not approved or replaced. The existing result snapshot and
all earlier candidate evidence are also unchanged. Calculator's 37 fixtures/harness, the F3
long-input timing file and timing helper are exact-main bytes. Current spec/docs and feature
maps follow the approved complete-entry rules while preserving the Atlas/#243/#244 layout.
API 251/252/253 and stone 254 remain separate composition steps. Independent probing and full
coverage/mutation/build/package/size/hook validation remain pending coordinator allocation.

### AFA-250 checkpoint and independent prefix correction — publication pending

The preparation above was subsequently committed with normal hooks as
`fd3ce2361737438ddc3df268df640793f0ef4a30`, with parents `bfac12a` and `70f3169`.
The reviewed result snapshot was adopted from independent policy and arithmetic evidence;
its SHA256 is `ebae8b38c96ac61050493a71b98c08244a84cfb12114005499f5b2684d97a269`.
The `5.11 ft` label was corrected to 5.11 ft by independent arithmetic, retaining the old
label and note in the evidence archive. This was an oracle correction, not a runtime fix.
All 481 design files were preserved outside the checkout at
`/Users/afahy/.t3/design-evidence/afa-250/t3-1a8416c0/design/`; earlier relative evidence paths
refer to that retained tree. The original F6 patch, F9 layer and stash remain intact.

A new isolated probe froze 302 expectations before comparing that checkpoint with exact
main `70f3169`. Ten approved inputs returned null only on the checkpoint: the six selected
weight pairs `cm: 181 and 72 kg`, `kg: 72 and 181 cm`, `in: 73 and 160 lbs`,
`feet 6 and 72 kg`, `m: 1.81 and 72 kg`, `pounds 160 and 73 in`; and the four scalar entries
`kg seventy two.`, `pounds six and a half.`, `m: one point eight.`, `in: seventy three.`.
Their expected values follow the approved prefix-unit, complete-pair and final-period rules.
The frozen main results retain 220 agreements and 82 disagreements with the new contract;
those disagreements are not all null transitions. The immutable probe is separate from the
same-owner correction replay.

The correction refines the current M2/M4/M5/M9 replacement transitions as follows:

| State or boundary                                                         | Required transition and invariant                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prefix unit followed by a complete number                                 | A successful whole phrase keeps priority. If the shared reader instead identifies an invalid numeric group at `and`, validate the complete left number once and leave the conjunction for the existing expression cursor. |
| Conjunction left at a prefix-part boundary                                | The cursor must consume an eligible compound or a complete selected height/weight pair. The left prefix alone cannot make an invalid remaining expression succeed; no later split search is allowed.                      |
| Number word, multiplier or `half` followed by a period                    | Retain the numeric token and period with their original normalized offsets. The number reader stops at standalone punctuation; the expression owns its permitted final period. Unit-label periods remain unchanged.       |
| Internal or repeated periods, missing selector, invalid second expression | Reject the complete entry. Do not erase punctuation, discard a field or return a numeric fragment.                                                                                                                        |

The dedicated prefix suite failed 29 assertions and passed 45 controls before correction,
including all ten reported failures. Final named source suites pass 662 tests; snapshot and
corpus suites pass 33. The frozen replay changes 292 agreements and ten misses to 302
agreements. A separate 243-path full-result comparison changes exactly 42 paths over 24
literals from null to independently justified values; raw input, written matches and symmetric
selectors are asserted. All 2,007 prior corpus rows are byte-identical; 57 authored cases give
2,064 agreements. The approved generated result snapshot remains byte-identical.

The shared number reader, supplied-token indices, normalization and single compact split are
unchanged. Existing reader-work tests and new prefix-pair cases at sizes 8, 16 and 32 assert
positive actual-reader calls and the existing parsed-character bound. These are focused
semantic and work-count results, not full validation, bundle measurements or performance claims.
The missed default assertion for `1.8 (m), 80 kg` now follows the already-approved selector rule,
with four positive selector controls; its runtime result did not change in this correction.

Exact patches, hashes, immutable-probe checks and changed-result ledgers are retained in
`/Users/afahy/.t3/design-evidence/afa-250/t3-1a8416c0/prefix-correction/` and ticket comment
`93599fde-bad9-4937-ab27-9606ae99e88a`. This correction is uncommitted at this review point;
final committed-source validation and publication remain pending. AFA-250 remains its own
ticket/PR, without API or stone composition. Historical F6/F9 completion and deferred findings
above are preserved; publication of their closeout layer remains pending the same AFA-250 PR.

### AFA-250 allocated validation follow-up — publication pending

The prefix correction and preceding audit were committed with normal hooks as
`7c32bbbc7b7c162b829cc82b83f19e8604bccc32`. Hooks changed only Markdown table formatting;
every cell and prose line was verified against the parent-reviewed audit. Frozen installation
left dependency metadata and the lockfile unchanged. The first full check stopped during
unit coverage with 5,176 passes and seven failures; no later stage ran in that attempt.

Six failures were missed assertions from the retired extraction policy: three consecutive
calls for `my son is two, thirty pounds`, `phase twenty, 5 kg` with default/weight selection,
and `180 lbs, top 10 in the class` with default/height/weight selection. Their exact literals,
options, retry counts and old expectations are archived. They now assert complete-entry null.

The seventh exposes a configuration-error-order consequence of retaining punctuation:
`parseMeasurement(',', { type: 'height', normalizedUnit: 'kg' })` now throws the existing
`normalizedUnit kg is not a height unit` error instead of returning null. The parent approved
this exact disposition. A comma with default options and empty input with contradictory
options still return null. No other punctuation-only result is claimed here. This is not a
numeric fix or AFA-251's separate default-unit/early-validator implementation.

The package reproduction found 24 failing private-reader spy assertions, with 146 semantic
passes: ESM/CJS builds cannot call a separate source-module spy. All public malformed-run
cases remain in package-selected tests. The unchanged positive-call and parsed-character
assertions now live in source-only `numberReadingWork.test.ts`; no test is skipped and no
package selector is weakened. The same 170 ESM/CJS cases then pass, alongside 297 focused
source tests. Historical failure logs remain separate from these passing runs.

Source coverage exposed two redundant branches. After nonempty normalized text, the private
stream necessarily contains a token: normalization either rejects the whole entry or retains
a non-whitespace character, and the token stream retains every such character. The earlier empty
normalized-text guard remains. The comma/Unicode join is called only for current `NEXT_PART`
keys ft and m, so its non-height alternative is unreachable. Extending that table with stone
requires an explicit height-only join policy at composition: stone minus, Unicode-minus and
comma/Unicode-negative components must not borrow the ft/m connector invariant. No stone
support or normalization change is made here.

Policy-derived controls cover mismatched unit brackets, nested expression wrappers and a
missing colon after the fixed weigh-in introduction. All 3,665 parser-facing tests then pass
with 100% statements, branches, functions and lines. This targeted report is not the final
full-check/mutation report. Twenty additional authored corpus controls retain all previous
2,064 rows byte-for-byte, giving 2,084 expected agreements. Full committed-source validation
and PR publication remain pending at this checkpoint; evidence is archived outside the
checkout under `final-validation/` beside the earlier design/probe/correction archives.

### AFA-250 failed mutation and focused correction — publication pending

Normal hooks committed the validation follow-up as
`7ffc2e49d4ecd553a2b5fcc969ec06b137d8ccc5`. The earlier editorial commit attempt failed
spelling; an orchestration error then launched a non-qualifying lint-only check on the dirty
checkout. Both logs remain separate. The subsequent clean committed-source full check passed
5,202 tests, 100% coverage and TypeScript, then stopped at the default non-incremental mutation
stage: 1,438 killed, 55 timed out, 185 survived, one uncovered and one ignored, score 88.92%.
No build, size, API or package stage ran in that full check. All eight selected source files
and all six report source bodies were verified against the committed bytes. The failed report hash is
`d71974c73c822e45cf3c961c84b33405f28722fcf27eb72b0807b3b22af66c02`.

The coordinator's scheduling hold began at the failed-stage boundary. Every owned process
group was verified empty and the allocation was explicitly released. Subsequent work here is
focused source testing and static diagnosis only; no new mutation, coverage, full check,
build, install or hook run is claimed.

Two focused regressions expose a real prefix-compound result defect: `ft five 0 in` and
`m: one 0 cm` returned null. The approved written-zero rule requires 60 inches with matches
`[5 ft, 0 in]` and 100 centimeters with matches `[1 m, 0 cm]`, respectively. Their failing-first
assertions and two new corpus rows are retained. Smaller-part validity now belongs to the
existing expression cursor, including explicit zero, integral larger values, upper bounds,
signs and dimensions. This result-changing fix is separate from redundant-code cleanup.

The cleanup removes the unused unsupported-unit regex, unused label-map values and unused
wrapper default. It centralizes part and pair validation in their existing cursors, retaining
one bounded numeric split and the original shared reader. The supplied-token index contract,
compact split and normalization remain unchanged. Current compound joins rely on `NEXT_PART`
containing only ft and m; later stone composition still requires explicit height-only sign
and bare-part eligibility. Nested compound-part brackets remain valid, while nested whole-entry
wrappers and incomplete phrases remain invalid. Individual failed-report mutant dispositions
record the precise caller and token preconditions; none is a blanket equivalence exclusion.

The final focused candidate passes 795 tests in 12 named source files, including real-reader
positive-call/work bounds, the approved generated result snapshot and the corpus report.
All 2,084 previous corpus rows remain byte-identical; the two arithmetic regressions give
2,086 expected agreements. The frozen 302-input probe and the separately authored 243 full
results are replayed without changing their expectations. An initial trial incorrectly
expected `.5 in .` to reject; it remains archived as a test-oracle mistake, not a production
bug. Both `.5 in .` and `kg .5 .` retain the approved 0.5 final-period result.

The complete failed-report disposition ledger, focused logs, replay and source hashes are
under `final-validation/mutation-corrections/` in the external evidence archive. Fresh exact
committed-source mutation and final validation remain pending a new coordinator grant. No
mutation-kill, performance or final-readiness claim is made from these focused results. F6/F9
historical closeout and all earlier deferred findings remain intact; publication is pending.

### AFA-250 second mutation report and wrapper boundary — publication pending

The next coordinator grant committed the focused correction as
`329deb9950c812025aebd59513e64436f18a12ec`. Normal hooks passed without a file delta.
Its fresh clean-source full check passed 5,285 tests, 100% coverage and TypeScript, then
stopped at mutation: 1,411 killed, 42 timed out, 36 survived, none uncovered and one ignored,
score 97.58%, below the unchanged 98% threshold. No build, size, API or package stage ran.
The actual report hash is
`af6e738cf4b9a4a4305ba60b43029c17331dbb59eb8bd9c1c8f1166bd0609330`;
all eight selected sources and six report bodies match that commit. This failed run remains
separate from every earlier failed or partial run.

The follow-up fixes one real wrapper-boundary defect: a closing entry quote could be read
as the suffix unit of its final bare smaller part. The existing part cursor now checks
`at < limit` before reading a suffix. Both ASCII quote styles preserve `5 ft 11` as
71 inches with `[5 ft, 11 in]`, and `1 m 80` as 180 centimeters with `[1 m, 80 cm]`.
The four bare quoted forms and both selected pair orders produce 20 corrected paths from
`329deb99`; explicit smaller-unit counterparts and malformed quote controls are preserved.
The original two-failure run was on dirty preparation source, not exact main or the commit.
A separate source-pinned replay on `329deb99` confirms all 20 failures. Exact main `70f3169`
already passes `ft five 0 in` and double-quoted `5 ft 11`; it drops the zero part from
`m: one 0 cm` (1 meter with one match) and rejects single-quoted `1 m 80`. These controls
are separate from branch-introduced regressions and the earlier written-zero correction.

Remaining cleanup retains a single bounded number split and the shared reader. The two
wrapper loops use exclusive equality bounds: their cursors advance by one, begin no later
than the limit, and cannot pass it. Unwrapped expression calls retain the full token limit;
bounded recursive calls are wrapped and skip that loop. The outer limit changes only
immediately before a break. The redundant join-start bound is removed, but a null join
still rejects; an excluded closing token cannot advance the join, and an empty bounded
numeric phrase cannot form a part. Additional empty reader attempts are bounded and remain
covered by the positive-call and parsed-character assertions.

The local `next.end <= limit` guard is retained. Two new malformed-wrapper controls,
`„0 ft “11”` and `‚0 m ‘80’`, return null with default and valid normalized units. With
today's unsupported JavaScript `normalizedUnit: 'st'`, they also return null because the
zero first part cannot reach conversion. Applying only actual mutant 853's replacement
causes premature inch/centimeter conversion errors; the exact source was then restored.
This is stronger coverage of an existing guard, not a production fix. The separate early
validation and stone work must revise the unsupported-unit premise when those changes land.

Three individually justified annotations cover only the invalid-article object, invalid-quote
object and adjacent-conjunction arithmetic alternatives (actual mutants 99, 376 and 134).
The conjunction reader backs either adjacent member to the same run boundary. No bound-wide
EqualityOperator annotation, threshold change or blanket survivor exemption was added.
New independent controls cover semicolon/sign rejection, repeated decorations and depth
inside a valid wrapped pair. The actual-report disposition ledger does not claim new kills.

The focused follow-up passes 971 tests across 14 named source files. All 302 frozen probe
results and 243 authored full results remain unchanged. Another 128 independently specified
full results pass, including raw input and matches; their exact-main and `329deb99` outputs
are recorded separately. All 2,086 prior corpus rows remain a byte-identical prefix, with
128 additions giving 2,214 expected agreements. The approved generated result snapshot is
unchanged. The corpus report counts are derived from independent labels, not observations.
Evidence is under `final-validation/actual-survivor-followup/` in the external archive.
Fresh committed-source validation is still required; these focused results make no mutation
score, performance or final-readiness claim. Historical F6/F9 publication remains pending.

### AFA-250 qualifying local validation — publication pending

The wrapper correction committed as `14ba82d12d429cf255df76cc7ce33e8ae5ea01f5` with
normal hooks and no formatting delta. Its clean `pnpm check` passed lint, 5,319 tests in
126 files, 100% coverage (444 statements, 477 branches, 55 functions and 364 lines),
TypeScript, the build, size limits, unchanged exported API and 7,106 ESM/CJS package tests
in 136 files. Mutation scored 99.86%, but the separate changed-line check correctly rejected
one parser survivor: bypassing a successful prefix return reread the same numeric phrase.
That report remains archived as a passed full command with a failed changed-line gate,
not as the qualifying final mutation report.

A test-only follow-up, `54b1e1deffb45df1760babf107591b59aadfc9fc`, adds three source-only
actual-reader assertions: `kg seventy two`, `m: one point eight` and `ft five` each require
one nonempty numeric read. Empty end-boundary attempts remain allowed. Their values and
written matches are independently 72 kg, 1.8 m and 5 ft; public counterparts remain package
selected. Applying only actual mutant 507 made all three work assertions fail (two reads
instead of one); original source was restored exactly. This changes no production result,
corpus label, snapshot, API, ignore directive or threshold. The focused source checks pass
106 tests, and the ESM/CJS counterpart checks pass 182 tests. It is a work-count regression
check, not a wall-clock performance claim.

The necessary fresh default non-incremental mutation run on that clean test commit scored
99.93%: 1,392 killed, 43 timed out, one survivor, none uncovered and four ignored. Mutant
507 is killed by the new `kg seventy two` reader-work assertion. The only survivor is in
`matchUnit.ts`, whose source is byte-identical to pinned main; matching policy remains
separate work. All changed-line mutants pass the existing gate. The four ignores are exactly
the three individually reviewed parser alternatives and the existing invalid-comma replacement.
The report hash is
`5776027e0cbea85b9dab1f74feb0d36482b8ca047836c2d297fcde99734d57cc`.
Every byte of all six report bodies and all eight selected sources matches the commit.

Both validation commits have source tree `61386e4089549953d55dcac9a7dc54e04f7a79bb`;
the final tested tree for tests is `1f0ae4c3704a94eb093b438ff4432b206c92c1b4`.
The successful full check, build/API/full-package evidence on identical production source
and the new committed-test mutation evidence are deliberately recorded with their own SHAs.
No redundant unchanged-source full check was substituted for that distinction.

A fresh build of exact main `70f31690c4835ab97d60bf4af9c7a48d2f57d878`, using the same
frozen toolchain, measures 5,736 bytes ESM and 5,795 bytes CJS after minification and Brotli.
The final build measures 4,581 and 4,630 bytes respectively. Both stay below the unchanged
6,000-byte limits; this is bundle-size evidence only. Build inputs, outputs, logs and exact
source hashes are preserved under `final-validation/` in the external evidence archive.
All earlier failed/partial reports, independent oracles, original audit findings, historical
F6/F9 closeout and deferred findings remain preserved. Local validation does not publish the
audit to main or establish hosted PR readiness; publication remains pending.

### AFA-250 PR handoff — publication pending

The complete-entry implementation is proposed in
[PR #247](https://github.com/afahy/fluent-measures/pull/247), opened from feature commit
`5cbd7ed91b28d8fedc9d97096ea47342e58c9db1` after normal push hooks passed 5,323 unit tests,
TypeScript, build and size checks. The URL handoff changes audit text only; source tree
`61386e4089549953d55dcac9a7dc54e04f7a79bb` and test tree
`1f0ae4c3704a94eb093b438ff4432b206c92c1b4` retain the validation above.
The sole unchanged matching survivor can affect higher fuzzy settings; it is not globally
equivalent or fixed by this PR. Hosted checks, review, qualifying merge and exact-main CI
remain with the parent. At this local handoff, F6/F9 audit publication is pending: a feature
push or an open PR does not publish the historical closeout to main.

### AFA-250 first PR review corrections — focused evidence only

Published `7dcd18e140869304a45638c00eaaf4b4bdcfa6f7` rejected `(180 cm).`, `[180 cm].`,
`about (180 cm).` and `m: one and eighty cm`. All four now have failing-first regression
records and policy-derived full-result assertions. Exact main `70f3169` returns 180 cm
for these inputs, but its metric prefix result has only `[180 cm]` in `matches`; the
corrected compound retains the written `[1 m, 80 cm]`. This provenance change is distinct
from restoring its total. The existing wrapper cursor owns one external final period;
a period on each side, as in `(180 cm.).`, still rejects.

A successful prefix phrase followed by its explicit smaller unit can use the first
conjunction as a compound boundary. The unit lookahead must start and end within the
expression limit, so an excluded closing quotation cannot become inches. This adds one
bounded walk over the already-read numeric token span, stopping at the first conjunction,
and one bounded left-phrase read; it is not a retry search or a normalization pass. The
cursor advances by one over a fixed span and never retries another conjunction. The
existing supplied-token failure boundary still handles an invalid whole phrase. Numeric
reader spies count numeric work, not this token walk. Successful unanchored scalars still
use one nonempty shared-reader call, including half and multiplier controls.

The explicit interpretation also means `m: one hundred and eighty cm` is 10,080 cm with
`[100 m, 80 cm]`, while `m: one hundred and eighty` remains the complete 180 m scalar.
`m: one and eighty and five cm` is 185 cm with `[1 m, 85 cm]`; the complete larger phrase
in `m: one hundred and one and eighty cm` instead yields `[101 m, 80 cm]` and 10,180 cm.
These arithmetic and boundary choices are explicit in the review ledger.

The separate 133-case ledger records 53 null-to-valid paths and 80 full-result controls
against published `7dcd18e`; against exact main it records 70 full-result changes and 63
controls, including match provenance. All 2,214 prior corpus full objects and all 243
earlier authored full objects are unchanged. All 302 frozen probe expectations still
agree, but seven wrapper-period objects change from null to 72 kg within their original
allowed alternatives. That permissive oracle did not assert rejection; its archive is
unchanged. A separate seven-row ledger and strict positive tests preserve this distinction.
Five match main; ASCII-quoted weight entries correct main's 72 in/72 ft to the written 72 kg.

The new corpus has 140 appended rows; all 2,214 earlier rows remain a byte-identical prefix.
Its 2,354-row report counts come from independent fixture labels. The approved generated
result snapshot remains unchanged. Focused evidence comprises 1,029 source tests before
the seven supplemental cases and a final 206-test run covering those cases, work bounds,
corpus, result snapshot and feature links. Captures pin all eight source bodies for main,
published and candidate sources, with temporary observation changes restored. Full-result
oracles, both ledgers, captures, exact hashes and verification limitations are archived in
`final-validation/review-round-1-corrections/` under the external evidence root above.
No fresh full check, coverage, mutation, build, package or size result is claimed for these
corrections. Prior successful evidence retains its original SHA. F6/F9 publication remains
pending; the parent owns hosted replies, final validation allocation and qualifying merge.

The first review-correction full check on clean `3f608c6d26ee1b8bc2afdfdea7beedad78781fbe`
passed 5,474 tests in 127 files but stopped at branch coverage (496/497). No later
TypeScript, mutation, build, package or size stage ran. Its exact coverage/source evidence
is retained under `final-validation/review-round-1-validation/` in the external archive.
The uncovered arm rejects a quoted whole number when its internal conjunction cannot
become a compound separator: `m: "one and eighty" cm` is not `[1 m, 80 cm]`. Eight new
policy-derived assertions distinguish that invalid duplicate-unit form from
`m: "one" and eighty cm`, the existing `m: one and "eighty" cm`, and a quote around the
entire qualified entry. Raw strings and full written matches are checked. The new corpus
has 2,362 rows, preserving all earlier 2,354 bytes before eight appended controls.
These additions change tests and audit evidence only; production source is unchanged.
Actual mutation outcomes remain pending; reaching the arm does not establish a mutant kill.

### AFA-250 actual first-review mutation follow-up — not yet qualified

The necessary fresh full check on `6a024c9a07b40b085c9c4901b9649ae3250fcbcf` passed
5,482 source tests, 100% coverage, TypeScript, build, API, size and 7,404 ESM/CJS tests.
Its actual non-incremental mutation report has 1,441 killed, 47 timed out, seven survivors
and four existing reviewed ignores (99.53%). Report SHA256
`c6083d5385e1b834c278f3b098b56a8dcc70624e0e0b8fbe40a2203d826003cb` has eight selected
sources and six byte-verified source bodies. The separate changed-line gate failed six
new prefix alternatives; overall command success was not treated as qualification.

Actual 523 exposed the same prefix/conjunction cause for selected pairs: `m: one and eighty kg`
requires 1 m or 80 kg according to the selector, and null without one. A following explicit
unit now anchors a compound or pair; the existing expression/root still enforce smaller-unit
bounds, valid positive expressions, different pair dimensions, full consumption and a selector.
Eighty-eight independent rows cover both orders, both selector paths, normalization, duplicates,
unsupported units, signs and defaults. Sixteen null-to-valid paths change from `6a024c9a`,
with 72 preserved full objects; exact main has 51 changes and 37 full-object controls.
All earlier 2,362 corpus objects and all 302 frozen/243 authored objects are unchanged by
this follow-up. The seven earlier permissive-probe transitions remain separately disclosed.
The corpus now contains 2,450 rows and keeps the prior bytes as a prefix.

Actual 510/512 were redundant with the retained unit-end guard: successful `readUnit`
results have end greater than start, so end within the expression also places the start
inside it. Non-consuming fixed-size lookahead may inspect a bracketed unit and following
assignment punctuation; an excluded closing mark is never accepted as part of the unit.
The ordinary suffix `at < limit` guard remains unchanged. The first-conjunction loop now
uses an exclusive endpoint: a successful number guarantees start no greater than end,
the cursor advances only by one, the endpoint never changes, and the first conjunction
returns immediately. This removes actual 527's redundant extra endpoint iteration.

Actual 520 is behavior-changing and its guard remains. For `"ft zero and a half ["]`,
default, height and centimeter options reject; current unsupported JavaScript option
`normalizedUnit: 'st'` retains `Cannot convert ft to st`. Exact main instead extracts
0.5 in (1.27 cm when normalized) and throws `Cannot convert in to st` for the unsupported
option. That message difference is explicit historical evidence. This preserves current
conversion-error order, not a valid malformed measurement or permanent stone policy;
AFA-251/254 retain their separate validation/unit decisions. Actual 536 adds two redundant
numeric rereads after the quoted-left failure: four nonempty reader calls versus two.
Positive-call work assertions distinguish its exact replacement while public results remain null.
No new ignore or threshold change was added. The 909-test focused run and captured exact
replacements establish bounded evidence, not fresh mutation qualification. All earlier
failed/partial reports and F6/F9 publication-pending history remain unchanged.

### AFA-250 first-review corrected-source qualification

Clean `4a04e92be6f87485702c123eb69af596e82d3c51` passed the fresh serial `pnpm check`
on November 7, 2026. The source tree is `8f9c06c9e61bc5951d484f59bccf320cb3dd1019`
and test tree is `8708fd3fff968b603f54ef8854e8d2d066e88724`. All 319 committed file
hashes remained unchanged through the run. This qualifies the corrected source separately
from the earlier `6a024c9a` command success whose changed-line gate failed.

The run passed 5,575 source tests in 127 files, TypeScript, and 100% coverage: 454 statements,
494 branches, 55 functions and 374 lines. Fresh default non-incremental mutation scored
99.93%: 1,435 killed, 50 timed out, one survivor, no uncovered mutants and four ignored
alternatives. Report SHA256
`eec8143a7a5034614aceb28d83f6b8b762307821fc7ab054d80e3e21d7d82da4` selects all eight
sources; all six report source bodies equal the committed and live bytes. The four ignores
match the prior reviewed alternatives exactly. The official changed-line gate passes against
pinned main `70f3169`. The sole survivor remains actual 40 in unchanged `matchUnit.ts`;
removing its initial anchor can affect higher fuzzy settings, so it is not globally equivalent
or fixed here. No threshold, assertion or exclusion was weakened.

The actual report kills the retained unit-end guard alternative (514) and the failed-left
retry alternative (527). The latter is caught by the positive-call reader test: four nonempty
reads instead of the required two. Removed redundant conditions have no claimed kills;
their caller proofs and the selected-pair behavior correction remain recorded above.
Build, unchanged exported API and all 7,582 ESM/CJS tests in 138 files passed. Exact sizes
are 4,668 bytes ESM and 4,706 bytes CJS, minified and Brotli-compressed, versus the preserved
same-toolchain pinned-main build's 5,736 and 5,795 bytes. The 6,000-byte limits are unchanged.
All eight baseline source files, shared build/lock settings and six baseline/final build
outputs were reverified. These measurements make no speed or accuracy claim.

A prior run on the same `4a04e92` stopped during coverage when the unchanged Git-isolation
nested suite timed out after 180,023 ms. Its 5,574 passing tests, sole failure, full nested
output, source pins and empty process group are archived; no coverage report or later stage
was produced. One unchanged targeted diagnosis passed all 11 tests, with the nested suite
at 100,499 ms on Node 24.21.0. The fresh qualifying full run passed that suite at 99,550 ms.
The original timeout's cause remains unexplained; no contention or intermittent-defect
classification is inferred. The real timeout, assertions and configuration were unchanged.

The 133, seven, eight and 88 review ledgers retain 236 rows across 235 distinct input/options
paths, with 130 full-result changes and 105 controls against exact main. Their one overlap
is explicit; the unsupported-option error-message comparison remains separate. All earlier
2,362 corpus objects, 302 frozen objects and 243 authored objects are preserved by the final
selected-pair correction. The earlier seven permissive-probe changes remain disclosed rather
than described as identical results. The 2,450-row corpus and approved generated snapshot
passed; all historical fixtures, ledgers and failed reports remain in the external archive.

Exact logs, report, source-byte verification, size comparison and self-review are under
`final-validation/review-round-1-validation/`. Normal publication hooks and the final feature
push are the next local steps. PR #247 remains subject to hosted review and qualifying merge;
F6/F9 historical audit publication remains pending until that merge.

### AFA-250 second PR review corrections — focused evidence only

Published `87039159e1aea4de27165a5c701e7b89b8e22b41` rejected six approved complete
entries: `(180 cm) tall`, `height is (180 cm) tall`, `about (5 ft 11) tall`, `“5 ft 11”`,
`kg 72.5.` and `kg: ½.`. Exact main `70f3169` returns their independently expected full
objects: 180 cm, 180 cm, 71 in, 71 in, 72.5 kg and 0.5 kg, with written matches preserved.
All six have failing-first records and strict regression/corpus assertions.

The existing wrapper completion now owns one outer height `tall` suffix, rejecting weight
and duplicate suffixes. A prior standalone period still cannot precede that suffix. Dotted
unit spellings remain units: `(72 in.) tall`, `(180 cm.) tall` and `(180 cm.) tall.` retain
their complete scalars. An outer `tall` owns its own final period, attached or separated by
space. Without that suffix, the existing double-period guard still rejects `(180 cm.).`.
No global dot count or additional scan was introduced.

The existing curly-mark normalization expression uses its quotation-context guard for both
numeric and word endings. A closing whole-entry quote therefore cannot become an inch or
feet mark merely because the smaller component is bare. The separate quoted-feet and compact
mark controls remain intact. The unused numeric-only quotation pattern was removed; no new
normalization pass or general quote policy was added. The existing token split retains a
period after a complete decimal as punctuation. Malformed dot runs remain invalid, and the
established `72. kg` numeric spelling stays unchanged. The shared number reader, its supplied
indices, public types, option policy and single compact split are unchanged.

An initially authored `(180 cm.) tall` null assertion was a trial-oracle error: it confused a
dotted unit with a standalone terminator. The parent resolved it from existing spelling and
wrapper rules. The original assertion, six proposed trial records and failed candidate/main
trial commands remain archived; their observed outputs did not supply the corrected oracle.
Likewise, the private `5.5. ft` token expectation now retains `5.5`, `.`, `ft`, while the
public result remains null because the period interrupts the number/unit expression.

The final 155-path ledger has 58 null-to-valid changes and 97 full-object controls against
published `87039159`; exact main has 63 full-object changes and 92 controls. It combines the
154 corpus additions with the extra `(72 in.) tall . .` public null control. The latter
already rejects on the published branch; exact main recovers 72 in, contrary to the approved
one-period/complete-consumption rule. All 2,450 prior
corpus objects and all 243 earlier authored objects are unchanged. All 302 frozen allowed
outcomes still agree, but two full objects change from null to their independently permitted
positive alternative: `my height is (181 cm) tall` and `I am “six feet” tall.`. Both match
exact main; a separate two-row ledger and strict new positives retain this oracle limitation.
The other 300 frozen objects and every original fixture byte remain unchanged.

The corpus now has 2,604 rows, preserving all 2,450 earlier rows as a byte-identical prefix.
Its report counts derive from fixture labels; the approved generated snapshot is unchanged.
The 16 named focused suites pass 1,484 tests, including scalar one-read and positive-call
reader bounds, mark/quote controls, compact notation, corpus and result snapshot. Exact
source-pinned observations, arithmetic/oracle ledgers, failed trials and process proofs are
under `final-validation/review-round-2-corrections/` in the external archive. This is focused
evidence only: `4a04e92` full-check/report qualification remains historical for the changed
source. Fresh full validation, mutation, package/build/size and publication hooks require a
separate coordinated grant. F6/F9 publication remains pending until the qualifying merge.

### AFA-250 second PR review — qualified source before final push

Clean source commit `8a2f17f603c3f32eff93897ae5615f1c0bc39e7b` passed one fresh
`pnpm check` after the reviewed focused corrections. All normal correction-commit hooks
passed without changing the approved candidate. The existing installed checkout retained
Node 24.21.0, pnpm 10.10.0 and the verified frozen package/lock/lifecycle setup; no new install
or borrowed dependency tree was needed.

The source suite passed 5,739 tests in 128 files. Coverage is 100%: 461 statements,
507 branches, 55 functions and 381 lines. The real Git-isolation test passed in 101,870 ms
with the unchanged timeout and assertions. Type checking, build, exported API comparison and
all 7,894 ESM/CJS package tests in 140 files passed on that same committed source.

The default non-incremental mutation report SHA256 is
`fbb27625cd764b24b52a0b201a666af731d866cc6a1901bdebf94acf311778e8`.
It records 1,482 killed, 50 timed out, one surviving and four ignored alternatives, scoring
99.93% with unchanged thresholds. All eight selected source files are pinned to the commit;
every byte of the six source bodies in the report matches the live and committed source.
The four existing reviewed ignore signatures, original source expressions and reasons are
unchanged. The official changed-line gate against exact main `70f3169` passed. No parser or
tokenizer survivor or uncovered alternative remains in this report.

The sole survivor is still `matchUnit.ts` mutant 40, removing the anchored start of its
prose-exclusion regex. That source is byte-identical to exact main. Its previously documented
higher-fuzziness limitation remains; this alternative is not globally equivalent or fixed.
There is no new ignore, relaxed assertion, threshold change or redundant full sweep.

The preserved exact-main same-toolchain build measures 5,736/5,795 bytes for ESM/CJS; the
qualified build measures 4,688/4,744 bytes with the same minified and Brotli-compressed
measurement and unchanged 6,000-byte limits. All baseline configuration/source/build hashes
and all six final output hashes are recorded. These are size measurements, not performance
or accuracy claims.

The current 155-path disclosure and historical first-review 235-path inventory remain
separate because their inputs overlap. The two permissive frozen transitions, original trial
oracle error, dirty versus exact failing-first pins and all earlier failed/partial reports
remain immutable. The generated result snapshot is unchanged. Local source qualification
does not publish the F6/F9 audit or settle hosted reviews: PR #247 still needs the final normal
push, hosted review and qualifying merge. F6/F9 publication remains pending until that merge.

The exact source, report, coverage, package/build/size records and process proofs are under
`final-validation/review-round-2-validation/` in the external evidence archive. The final
audit-only commit keeps the qualified source and test trees unchanged.

### AFA-250 third PR review — earlier numeric failure cursor, focused only

Published `4ac971aa3b4e44a03ad653274f4108386fa9b1df` returned null for both
`ft five eleven and (70 kg)` and `ft five eleven and weight 70 kg` with either type selector
or normalized cm/kg. Exact main `70f3169` and the approved complete-entry contract supply
71 in or 180.34 cm with [5 ft, 11 in], or the independent 70 kg result. All eight reported
full-object expectations fail on the published checkpoint and pass in the focused candidate.

The parser-local number wrapper already receives the earlier failed numeric token position.
It formerly replaced that position with a later trailing conjunction, so the single bounded
prefix split retried an invalid larger phrase. Its existing null return now precedes the
trailing/repeated-conjunction checks. Empty and leading-conjunction rejection stays first.
A failed full phrase still returns null; each bounded candidate and the root must independently
validate complete numeric structure, eligible compounds, both pair dimensions and consumption.
No shared-reader, normalization, unit-table, public-API or stone change is included.

Article offsets and the supplied numeric-token positions, including skipped conjunctions,
remain unchanged. The half wrapper still reads its whole-number portion once and validates
its complete suffix. There is no new scan, normalization pass or retry search. The existing
single compound split and fixed-span anchored-prefix conjunction walk are reused unchanged.
New actual-reader instrumentation records six nonempty calls for each of six successful
compound/pair controls, with first supplied invalidAt 1 or 3 for the article case. Twelve
scalar controls each make exactly one nonempty call. The six repeated-token controls at
8/16/32 retain five or six calls and stay below the existing four-times-input character bound.
These are work-count controls, not timing or mutation-kill claims.

The independently authored 143-path corpus inventory has 56 null-to-valid changes and
87 controls versus published `4ac971aa`; exact main has 57 changed full objects and 86 controls.
Six additional malformed work controls retain public null assertions and package counterparts:
the complete 149-path ledger has 56 changes/93 controls versus published and 63 changes/86
controls versus main. No overlapping historical review inventories are added to these counts.
The initial 57-failure trial included a rounded scalar oracle error: binary64 5.5 times 30.48
is 167.64000000000001. Its original literal/assertion/log is preserved separately from the
corrected 56-failure baseline; no numeric production change was made for that trial.

The 11 named focused suites pass 1,224 tests. All 3,149 prior full objects remain unchanged:
2,604 earlier corpus rows, all 302 immutable frozen probes and all 243 authored cases. The
prior exact-main observations also reproduce exactly. The corpus is now 2,747 rows, preserving
the old 2,604 rows as a byte-identical prefix and deriving counts from fixture labels. The generated
result snapshot remains unchanged. All 3,298 candidate observer rows agree with their independent
expectations; observer command report mismatches from extra temporary rows remain recorded.

Source pins, failing-first runs, complete result/rule ledgers, article/half/work evidence and
restoration/process proofs are under `final-validation/review-round-3-corrections/` in the
external archive. The prior 8a2f17f6/fbb27625 full qualification remains historical for this
changed parser. Fresh full/report/package qualification and normal hooks/push need a separate
coordinated grant. PR #247 remains blocked on the reported finding; F6/F9 publication is pending.

### AFA-250 third PR review — qualified source and publication handoff

Under the explicit coordinator grant, the normal correction commit and all hooks passed with
no formatting delta at `bf2565455c302230b68a223010879784c9d92ebd`. Its source tree is
`847146e23bfeddf3f8f0220a9efaf6f3f157a654` and test tree is
`d67e15d64fc071e1ccd01b80adcd796b99517fd8`. All 321 tracked file hashes remained identical
through the fresh clean committed-source `pnpm check`; the retained frozen installation,
dependency files and toolchain were unchanged, so no new installation was needed.

That full check passed lint, 5,896 source tests in 129 files, TypeScript, build, public API and
8,186 ESM/CJS package tests in 142 files. Coverage is 100%: 461 statements, 507 branches,
55 functions and 381 lines. The real nested Git-isolation test passed in 101,867 ms with its
unchanged timeout. This fresh run qualifies the corrected source; earlier successful runs
remain evidence only for their recorded source commits.

The actual default non-incremental mutation report is
`fa48a77d5934a89bc656a9d9caadae16dbe43820c47963a44d51492e6648129d`: 1,484 killed, 48 timeouts,
one survivor and four ignored mutants. All eight selected source files match the committed
and live bytes; all six source bodies in the report match exactly. The four ignored source,
mutator, replacement and reason signatures are unchanged from the previous reviewed report.
The official changed-line gate against exact main `70f3169` passes. Sole survivor 40 remains
the unchanged main matcher start-anchor alternative at higher fuzziness settings: it is not
globally equivalent or fixed, and no new ignore, threshold change or waiver was introduced.

The final measured ESM/CJS sizes are 4,684/4,740 bytes against the preserved exact-main
5,736/5,795-byte baseline, with unchanged 6,000-byte limits. All eight baseline sources,
dependency/build/size configurations and six baseline outputs were reverified; all six final
outputs match this full check. These are build measurements, not runtime performance claims.

The separate 149-path third-review ledger retains all 63 exact-main differences, independent
arithmetic, full raw/matches objects and malformed controls. The 3,149 prior objects, original
oracle-error trial, corrected failing-first evidence, earlier review inventories, approved
generated snapshot and retained stash remain preserved. Their overlapping path counts are
not combined. No source or test change follows this qualification; this appended audit is
the only final publication edit.

Exact run, report, coverage, package/build/size identities and process proofs are under
`final-validation/review-round-3-validation/` in the external evidence archive. Normal final
push and parent-owned hosted review remain separate from local qualification. PR #247 is not
declared merge-ready here, and F6/F9 publication remains pending until the qualifying main merge.

### AFA-250 fourth PR review — quote and unit identity correction

The published checkpoint is `5bae01e4c35dff52947fcd43cb12405145c77df0`. Root review
4504447325 reported three ASCII-quoted compound spellings across three option paths: all nine
returned null instead of 71 inches or 180.34 cm with both written matches. Exact main `70f3169`
returns those full expected objects. Two missing ASCII closes with Unicode inch marks returned
71 inches on both published and main; their approved null outcomes are preserved-main policy
gaps, not introduced regressions. The modifier-prime counterpart has the same missing-close gap.

The existing normalization path now retains explicit feet and inch identity as canonical prime
and double-prime tokens. The existing curly-mark lookahead, preceding-mark context and slash
fraction exclusions use that alphabet. Private normalization strings intentionally change; that
alone is not a public result change. ASCII quotation delimiters remain distinct. The existing
token rewrite still handles immediate-digit paired inch marks and preserves its ASCII quoted
number exception. Mixed prime/apostrophe pairs stay separate until the existing unit reader
can prove both marks belong inside the current expression, are adjacent to each other and to
the preceding digit, and occur in suffix position. All three callers supply the same exclusive
limit; ordinary suffix and following/next-part end guards remain in force.

Both existing wrapper loops use one local token predicate to distinguish an internal unit from
a closing quote. The predicate inspects a fixed number of token positions per existing cursor
step, with no numeric-reader call or parsed-candidate retry. Its numeric token check can inspect
token characters; the reader spies do not measure that predicate. The loops still advance only
by one within their existing span. Complete inner and root consumption reject missing, extra,
nested or mismatched closes. A standalone period cannot masquerade as a following number.
No additional normalization pass, recovery scan, public API, stone support or shared number
reader change is included. Prefix label punctuation and unsupported-option error order remain.

The independent 261-path full-object ledger contains 180 positives and 81 null controls:
88 changes/173 controls versus published, and 96 changes/165 controls versus exact main.
The nine reported regressions and three missing-close gaps are classified separately. Single
quoted feet scalars with prime, acute and modifier-prime marks restore 6 feet from published
null; exact main agrees. The double-quoted prime scalar control stays 6 feet here, while main
returns 6 inches. Curly quoted feet followed by paired prime/acute/mixed inch marks preserve
published/main 71-inch results. The earlier 228-path candidate ledger remains immutable; its
missing curly-pair consumer produced 19 failed assertions in the expanded dirty-candidate run,
then all 261 pass after the existing paired-mark class includes canonical prime.

Candidate-only feet-close, scalar-close and period regressions remain separately archived;
they are not attributed to published main. The attached-hyphen trial's null oracle was wrong:
the documented attached mark join gives 71 inches. Its original assertion and failure remain
separate from independently corrected expectations. Preparation failures and temporary observer
report mismatches are also retained rather than represented as successful validation commands.

The final 23 named source suites pass 2,196 tests. Another 48 selected normalization spelling
cases pass; the two unchanged long timing tests were not selected in this focused phase.
All 29 captured real-reader work records retain positive calls: 12 scalar controls have one
nonempty read, five quoted compounds have two reads over three numeric characters, and the
existing repeated-input/article/half controls retain their character bounds and token indices.
These are work-count checks, not speed measurements or mutation-kill claims.

All 3,298 earlier fixture entries and full objects remain identical: 2,747 corpus rows,
302 frozen probes, 243 authored cases and six auxiliary work controls. Their exact-main
observations reproduce too. All 3,559 candidate observer rows meet independent expectations.
The corpus is 3,008 rows with its old byte prefix intact and report counts derived from labels;
the approved generated result snapshot is unchanged. Exact failing-first, published/main,
private spelling, work and restoration evidence is in the external archive under
`final-validation/review-round-4-corrections/`.

The previous bf256545/fa48a77d full qualification is historical for these changed sources.
Only focused preparation is complete here; fresh committed-source full/report/package/size
validation and normal hooks/push require a separate coordinated grant. The review finding and
PR #247 remain pending, and the distinct F6/F9 historical publication status remains pending.

### AFA-250 fourth review — actual mutation follow-up

The normal correction commit `7d2c715c9ae87454278206a9c52a16cfae6bb6ca` preserved the reviewed
candidate exactly. Its fresh full check passed 6,169 source tests, TypeScript, build, public API
and 8,708 ESM/CJS package tests. Coverage was 100%: 475 statements, 544 branches, 57 functions
and 391 lines. The actual non-incremental report
`0bb628a3a521ffa135eee05f007efaf4762fbbcb099d4faee6ec56b21bc9c680` has 1,608 killed, 49 timeouts,
six survivors and the same four individually reviewed ignores. All eight selected source files
and six report bodies match live, committed and archived bytes. The command passed, but the
official changed-line gate failed on five survivors; that run is not final qualification.

Exact replacements from that report were tested against 33 independently frozen public cases,
with source restored after each experiment. Survivor 1071 adds four failures for selection
from a whole single-quoted pair with an internal feet mark. Survivor 1167 adds six failures
for quoted or bracketed unqualified inference: the approved bare-number alternative does not
expand to wrappers. These assertions expose actual alternatives; fresh mutation outcomes
remain necessary. The unchanged higher-fuzziness matcher survivor 40 retains its prior limit.

Survivors 262 and 268 led to bounded control-flow cleanup, without new ignores. Both wrapper
loops now invoke the helper inside their existing matching-close branch, so the helper's
second equality test is redundant and removed. Double versus single ASCII quote handling
uses a mutually exclusive conditional, retaining the single-quote guard for other closers.
Continue still occurs before depth decrement; break, inner consumption, and opener depth
handling retain their original order. Focused observations alone are not an equivalence proof.

Survivor 1349 exposed a real boundary error: eligible paired ASCII apostrophes became an ASCII
entry close. Three missing-close inputs across nine options incorrectly returned a height.
The existing same-pass replacement now writes canonical inch identity for every eligible
pair; its existing eligibility and quoted-number exclusions remain. Private token spelling
for `72''` changes from ASCII double quote to double prime. A paired unit cannot supply an
absent entry close. No extra pass, scanner, reader/API/stone change or comma rule is introduced.

Two trial-oracle errors remain archived separately. Approximation around an entire selected
pair is outside the approved grammar; approximation on one qualified measurement within a
pair remains valid. An immediately adjacent `,70` is a decimal number, not a pair separator;
the intended positive counterparts use comma-space. The original positive trials, 13-failure
and eight-failure logs, and corrected independent dispositions remain intact.

The 58 new full-result controls have 24 positives. They change nine checkpoint results,
24 published results and 33 exact-main results. The earlier 261-path inventory is unchanged;
the two sets have 318 distinct raw/options paths, with 112 published and 129 main differences.
All 3,559 earlier fixture/full objects and their published/main observations remain identical.
All 3,617 candidate observer objects agree with independent expectations. Corpus counts derive
from 3,066 labels, retaining its old byte prefix; the approved generated snapshot is unchanged.
The 18 focused suites pass 1,742 tests, and all 29 real-reader work records retain positive calls,
indices and bounds. Exact source/experiment/result evidence is under
`final-validation/review-round-4-validation/actual-survivors/` in the external archive.

This uncommitted follow-up still needs fresh committed-source full/report qualification.
No new ignore, threshold reduction or claimed mutant kill substitutes for that report.
PR #247 and the distinct F6/F9 main-publication status remain pending.

### AFA-250 fourth review — final source qualification

The reviewed follow-up is committed as `f925cc5d1107b48251c95e57cf31ed68a3649f51`, with source
tree `d8e64e29b784e5447f27cc5870e06100dcee0f1b` and test tree
`5fc58e43f255848003be1b894a0e303a672fad52`. Both normal correction commits passed all hooks
without a formatting delta. The retained frozen dependency setup, package, lockfile and
toolchain remain unchanged; no additional install or borrowed dependencies were needed.

The necessary fresh clean-source `pnpm check` passed 6,227 source tests in 131 files,
TypeScript, build, public API comparison and 8,824 ESM/CJS package tests in 146 files.
Coverage is 100%: 476 statements, 541 branches, 56 functions and 392 lines. All 323 tracked
file hashes stayed identical to the committed input throughout the run. The earlier
7d2c715c full-command pass with a failed changed-line gate remains historical, not qualifying.

The actual report is
`5b460bdbfab5c1a22560a9a52249a975882aa8464470ce950506bbf6821202b7`: 1,603 killed, 50 timeouts,
one survivor and four ignored mutants. Mutation was non-incremental, with the unchanged
98 threshold. All eight selected sources match live, committed and archived bytes; all six
report source bodies match those same bytes. The four exact source, mutator, replacement
and reason signatures match the previously reviewed ignores. No new ignore was added.
The official changed-line gate against exact main 70f3169 passed from this actual report.

The former outer-wrapper survivor 1071 is current mutant 1069, and the former bare-inference
survivor 1167 is current mutant 1161. Both are actually killed; the report identifies the
corpus assertion as the killing test. The earlier exact experiments remain separate evidence
for the independent full-result controls. The redundant equality/quote alternatives and
conditional inch replacement were removed by the reviewed changes, not suppressed.
The sole survivor 40 remains in matcher source identical to exact main. Removing its anchor
affects higher fuzzy settings; it is neither globally equivalent nor fixed by this ticket.

The measured final build is 4,820 bytes ESM and 4,875 bytes CJS, against 5,736 and 5,795 bytes
for the preserved exact-main build. The same toolchain, package/lock/build configuration,
eight baseline sources and six baseline outputs were reverified. Both unchanged limits are
6,000 bytes. All six final build output hashes are archived. This is a build-size comparison,
not a parser speed or accuracy claim.

The fourth-review union remains 318 distinct input/options paths, with 112 published and
129 exact-main full-object changes. All earlier observations, the 3,617 current full objects,
29 positive-call reader records, approved generated snapshot and both trial-oracle corrections
remain preserved. The original 261-path and subsequent 58-path ledgers remain separate;
their overlap is not counted twice. The historical full check and failed gate are immutable.
Final report, coverage, build, size and source pins are under
`final-validation/review-round-4-validation/` in the external evidence archive.

This section records local source qualification, not hosted review or publication to main.
The normal evidence-only audit commit and feature push follow under the active grant.
The parent retains review finding 4504447325 and PR #247 stewardship. The distinct F6/F9
historical closeout publication remains pending until the eventual PR lands on main.

### AFA-250 fifth review — focused wrapper preparation

Published `b92f9644a9fa6af4dae9c469a936ad091ed674a6` and its f925cc5d qualification remain
immutable historical evidence. The parent froze 37 full-result paths for review findings
4504713300 and 4504713301. Ten failed on published source: eight preserve exact-main results,
while two weight-selector paths are approved-contract gaps already returning null on main.
The first independently expanded 217-case source run failed 61 cases on exact published
source. Its original literals and failure log remain separate from later passing evidence.

Only the root whole-entry wrapper loop can now continue past an ASCII inch quote at an
existing pair separator. Individual expression wrappers still close at that quote, preserving
a quoted height followed by an outside weight when no final whole-entry quote exists.
The shared separator set contains only the existing comma, semicolon, slash, conjunction,
parenthesis and square-bracket routes. Continue remains before depth decrement; matching-close,
break and depth behavior remain. No numeric read or parsed-candidate retry is added.

A bracketed second expression can own its separator bracket inside an outer pair wrapper.
The root starts it at a recognized in-bound separator: the first expression has ended before
the exclusive outer limit. An unwrapped call with an opener therefore has start below limit;
the wrapper cursor advances only by one without changing that bound. Recursive wrapped calls
skip this loop. A token beyond the outer limit cannot become a separator. Existing first-part,
next-part, unit-span, ordinary suffix and complete-consumption bounds remain. Missing, nested,
mismatched and extra closes reject both selectors; arbitrary nested wrappers are not enabled.

The existing curly normalization guard now recognizes exactly the reader's curly openers:
left/low single and left/low/right double quotes. Right single quote is not added as an opener.
A right double quote already in numeric suffix position remains a unit. The first simple
opener-class candidate failed the existing private spelling control for two separated inch
marks; that candidate-only failure remains archived. The corrected numeric suffix-context
lookbehind stays inside the existing pattern. Its quotation segment stops at a right quote;
the new predicate examines adjacent suffix context, with no separate backward scan or pass.
Adjacent-digit, following-inch and following-explicit-unit behavior remain covered.

The final independent ledger has 233 paths: 149 positive full arithmetic/match results and
84 null controls. It records 61 published and 108 exact-main full-object differences, including
the bracket-pair route separately from the original ten paths. All 3,617 earlier fixture entries
and full results, including exact-main observations, remain unchanged. All 3,850 current observer
objects agree with their independent allowed outcomes. The corpus retains its 3,066-row byte
prefix and adds 233 ticket-sourced rows; report counts derive from its 3,299 labels. The approved
generated result snapshot remains unchanged. Nineteen private normalization records distinguish
private spelling changes from public results, including genuine quotations before later units.

All 29 earlier real-reader records remain identical. Six new whole-pair controls each make
three nonempty numeric reads over five characters. These spies measure numeric work, not regex
lookbehind work. No speed, size, mutation-kill or full-qualification claim follows. The unchanged
long timing fixtures await an allocated final run; none was added or run in this focused phase.
Current captures are the 3,850-row `*-ready-observations.json` files in
`final-validation/review-round-5-corrections/`; earlier captures remain historical evidence.

Only focused correction is authorized here. Fresh committed-source full/report/package/size
validation, normal hooks and push require a separate grant. No reader, public API, stone support,
extra normalization pass or recovery scan is introduced. Both review findings remain pending
parent publication and hosted review. The distinct F6/F9 historical publication remains pending.

### AFA-250 fifth review — local qualification and corpus disclosure

Under the exclusive grant, production commit `2936db536294dd45d03968a9251dda5e8c3b8cd2` passed:
6,480 source tests in 132 files, TypeScript, build, public API and 9,290 ESM/CJS package tests
in 148 files passed. Coverage is 100%: 477 statements, 544 branches, 56 functions and 394 lines.
The unchanged timing fixtures ran in that full check; reader work counts still do not measure
regex timing. Its first actual report `4183fa6f` had 1,612 killed, 49 timeouts, three survivors
and four ignored mutants. The full command passed but the changed-line gate failed. This
report and its complete logs, sources, coverage and build remain immutable historical evidence.

Two exact tokenizer alternatives, 1278 and 1279, changed the existing following-unit check's
substring. Frozen experiments showed private curly-mark spelling differences, while all eight
public full objects remained identical. Commit `091285220ea5a21d7abd81c5392264d206ede986` adds
only six test lines: two private spelling assertions and two public null counterparts. There
is no production correction, new ignore or runtime result change in that test commit. Its
source tree remains `15aa1a89c2bb722b4e7a5298aba39650bf48654d`; its test tree is `e83178a9`.
The necessary fresh default non-incremental mutation report is
`96283e8d31c8bf23438b7c9ab30668f4ba7751ac961de652a571b81ed6add978`:
1,619 killed, 44 timeouts, one survivor and four exact previously reviewed ignores. Both 1278
and 1279 are killed by test 4909, the private spelling assertion for `72’ kg`. All eight selected
source paths and six report source bodies equal committed, live and archived bytes. The
unchanged threshold is 98 and the official changed-line gate against exact main `70f3169`
passes. The sole survivor, matcher 40, remains byte-identical to main; its higher-fuzziness
anchor-removal limitation is not called globally equivalent or fixed.

The two public counterparts also expose approved-contract differences from exact main:
`72’ kg` changes from 72 kg with matches `[72 kg]` to null, and `5½’ ft` changes from 5.5 ft
with matches `[5.5 ft]` to null. These are preserved mark/duplicate-unit policy differences,
not new runtime changes from the spelling assertions. Exact main source capture, full raw
objects and the independent complete-entry basis are archived separately. Corpus commit
`7461e95630d76df757dacd5332185f40b0337d76` adds only rows `afa250-r5-234` and `afa250-r5-235`
and two report count lines. The prior 3,299 rows are a byte-exact prefix; the new total is
3,301. Both rows are Unicode cases because U+2019 mark identity controls the second unit
rejection. Hand-derived total/agree counts change from 3,299 to 3,301 and Unicode counts
from 394 to 396. Every other report byte, including seven multiple-outcome dispositions,
remains unchanged. The approved generated snapshot `ebae8b38` remains unchanged. Whole
corpus/entry checks pass 61 source tests, and both package formats pass 64 corpus tests.
The added public counterpart file also passed 470 package tests. Normal hooks ran; their
configured file globs do not select JSON Lines or snapshot files, so no formatting or spelling
coverage of those excluded files is claimed. Corpus schema and explicit byte proofs cover them.

The measured unchanged production build is 4,863 bytes ESM and 4,906 bytes CJS, against
5,736 and 5,795 bytes for preserved exact main. All six current outputs equal the full-check
build, with identical toolchain/package/lock/build configuration and unchanged 6,000-byte
limits. This is a size comparison, not a speed or accuracy claim. No redundant full check,
coverage or mutation run follows the corpus-only assertion additions.

All fifth-review ledgers, original failures, private spellings, 3,850 full objects, 35 real-reader
records and 3,617 prior preserved objects remain in the external evidence archive under
`final-validation/review-round-5-corrections/` and `review-round-5-validation/`. The 233-path
ledger and two supplementary corpus controls remain separately identified. This section
records local qualification before normal feature push. Parent-owned hosted review findings
4504713300 and 4504713301 remain pending verified publication and review. The distinct F6/F9
historical closeout publication remains pending the eventual PR #247 merge and exact-main CI.

## Approved policy revision: explicit source defaults (AFA-251)

The historical findings and reproductions above describe their recorded revisions, including
AFA-66 magnitude inference and token-dependent option errors. They remain historical evidence;
this policy change does not reclassify them as mistakes or rewrite their expected outputs.

The AFA-251 preparation against `bfac12a943720390c60afd26a522cb67dfa20fa3` implements the approved
replacement of `allowUnqualified`/`inferUnit` with an exact `defaultUnit`. It removes implicit
imperial selection and the below-three metric-height guess. Options now validate for every
string before length or tokenization, in the approved AFA-178 order; the non-string guard still
runs first. Defined retired options raise migration errors. Bare defaults read the complete
unwrapped number, with no discarded punctuation or suffix recovery. AFA-250 owns the wider
complete-expression grammar integration; AFA-253 owns fuzzy removal; AFA-252 owns detailed
failure/provenance results. Those changes are separate from this preparation.

Composition onto `ae985e1c7d257c7ceb215d9fa51243c4df85d8d8` retains the merged complete-entry
cursor and original audit closeout. The original whole bare numeric read is retained before
part reduction; the former fallback reread and magnitude/system switch are removed. The
shared numeric reader, tokenizer and unit tables remain unchanged. The two real-reader
controls in `tests/defaultUnitWork.test.ts` require exactly one call for each bare number.
Composition evidence and validation results are recorded in
[PR #252](https://github.com/afahy/fluent-measures/pull/252), separately from the historical audit.

### AFA-251 composition and compatibility policy

The bfac12a and ae985e1 paragraphs above describe earlier preparation stages. The AFA-251 PR
composes explicit defaults onto `d874ded31ecedf9a7c0a874685e034999ab6989e`, preserving the
complete-entry cursor and the landed AFA-265 curly-unit rules. Bare numbers use the caller's
source unit at every magnitude; written units override that default. Empty strings and null
values for type and normalizedUnit count as absent, while null defaultUnit and defined retired
options are configuration errors. Options-container errors precede string length/content checks.
The forced 2.99 m / 3 cm property controls retain all targets, written-value counterparts and
no-default controls. The AFA-251 PR description records composition evidence and validation;
historical findings and their original revision references above remain unchanged.

## Approved policy revision: no quote or bracket wrappers (AFA-277)

The maintainer decided on 2026-11-08 to stop reading wrappers, to reduce bundle size. Quotation
marks, parentheses and square brackets around an entry, around one measurement of a pair, or
around a number no longer make a measurement. The F2 and AFA-265 quotation rows above describe
the earlier implementation and stay as historical evidence.

M1 no longer carries quotation context. `normalizeForms` writes a curly `’` or `”` after a
number as `'` or `"`, even at the end of the entry or before a unit name. Primes keep their unit
identity, and an apostrophe in a word stays. M2 writes two feet marks right after a digit, in
any mix of `'` and `′`, as `″`, with no check for an earlier opening pair. The parser
no longer has a whole-entry wrapper cursor, quoted numbers or quoted feet. Its bracket cursor
remains only for the second measurement of a pair, as in `5'11" (180 lbs)`. Bracketed unit
labels and bracketed smaller parts are unchanged.

## One tokenizer scan (AFA-88)

M1 and M2 are now one scan from left to right in `src/tokenize.ts`. Before the scan, one
replace applies the character table to the whole input, because `㎝` and `㎏` become two
characters and the scan's rules read the converted text. In the scan, `readNumber` converts
each run of number characters with three patterns, for comma groups, Unicode fractions and
slash fractions. `normalizeForms`, `normalizeNumericCommas`, `normalizeFractions`, `normalize`
and `tokenizeNormalized` are gone, and so is the parser's string path for whole-entry shorthand
such as `5-11`, which now reads the three tokens. No result changes. The scan writes the same tokens, with the same places, as
the passes wrote, with one exception that changes no result. Each token is lowercased alone,
not as part of the whole text, so a Greek capital sigma can take the other lowercase form, `σ`
or `ς`, than it took on main. No unit, alias or number word has a sigma.

The scan carries this state:

| State          | Meaning                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `token`/`kind` | The word or number being read                                                |
| `place`        | The place in the converted text, so token boundaries and adjacency stay      |
| `solid`        | The last character that isn't a space, for the fraction rule after a letter  |
| `label`        | Whether a letter and only numerals come right before, as in `phase2,180`     |
| `first`        | Where the first number of the input starts, found once for a minus sign      |
| `unitEnd`      | Where a unit ends that digits right after don't join, as in `5ft11` (AFA-62) |

The table converts full-width forms, `㎝`, `㎏`, primes and acute accents. A minus sign is a
sign when no number comes before it. A curly closing quote after a number or a number word is a
mark. `readNumber` takes the letter or quote mark before a run as context. A comma group of the
wrong size still rejects the whole input.

## Approved policy revision: one-edit fuzzy matching (AFA-253)

The maintainer decided on 2026-11-09 (AFA-253 comments 9bf0c672, 3e80ce01 and 226d15f6) to bound
fuzzy matching so that every match can be tested. The numeric `fuzziness` option is retired: any
defined value throws `fuzziness was removed; use fuzzy: true or remove it`, like the other options
that AFA-251 retired. The new `fuzzy?: boolean` option reads a unit name with one spelling error. An
invalid `fuzzy` throws a TypeError after `defaultUnit` and before the retired options. The earlier
findings above about edit budgets, fractions and Infinity (AFA-189) describe the numeric option and
stay as historical evidence.

`matchUnit` keeps its order: an exact alias returns at once. With `fuzzy`, the first alias in
`UNIT_ALIASES` order that is one edit away wins, among aliases of four or more letters that start
with the word's first letter and aren't British spellings. The regular expression that blocked
`food`, `feel`, `feed`, `fool`, `kill` and `kills` is gone (AFA-253 comment d5897102): with
`fuzzy`, every word that the rule accepts reads as its unit, English words included. One reviewed
typo that the rule doesn't accept, `kilgrm`, reads as `kg` with `fuzzy`. `kilogramme` and `kilogrammes` are new exact
aliases of `kg` and, like the other British spellings, match only exactly. One edit accepts 3,941
spellings, 2,288 for height and 1,653 for weight, and `tests/matchUnit.oneEdit.test.ts` checks
each one.

## Compound-boundary integration with complete entries (AFA-51, 2026-11-09)

PR #240 integrates main through `8d286f3` with normal merges and changes no file under `src/`.
The complete-entry grammar on main already keeps height parts apart: semicolons and ordinary
words other than `and` between parts, in any script, reject the entry, and letters attached to
a number or unit stay part of that word. An earlier AFA-51 design added a match-span map, a gap
guard in M9 and a range-recovery exception to the extraction parser. That design never reached
main, and restoring it would undo the approved complete-entry policy.

The PR adds 62 compound-boundary regression cases and 26 ticket-sourced corpus entries. Their
expectations follow PARSING.md's Complete Entries, Semicolons, Ranges and More Than One
Measurement sections. In particular, `0 m; actual 80 cm`, an attached unknown word beside a
valid part, a range inside a height, and an independent zero measurement all reject the whole
entry. Valid complete compounds keep their hand-calculated totals.
