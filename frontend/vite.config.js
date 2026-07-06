import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const backendUrl = "http://localhost:3101";
const clerkMockPath = path.resolve(__dirname, "./src/mocks/clerk.jsx");

export default defineConfig(({ command }) => ({
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
    // Local dev uses a mock Clerk provider so the app runs without OAuth setup.
    // Production builds must use the real @clerk/react package for Google sign-in.
    alias:
      command === "serve"
        ? {
            "@clerk/react": clerkMockPath,
          }
        : {},
  },
  server: {
    port: 3100,
    proxy: {
      "/api/voxis": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/api": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      "/health": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/me": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/users": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/memory": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/personality": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/personality-preference": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/personalities": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/research-profile": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/chat": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/settings": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/tts": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/voice-presets": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/youtube": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/ports.json": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/voxis-config.js": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
      "/sfx": {
        target: backendUrl,
        changeOrigin: true,
        secure: false,
      },
    },
  },
}));
