# @afahy/fluent-measures

## 0.2.0

### Upgrading from 0.1.1

Many inputs now give a different result. The entries below describe each change. An entry's
"before" is the result just before that change, which can differ from the 0.1.1 result. These
changes are the most likely to need a code change:

- `import` from an ES module now works. In 0.1.1, only `require` could load the package.
- Each result now has `matches`, a list of `{ value, unit }` for the parts that the parser read.
  It replaces `components` and the `returnComponents` option, which are gone. A match has no
  `match` text.
- `parseMeasurement` returns `null` where 0.1.1 threw for input that isn't a string, or for a
  `normalizedUnit` of the other type. So `parseMeasurement(123)` and
  `parseMeasurement('6 ft', { normalizedUnit: 'kg' })` return `null`.
- Heights convert between meters and feet or inches. In 0.1.1,
  `parseMeasurement('1.8 m', { normalizedUnit: 'in' })`,
  `parseMeasurement('6 ft', { normalizedUnit: 'm' })` and `parseMeasurement('1 m 80 cm')` threw.
- Two new cases throw. A `type` that contradicts `normalizedUnit` throws, even when the input has
  no measurement, as in `parseMeasurement('hello', { type: 'weight', normalizedUnit: 'cm' })`. A
  `maxLength` that isn't a number of at least 1, or `Infinity`, throws.
- Input longer than 1,000 characters returns `null`. The new `maxLength` option changes the limit.
- Separate measurements are no longer added together. `70 kg (154 lbs)` returns 70 kg, and
  `210 lbs to 180 lbs` returns `null`.
- A weight with a part in stone, ounces or grams returns `null`, as in `12st 4lb`.

### Minor Changes

- 60ee4a2: "and a half" after a whole number now adds 0.5, for digits and number words. So "six and a half feet" returns 6.5 ft and "1 and a half meters" returns 1.5 m, where both returned null before. After a feet part with no inch unit, the half belongs to the inches. So "5 foot 10 and a half" returns 70.5 in, not 70 in. An input with only a number and no unit, read with `allowUnqualified`, doesn't read "and a half" yet.
- b45bad0: Normalize thousands separators and decimal commas, including fractions without a leading zero, so measurements such as 1,000 lbs and 72,5 kg retain their complete values. Normalize these numbers before rejecting shared-unit ranges and parsing bare height shorthand such as 5-11,5. Preserve comma separators after Unicode labels and labels ending in digits. Reject malformed combinations of numeric comma groups instead of returning partial or reinterpreted values.
- e504a34: Stop reading the short unit forms "in" and "m" before a number, where they're usually ordinary words, so "weighed 70 kg in 2020" returns 70 kg instead of 2020 in, and "M 28" returns null instead of 28 m. Labels still work before their number: in brackets, before ":" or "=", or written "in.", as in "Height (in): 72", "in = 72" and "m: 1.8". A label doesn't take a number that has its own unit, as in "Weigh in: 180 lbs", unless that unit starts the next part of the height, as in "m: 1 cm: 80". The end of a hyphenated word such as "check-in" is never a label. "in" and "m" after a number are unchanged. Without a label, inputs such as "in 72" and "height in 72" now return null.
- b442ffe: The British spellings "centimetre", "centimetres", "metre" and "metres" are now units, so "170 centimetres" returns 170 cm and "1.8 metres" returns 1.8 m. "#" right after a number now means pounds, so "185#" returns 185 lb. "#" before a number still isn't a unit, as in "room #12". The new spellings match only exactly, so fuzzy matching reads no new word as a unit.

  <!-- cspell:ignore centimetre centimetres -->

