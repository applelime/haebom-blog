export type PhotoFormat = 'jpeg' | 'png' | 'heic' | 'webp';

/** 데이터베이스에 저장하는 사진 정보(Photo). 사진 설명은 블록에만 있습니다. */
export interface PhotoRecord {
  id: string;
  originalFile: string;
  format: PhotoFormat;
  width: number;
  height: number;
  sizeBytes: number;
  /** 만들어 둔 WebP 폭 목록 */
  variants: number[];
  createdAt: number;
}

/** 화면에 필요한 사진 정보. 비율 자리를 잡고 srcset을 만드는 데 씁니다. */
export interface PhotoInfo {
  id: string;
  width: number;
  height: number;
}

export function toPhotoInfo(photo: PhotoRecord): PhotoInfo {
  return { id: photo.id, width: photo.width, height: photo.height };
}
