# Library state machines

<!-- cspell:ignore NFKC apfahy meterrs -->

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

Status: [PR #242](https://github.com/afahy/fluent-measures/pull/242) is open with final
source `512cb75f393db54f938cdcea62023e22eb09c9a8` on `t3/metric-height-shorthand`.
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

Focused integration preparation retains the same F6 owner and PR, with branch HEAD still
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
No full check, coverage, mutation, build, API/package, size or push validation has run for this
combined source. All earlier full-check/report/size evidence above remains historical until
fresh committed combined validation runs under a separate grant.

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

| Work stream                   | Tickets / order                    | State and required handoff                                                                                                                                    |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publish this audit            | [AFA-235][audit]                   | [PR #228](https://github.com/afahy/fluent-measures/pull/228) merged at `527f7b5`; main CI passed                                                              |
| Separate tokenizer refactor   | [AFA-88][refactor]                 | In Progress; preserve existing remote branch `apfahy/afa-88-read-every-number-form-in-one-tokenizer-pass`, last observed `ded9ee0`; requires maintainer merge |
| Boundary and number fixes     | AFA-75 → AFA-74 → AFA-202 → AFA-62 | Pause lifted by maintainer on 2026-11-06; fresh sessions fix one ticket per PR                                                                                |
| Quote and ownership fixes     | AFA-78 → AFA-203 → AFA-116         | F2, F5 and F7 complete; F7 merged as `b90ea36` from reviewed `28c3d21`; all 12 exact-merge main CI jobs passed; no successor                                  |
| Inferred conversion underflow | [AFA-107][underflow]               | Pulled forward independently; [PR #233](https://github.com/afahy/fluent-measures/pull/233) merged at `b76070d`; main ci-ok passed; no successor assigned      |
| Numeric conversion            | [AFA-236][overflow]                | `units.ts` correction at `ecf7a2e`; full validation passes; [PR #230](https://github.com/afahy/fluent-measures/pull/230) tracks review/merge                  |

The maintainer explicitly lifted the AFA-88 pause for these eight confirmed targeted fixes on
2026-11-06. Their AFA-88 blocker relations were removed. Other dependencies remain; the tokenizer
refactor is separate and is not part of these fix sessions. AFA-107 was pulled forward into
[PR #233](https://github.com/afahy/fluent-measures/pull/233); it is no longer in the queue after
AFA-203. AFA-74 completed [PR #232](https://github.com/afahy/fluent-measures/pull/232), merge `bfac12a9`,
and all 12 exact-merge main CI jobs. AFA-202 then completed PR #236 at merge `e1d3a457`,
with all 19 PR checks and all 12 exact-merge main CI jobs passed. The coordinator released the
implementation hold for the already assigned AFA-62 owner after that gate passed. AFA-62 is the
final ticket in this targeted queue; no duplicate or successor session is assigned.

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

| Session                                                                                                                                                                                 | Assigned work                                                       | Launch state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:ab3e225544f4690efa2764d0a191792e86a687eff06d7b4e3bb8c5380b1b736d>                                                       | AFA-235 publication and review of this document                     | [PR #228](https://github.com/afahy/fluent-measures/pull/228) merged at `527f7b5`; main CI passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:9df9034c3ce42adbebf696dd9b9d990bec04b84a9494a53e3c9bf77d6c1fc1d4>                                                       | AFA-75, then fresh successor sessions for AFA-74, AFA-202, AFA-62   | [PR #229](https://github.com/afahy/fluent-measures/pull/229) merged at `fa73fd5`; all 12 main CI jobs passed; AFA-74 successor launched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:1a5f5b908ee23500b3eab3c85521ed6236b310c0f375af966f353457aef7d25e>                                                       | Original AFA-78 implementation and recorded successor queue         | Stopped for the maintainer-requested takeover; clean history preserved through `02d463a`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/thread:delegated-task:command%3Amcp%3A07e37d08-94dc-4f21-9274-996c2a7a8c00%3Adelegate-task%3A632fca4a-3251-4d46-b64c-68aa393e85be> | AFA-78 implementation takeover, final validation and PR preparation | Validated at `133aac5`; [PR #231](https://github.com/afahy/fluent-measures/pull/231) prepared for parent stewardship; no successor work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/b61ed010-1655-4d08-b5ee-8c6e4d3e7ad4>                                                                                              | AFA-78 PR steward                                                   | [PR #231](https://github.com/afahy/fluent-measures/pull/231) merged at `ef39a7b`; all 12 main CI jobs passed; separate AFA-203 session launched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:437846f95d8fc1b59e8b6aed92f360110a4df975347393dec096581adc8de82f>                                                       | AFA-236 finite conversion overflow                                  | F9 validated; [PR #230](https://github.com/afahy/fluent-measures/pull/230) merged at `b74d185`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:e814642ff8608ad682438ef18ee4080fc919744b9ea078fd9ad8e24e7597c9b4>                                                       | AFA-74; fresh AFA-202 then AFA-62 sessions after each merge/main CI | Complete: [PR #232](https://github.com/afahy/fluent-measures/pull/232), reviewed `70419bd`, merge `bfac12a9`; 19 PR checks, exact-head Codex review, final audits and all 12 exact-merge main CI jobs passed (run 42322049791, ci-ok 2026-11-07T01:11:17Z). Merged worktree/local branch removed; fresh AFA-202 successor launched. Earlier validation and AFA-242 comparisons retained                                                                                                                                                                                                                                                                               |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:461b3a6bdd48f18b59aa264dedf46356fae143e0f5f4b90936f49716e134a37a>                                                       | AFA-107 inferred conversion underflow; no successor                 | [PR #233](https://github.com/afahy/fluent-measures/pull/233) at `7426e3e` implementation; full checks and independent probes pass; merged at `b76070d`; exact-merge main ci-ok passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:1e5640d2dbe8ef251e2bb479d46cc5f4fc59c1597ecd270e7941a88df6893b76>                                                       | Fresh AFA-203 implementation, review and PR stewardship             | Complete: [PR #234](https://github.com/afahy/fluent-measures/pull/234), reviewed head `0a33c40`, merge `77bd5ce`; 19 PR checks, pre/post-merge audits and all 12 exact-merge main CI jobs passed (run 42314274182, ci-ok 2026-11-06T23:54:24Z). Earlier validation at `9030111` and `5c9eab1` retained                                                                                                                                                                                                                                                                                                                                                                |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:2d4a60308bdfb6191174b5f92be891f2f90bd42e44ea1218e394ed52840c6148>                                                       | Fresh AFA-116 signed other-type ownership and named test groups     | Source `1eb0a1b`; focused checks passed against `77bd5ce`. Independent review complete (125/126 agree; existing finding filed as AFA-241); full check and fresh changed-line mutation validation passed at `f80b4be`; [PR #235](https://github.com/afahy/fluent-measures/pull/235) merged as `b90ea36` from reviewed `28c3d21`; all 19 PR checks, exact-head Codex review, final audits and all 12 exact-merge main CI jobs passed (run 42319687195, ci-ok 2026-11-07T00:47:02Z). Ticket Done; merged worktree/local branch removed; audit `513b4c3` preserved. No successor assigned                                                                                 |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:462bb758094ab0a59a27217f4fb643589704bceca25e2bf1c7aba94be4f52c28>                                                       | AFA-202 Unicode-minus correction; handoff to existing AFA-62 owner  | Complete: [PR #236](https://github.com/afahy/fluent-measures/pull/236), reviewed `c819c48`, merge `e1d3a457`; 19 PR checks, exact-head review/late audit and all 12 exact-main CI jobs passed (run 42340992416, ci-ok 2026-11-07T05:08:57Z). Earlier source `93c7c72`/validation `b80d68a`, round-one `ac4970d`, round-two `d6e2ce7`, final backtracking correction `f50c9c5` and their full-check/mutation records remain above. Handoff goes to the existing AFA-62 owner; no duplicate session.                                                                                                                                                                    |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/thread:delegated-task:command%3Amcp%3A18aad716-812d-4b59-b64d-35f626938eb1%3Adelegate-task%3Ae40d7c32-82cc-465c-b9b7-71af5f3f983d> | Existing AFA-62 compact heights and metric shorthand owner          | Work preserved during the AFA-202 hold. Normal fast-forward to exact main `e1d3a457` completed with the unchanged post-merge hook and no install; local changes reapplied from retained stash `6a09864090c14d25baba2141a4f0222d4ceb8c5f`. Then integrated test-only main `b632655` normally, retaining all nine calculator feature links; 342 focused tests pass. Initial commit `8660ec6` passed normal hooks and released the slot. Parent-arranged independent probe completed (129/136); focused corrections replay 136/136. Final `512cb75` validation and [PR #242](https://github.com/afahy/fluent-measures/pull/242) recorded above; parent owns integration. |

AFA-202's third-round and late findings remain recorded above, including the separate deferred
AFA-249 fuzzy-name and Unicode-mark cases. The fixed backtracking defect is included in
`e1d3a457`; it is not part of AFA-249. The existing AFA-62 owner above continues the preserved
work after the completed merge/main-CI gate. No replacement implementation owner was launched;
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
