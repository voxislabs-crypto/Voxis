import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3100,
    proxy: {
      "/health": "http://localhost:3101",
      "/personality": "http://localhost:3101",
      "/personalities": "http://localhost:3101",
      "/research-profile": "http://localhost:3101",
      "/chat": "http://localhost:3101",
      "/settings": "http://localhost:3101",
    },
  },
});
