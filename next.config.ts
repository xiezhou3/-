import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

const localOrigins = Object.values(networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .filter((entry) => entry.family === "IPv4" && !entry.internal)
  .map((entry) => entry.address);

const nextConfig: NextConfig = {
  // 生产 Docker 镜像使用 standalone 产物（.next/standalone + server.js），见 Dockerfile。
  output: "standalone",
  // 允许局域网和 Cloudflare Quick Tunnel 在开发模式访问。
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...localOrigins,
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
