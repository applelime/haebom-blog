/** "2026년 11월 4일" */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** "11월 4일" (내 글 목록) */
export function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
