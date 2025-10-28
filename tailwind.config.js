// tailwind.config.js
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        pulseGold: {
          "0%": { boxShadow: "0 0 0px rgba(255,200,0,0.25)" },
          "50%": { boxShadow: "0 0 24px rgba(255,200,0,0.75)" },
          "100%": { boxShadow: "0 0 0px rgba(255,200,0,0.25)" },
        },
        popIn: {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "pulse-gold": "pulseGold 2.2s ease-in-out infinite",
        "pop-in": "popIn 700ms cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};
