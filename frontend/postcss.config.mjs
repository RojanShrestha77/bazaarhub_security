// Tailwind CSS v4 is processed through PostCSS via this plugin. Without this
// file, `@import "tailwindcss"` in globals.css is never compiled and the app
// renders completely unstyled.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
