/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '62.146.175.144',
        port: '3000',
        pathname: '/thumbnails/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/proxy/:path*',
        destination: 'http://62.146.175.144:3000/:path*',
      },
    ]
  },
}

export default nextConfig
