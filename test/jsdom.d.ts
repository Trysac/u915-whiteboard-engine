declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    window: {
      document: {
        querySelector(selectors: string): {
          tagName: string;
          children: Iterable<{
            tagName: string;
            getAttribute(name: string): string | null;
          }>;
          getAttribute(name: string): string | null;
        } | null;
      };
    };
  }
}
