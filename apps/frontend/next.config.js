/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: ['lh3.googleusercontent.com'],
    },
    async rewrites() {
        return [
            {
                source: '/api/auth/:path*',
                destination: 'http://localhost:3001/auth/:path*',
            },
            {
                source: '/api/skills/:path*',
                destination: 'http://localhost:3001/skills/:path*',
            },
            {
                source: '/api/artifacts/:path*',
                destination: 'http://localhost:3001/artifacts/:path*',
            },
        ];
    },
};

module.exports = nextConfig;
