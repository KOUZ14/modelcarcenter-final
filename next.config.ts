import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Vinext currently applies the Server Action multipart guard before App
    // Router upload routes. Uploads are sent one photo at a time, so 11 MB
    // covers one validated 10 MB image plus multipart framing.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
