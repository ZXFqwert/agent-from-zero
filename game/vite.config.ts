import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/play/",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1600 },
  server: { strictPort: true },
});
