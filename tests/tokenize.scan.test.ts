import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/tokenize';

const tokens = (input: string): [string, number, number][] =>
  tokenize(input).map(({ text, start, end }) => [text, start, end]);

// AFA-88: cases for each rule that the single scan decides. Tokens have no public specification,
// and the ticket asks this refactor to keep every result. So each row is what main's tokenizer at
// f85a98d gave for its input, as a characterization of the passes that the scan replaced. A
// differential comparison of main and the branch over millions of inputs, in the PR, checks the
// rest.
describe('tokenize: the single scan', () => {
  // A unit right before digits ends its word, but only after a number that starts a word (AFA-62).
  it.each([
    [
      '5ft6',
      [
        ['5', 0, 1],
        ['ft', 1, 3],
        ['6', 4, 5],
      ],
    ],
    [
      '5FT6',
      [
        ['5', 0, 1],
        ['ft', 1, 3],
        ['6', 4, 5],
      ],
    ],
    [
      '5ft.6',
      [
        ['5', 0, 1],
        ['ft.', 1, 4],
        ['6', 5, 6],
      ],
    ],
    [
      '5ft..6',
      [
        ['5', 0, 1],
        ['ft.', 1, 4],
        ['.6', 4, 6],
      ],
    ],
    ['x5ft6', [['x5ft6', 0, 5]]],
    ['_5ft6', [['_5ft6', 0, 5]]],
    [
      '²5ft6',
      [
        ['²', 0, 1],
        ['5', 1, 2],
        ['ft6', 2, 5],
      ],
    ],
    ['𝐀5ft6', [['𝐀5ft6', 0, 6]]],
    [
      '5.5ft6',
      [
        ['5.5', 0, 3],
        ['ft', 3, 5],
        ['6', 6, 7],
      ],
    ],
    [
      '.5ft6',
      [
        ['.5', 0, 2],
        ['ft', 2, 4],
        ['6', 5, 6],
      ],
    ],
    [
      '1.2.3ft6',
      [
        ['1.2.3', 0, 5],
        ['ft6', 5, 8],
      ],
    ],
    [
      '5.ft6',
      [
        ['5.', 0, 2],
        ['ft6', 2, 5],
      ],
    ],
    [
      'a.5ft6',
      [
        ['a.', 0, 2],
        ['5', 2, 3],
        ['ft6', 3, 6],
      ],
    ],
    [
      '5½ft6',
      [
        ['5.5', 0, 3],
        ['ft', 3, 5],
        ['6', 6, 7],
      ],
    ],
    [
      '½m80',
      [
        ['0.5', 0, 3],
        ['m', 3, 4],
        ['80', 5, 7],
      ],
    ],
    [
      '5meterſ6',
      [
        ['5', 0, 1],
        ['meterſ', 1, 7],
        ['6', 8, 9],
      ],
    ],
    [
      '5metres6',
      [
        ['5', 0, 1],
        ['metres', 1, 7],
        ['6', 8, 9],
      ],
    ],
    [
      '1.8m80',
      [
        ['1.8', 0, 3],
        ['m', 3, 4],
        ['80', 5, 7],
      ],
    ],
    [
      '5ftm6',
      [
        ['5', 0, 1],
        ['ftm6', 1, 5],
      ],
    ],
    [
      '5ft5ft6',
      [
        ['5', 0, 1],
        ['ft', 1, 3],
        ['5', 4, 5],
        ['ft6', 5, 8],
      ],
    ],
    ['kg12ft5', [['kg12ft5', 0, 7]]],
    [
      '5 ft6',
      [
        ['5', 0, 1],
        ['ft', 2, 4],
        ['6', 5, 6],
      ],
    ],
    [
      'a€5ft6',
      [
        ['a', 0, 1],
        ['€', 1, 2],
        ['5', 2, 3],
        ['ft', 3, 5],
        ['6', 6, 7],
      ],
    ],
    [
      '5xft6',
      [
        ['5', 0, 1],
        ['xft6', 1, 5],
      ],
    ],
    [
      '5ftx6',
      [
        ['5', 0, 1],
        ['ftx6', 1, 5],
      ],
    ],
    [
      'a@b`c[d{e_f',
      [
        ['a', 0, 1],
        ['@', 1, 2],
        ['b', 2, 3],
        ['`', 3, 4],
        ['c', 4, 5],
        ['[', 5, 6],
        ['d', 6, 7],
        ['{', 7, 8],
        ['e_f', 8, 11],
      ],
    ],
  ] as [string, [string, number, number][]][])('units: reads %j', (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });

  // "I’m" is one word, also before digits, which a space separates from its unit "m".
  it.each([
    [
      "I'm5",
      [
        ["i'm", 0, 3],
        ['5', 4, 5],
      ],
    ],
    [
      'I’m 5',
      [
        ['i’m', 0, 3],
        ['5', 4, 5],
      ],
    ],
    [
      "I'mK",
      [
        ['i', 0, 1],
        ["'", 1, 2],
        ['mk', 2, 4],
      ],
    ],
    [
      "I'mİ",
      [
        ['i', 0, 1],
        ["'", 1, 2],
        ['mi̇', 2, 5],
      ],
    ],
    [
      "I'mé",
      [
        ["i'm", 0, 3],
        ['é', 3, 4],
      ],
    ],
    [
      "i'm_",
      [
        ['i', 0, 1],
        ["'", 1, 2],
        ['m_', 2, 4],
      ],
    ],
    ["I'M", [["i'm", 0, 3]]],
    [
      '5i’m',
      [
        ['5', 0, 1],
        ['i’m', 1, 4],
      ],
    ],
    [
      'a5i’m',
      [
        ['a5i', 0, 3],
        ['’', 3, 4],
        ['m', 4, 5],
      ],
    ],
    [
      "hi'm",
      [
        ['hi', 0, 2],
        ["'", 2, 3],
        ['m', 3, 4],
      ],
    ],
    [
      "I'm.5",
      [
        ["i'm", 0, 3],
        ['.', 3, 4],
        ['5', 5, 6],
      ],
    ],
    [
      "I'm,5",
      [
        ["i'm", 0, 3],
        [',', 3, 4],
        ['5', 4, 5],
      ],
    ],
    [
      "I'm½",
      [
        ["i'm", 0, 3],
        ['0.5', 4, 7],
      ],
    ],
    [
      'I-m',
      [
        ['i', 0, 1],
        ['-', 1, 2],
        ['m', 2, 3],
      ],
    ],
    [
      "I'x",
      [
        ['i', 0, 1],
        ["'", 1, 2],
        ['x', 2, 3],
      ],
    ],
    [
      "I'm 1/2",
      [
        ["i'm", 0, 3],
        ['1', 4, 5],
        ['/', 5, 6],
        ['2', 6, 7],
      ],
    ],
  ] as [string, [string, number, number][]][])('words: reads %j', (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });

  // A letter and numerals before a comma own it, and a run after a letter or quote mark keeps that context.
  it.each([
    [
      'phase2,180',
      [
        ['phase2', 0, 6],
        [',', 6, 7],
        ['180', 7, 10],
      ],
    ],
    [
      'a1,000',
      [
        ['a1', 0, 2],
        [',', 2, 3],
        ['000', 3, 6],
      ],
    ],
    [
      'a 1,000',
      [
        ['a', 0, 1],
        ['1000', 2, 6],
      ],
    ],
    [
      'a²1,5',
      [
        ['a²1', 0, 3],
        [',', 3, 4],
        ['5', 4, 5],
      ],
    ],
    [
      '5²,5',
      [
        ['5', 0, 1],
        ['²', 1, 2],
        ['.5', 2, 4],
      ],
    ],
    [
      'a5²,5',
      [
        ['a5²', 0, 3],
        [',', 3, 4],
        ['5', 4, 5],
      ],
    ],
    [
      'kg5 1/2',
      [
        ['kg5.', 0, 4],
        ['5', 4, 5],
      ],
    ],
    ['kg5 5/2', [['kgx', 0, 3]]],
    ['kg1000000000000000000000½', [['kgx', 0, 3]]],
    [
      '1/2²,5',
      [
        ['0.5', 0, 3],
        ['²', 3, 4],
        ['.5', 4, 6],
      ],
    ],
    [
      'a5€,5',
      [
        ['a5', 0, 2],
        ['€', 2, 3],
        ['.5', 3, 5],
      ],
    ],
    [
      'x ²,5',
      [
        ['x', 0, 1],
        ['²', 2, 3],
        ['.5', 3, 5],
      ],
    ],
    [
      'a1/2²,5',
      [
        ['a1', 0, 2],
        ['/', 2, 3],
        ['2', 3, 4],
        ['²', 4, 5],
        ['.5', 5, 7],
      ],
    ],
    [
      'é 1/2',
      [
        ['é', 0, 2],
        ['0.5', 3, 6],
      ],
    ],
    [
      'a² 1/2',
      [
        ['a²', 0, 2],
        ['0.5', 3, 6],
      ],
    ],
  ] as [string, [string, number, number][]][])('labels: reads %j', (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });

  // A minus sign is a sign only when no number or number word comes before it.
  it.each([
    [
      'kg −−5',
      [
        ['kg', 0, 2],
        ['−', 3, 4],
        ['-', 4, 5],
        ['5', 5, 6],
      ],
    ],
    [
      'éone −5',
      [
        ['éone', 0, 4],
        ['−', 5, 6],
        ['5', 6, 7],
      ],
    ],
    [
      'Kone −5',
      [
        ['kone', 0, 4],
        ['-', 5, 6],
        ['5', 6, 7],
      ],
    ],
    [
      '−a five',
      [
        ['-', 0, 1],
        ['a', 1, 2],
        ['five', 3, 7],
      ],
    ],
    [
      '−anfive',
      [
        ['−', 0, 1],
        ['anfive', 1, 7],
      ],
    ],
    [
      'x−a five',
      [
        ['x', 0, 1],
        ['-', 1, 2],
        ['a', 2, 3],
        ['five', 4, 8],
      ],
    ],
    [
      '− 5',
      [
        ['−', 0, 1],
        ['5', 2, 3],
      ],
    ],
    [
      '﹣five',
      [
        ['-', 0, 1],
        ['five', 1, 5],
      ],
    ],
  ] as [string, [string, number, number][]][])('signs: reads %j', (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });

  // A curly quote after a number, a number word or "and a half" is a mark.
  it.each([
    [
      'five’',
      [
        ['five', 0, 4],
        ["'", 4, 5],
      ],
    ],
    [
      'five’s',
      [
        ['five', 0, 4],
        ['’', 4, 5],
        ['s', 5, 6],
      ],
    ],
    [
      'Kfive’',
      [
        ['kfive', 0, 5],
        ['’', 5, 6],
      ],
    ],
    [
      '17seventeen’',
      [
        ['17', 0, 2],
        ['seventeen', 2, 11],
        ['’', 11, 12],
      ],
    ],
    [
      '5 and a half’',
      [
        ['5', 0, 1],
        ['and', 2, 5],
        ['a', 6, 7],
        ['half', 8, 12],
        ["'", 12, 13],
      ],
    ],
    [
      'x5 and a half’',
      [
        ['x5', 0, 2],
        ['and', 3, 6],
        ['a', 7, 8],
        ['half', 9, 13],
        ["'", 13, 14],
      ],
    ],
    [
      'xfive and a half’',
      [
        ['xfive', 0, 5],
        ['and', 6, 9],
        ['a', 10, 11],
        ['half', 12, 16],
        ['’', 16, 17],
      ],
    ],
    [
      'six-and-a-half”',
      [
        ['six', 0, 3],
        ['-', 3, 4],
        ['and', 4, 7],
        ['-', 7, 8],
        ['a', 8, 9],
        ['-', 9, 10],
        ['half', 10, 14],
        ['"', 14, 15],
      ],
    ],
    [
      '5 xand a half’',
      [
        ['5', 0, 1],
        ['xand', 2, 6],
        ['a', 7, 8],
        ['half', 9, 13],
        ['’', 13, 14],
      ],
    ],
    [
      'and a half’',
      [
        ['and', 0, 3],
        ['a', 4, 5],
        ['half', 6, 10],
        ['’', 10, 11],
      ],
    ],
    [
      '5 ’ ’',
      [
        ['5', 0, 1],
        ["'", 2, 3],
        ['’', 4, 5],
      ],
    ],
    [
      '5’ ’',
      [
        ['5', 0, 1],
        ["'", 1, 2],
        ["'", 3, 4],
      ],
    ],
    [
      '5½’',
      [
        ['5.5', 0, 3],
        ["'", 3, 4],
      ],
    ],
    [
      '5 and ahalf’',
      [
        ['5', 0, 1],
        ['and', 2, 5],
        ['ahalf', 6, 11],
        ['’', 11, 12],
      ],
    ],
    [
      '5 and a halx’',
      [
        ['5', 0, 1],
        ['and', 2, 5],
        ['a', 6, 7],
        ['halx', 8, 12],
        ['’', 12, 13],
      ],
    ],
    [
      'xyz and a half’',
      [
        ['xyz', 0, 3],
        ['and', 4, 7],
        ['a', 8, 9],
        ['half', 10, 14],
        ['’', 14, 15],
      ],
    ],
  ] as [string, [string, number, number][]][])('marks: reads %j', (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });

  // Two marks right after a number are an inch mark, but a third keeps them.
  it.each([
    [
      "5''",
      [
        ['5', 0, 1],
        ['″', 1, 2],
      ],
    ],
    [
      "5'''",
      [
        ['5', 0, 1],
        ["'", 1, 2],
        ["'", 2, 3],
        ["'", 3, 4],
      ],
    ],
    [
      '5’’',
      [
        ['5', 0, 1],
        ['″', 1, 2],
      ],
    ],
    [
      "5'′",
      [
        ['5', 0, 1],
        ['″', 1, 2],
      ],
    ],
    [
      "½''",
      [
        ['0.5', 0, 3],
        ['″', 3, 4],
      ],
    ],
    [
      "5/2''",
      [
        ['x', 0, 1],
        ["'", 1, 2],
        ["'", 2, 3],
      ],
    ],
    [
      "a5''",
      [
        ['a5', 0, 2],
        ['″', 2, 3],
      ],
    ],
    [
      "5 ''",
      [
        ['5', 0, 1],
        ["'", 2, 3],
        ["'", 3, 4],
      ],
    ],
    [
      "5''’",
      [
        ['5', 0, 1],
        ["'", 1, 2],
        ["'", 2, 3],
        ['’', 3, 4],
      ],
    ],
    [
      "5''”",
      [
        ['5', 0, 1],
        ['″', 1, 2],
        ['”', 2, 3],
      ],
    ],
    [
      "5''1/2",
      [
        ['5', 0, 1],
        ['″', 1, 2],
        ['1', 2, 3],
        ['/', 3, 4],
        ['2', 4, 5],
      ],
    ],
  ] as [string, [string, number, number][]][])('inches: reads %j', (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });

  // Long runs and other spaces read like short ones, with the same places.
  it.each([
    [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5',
      [['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5', 0, 41]],
    ],
    [
      '1111111111111111111111111111111111111111kg',
      [
        ['1111111111111111111111111111111111111111', 0, 40],
        ['kg', 40, 42],
      ],
    ],
    [
      '........................................5',
      [['........................................5', 0, 41]],
    ],
    [
      'abababababababababababababababababababab1ft2',
      [['abababababababababababababababababababab1ft2', 0, 44]],
    ],
    ['5                                        1/2', [['5.5', 0, 3]]],
    [
      '5　　ft',
      [
        ['5', 0, 1],
        ['ft', 3, 5],
      ],
    ],
    [
      '\t5\tft\n',
      [
        ['5', 1, 2],
        ['ft', 3, 5],
      ],
    ],
    ['5  ½', [['5.5', 0, 3]]],
    [
      '1/2 3 kg',
      [
        ['0.5', 0, 3],
        ['3', 4, 5],
        ['kg', 6, 8],
      ],
    ],
  ] as [string, [string, number, number][]][])('runs: reads %j', (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });

  // Other characters, the character table, lowercase forms, two fractions in a run, and a comma group that rejects the input.
  it.each([
    [
      '70kg😀',
      [
        ['70', 0, 2],
        ['kg', 2, 4],
        ['😀', 4, 6],
      ],
    ],
    [
      'a😀b',
      [
        ['a', 0, 1],
        ['😀', 1, 3],
        ['b', 3, 4],
      ],
    ],
    [
      '\ud800kg',
      [
        ['\ud800', 0, 1],
        ['kg', 1, 3],
      ],
    ],
    [
      '５ｆｔ',
      [
        ['5', 0, 1],
        ['ft', 1, 3],
      ],
    ],
    [
      '180 ㎝',
      [
        ['180', 0, 3],
        ['cm', 4, 6],
      ],
    ],
    ['kg 12,34,567', []],
    ['72 kg 1234,567', []],
    [
      '½ ¼',
      [
        ['0.5', 0, 3],
        ['0.25', 4, 8],
      ],
    ],
    ['Ⓜ', [['ⓜ', 0, 1]]],
    [
      'Ⅻ 5',
      [
        ['ⅻ', 0, 1],
        ['5', 2, 3],
      ],
    ],
    [
      '5Ⓐ',
      [
        ['5', 0, 1],
        ['ⓐ', 1, 2],
      ],
    ],
    ['aⅫ', [['aⅻ', 0, 2]]],
    ['Ⅰ', [['ⅰ', 0, 1]]],
    ['5/2kg', [['xkg', 0, 3]]],
  ] as [string, [string, number, number][]][])('others: reads %j', (input, expected) => {
    expect(tokens(input)).toEqual(expected);
  });
});
