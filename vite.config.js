import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      buffer: "buffer",
      stream: "stream-browserify",
    },
  },
  optimizeDeps: {
    include: ["buffer", "stream-browserify"],
  },
  define: {
    global: "window",
  },
});
