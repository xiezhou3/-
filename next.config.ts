import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产 Docker 镜像用 standalone 产物（.next/standalone + server.js），见 Dockerfile
  output: "standalone",
  // 局域网开发访问时允许该主机加载 Next.js 客户端资源；生产构建不受此项影响。
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "localhost", "127.0.0.1"],
};

export default nextConfig;
