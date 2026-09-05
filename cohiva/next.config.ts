import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Keep responses smaller and avoid an unnecessary header. */
  poweredByHeader: false,

  /*
   * Next/Image can serve modern formats when supported. Cohiva's
   * local source assets are also pre-compressed WebP files now.
   */
  images: {
    formats: [
      "image/avif",
      "image/webp",
    ],
  },
};

export default nextConfig;
