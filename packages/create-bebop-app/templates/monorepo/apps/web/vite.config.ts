import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { jazzPlugin } from "jazz-tools/dev/vite";

export default defineConfig({
  plugins: [
    tanstackStart(),
    react(),
    jazzPlugin({
      appId: "bebop-starter",
      server: { port: 1625 },
    }),
  ],
});
