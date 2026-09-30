import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(packageDirectory, "src") },
  },
  build: {
    // The dev watcher shares dist with emitted declarations. Keep those files
    // when Vite rebuilds JS/CSS after the initial package build.
    emptyOutDir: false,
    lib: {
      entry: path.resolve(packageDirectory, "src/index.tsx"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: (id) =>
        id === "react" ||
        id.startsWith("react/") ||
        id === "react-dom" ||
        id.startsWith("react-dom/") ||
        [
          "react-router-dom",
          "jazz-tools/react",
          "react-hook-form",
          "lucide-react",
          "class-variance-authority",
          "cn",
        ].includes(id) ||
        id.startsWith("@base-ui/react/"),
    },
  },
});
