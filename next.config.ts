import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Set base path. This is the slug of your GitHub repository.
   *
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/basePath
   */
  basePath: process.env.PAGES_BASE_PATH,

  /**
   * Configure rewrites to proxy QDF file requests from external template sites.
   * This bypasses CORS restrictions by proxying through the Next.js server.
   *
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/rewrites
   */
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/proxy/qdf/:path*',
          destination: 'https://mdb.quadroworld.com/:path*',
        },
        {
          source: '/proxy/mynthquadro/:path*',
          destination: 'https://mynthquadro.github.io/:path*',
        },
        {
          source: '/proxy/yougenmdb/:path*',
          destination: 'https://yougenmdb.com/:path*',
        },
      ],
    };
  },

  /**
   * Disable server-based image optimization. Next.js does not support
   * dynamic features with static exports.
   *
   * @see https://nextjs.org/docs/app/api-reference/components/image#unoptimized
   */
  images: {
    unoptimized: true,
  },
  /* config options here */
  devIndicators: false


};

export default nextConfig;
