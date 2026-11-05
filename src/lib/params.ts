/** 주소의 ?page= 값을 1 이상의 정수로 바꿉니다. 이상한 값은 1쪽입니다. */
export function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** 주소 조각을 풀어 씁니다. 잘못 인코딩된 값이면 null입니다. */
export function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value).normalize('NFC');
  } catch {
    return null;
  }
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
