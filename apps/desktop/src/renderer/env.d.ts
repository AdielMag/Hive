/// <reference path="../../../../packages/theme-engine/src/culori.d.ts" />

declare module "*.css";
declare module "*.png" {
  const content: string;
  export default content;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        allowpopups?: boolean | string;
        partition?: string;
        webpreferences?: string;
        useragent?: string;
        autosize?: boolean | string;
        nodeintegration?: boolean | string;
        plugins?: boolean | string;
        disablewebsecurity?: boolean | string;
        httpreferrer?: string;
      };
    }
  }
}
