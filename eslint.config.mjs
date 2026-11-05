import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      'aidlc/**',
      '.kiro/**',
      '.next/**',
      'node_modules/**',
      'data/**',
      'uploads/**',
      '.test-tmp/**',
      'coverage/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // 사진은 미리 만든 크기별 WebP와 srcset을 직접 씁니다(ADR-003). next/image 최적화는 쓰지 않습니다.
      '@next/next/no-img-element': 'off',
    },
  },
];

export default eslintConfig;
