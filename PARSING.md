# Parsing rules

This file gives the rules that `parseMeasurement` uses to read text, with examples. For the basic
use, see the [README](https://github.com/afahy/fluent-measures/blob/main/README.md).

The examples in this file and in the README are the public specification. A test checks each
result that they show.

<!-- cspell:ignore centimetre centimetres -->

## Unsupported Units

Stone, ounces and grams aren't supported. A weight that has a part in one of these units returns
`null`. For example, `12st 4lb` and `7 lb 8 oz` return `null`, not 4 lb or 7 lb.

An amount in one of these units in a different part of the text doesn't count. For example,
`I drink 8 oz of water, weight 180 lbs` returns 180 lb. But a comma doesn't separate the parts of
a measurement. For this reason, a weight with an amount in one of these units directly after it
also returns `null`, as in `180 lbs, 8 oz of water a day`.

A unit can also come before its number. For example, `stone 12, 4 lb` and `kg 3, 400 g` return
`null`. Before a number, the short forms `st` and `g` are usually other words, as `in` and `m`
are. For example, `Main St 12, 180 lbs` returns 180 lb. A capital `G` directly after a number, as
in `5G`, is a network generation, not grams.

## Units Before a Number

Most units can come before their number, as in `kg 70`. Before a number, the short forms `in`
and `m` are usually ordinary words. The parser reads them as units before a number only when they
are labels. A label is in brackets, or before `:` or `=`. For inches, `in.` is also a
label:

```typescript
parseMeasurement('Height (in): 72'); // { value: 72, unit: 'in', ... }
parseMeasurement('m: 1.8'); // { value: 1.8, unit: 'm', ... }
parseMeasurement('in = 72'); // { value: 72, unit: 'in', ... }
parseMeasurement('in. 5'); // { value: 5, unit: 'in', ... }
parseMeasurement('check-in: 5'); // null: "in" is part of a word with a hyphen
parseMeasurement('weighed 70 kg in 2020'); // { value: 70, unit: 'kg', ... }
parseMeasurement('M 28'); // null: "M" before an age isn't meters
parseMeasurement('Weigh in: 180 lbs'); // { value: 180, unit: 'lb', ... }: 180 has its own unit
```

After a number, `in` means inches, also in ordinary text. For example, `Top 10 in the class`
returns 10 inches. The label rules in this file also apply to a label such as `in.` or `in:`.

## Labels

Each unit can be a label. A label reads the number after it, so it doesn't take the number of the
field before it.

When the number after a label has its own unit, the label takes the number before it. This
doesn't apply when a comma, semicolon, colon, equals sign or `&` is between that number and the
label.

A field name is different. `in` or `m` before `:` or `=` is a field name. It takes the number
before it only when no number comes after it.

```typescript
parseMeasurement('age=28, kg=72'); // { value: 72, unit: 'kg', ... }
parseMeasurement('age: 28, ft: 6'); // { value: 6, unit: 'ft', ... }
parseMeasurement('180 lbs = 82 kg'); // { value: 180, unit: 'lb', ... }
parseMeasurement('age=28, kg=72 lbs'); // { value: 72, unit: 'lb', ... }: "kg" doesn't take 28
parseMeasurement('72 (in), 180 lbs'); // { value: 72, unit: 'in', ... }
parseMeasurement('72 in: 180 lbs'); // { value: 180, unit: 'lb', ... }: "in:" is a field name
parseMeasurement('72 in: height'); // { value: 72, unit: 'in', ... }
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
parseMeasurement('5 ft-1 m', { normalizedUnit: 'm' }); // null: 5 ft and 1 m are separate and disagree
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

## Semicolons

A semicolon can come between a number and its unit, as in `180;lbs`:

```typescript
parseMeasurement('0 feet; actual 1.8 meters'); // { value: 1.8, unit: 'm', ... }
parseMeasurement('180;lbs'); // { value: 180, unit: 'lb', ... }
parseMeasurement('record 0; kg 70'); // { value: 70, unit: 'kg', ... }
```

## Ranges

A range returns `null`. This applies to a range of numbers that share one unit, with the unit
before or after the numbers:

```typescript
parseMeasurement('150-180 lbs'); // null
parseMeasurement('150 – 180 lbs'); // null: spaces and Unicode dashes also make a range
parseMeasurement('kg 50-70'); // null: the unit can come before the range
parseMeasurement('72,5-80,5 kg'); // null: decimal commas can also make a range
parseMeasurement('1,250-1,500 lbs'); // null: thousands groups can also make a range
parseMeasurement('kg-70.5'); // null: a hyphen directly after a unit is a minus sign
```

A range with its unit at each end, such as `150 lbs - 180 lbs`, also returns `null`. Its two
ends are separate measurements that disagree.

The parser leaves out the numbers of a range. A number before the range doesn't take a unit after
it, and a unit before the range doesn't reach a number after it:

```typescript
parseMeasurement('6 1-2 ft'); // null: 6 doesn't take "ft" across the range
parseMeasurement('ft 1-2 6'); // null: "ft" doesn't reach 6 across the range
parseMeasurement('6ft1-2in'); // { value: 6, unit: 'ft', ... }: the range's numbers are left out
```

The rest of the text is still parsed, though. The range's own unit can attach to a number after
it, and measurements on both sides of the range can join, as in `6 ft 1-2 11 in`. So other text
with a range and a separate measurement isn't supported, as in `50-70 kg, 180 lbs`.

## More Than One Measurement

Two parts are one measurement only when all of these are true:

- The unit of the second part is the next smaller unit.
- The first part is a whole number.
- The second part is less than one of the larger unit.

Examples are `5 ft 11 in` and `1 m 80 cm`. Other parts are separate measurements. For
example, `6 ft (72 in)` and `0.5 m (50 cm)` are a height and its conversion.

When the text has more than one measurement, the result is the first one. The others must agree
with it within 1%. If not, the result is `null`:

```typescript
parseMeasurement('70 kg (154 lbs)'); // { value: 70, unit: 'kg', ... }
parseMeasurement('180 cm (5\'11")'); // { value: 180, unit: 'cm', ... }
parseMeasurement('6 ft (72 in)'); // { value: 6, unit: 'ft', ... }
parseMeasurement('210 lbs to 180 lbs'); // null: two different weights
```

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
This is also true in a range or in a measurement with two parts. A comma after a number doesn't
change the number: `1,000, kg` still means 1000 kg.

A space, or a hyphen between a word and a number, separates them. The number keeps its decimal
comma or its thousands groups. For example, `weight 72,5 kg` is 72.5 kg, and `height-1,800 cm`
is 1800 cm. For this reason, `phase 2,180 cm` and `phase-2,180 cm` both contain the number 2180.

To separate a label that ends in a number from a measurement, put a space after the comma. For
example, `phase-2, 180 cm` is 180 cm. A comma directly after a label with no space or hyphen in
it is also a separator. For example, `phase2,180 cm` is 180 cm. The label can include Unicode
letters.

### Numbers With No Unit

With `allowUnqualified`, `normalizedUnit` also converts a number that has no unit:

```typescript
parseMeasurement('72', {
  type: 'height',
  allowUnqualified: true,
  inferUnit: 'imperial',
  normalizedUnit: 'cm',
});
// { value: 182.88, unit: 'cm', type: 'height', matches: [{ value: 72, unit: 'in' }], raw: '72' }
```

## Fuzzy Matching

Set `fuzziness` to 1 or 2 to read unit names that have spelling errors. The value is the largest
number of spelling errors in a word. Each letter that is added, removed or changed is one error.
These rules apply:

- An exact unit name always wins.
- A word must start with the same letter as the unit name.
- The number of errors must be less than a third of the length of the unit name.
- A unit name of three characters or fewer matches only when it is exact.
- The British spellings `centimetre`, `centimetres`, `metre` and `metres` match only when they are
  exact.
- The words `food`, `feel`, `feed`, `fool`, `kill` and `kills` never match. They are too near to
  `foot`, `feet`, `kilo` and `kilos`.
- The nearest unit name wins. If two unit names are equally near, the first unit in this order
  wins: `ft`, `in`, `cm` and `m` for height, and `lb` and `kg` for weight.

These rules prevent many wrong matches. But fuzzy matching can still read an ordinary word as a
unit.

```typescript
parseMeasurement('5 foots 10 inc', { fuzziness: 2 }); // { value: 70, unit: 'in', ... }
parseMeasurement('5 foots 10 inc'); // null: without fuzziness, unit names must be exact
parseMeasurement('5 foot 10 inches', { fuzziness: 1 }); // { value: 70, unit: 'in', ... }: exact names still match
```
