import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DW Meeting Room",
    short_name: "DW Meeting",
    description: "회사 미팅룸 예약",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icons/meeting-room-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/meeting-room-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/meeting-room-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
