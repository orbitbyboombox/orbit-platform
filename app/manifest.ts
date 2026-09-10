import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ORBIT BOOMBOX",
    short_name: "ORBIT BBOX",
    description: "Plataforma operativa ORBIT BOOMBOX",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/orbit-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/orbit-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
