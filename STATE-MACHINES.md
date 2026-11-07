# Library state machines

<!-- cspell:ignore NFKC apfahy -->

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

Source: `tokenize.ts`, normalization functions and quote patterns. F2 transitions below are
include `95a5a54` and the review corrections recorded below. This is a pipeline with implicit context states, rather than one scanner.
Later passes cannot recover characters discarded by earlier ones.

| From                | Input / guard                                                       | Action                                                                                    | To                                    |
| ------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| Raw                 | Full-width character or supported compatibility unit                | Convert that character with NFKC                                                          | Forms normalized                      |
| Raw/forms           | Unicode minus before a number and no earlier number anywhere        | Preserve it as ASCII minus                                                                | Signed number text                    |
| Raw/forms           | Unicode minus after any earlier number                              | Leave it for later punctuation removal/range handling                                     | Unsigned/joining context; F3          |
| Raw/forms           | ASCII opener and ASCII/curly closer before a named unit             | Remove both quotation marks; retain the quantity and named unit                           | Named-unit text                       |
| Raw/forms           | Curly closer before a named unit                                    | Remove closing quote; retain unquoted feet before `in` and paired apostrophes for M2      | Named-unit text                       |
| Raw/forms           | Prime, modifier-letter prime or acute accent                        | Convert to ASCII feet/inch mark                                                           | Mark text                             |
| Raw/forms           | Curly closer after digits, fraction or number words; spaces allowed | Preserve quotation context except compact digits or a following inch component after feet | Quote or mark; F2 corrected           |
| Forms normalized    | Supported numeric comma group                                       | Convert last 1–2 digits to decimal part and remove thousands commas                       | Numeric text                          |
| Forms normalized    | Numeric group matches comma-size detection but fails grammar        | Set `valid = false`; entire normalized input becomes empty                                | Rejected text                         |
| Forms normalized    | Comma is not such a numeric group, or belongs to attached label     | Leave it for tokenization                                                                 | Punctuation text                      |
| Numeric text        | Proper integer fraction, representable without exponent notation    | Replace whole-plus-fraction with decimal text                                             | Fraction normalized                   |
| Numeric text        | Improper/decimal/exponent-producing fraction                        | Write `x` boundary                                                                        | Invalid numeric fragment              |
| Numeric text        | Unicode fraction                                                    | Decode numerator/denominator and apply same numeric writer                                | Fraction normalized; F4 at boundaries |
| Fraction normalized | Pipeline complete                                                   | Pass text to tokenization/range detection                                                 | M2/M3                                 |

Comma rejection is absorbing. Fraction rejection is local: `x` is a non-number, so later valid
measurements can still be read. That local replacement wrongly destroys range evidence in
`5/2-180 lbs` (F4). A decimal rewrite next to a digit can instead manufacture `5.52` from `5½2`.

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
| Pending state           | `RANGE`                                               | Emit `{ text: '-', range: true }`; clear pending metadata                                | No pending metadata             |
| Pending label           | Ordinary token                                        | Emit label kind and `startsField`; clear metadata                                        | No pending metadata             |
| No pending label        | Ordinary token                                        | Emit `{ text }`; clear metadata                                                          | No pending metadata             |

The F1 fix also looks past an opening curly quote (`“` or `‘`) before the next number word or
spaced digits, so `phase twenty, “5” cm` retains the boundary. No space is needed between a
comma and a number word; digits keep the existing space requirement. Numeric comma groups
are still normalized in M1. This is a targeted boundary change, not the tokenizer refactor.

Input is lowercased before uppercase markers are inserted; users cannot inject marker words by
typing their names. The decoder resets pending flags after every ordinary/range token. At this
revision, range tokens cannot simultaneously be labels. `startsField` is emitted only with a
label. `used` is assigned later by the parser. Compact unit-to-digit boundaries are not generally
split, explaining F6. Empty tokens remain harmless non-number boundaries.

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
| Feet accepted            | Following number has inch unit, or is bare 0 < n < 12 without another supported/unsupported unit   | Append inch match; consume number and explicit inch unit if present      | Compound candidate |
| Feet accepted            | Isolated zero without inches                                                                       | Remove zero feet match                                                   | Next token         |
| End of pass              | All candidates visited                                                                             | Apply signed-field filter                                                | M8 then M9/M10     |

`readValueAfter` checks the next unit across semicolons but not across a new field label. Short
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