- 1e64b8b: Preserve explicit zero components and leading-dot decimals in hyphenated heights, and support meter normalization and mixed spacing around feet units. Reject complete numeric ranges sharing one unit, including spaces and Unicode dashes. Preserve signs after exact or fuzzy unit prefixes, opening quotes, and underscores; reject repeated minus signs and signed compound heights. Ignore unrelated dates and prose dashes, and retain independent measurements after invalid or zero-height fragments. Preserve semicolons as punctuation within individual measurements. Support metric suffixes and unit-prefix values after unrelated zeroes. Bound matching work for malformed decimal shorthand.
- 09899d0: Reduce false matches in fuzzy unit parsing, choose the closest eligible alias, and recognize kilo as kilograms.
- 4f5a867: Read a fraction as part of its number, so "150 1/2 lbs" returns 150.5 lb instead of 2 lb, and "5½ ft" returns 5.5 ft instead of 5 ft. A whole number followed by a space and a proper fraction (`a/b` with `a` less than `b`), and a Unicode fraction such as "½", "¼" or "⅛" after a number, are read as one number. A slash between numbers that don't make a proper fraction, as in "5/2 lbs" and "150 5/2 lbs", now returns null instead of 2 lb. So does a fraction with a decimal in it or before it, as in "1.1/2 lbs" and "5.5 1/2 ft". A whole number with comma groups works too, so "1,000 1/2 lbs" returns 1000.5 lb. A date such as "12/25/2020" is still ignored.
- 7311b55: When the unit comes after the number, a multiplier word after "and a half" now multiplies the whole number plus 0.5. So "two and a half thousand pounds" returns 2500 lb, not 1000 lb. "Five and a half hundred pounds" returns 550 lb, and "two and a half hundred thousand pounds" returns 250,000 lb. A semicolon between the half and its unit works too, as in "two and a half thousand; lbs" and "6 and a half; ft". If the words before "half" don't form a number, as in "1.5 and a half thousand lbs", the result is now null, not 1000 lb. A signed number before "and a half" now drops its field, as a signed number does elsewhere, so "-2 and a half ft 4" returns null, as "-2.5 ft 4" does. A unit or label before the number still reads only the half, so "pounds: two and a half thousand" returns 2.5 lb.
- bfff5cc: Return null for non-string input at runtime and for raw input longer than 1,000 characters.
  Add the `maxLength` parsing option to raise or lower this limit, or disable it with `Infinity`.
  Invalid limits throw an error. The TypeScript input parameter remains `string`.
- b1980ed: Keep the value before a label in brackets, or `in.`, when the number after the label has its own unit. So "72 (in), 180 lbs" returns 72 in again instead of 180 lb, and "1.8 (m), 80 kg" returns 1.8 m instead of 80 kg. A label before ":" or "=" is a field name, in brackets too, so it still doesn't take the number before it when a number follows: "age=28 in=180 lbs", "72 in: 180 lbs" and "age 28 (in): 180 lbs" return 180 lb. A label after a comma, semicolon, colon, equals sign or "&" never takes the number of the field before it, so "age=28, in:" returns null instead of 28 in. "age=28, in=72" still returns 72 in.
- 49d4710: Read the number after a unit label, so "age=28, in=72" returns 72 in instead of 28 in, and "id=7, m=1.8" returns 1.8 m instead of 7 m. A label still reads the number before it when none follows, as in "72 (in)".
- ca03486: A `'` or `"` mark, or a prime, right after "and a half" or a number word now reads as a feet or inch mark, as it does after digits. So `5' 10 and a half"` returns 70.5 in, not 70 in, `five' ten"` returns 70 in, not `null`, and `six'` returns 6 ft. A quoted word, as in `"ten" 5`, is still not a measurement.

  A Unicode minus sign before a number word is now a minus sign, as before digits, so `−five feet` returns `null`, as `−5 feet` does.

