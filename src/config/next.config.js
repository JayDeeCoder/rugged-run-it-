/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
      domains: ['placeholder.com'],
    },
    // Add these settings to help with the build process
    experimental: {
      // This enables the App Router if you're using it
      appDir: true,
    },
    // Disable specific prerendering for problematic pages
    rewrites: async () => {
      return [
        {
          source: '/_next/:path*',
          destination: '/:path*',
        },
      ];
    },
  };
  
  module.exports = nextConfig;