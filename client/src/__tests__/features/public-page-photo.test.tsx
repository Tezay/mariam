import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoDialog } from '@/pages/admin/public-page/PhotoDialog';

beforeAll(() => {
  URL.createObjectURL = () => 'blob:preview';
  URL.revokeObjectURL = () => {};
});

function open(onSubmit = vi.fn(async () => {})) {
  render(<PhotoDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);
  return onSubmit;
}

const photo = () => new File(['x'], 'salle.jpg', { type: 'image/jpeg' });
const addButton = () => screen.getByRole('button', { name: 'Ajouter' }) as HTMLButtonElement;
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe('adding a photo', () => {
  it('sends nothing without a description', async () => {
    const onSubmit = open();

    await userEvent.upload(fileInput(), photo());

    expect(addButton().disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends nothing without a photo', async () => {
    open();

    await userEvent.type(screen.getByLabelText('Description'), 'La salle');

    expect(addButton().disabled).toBe(true);
  });

  it('sends the photo with its description, trimmed', async () => {
    const onSubmit = open();
    const file = photo();

    await userEvent.upload(fileInput(), file);
    await userEvent.type(screen.getByLabelText('Description'), '  La salle  ');
    await userEvent.click(addButton());

    expect(onSubmit).toHaveBeenCalledWith(file, 'La salle');
  });

  it('refuses a file the server would refuse, before sending it', async () => {
    open();

    await userEvent.upload(fileInput(), new File(['x'], 'notes.pdf', { type: 'application/pdf' }), {
      applyAccept: false,
    });

    expect(screen.getByText(/Format non pris en charge/)).toBeDefined();
  });
});