- 0386558: A hyphen after a feet or inch mark now joins two values as it does after a unit word. So `5'-eleven` returns 71 in and `5;"-5 in` returns 5 in, and the hyphen in `x11"-5 in` is a minus sign, as in `x11 in-5 in`.
- b187b1e: Include bare inches after a feet component when the value is below twelve and has no unit of its own, including before a separate weight measurement.
- ca886bd: `normalizedUnit` now selects the measurement type, so `parseMeasurement` no longer throws when the input has a measurement of the other type. "6 ft" with `{ normalizedUnit: 'kg' }` returns null, and "6 ft, 80 kg" with `{ normalizedUnit: 'kg' }` returns 80 kg. A `type` that contradicts `normalizedUnit`, as in `{ type: 'height', normalizedUnit: 'kg' }`, throws "normalizedUnit kg is not a height unit". Like the "allowUnqualified requires type" error, it doesn't throw for an empty input, or for one that has only characters that the parser ignores, such as ",". Other punctuation, such as "." or ";", is enough to throw. Bare shorthand such as "5-11", and `allowUnqualified`, still need `type`. A height with several parts now keeps the unit system of its parts: "1 m 80 cm" returns 180 cm instead of 70.87 in. "5 ft 11 in" still returns 71 in.
- 1b5c6fa: Keep a label's number word separate from digits after a comma and space, so `phase twenty, 5 cm`
  returns 5 cm and `I am forty, 5 kg overweight` returns 5 kg.

  Reject incomplete weights such as `stone twenty, 4 lb` while preserving a later independent
  weight after a signed part, as in `stone -5 lb; actual 70 kg`.

  Keep unsupported weight parts connected across a comma boundary to a signed unit-first amount, including
  `kg -twenty, 5 grams; actual 70 kg`, so incomplete weights return `null`.

- 1e64b8b: Parse hyphenated heights without treating separators as minus signs. Interpret bare feet-inches shorthand only with an explicit height type and an inch component below twelve.
- c7f364a: Parse complete number phrases before units and in unqualified input, including mixed words and digits. Preserve independent numeric values and multiplier groups, support leading-dot decimals, and bound phrase parsing work for long inputs.
- 2d0f82c: Keep a numeric range's unit from attaching to a separate measurement. Read surrounding feet and
  inches such as `6 1-2 ft 3 in` as `6 ft 3 in`, without using the range's endpoints.
- e4d70e6: Stop adding separate measurements together. Parts form one measurement only when each unit is the next smaller one, the larger part is a whole number and the smaller part is less than one of the larger unit, as in "5 ft 11 in" or "1 m 80 cm". When an input has more than one measurement of a type, return the first if the others agree with it within 1%, so "70 kg (154 lbs)" returns 70 kg instead of 139.85 kg, and "6 ft (72 in)" and "0.5 m (50 cm)" return 6 ft and 0.5 m. Otherwise return null, so "210 lbs to 180 lbs" and "150 lbs - 180 lbs" no longer return 390 lb and 330 lb. "5 ft-1 m" and "5 ft 12 in" also return null now, instead of 2.524 m and 72 in. A number too large to represent, such as 400 digits, returns null instead of Infinity.
- 6d68d17: A minus sign on "a" or "an" before number words now signs the number. So `-a hundred kg` and `age 28 kg: -a hundred` return `null`, as `-one hundred kg` does. The parser also reads a signed number in words before an ounce, gram or stone unit as one number. So `12 lb -twenty five oz` returns `null`, as `12 lb -25 oz` does.
- c05b6d9: Fix more signed parts. A signed value with its own unit of the other type no longer drops a label's measurement, so `in: -180 lbs, 72 in` returns 72 in. A semicolon before the number no longer stops a hyphen from joining two values, so `1 ; m-80 cm` returns 180 cm. A sign on the first word of a number phrase now signs the whole phrase, so `-twenty five kg` and `-5 hundred kg` return `null`, as `-5 feet` does.
- 860ebc0: A measurement can't be negative. Before, the parser dropped a signed part, such as "-5 ft" or "kg -5", and the rest of the input decided the result.

  Now a signed part drops each part of its type in its field. A field is the input, or a part between semicolons. So "-5 ft 6 ft", "[-5 kg] 70 kg" and "-12st 4lb" return null, and so does "−5 ft 6 ft" with the Unicode minus sign.

  After a number and its unit, a hyphen now joins two parts or values. So "150 lbs-180 lbs" returns null, as a range that repeats its unit, and "1 m-80 cm" returns 180 cm.

  A signed height doesn't cancel a weight, so "-5 ft, 150 lbs" returns 150 lb.

