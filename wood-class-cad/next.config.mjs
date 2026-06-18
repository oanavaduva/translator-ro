/** @type {import('next').NextConfig} */
const nextConfig = {
  // potrace (via jimp) relies on CJS `instanceof` checks that break under Next's RSC/route-handler
  // webpack bundling — keep it as a real Node `require()` at runtime instead of bundling it.
  experimental: {
    serverComponentsExternalPackages: ['potrace', 'jimp'],
  },
};

export default nextConfig;
