/** @type {import('next').NextConfig} */
const nextConfig = {
  // potrace (via jimp) relies on CJS `instanceof` checks that break under Next's RSC/route-handler
  // webpack bundling — keep it as a real Node `require()` at runtime instead of bundling it.
  // pdfjs-dist dynamically resolves its worker module by file path at runtime, which breaks once
  // webpack relocates it into .next/server/vendor-chunks — keep it external too.
  experimental: {
    serverComponentsExternalPackages: ['potrace', 'jimp', 'pdfjs-dist', 'pdf-parse', 'mammoth'],
  },
};

export default nextConfig;