- 1bc75c7: Read spoken weights and heights. A ones word and then a tens word, as the first two words of a number, are hundreds, so "one-eighty pounds" returns 180 lb instead of 80 lb, and "two twenty-five lbs" returns 225 lb. Two number words joined by a hyphen work like the "5-11" shorthand when the feet are 3 to 8, so "five-eleven" with `{ type: 'height' }` returns 71 in instead of null. Without `{ type: 'height' }`, "five-eleven" still returns null, as "5-11" does.
- a9cb125: Return null for a weight with a part in stone, ounces or grams, such as "12st 4lb", "7 lb 8 oz" and "3 kg 400 g", instead of returning the supported part alone. These units aren't supported. Only a part next to a supported weight part counts, so an unrelated amount such as "I drink 8 oz of water, weight 180 lbs" still returns 180 lb. Commas don't separate parts, so "180 lbs, 8 oz of water a day" returns null. "st" after a whole number that ends in 1, except 11, is read as an ordinal, so dates such as "Oct 1st" still work, while "10.1st 4lb" returns null. A capital "G" right after a number, as in "5G", isn't read as grams. A height in the same input is still returned.
- da0feb1: Return null for a weight with a part in stone, ounces or grams when a unit comes before its number, as in "stone 12, 4 lb", "kg 3, 400 g" and "Stone: 12, lb: 4", instead of returning the supported part alone. "gravel and stone, 50 lb bag" still returns 50 lb, because 50 has its own unit. Like "in" and "m", "st" and "g" before a number are read as other words, so "Main St 12, 180 lbs" still returns 180 lb.
- f066acb: Apply `normalizedUnit` conversions to unqualified measurements after inferring their source unit.
- d8a52a0: Disable fuzzy unit matching when fuzziness is not a positive, finite number.
- e158b99: Reject inherited object property names in number words and multipliers so invalid measurements cannot return string values.
- b10b37c: Two apostrophes right after a digit now read as an inch mark, as `"` does there. So `72''` returns 72 in, not `null`. `´´` and `’’` read the same way. Two apostrophes that close a number they opened, as in `the ''5'' kg bag`, and three or more marks, as in `72'''`, still return `null`.
- 248b15a: Pass typed tokens from the tokenizer to the parser. A label is one token that gives its kind and whether it starts a field, and the parser sets a flag on each token that a measurement uses. No result changes, except for input that contains the words `_unit`, `_name` or `_field`. The parser no longer reads them as label marks, so `5 _unit kg` returns null, not 5 kg.
- ddb8fb1: Don't read the short unit forms "in" and "m" as a label when they end a longer word that starts with a non-ASCII letter, so "µm: 5" (micrometers) and "éin: 72" return null instead of 5 m and 72 in. Labels after a space or bracket, such as "Height in: 72" and "Longueur (m): 1.8", still work.
- ee10658: Read the Unicode minus signs "−" (U+2212) and "﹣" (U+FE63) as "-" before the first number of an input. A digit, a Unicode fraction and a number word all count as a number. A measurement can't be negative, so "−5 ft" and "−½ lb" now return null, as "-5 ft" does, instead of 5 ft and 0.5 lb. "kg−70.5" returns null, as "kg-70.5" does. After a number, a minus sign still joins two parts or values, so "5−11", "1 m−80 cm" and "150 lbs−180 lbs" give the same results as before.
- afaf89d: Read curly quotes, primes and acute accents as feet and inch marks, so "5’11”", "5′11″" and "5´11´´" return 71 in instead of null. Full-width characters and the units "㎝" and "㎏" are read as their ASCII forms, so "１８０ｃｍ" and "180 ㎝" return 180 cm. An apostrophe in prose, curly or not, is still an apostrophe.
- 8a7c41c: Read the whole number phrase after a unit, so "kg one hundred eighty" returns 180 kg instead of 1 kg, and "in: seventy two" returns 72 in instead of 70 in. A label still doesn't take a number that has its own unit, so "Weigh in: one hundred eighty lbs" returns 180 lb.
- 56c8862: Read the number after any unit label, not only "in" and "m", so "age=28, kg=72" returns 72 kg instead of 28 kg, and "age: 28, ft: 6" returns 6 ft instead of 28 ft 6 in. A unit in brackets or before ":" or "=" is a label. When the number after it has its own unit, the label takes the number before it, as before, so "180 lbs = 82 kg" still returns 180 lb. A label after a comma, semicolon, colon, equals sign or "&" never takes the number of the field before it, so "age=28, kg=0" and "age=28, kg=" return null.
- 72eb3b9: With `{ type: 'height', allowUnqualified: true, inferUnit: 'metric' }`, a lone number below 3 is now a height in meters, because no one is 3 cm tall. So "1.75" returns 1.75 m, not 1.75 cm, and returns 175 cm with `normalizedUnit: 'cm'`. From 3 up, a lone number stays centimeters, as in "175" → 175 cm.
- 8e533e8: After a feet part, a number with a stone, ounce or gram unit no longer becomes inches. So "5 ft 8 oz" returns 5 ft, not 68 in, and "0 ft 8 oz" returns `null`, not 8 in.
- 6e0a1e3: A zero right before a unit is now that unit's own number. Before, the unit also took the next number, so "0 cm, 1.8 m" returned 1.8 cm. Now the unit doesn't take a number that has its own unit, so "0 cm, 1.8 m" returns 1.8 m and "0 kg, 80 lb" returns 80 lb. A number with no unit of its own still belongs to the unit before it, as in "record 0; kg 70" and "0 kg 70".

