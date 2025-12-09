/** @type {import('next').NextConfig} */
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
