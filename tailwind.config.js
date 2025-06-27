/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        "background-secondary": "#1C1C1E",
        foreground: "#FFFFFF",
        primary: "#F7931A",
      },
    },
  },
  plugins: [],
};
