export type ProductType = 'plinta' | 'cornisa' | 'pardoseala_spc' | 'unknown';
export type ProfileStyle = 'straight' | 'rounded' | 'stepped' | 'classical' | 'modern';

export interface ProductParams {
  productType: ProductType;
  height: number;      // mm
  thickness: number;   // mm
  width?: number;      // mm - only for pardoseala_spc
  length: number;      // mm
  profileStyle: ProfileStyle;
  finish: string;
  color: string;       // hex color
}

export interface ExtractResult {
  success: boolean;
  params?: ProductParams;
  error?: string;
}
