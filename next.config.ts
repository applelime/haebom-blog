import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 사진은 미리 만든 크기별 WebP를 /media/[id]/[width]로 내보냅니다(ADR-003).
  images: { unoptimized: true },
  // 네이티브 모듈은 번들에 넣지 않고 Node에서 바로 불러옵니다.
  serverExternalPackages: ['@libsql/client', 'libsql', 'sharp', 'heic-convert'],
  poweredByHeader: false,
};

export default nextConfig;
