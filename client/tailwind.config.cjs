const path = require("path");
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.resolve(__dirname, "./index.html"),
    path.resolve(__dirname, "./src/**/*.{js,ts,jsx,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        "wa-green": "#25D366",
        "wa-green-dark": "#128C7E",
        "wa-green-darker": "#075E54",
        "wa-teal": "#34B7F1",
      },
    },
  },
  plugins: [],
};
