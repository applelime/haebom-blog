import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { Masthead } from '@/components/masthead/Masthead';
import { getViewer } from '@/lib/access/viewer';
import { getRuntime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

export default async function ReaderLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  const { posts } = await getRuntime();
  const topicCounts = await posts.topicCounts();
  return (
    <>
      <Masthead isAuthor={viewer === 'author'} topicCounts={topicCounts} />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
