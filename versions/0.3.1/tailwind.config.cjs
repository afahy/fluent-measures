// The settings for docs/tailwind.css, which docs/index.html loads (AFA-97). CONTRIBUTING.md says
// how to build the file again. It uses Tailwind 3.4.17, the version that the Play CDN served.
//
// The page has no Tailwind utility classes. Its styles are hand-written in docs/site.css, and the
// build copies each rule there to tailwind.css, in order. So build the file again after you
// change site.css. Tailwind adds no rules of its own, not even Preflight. The content is site.css
// itself, read as plain words, so every rule there has its classes as candidates, and no
// candidate has a variant such as "hover:" or "!".
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

module.exports = {
  content: {
    relative: true,
    files: ['./site.css'],
    extract: { css: content => content.match(/[A-Za-z_][\w-]*/g) ?? [] },
  },
  corePlugins: [],
  plugins: [
    ({ addBase, postcss }) => {
      addBase(postcss.parse(readFileSync(join(__dirname, 'site.css'), 'utf8')).nodes);
    },
  ],
};
