/** mammoth ships types for its Node entry point only. */
declare module 'mammoth/mammoth.browser' {
  type Input = { arrayBuffer: ArrayBuffer };
  type Result = { value: string; messages: Array<{ type: string; message: string }> };

  export function extractRawText(input: Input): Promise<Result>;
  export function convertToHtml(
    input: Input,
    options?: { ignoreEmptyParagraphs?: boolean; styleMap?: string | string[] },
  ): Promise<Result>;
}
