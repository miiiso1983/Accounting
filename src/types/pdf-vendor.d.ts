declare module "bidi-js" {
  export type EmbeddingLevels = {
    levels: Uint8Array;
    paragraphs: Array<{ start: number; end: number; level: number }>;
  };

  export type Bidi = {
    getEmbeddingLevels(text: string, explicitDirection?: "ltr" | "rtl"): EmbeddingLevels;
    getReorderSegments(text: string, embeddingLevels: EmbeddingLevels, start?: number, end?: number): Array<[number, number]>;
    getMirroredCharactersMap(text: string, embeddingLevels: EmbeddingLevels, start?: number, end?: number): Map<number, string>;
  };

  export default function bidiFactory(): Bidi;
}

declare module "arabic-persian-reshaper" {
  export const ArabicShaper: {
    convertArabic(value: string): string;
  };

  export const PersianShaper: {
    convertArabic(value: string): string;
  };
}