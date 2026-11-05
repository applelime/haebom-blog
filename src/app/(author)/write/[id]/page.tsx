import { notFound } from 'next/navigation';
import { Editor } from '@/components/editor/Editor';
import { getViewer } from '@/lib/access/viewer';
import { ID_PATTERN } from '@/lib/post/blocks';
import { getRuntime } from '@/lib/runtime';
import { deleteAction, discardAction, publishAction, saveDraftAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: '글쓰기', robots: { index: false } };

/** 에디터. 글쓴이 컴퓨터(localhost)가 아니면 "글을 찾을 수 없습니다."입니다(FR5.4). */
export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await getViewer()) !== 'author') notFound();
  const { id } = await params;
  if (!ID_PATTERN.test(id)) notFound();
  const { posts } = await getRuntime();
  const editing = await posts.getForEditor(id);
  if (!editing) notFound();
  const photos = await posts.getEditorPhotos(editing.fields);
  return (
    <main>
      <Editor
        key={id}
        initialFields={editing.fields}
        isPublished={editing.post.status === 'published'}
        initialHasPendingEdits={editing.hasPendingEdits}
        initialPhotos={photos}
        firstPublishedAt={editing.post.firstPublishedAt}
        actions={{
          save: saveDraftAction.bind(null, id),
          publish: publishAction.bind(null, id),
          discard: discardAction.bind(null, id),
          remove: deleteAction.bind(null, id),
        }}
      />
    </main>
  );
}
