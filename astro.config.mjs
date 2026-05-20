import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://artlu.ai",
  output: "static",
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/admin"),
    }),
  ],
});
