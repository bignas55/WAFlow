import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: path.resolve(__dirname, "./tailwind.config.cjs") }),
        autoprefixer(),
      ],
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../dist/client"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          // Suppress noisy socket errors caused by browser tab closes / page refreshes.
          // EPIPE = server wrote to a closed socket; ECONNRESET = client disconnected abruptly.
          // Both are normal during development and don't indicate a real problem.
          proxy.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EPIPE" || err.code === "ECONNRESET") return;
            console.error("[proxy /api error]", err.message);
          });
        },
      },
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EPIPE" || err.code === "ECONNRESET") return;
            console.error("[proxy /socket.io error]", err.message);
          });
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
});
