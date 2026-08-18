/** @type {import('next').NextConfig} */

// Streaming backend now lives on the new VPS (lionel-commander-openclaw),
// exposed publicly via Tailscale Funnel since the box sits behind a cloud firewall.
const STREAM_BACKEND = 'https://lionel-commander-openclaw.tail3a5f1d.ts.net'

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lionel-commander-openclaw.tail3a5f1d.ts.net',
        pathname: '/thumbnails/**',
      },
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
        destination: `${STREAM_BACKEND}/:path*`,
      },
    ]
  },
}

export default nextConfig
