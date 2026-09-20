/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      boxShadow: {
        card: '0 1px 3px rgba(2,18,70,0.06), 0 4px 16px rgba(2,18,70,0.06)',
      },
    },
  },
  plugins: [],
}
