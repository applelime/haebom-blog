import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_KR, Noto_Serif_KR } from 'next/font/google';
import type { ReactNode } from 'react';
import { SITE_NAME } from '@/lib/site';
import './globals.css';

const serif = Noto_Serif_KR({
  weight: ['400', '600', '700', '900'],
  display: 'swap',
  preload: false,
  variable: '--font-serif',
});

const sans = IBM_Plex_Sans_KR({
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: false,
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: '개인의 경험을 매거진처럼 읽히는 글로 기록합니다.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
