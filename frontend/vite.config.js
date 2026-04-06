import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Force a single copy of three + R3F packages — prevents
    // "Multiple instances of Three.js" / "Hooks can only be used within Canvas"
    dedupe: [
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "@react-three/postprocessing",
    ],
  },
  server: {
    port: 3100,
    proxy: {
      "/health": "http://localhost:3101",
      "/personality": "http://localhost:3101",
      "/personalities": "http://localhost:3101",
      "/research-profile": "http://localhost:3101",
      "/chat": "http://localhost:3101",
      "/settings": "http://localhost:3101",
      "/tts": "http://localhost:3101",
      "/voice-presets": "http://localhost:3101",
    },
  },
});
