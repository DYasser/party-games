# Third-party content

This project's own code and game content are MIT licensed (see [LICENSE](LICENSE)).
The game names and rules implementations here are original; any resemblance to
commercial party games is at the level of genre mechanics, which are not
copyrightable.

## Word Race dictionaries

The word lists in `shared/wordrace/dict/` are generated from two MIT-licensed
npm packages by `scripts/build-wordrace-dict.mjs`:

| Source | Licence | Used for |
| --- | --- | --- |
| [an-array-of-english-words](https://www.npmjs.com/package/an-array-of-english-words) | MIT | English accepted guesses |
| [an-array-of-french-words](https://www.npmjs.com/package/an-array-of-french-words) | MIT | French accepted guesses |

Both are **devDependencies**: they are needed only to regenerate the
dictionaries, never at runtime, and are not shipped to the browser.

The answer pools (the words that can actually be the secret) are curated
separately in this repository:

- English: hand-picked in `shared/wordrace/words.ts`
- French: hand-picked in `scripts/data/fr-common.txt`

To regenerate after editing either list:

```bash
npm run build:dict
```

## Fonts

The UI loads Chakra Petch and DM Sans from Google Fonts. Both are licensed under
the SIL Open Font License.
