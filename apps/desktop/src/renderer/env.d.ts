/// <reference path="../../../../packages/theme-engine/src/culori.d.ts" />

declare module "*.css";
declare module "*.png" {
  const content: string;
  export default content;
}
