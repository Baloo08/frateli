import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["@node-rs/argon2", "pg", "nodemailer", "bullmq", "ioredis"],
};

export default nextConfig;
