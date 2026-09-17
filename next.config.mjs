import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This project sits inside a parent folder that also has a lockfile (the
  // other Nawabus apps share the workspace) — pin the trace root here so Next
  // doesn't guess wrong.
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,

  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    // Bouncing between bottom-nav tabs shouldn't re-fetch every screen. 30s is
    // well inside the window where a fuel total still matters.
    staleTimes: { dynamic: 30, static: 180 },
  },

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
      },
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
    ];
  },
};

export default nextConfig;
