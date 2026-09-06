/** Values the injected Paged.js runtime publishes on the rendered document. */
declare global {
  interface Window {
    __VC_READY__?: boolean;
    __VC_ERROR__?: string;
    __VC_PAGE_COUNT__?: number;
    __VC_PAGES__?: Array<{
      pageNumber: number;
      label: string;
      side: 'left' | 'right';
      blank: boolean;
    }>;
    __VC_CONFIG__?: unknown;
    PagedConfig?: { auto: boolean };
    PagedPolyfill?: { preview: () => Promise<unknown> };
  }
}

export {};