| Finding / priority | Reachable input and options                                                                                     | Actual at baseline                              | Required result and source                                                                             | Invalid transition / issue                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| F1 / High          | `my son is two, thirty pounds`; `twenty, one hundred pounds`                                                    | 230 lb; 2100 lb                                 | 30 lb; 100 lb, specified by [AFA-75][commas]                                                           | Baseline M2 boundary loss; correction in [PR #229](https://github.com/afahy/fluent-measures/pull/229) |
| F2 / High          | `he said “about 180” lbs`; `5 ’11”`                                                                             | 180 in (height); 11 in                          | 180 lb; 71 in, [AFA-78][quotes]                                                                        | M1 quotation → unit, or omitted feet → partial success                                                |
| F4 / High          | `5/2-180 lbs`; `5½2 lb`; `5.5 ½ ft`; `5 ft (10/180 lbs)` with weight type                                       | 180 lb; 5.52 lb; 0.5 ft; 0.05555555555555555 lb | `null`; `null`; `null`; 180 lb, [AFA-74][fractions]                                                    | M1 rewrites away range/fraction boundaries or measurement ownership before M3/M7                      |
| F3 / Medium        | `phase 20, −5 cm`; `phase twenty, −5 cm`                                                                        | 5 cm; 25 cm                                     | `null`, negative-field rule and [AFA-202][signs]                                                       | M1 sees earlier unrelated number → drops negative sign → accepted positive number                     |
| F6 / Medium        | `5ft11`                                                                                                         | `null`                                          | 71 in, [AFA-62][compact] and 5 × 12 + 11                                                               | M2 leaves `ft11` indivisible → M7 never reaches recognized unit                                       |
| F5 / Low           | `kg -20 5 grams; actual 70 kg`                                                                                  | 70 kg                                           | `null`, Unsupported Units specification and [AFA-203][unsupported]                                     | M8 unsigned backward lookup misses the supported prefix; incomplete weight bypasses rejection         |
| F7 / Low           | `kg -6 ft, 70 kg`                                                                                               | `null`                                          | 70 kg, [AFA-116][ownership]                                                                            | M7/M8 rejects kg field for a signed value owned by ft                                                 |
| F8 / Low           | `0.` + 322 zeros + `1`, height + allowUnqualified + normalized ft                                               | Successful result with value 0                  | `null`, [AFA-107][underflow], maintainer's 2026-10-08 “option 1” comment                               | M9 inferred-zero exception violates intended positive-result invariant                                |
| F9 / Low           | `1` + 307 zeros + ` ft`, normalized m; same digits + ` m`, normalized ft; `1` + 308 zeros + ` in`, normalized m | `null` in all three cases                       | Approximately 3.048e306 m; 3.280839895013123e307 ft; 2.54e306 m, independently calculated unit factors | M9 intermediate overflow falsely rejects finite target; [AFA-236][overflow], fix below                |

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

Status: implemented and locally validated;
[PR #231](https://github.com/afahy/fluent-measures/pull/231) tracks review and merge.
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

### F7 correction — signed values with their own other-type unit

Status: implemented at `1eb0a1b`; focused checks and independent input review are complete.
Full validation and final test-strengthening mutation validation pass at source `1eb0a1b`;
PR review/merge are pending. Before: current main
`77bd5ce63549ca25c4bdb6a425add7f0c5687787`. The original `b79eae0` finding and the
22-test baseline remain historical evidence; this fix is not yet merged.

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
[PR #233](https://github.com/afahy/fluent-measures/pull/233) tracks review and merge status.
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
above remain the historical baseline. This brings the tracked findings to ten groups. Reproduce
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

## Fix groups, dependencies and document ownership

Keep one ticket per PR. F1, F2 and F4 remain their existing grouped issues; do not duplicate them
or fold all tokenizer behavior changes into a single refactor. F3, F5 and F7 share broad ownership
concerns but have different failure causes and existing preservation requirements.

| Work stream                   | Tickets / order                    | State and required handoff                                                                                                                                           |
| ----------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publish this audit            | [AFA-235][audit]                   | [PR #228](https://github.com/afahy/fluent-measures/pull/228) merged at `527f7b5`; main CI passed                                                                     |
| Separate tokenizer refactor   | [AFA-88][refactor]                 | In Progress; preserve existing remote branch `apfahy/afa-88-read-every-number-form-in-one-tokenizer-pass`, last observed `ded9ee0`; requires maintainer merge        |
| Boundary and number fixes     | AFA-75 → AFA-74 → AFA-202 → AFA-62 | Pause lifted by maintainer on 2026-11-06; fresh sessions fix one ticket per PR                                                                                       |
| Quote and ownership fixes     | AFA-78 → AFA-203 → AFA-116         | AFA-78 and AFA-203 complete; F5 merged at `77bd5ce` with exact-merge main CI passed. Fresh AFA-116 owns F7; no successor assigned                                    |
| Numeric conversion            | [AFA-236][overflow]                | `units.ts` correction at `ecf7a2e`; full validation passes; [PR #230](https://github.com/afahy/fluent-measures/pull/230) tracks review/merge                         |
| Inferred conversion underflow | [AFA-107][underflow]               | Pulled forward during AFA-74’s separate decision wait; implementation `7426e3e`; [PR #233](https://github.com/afahy/fluent-measures/pull/233); no successor assigned |

The maintainer explicitly lifted the AFA-88 pause for these eight confirmed targeted fixes on
2026-11-06. Their AFA-88 blocker relations were removed. Other dependencies remain; the tokenizer
refactor is separate and is not part of these fix sessions. AFA-107 was pulled forward into
[PR #233](https://github.com/afahy/fluent-measures/pull/233); it is no longer in the queue after
AFA-203. AFA-74 is active in [PR #232](https://github.com/afahy/fluent-measures/pull/232).
Each successor ticket starts in a
fresh session after its predecessor merges, limiting overlapping edits and expensive check runs.

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

| Session                                                                                                                                                                                 | Assigned work                                                       | Launch state                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:ab3e225544f4690efa2764d0a191792e86a687eff06d7b4e3bb8c5380b1b736d>                                                       | AFA-235 publication and review of this document                     | [PR #228](https://github.com/afahy/fluent-measures/pull/228) merged at `527f7b5`; main CI passed                                                                                                                                                                                                       |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:9df9034c3ce42adbebf696dd9b9d990bec04b84a9494a53e3c9bf77d6c1fc1d4>                                                       | AFA-75, then fresh successor sessions for AFA-74, AFA-202, AFA-62   | F1 validated; [PR #229](https://github.com/afahy/fluent-measures/pull/229) tracks review/merge; successors start after merge and main CI                                                                                                                                                               |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:1a5f5b908ee23500b3eab3c85521ed6236b310c0f375af966f353457aef7d25e>                                                       | Original AFA-78 implementation and recorded successor queue         | Stopped for the maintainer-requested takeover; clean history preserved through `02d463a`                                                                                                                                                                                                               |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/thread:delegated-task:command%3Amcp%3A07e37d08-94dc-4f21-9274-996c2a7a8c00%3Adelegate-task%3A632fca4a-3251-4d46-b64c-68aa393e85be> | AFA-78 implementation takeover, final validation and PR preparation | Validated at `133aac5`; [PR #231](https://github.com/afahy/fluent-measures/pull/231) prepared for parent stewardship; no successor work                                                                                                                                                                |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/b61ed010-1655-4d08-b5ee-8c6e4d3e7ad4>                                                                                              | AFA-78 PR steward                                                   | Completed PR #231 merge at `ef39a7b`; all 12 exact-merge main CI jobs passed. Retains possible future AFA-88 assessment; no refactor started                                                                                                                                                           |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:437846f95d8fc1b59e8b6aed92f360110a4df975347393dec096581adc8de82f>                                                       | AFA-236 finite conversion overflow                                  | F9 validated; [PR #230](https://github.com/afahy/fluent-measures/pull/230) tracks review/merge; no successor assigned                                                                                                                                                                                  |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:1e5640d2dbe8ef251e2bb479d46cc5f4fc59c1597ecd270e7941a88df6893b76>                                                       | Fresh AFA-203 implementation, review and PR stewardship             | Complete: [PR #234](https://github.com/afahy/fluent-measures/pull/234), reviewed head `0a33c40`, merge `77bd5ce`; 19 PR checks, pre/post-merge audits and all 12 exact-merge main CI jobs passed (run 42314274182, ci-ok 2026-11-06T23:54:24Z). Earlier validation at `9030111` and `5c9eab1` retained |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:461b3a6bdd48f18b59aa264dedf46356fae143e0f5f4b90936f49716e134a37a>                                                       | AFA-107 inferred conversion underflow; no successor                 | Implementation `7426e3e`; [PR #233](https://github.com/afahy/fluent-measures/pull/233) merged at `b76070d`; exact-merge main CI pending under this owner                                                                                                                                               |
| <t3-thread://v2/b0cb576b-f55b-43bf-ab6f-c1c6d3eb2054/mcp:launch:2d4a60308bdfb6191174b5f92be891f2f90bd42e44ea1218e394ed52840c6148>                                                       | Fresh AFA-116 signed other-type ownership and named test groups     | Source `1eb0a1b`; focused checks passed against `77bd5ce`. Independent review complete (125/126 agree; existing finding filed as AFA-241); full check and fresh changed-line mutation validation passed; PR lifecycle pending. No successor assigned                                                   |

Sessions use isolated prepared worktrees. Full checks and mutation runs have one shared execution
slot, initially publication → AFA-75 → AFA-78 → AFA-236; sessions pass it by message. Focused tests
can run while another session holds the slot. Successor sessions inherit the regression, corpus,
mutation, PR-lifecycle and document-update requirements. Launch status is not fix completion.

## Validation record

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
No source or mutation suppression changed. Hosted lifecycle results will be added when available.

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
[unsupported]: https://linear.app/afahy/issue/AFA-203
[prefix-ownership]: https://linear.app/afahy/issue/AFA-237
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
