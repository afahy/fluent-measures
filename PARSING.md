# Parsing rules

This file gives the rules that `parseMeasurement` uses to read text, with examples. For the basic
use, see the [README](https://github.com/afahy/fluent-measures/blob/main/README.md).

The examples in this file and in the README are the public specification. A test checks each
result that they show.

<!-- cspell:ignore centimetre centimetres kilogramme kilogrammes kilgrm kilgrom -->

## Complete Entries

The parser must consume the complete entry. It accepts one complete measurement, or a pair
with exactly one complete height and one complete weight when `type` or `normalizedUnit`
selects the result. Unknown words, leftover numbers or units, malformed number phrases,
ranges, and duplicate measurements reject the whole entry. It never retries at a later
number or returns only a valid-looking prefix or suffix.

A number must be a complete supported phrase. `5 11 inches`, `140 and 150 pounds`,
`one hundred and two hundred pounds`, and `5 ft 10 and a hat` return `null`. A positive
complete scalar is required. Zero parts are allowed inside a positive compound, but a
standalone zero or negative measurement is not ignored to save a later one.

### Surrounding Words

A qualified measurement can have one introduction, followed by one approximation word.
Introductions are `I'm`, `I’m`, `I am`, `I weigh`, `height`, `my height`, `weight`, `my weight`,
`weigh in:` and `weigh-in:`. A height or weight name may be followed by `is`, `:` or `=` and
must agree with the measurement's dimension. `I weigh`, `weigh in:` and `weigh-in:` require a
weight. Approximation words are `about`, `around`, `roughly`,
`approximately` and `approx.`; they do not change the numeric value. A height can end with
`tall`. One final period is allowed. Whitespace and letter case do not change these words.

```typescript
parseMeasurement("I'm five foot eleven tall"); // { value: 71, unit: 'in', ... }
parseMeasurement('about 180 cm'); // { value: 180, unit: 'cm', ... }
parseMeasurement('I weigh one hundred fifty pounds'); // { value: 150, unit: 'lb', ... }
parseMeasurement('weighed 70 kg in 2020'); // null: historical prose is not a supported introduction
parseMeasurement('I was 210 lbs, now 180 lbs'); // null: the parser does not select a current reading
parseMeasurement('Top 10 in the class'); // null: ranking prose is not a supported introduction
```

Quotation marks, parentheses and square brackets cannot surround an entry, one measurement of
a pair, or a number. Such an entry returns `null`. Curly quotes and primes after a number are
always feet and inch marks, like `'` and `"`: `5’11”`, `5′11″` and `5´11´´` all give 71 inches.
Brackets keep their other uses: a unit label such as `Height (in): 72`, a smaller part such as
`5 ft (11 in)`, and the second measurement of a pair. A bare number with `defaultUnit` must
still occupy the whole entry without surrounding words.

```typescript
parseMeasurement('5’11”'); // { value: 71, unit: 'in', ... }
parseMeasurement('(180 cm)'); // null: brackets cannot surround an entry
parseMeasurement('"180 lbs"'); // null: quotation marks cannot surround an entry
parseMeasurement('“5’11””'); // null: quotation marks cannot surround an entry
parseMeasurement('(180) lbs'); // null: brackets cannot surround a number
```

## Unsupported Units

Stone, ounces and grams are not supported. Any unsupported fragment rejects the entire
entry, including when a selector requests a different measurement type. `12st 4lb`,
`7 lb 8 oz`, `7 lb, 8 oz`, `stone 12, 4 lb` and `kg 3, 400 g` return `null`.

The order of unrelated prose does not change rejection. Both
`I drink 8 oz of water, weight 180 lbs` and `180 lbs, 8 oz of water a day` return `null`.
Send only `weight 180 lbs` to parse that field. `Main St 12, 180 lbs` also returns `null`.
A capital `G` in `5G` still is not grams; `5G phone, 180 lbs` is rejected as extra text.

## Units Before a Number

Most supported unit names can precede their complete number, as in `kg 70` and
`kg seventy two`. Bare `in` and `m` require label punctuation before a number. A unit label
is in parentheses or square brackets, or followed by `:` or `=`. A bracket label may also
be followed by `:` or `=`. `in.` is an inch label. A label binds only its following number.

```typescript
parseMeasurement('Height (in): 72'); // { value: 72, unit: 'in', ... }
parseMeasurement('m: 1.8'); // { value: 1.8, unit: 'm', ... }
parseMeasurement('in = 72'); // { value: 72, unit: 'in', ... }
parseMeasurement('in. 5'); // { value: 5, unit: 'in', ... }
parseMeasurement('check-in: 5'); // null: not a complete measurement
parseMeasurement('weighed 70 kg in 2020'); // null: extra historical text
parseMeasurement('M 28'); // null: no supported unit label
parseMeasurement('Weigh in: 180 lbs'); // { value: 180, unit: 'lb', ... }
```

A number phrase has the same value before or after its unit. For example,
`two and a half thousand pounds` and `pounds: two and a half thousand` each mean 2500 lb.
After a complete number, `in` means inches; arbitrary surrounding prose still rejects.

## Labels

Simple field names and unit labels describe the following complete measurement or number.
A label never borrows an earlier field's value. A bracketed unit after a number is a suffix
unit, as in `72 (in)`. Two unit declarations for one scalar reject, including `kg: 72 lbs`,
`kg: 72 kg` and `Height (m): 180 cm`. Colon and equals signs do not express conversion
agreement or a backwards assignment.

```typescript
parseMeasurement('age=28, kg=72'); // null: unrelated age field
parseMeasurement('age: 28, ft: 6'); // null: unrelated age field
parseMeasurement('180 lbs = 82 kg'); // null: two weights
parseMeasurement('age=28, kg=72 lbs'); // null: extra field and conflicting units
parseMeasurement('72 (in), 180 lbs'); // null: a height/weight pair needs a selector
parseMeasurement('72 in: 180 lbs'); // null: a suffix unit cannot become a forward label
parseMeasurement('72 in: height'); // null: backwards label fallback is not supported
parseMeasurement('kg=72'); // { value: 72, unit: 'kg', ... }
parseMeasurement('m: 1 cm: 80'); // { value: 180, unit: 'cm', ... }
```

## Feet and Inches

A height in feet and inches gives the total in inches:

```typescript
parseMeasurement('5\'11"', { type: 'height' }); // { value: 71, unit: 'in', type: 'height', matches: [{ value: 5, unit: 'ft' }, { value: 11, unit: 'in' }] }
```

### Hyphens

A hyphen can separate feet and inches:

```typescript
parseMeasurement('5-foot-11'); // { value: 71, unit: 'in', ... }
parseMeasurement('5 ft-11'); // { value: 71, unit: 'in', ... }
parseMeasurement('5\'-11"'); // { value: 71, unit: 'in', ... }
parseMeasurement('0-foot-11'); // { value: 11, unit: 'in', ... }
parseMeasurement('5-foot-0-inches'); // { value: 60, unit: 'in', ... }
parseMeasurement('5 ft-1 m', { normalizedUnit: 'm' }); // null: two heights do not form a supported compound
```

### Shorthand

Two numbers with a hyphen between them, as in `5-11`, are feet and inches only when `type` is
`'height'`. The second number must be less than 12:

```typescript
parseMeasurement('5-11', { type: 'height' }); // { value: 71, unit: 'in', ... }
parseMeasurement('5-.5', { type: 'height' }); // { value: 60.5, unit: 'in', ... }
parseMeasurement('5-11,5', { type: 'height' }); // { value: 71.5, unit: 'in', ... }
parseMeasurement('5-,5', { type: 'height' }); // { value: 60.5, unit: 'in', ... }
parseMeasurement('5-11'); // null: no height type
parseMeasurement('5-12', { type: 'height' }); // null: the inches must be less than 12
parseMeasurement('5-11', { type: 'height', normalizedUnit: 'm' }); // { value: 1.8034, unit: 'm', ... }
```

## Compact Heights

Spaces may be omitted between numbers and height units: `5ft11` and `5ft11in` give 71 inches,
just as `5 ft 11` does. A bare number after meters means centimeters, so `1m80` and `1 m 80`
give 180 centimeters. A single `1 m` still gives 1 meter.

A bare centimeter part must be greater than zero and less than 100. A following explicit unit
owns its number instead: `1 m 80 kg` is not a compound and returns `null` because it has no
pair separator. Write `1 m, 80 kg` with a selector for a complete height/weight pair.
The [two-part rules](#more-than-one-measurement) still apply: a fractional larger part or an
extra independent reading returns `null`; readings are never reconciled.

A zero-meter part can start a valid compound: `0 meter 80` gives 80 centimeters. An oversized
bare part does not become a meter value, so `0 meter 100` returns `null`.

## Semicolons

A semicolon can separate a complete height from a complete weight when a selector is given.
It cannot separate a number from its unit, words of a number phrase, or parts of a compound.
An invalid or zero expression before a semicolon is not discarded.

```typescript
parseMeasurement('0 feet; actual 1.8 meters'); // null: an invalid earlier measurement is not discarded
parseMeasurement('180;lbs'); // null: the number and unit must belong to one expression
parseMeasurement('record 0; kg 70'); // null: unrelated text and a leftover number
```

## Ranges

A range is not one measurement and rejects the entire entry, including any surrounding
measurement. Digit ranges, fractional ranges, and ordinary shared-unit `to` and
`between ... and ...` ranges follow this rule. Valid whole-entry height shorthand under
`Shorthand` remains the explicit exception.

```typescript
parseMeasurement('150-180 lbs'); // null
parseMeasurement('150 – 180 lbs'); // null: Unicode dashes also make ranges
parseMeasurement('kg 50-70'); // null: the unit can precede the range
parseMeasurement('72,5-80,5 kg'); // null: decimal commas can occur in ranges
parseMeasurement('1,250-1,500 lbs'); // null: thousands groups can occur in ranges
parseMeasurement('kg-70.5'); // null: this is a negative value
parseMeasurement('150 to 180 lbs'); // null: two endpoints
parseMeasurement('between 70 and 80 kg'); // null: two endpoints
```

Repeating the unit at both endpoints does not help: `150 lbs - 180 lbs` is also `null`.
No range endpoint or unit is removed to expose another measurement.

```typescript
parseMeasurement('6 1-2 ft'); // null
parseMeasurement('ft 1-2 6'); // null
parseMeasurement('6ft1-2in'); // null: do not salvage the feet
```

`50-70 kg, 180 lbs`, `1-2 ft 6`, `6 1-2 ft 3 in` and `6 ft 1-2 11 in` all return
`null`. The parser never reconstructs feet and inches across an omitted range.

## More Than One Measurement

Two parts form one compound only when the first is an integral number of feet or meters,
and the second is a smaller nonnegative amount in the next unit: inches below 12 or
centimeters below 100. The total must be finite and positive. Examples are `5 ft 11 in`
and `1 m 80 cm`; `0 ft 11 in` and `5 ft 0 in` are also positive compounds. All written parts, including zeros,
remain in `matches`. Without normalization a compound uses its smaller unit, so `1 m 0 cm`
is 100 cm with both parts in `matches`.

Parts may join with whitespace, the supported hyphen spellings, `and`, a comma before an
explicit smaller part, or balanced brackets around an explicit smaller part. They cannot
join across semicolons, other words, other measurements or ranges. Adjacent prefix parts
such as `m: 1 cm: 80` are supported. Bare smaller parts keep their supported limits;
`5 ft 12`, `5 ft 0` and `5 ft -11` reject instead of returning only the feet.

Two independent heights or two independent weights return `null` regardless of agreement.
For example, `6 ft (72 in)` and `0.5 m (50 cm)` are duplicate representations, not compounds.

```typescript
parseMeasurement('70 kg (154 lbs)'); // null: two weights
parseMeasurement('180 cm (5\'11")'); // null: two heights
parseMeasurement('6 ft (72 in)'); // null: two heights
parseMeasurement('210 lbs to 180 lbs'); // null: two weights
```

A pair with exactly one complete height and one complete weight needs `type` or
`normalizedUnit` to choose a result. Without a selector it returns `null`. The expressions
can be separated by a comma, semicolon, ASCII slash or `and`, or the second can be enclosed
in parentheses or square brackets. Brackets or quotation marks cannot enclose the first
measurement or the whole pair. Whitespace alone does not separate a pair. Both complete
expressions must be valid; an invalid expression is never ignored because of its type.

```typescript
parseMeasurement('5\'11", 180 lbs', { type: 'height' }); // { value: 71, unit: 'in', ... }
parseMeasurement('5\'11", 180 lbs', { type: 'weight' }); // { value: 180, unit: 'lb', ... }
```

A slash inside a proper fraction remains numeric. With a weight selector,
`5 ft (10/180 lbs)` means 10/180 lb; with a height selector it means 5 ft. In contrast,
`5'10/180 lbs` separates a 5-ft-10-in height from a 180-lb weight. A numeric run with two
slashes, such as `1/2/180 lbs`, rejects rather than exposing its final number.

## Numbers

The parser reads decimal numbers, numbers in words, and numbers in words and digits:

```typescript
parseMeasurement('72.5 kg'); // { value: 72.5, unit: 'kg', ... }
parseMeasurement('one hundred fifty pounds'); // { value: 150, unit: 'lb', ... }
parseMeasurement('one hundred and 50 pounds'); // { value: 150, unit: 'lb', ... }
```

### Commas

A comma can separate thousands, as in `1,000 lbs`. A number with thousands groups starts with one
to three digits, and then has groups of three digits.

A decimal comma has one or two digits after it, as in `72,5 kg`, `72,05 kg` and `,5 kg`. After
thousands groups, a last group of one or two digits is a decimal part. For example, `1,234,56 kg`
is 1234.56 kg.

Other comma groups return `null`. For example, `12,34,567 kg` and `1234,567 kg` return `null`.
This is also true in a range or in a measurement with two parts. A trailing comma between a
number and its unit is not part of a complete measurement:
`1,000, kg` returns `null`.

Numeric commas keep their meaning after a field name: `weight 72,5 kg` is 72.5 kg.
A hyphen after a field name does not make it an introduction:
`height-1,800 cm` returns `null`. A separate number word followed by a comma is not joined
or discarded; `twenty,5 kg`, `twenty, 5 kg` and `kg twenty, 5` return `null`.

Arbitrary labels are outside the entry grammar. `phase 2,180 cm`, `phase-2,180 cm`,
`phase-2, 180 cm` and `phase2,180 cm` all return `null`; enter the intended value with its
unit, such as `2180 cm` or `180 cm`, without the phase label.

### Numbers With No Unit

`defaultUnit` supplies the source unit for one complete unwrapped number, including supported
fractions and number words. A bare number without this option returns `null`, even when `type`
or `normalizedUnit` is supplied. Written units always win. The source unit never depends on
magnitude: with `defaultUnit: 'cm'`, 1.8 means 1.8 cm; with `'m'`, 3 means 3 m.

```typescript
parseMeasurement('72', { defaultUnit: 'in' }); // { value: 72, unit: 'in', ... }
parseMeasurement('150', { defaultUnit: 'lb' }); // { value: 150, unit: 'lb', ... }
parseMeasurement('1.8', { defaultUnit: 'm' }); // { value: 1.8, unit: 'm', ... }
parseMeasurement('180', { defaultUnit: 'cm' }); // { value: 180, unit: 'cm', ... }
parseMeasurement('70', { defaultUnit: 'kg' }); // { value: 70, unit: 'kg', ... }
```

`normalizedUnit` converts from the explicit source default; it never supplies one:

```typescript
parseMeasurement('72', {
  defaultUnit: 'in',
  normalizedUnit: 'cm',
});
// { value: 182.88, unit: 'cm', type: 'height', matches: [{ value: 72, unit: 'in' }], raw: '72' }
```

If `type` or `normalizedUnit` selects a dimension, `defaultUnit` must agree with it, even for
input with a written unit. A default alone does not select a dimension for qualified input or
authorize `5-11` shorthand. Extra words, brackets, quotation marks, punctuation or a second
number cannot be discarded to apply a default: `about 80`, `(80)`, `80;` and `80 90` return
`null` with a kilogram default. `allowUnqualified` and `inferUnit` are removed; passing a defined
value throws a migration error. See the README for validation order and migration.

## Fuzzy Matching

Set `fuzzy: true` to read a unit name that has one spelling error. One error is one letter added,
removed or changed. These rules apply:

- An exact unit name always wins.
- A word must start with the same letter as the unit name.
- A unit name must have four or more letters to match with an error. Shorter names, such as `ft`,
  `cms` and `lbs`, match only when they are exact.
- The British spellings `centimetre`, `centimetres`, `metre`, `metres`, `kilogramme` and
  `kilogrammes` match only when they are exact.
- A short list of reviewed typos also reads with `fuzzy: true`, beyond the one-error rule. Today
  it holds one entry: `kilgrm` reads as `kg`, although it has two errors, as it did with
  `fuzziness: 2`. Without `fuzzy`, no typo on the list reads. Each new entry needs a reason and a
  test with and without `fuzzy`.
- If a word is one error from two unit names, the first unit in this order wins: `ft`, `in`, `cm`
  and `m` for height, and `lb` and `kg` for weight.

Any other word with two errors, such as `kilgrom`, matches nothing. No word is blocked: with
`fuzzy: true`, an ordinary English word one letter from a unit name reads as that unit. `5 feat`,
`6 food` and `5 feel` read as feet, `70 kiln` and `5 kills` as kilograms, and `150 ponds` as pounds.
Without `fuzzy`, they return `null`.

```typescript
parseMeasurement('5 foots 10 inc', { fuzzy: true }); // { value: 70, unit: 'in', ... }
parseMeasurement('5 foots 10 inc'); // null: without fuzzy, unit names must be exact
parseMeasurement('5 foot 10 inches', { fuzzy: true }); // { value: 70, unit: 'in', ... }: exact names still match
```

`fuzziness` is retired. Any defined value throws a migration error that names `fuzzy: true`.
