/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/enterprise-document-ai",
  trailingSlash: true,

  experimental: {
    agentFeedback: true,
  },

  reactCompiler: true,

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;