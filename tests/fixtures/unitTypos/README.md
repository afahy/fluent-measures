# Unit typo fixtures

`tests/matchUnit.englishWords.test.ts` uses these files (AFA-253).

- `englishWords.json` is the reviewed table. It lists each English word that is one spelling error
  from a unit name under the rules in PARSING.md, "Fuzzy Matching". Each word is `allow`, so
  `fuzzy: true` reads it as its unit, or `block`, so it never matches. `src/matchUnit.ts` blocks
  the same words. The test fails when a word in the table is missing from the accepted set, or an
  English word in the accepted set is missing from the table.
- `scowlWords.txt` is the English word list. It holds only the words that start with a unit name's
  first letter and have a length in `filter` of `englishWords.json`: from one letter shorter than
  the shortest unit name of four or more letters with that first letter, to one letter longer than
  the longest. The test fails when an accepted spelling falls outside the filter, so a new unit name
  needs a wider list.

## Source

The words come from SCOWL by Kevin Atkinson (<http://wordlist.aspell.net/>), as packaged in
`@cspell/dict-en_us` 4.4.8 (`en_US.trie.gz`), which cspell already installs. The list keeps the
words that have only ASCII letters, in lowercase.

To make the list again, read the words from that package's trie with `importTrie` and
`iteratorTrieWords` from `cspell-trie-lib`, lowercase them, keep the words that match `^[a-z]+$`,
and keep those that pass `filter`. Sort them, one word per line.

## Licenses

SCOWL:

> Copyright 2000-2018 by Kevin Atkinson
>
> Permission to use, copy, modify, distribute and sell these word lists, the associated scripts,
> the output created from the scripts, and its documentation for any purpose is hereby granted
> without fee, provided that the above copyright notice appears in all copies and that both that
> copyright notice and this permission notice appear in supporting documentation. Kevin Atkinson
> makes no representations about the suitability of this array for any purpose. It is provided "as
> is" without express or implied warranty.

`SCOWL-LICENSE.txt` has SCOWL's full copyright section, which includes the Ispell notice.
`@cspell/dict-en_us` is under the MIT License, Copyright (c) 2017-2020 Jason Dent; its text is in
`CSPELL-DICT-LICENSE.txt`.
