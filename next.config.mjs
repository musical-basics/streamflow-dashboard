/** @type {import('next').NextConfig} */

// stream.musicalbasics.com now points at the new VPS (lionel-commander-openclaw,
// 87.99.135.13), fronted by nginx + Let's Encrypt proxying to the backend on :4000.
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'stream.musicalbasics.com',
        pathname: '/thumbnails/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/proxy/:path*',
        destination: 'https://stream.musicalbasics.com/:path*',
      },
    ]
  },
}

export default nextConfig
