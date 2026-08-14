import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" —— 相对路径构建，GitHub Pages 任意仓库路径下均可直接部署
export default defineConfig({
  base: "./",
  plugins: [react()],
});
