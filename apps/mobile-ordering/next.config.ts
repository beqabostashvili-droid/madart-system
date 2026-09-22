import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@madart/ui', '@madart/api-client'],
  typescript: { ignoreBuildErrors: false },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};

export default nextConfig;
