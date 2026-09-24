/**
 * Both forms live in the description column: the editor stores HTML, rows older
 * than it hold Markdown. The editor and the public page have to agree on which
 * is which, so the test sits here rather than in a copy on each side.
 */
export function isRichTextHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}
