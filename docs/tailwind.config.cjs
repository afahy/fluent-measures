// The settings for docs/tailwind.css, which docs/index.html loads (AFA-97). CONTRIBUTING.md says
// how to build the file again. It uses Tailwind 3.4.17, the version that the Play CDN served.
module.exports = {
  content: { relative: true, files: ['./index.html'] },
  theme: {
    extend: {
      colors: {
        primary: '#0366d6',
        'primary-dark': '#0256b9',
      },
    },
  },
};
