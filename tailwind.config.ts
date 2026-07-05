import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#202733",
        muted: "#657184",
        line: "#d8dee8",
        panel: "#f7f9fc",
        accent: "#0f72e5",
      },
    },
  },
  plugins: [],
};

export default config;
