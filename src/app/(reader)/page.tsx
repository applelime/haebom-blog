import { HomeView } from '@/components/reader/HomeView';
import { getRuntime } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { posts } = await getRuntime();
  const { cover, latest } = await posts.getHome();
  return <HomeView cover={cover} latest={latest} />;
}
