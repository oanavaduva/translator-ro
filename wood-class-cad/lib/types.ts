export type ProductType = 'plinta' | 'cornisa' | 'pardoseala_spc' | 'riflaj' | 'unknown';
export type ProfileStyle = 'straight' | 'rounded' | 'stepped' | 'classical' | 'modern';
export type RiflajType = 'RM' | 'RM-XL' | 'RS' | 'RX';
export type MiterType = 'none' | 'interior' | 'exterior';

export interface ProductParams {
  productType: ProductType;
  height: number;      // mm
  thickness: number;   // mm
  width?: number;      // mm - for pardoseala_spc and riflaj
  length: number;      // mm
  profileStyle: ProfileStyle;
  finish: string;
  color: string;       // hex color
  secondaryColor?: string;         // hex color for riflaj rib tops
  secondaryTextureDataUrl?: string; // user-uploaded texture for riflaj rib tops (folie decor), overrides secondaryColor when present
  riflajType?: RiflajType; // RM | RM-XL | RS | RX — required when productType === 'riflaj'
  customProfileSvg?: string; // raw SVG markup traced from an uploaded sketch (CDR/PDF/JPG), overrides the preset profileStyle shape when present
  textureDataUrl?: string; // user-uploaded texture photo, normalized client-side to a capped-size JPEG data URL; when present, replaces the solid `color` fill on the 3D model and in exports
  miterType?: MiterType;  // 45° miter cut at the right end for corner mounting
}

export interface ExtractResult {
  success: boolean;
  params?: ProductParams;
  error?: string;
}

export interface ConvertSketchResult {
  success: boolean;
  svg?: string;
  error?: string;
}