### Patch Changes

- ec87c47: The README now says that "in" after a number means inches, also in ordinary text, so "Top 10 in the class" returns 10 in. No result changes.
- d0ab7af: A hyphen after an inch mark now joins two values, as a hyphen after a feet mark already does. So `5"-5 in` now returns 5 in, as `5 in-5 in` does, and `6'1"-185 lbs` with `type: 'weight'` returns 185 lb. Both returned `null` before.
- f5f23c3: A long token with many words before a hyphen and a digit, such as `';kg-1'.repeat(25000)` or `';a-1'.repeat(25000)`, now parses in linear time. Before, at each such word, the parser read back over the whole token before it, so 25,000 copies of ";kg-1" took about a second. Each result stays the same.
- 72cb9c8: The parser removes the periods at the end of each token, and the semicolons before a unit, in linear time. Before, it used a regex that took quadratic time on a long run of these marks. So 100,000 periods before a letter, as in `'.'.repeat(100000) + 'a'`, took about 2.6 seconds and blocked the event loop. Each result stays the same.
- 90987aa: Document the unit inference defaults and the type requirement for numbers without units in the `ParseOptions` JSDoc shown by editors.
- bfce67d: Prepare the parser restructure with no change to any result. A result snapshot of generated inputs shows each result that a later change changes. The unused `parseNumberToken` module is gone, one function normalizes text for `tokenize` and `parseMeasurement`, and two blocks of `parseMeasurement` are now named functions.
- 2949690: Fix the `prepare`, `prepack` and `prepublishOnly` lifecycle scripts. They were top-level `package.json` keys, which npm and pnpm ignore. Packing or publishing now cleans and rebuilds `dist/` first, so a release can no longer ship stale build output.
- e373cc4: Add comments that explain why some code can't change a result. No result changes.
- 008d56d: Fix package entry points so the published package can actually be loaded. `exports.import`, `main` and `module` pointed at `dist/index.mjs`, a file tsup never emits, and `exports.require` pointed at `dist/index.js`, which is ESM. Entry points now match the build output (`dist/index.js` for ESM, `dist/index.cjs` for CJS) with per-condition type declarations.

## 0.1.1

### Patch Changes

- b9daafe: Updates documentation, changeset config
