import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Use relative asset paths for the leaderboard's GitHub Pages deployment.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
