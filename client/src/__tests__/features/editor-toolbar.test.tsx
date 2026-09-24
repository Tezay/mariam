import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { EditorToolbar } from '@/pages/admin/EventEditPage';

beforeAll(() => {
  // ProseMirror measures the caret; jsdom has no layout.
  const rect = { x: 0, y: 0, width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 };
  Range.prototype.getClientRects = (() => [] as unknown as DOMRectList) as never;
  Range.prototype.getBoundingClientRect = (() => ({ ...rect, toJSON: () => rect })) as never;
});

function Harness() {
  const editor = useEditor({ extensions: [StarterKit], content: '<p>bonjour</p>' });
  return (
    <>
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </>
  );
}

const isHighlighted = (button: HTMLElement) => button.className.includes('bg-primary');

describe('the editor toolbar', () => {
  it('lights a button up as soon as its mark is applied', async () => {
    render(<Harness />);
    const bold = await screen.findByTitle('Gras');
    expect(isHighlighted(bold)).toBe(false);

    await userEvent.click(bold);

    await waitFor(() => expect(isHighlighted(bold)).toBe(true));
  });

  it('turns it back off when the mark is removed', async () => {
    render(<Harness />);
    const bold = await screen.findByTitle('Gras');

    await userEvent.click(bold);
    await waitFor(() => expect(isHighlighted(bold)).toBe(true));
    await userEvent.click(bold);

    await waitFor(() => expect(isHighlighted(bold)).toBe(false));
  });

  it('leaves the other buttons alone', async () => {
    render(<Harness />);
    await userEvent.click(await screen.findByTitle('Gras'));

    await waitFor(() => expect(isHighlighted(screen.getByTitle('Gras'))).toBe(true));
    expect(isHighlighted(screen.getByTitle('Italique'))).toBe(false);
    expect(isHighlighted(screen.getByTitle('Liste à puces'))).toBe(false);
  });
});
