import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png}"] },
      manifest: {
        name: "ギブる",
        short_name: "ギブる",
        description: "青山さんの1to1と段取りを、スワイプ1回で。",
        lang: "ja",
        start_url: "/",
        display: "standalone",
        background_color: "#fdb030",
        theme_color: "#fdb030",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
