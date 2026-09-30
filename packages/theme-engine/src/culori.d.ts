declare module "culori" {
  export interface Color {
    mode: string;
    l?: number;
    c?: number;
    h?: number;
    r?: number;
    g?: number;
    b?: number;
    alpha?: number;
  }

  export function parse(color: string): Color | undefined;
  export function formatHex(color: Color | string | undefined): string;
  export function wcagLuminance(color: Color | string): number;
  export function oklch(color: Color | string): Color | undefined;
}
