/**
 * 검색용 글자 정리(ADR-007): 유니코드 NFC 정규화, 소문자, 앞뒤 공백 제거, 사이 공백은 한 칸으로.
 * 글 내용과 검색어를 같은 방식으로 정리해야 부분 일치가 맞습니다.
 */
export function normalizeForSearch(value: string): string {
  return value.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}
