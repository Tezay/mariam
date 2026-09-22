import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Read once when the module loads, so the stub has to precede the import.
vi.stubGlobal('PublicKeyCredential', class {});
const { SecondFactorSetup } = await import('@/features/security/SecondFactorSetup');

const enrolment = {
  registerPasskey: vi.fn(async () => {}),
  beginTotp: vi.fn(async () => ({ qrCode: 'data:image/png;base64,zzz', secret: 'ABCD1234' })),
  confirmTotp: vi.fn(async () => {}),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('second-factor enrolment', () => {
  it('offers the passkey before the authenticator application', () => {
    render(<SecondFactorSetup enrolment={enrolment} />);

    const options = screen.getAllByRole('button');
    expect(options[0].textContent).toContain('Empreinte digitale');
    expect(options[1].textContent).toContain("Application d'authentification");
  });

  it('registers a passkey without asking for a device name', async () => {
    render(<SecondFactorSetup enrolment={enrolment} />);

    await userEvent.click(screen.getByText(/Empreinte digitale/));
    expect(screen.queryByLabelText(/nom de l'appareil/i)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Activer avec cet appareil/ }));
    await waitFor(() => expect(enrolment.registerPasskey).toHaveBeenCalledTimes(1));
  });

  it('reports a cancelled browser prompt without leaving the step', async () => {
    enrolment.registerPasskey.mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), { name: 'NotAllowedError' })
    );
    render(<SecondFactorSetup enrolment={enrolment} />);

    await userEvent.click(screen.getByText(/Empreinte digitale/));
    await userEvent.click(screen.getByRole('button', { name: /Activer avec cet appareil/ }));

    expect(await screen.findByText(/Enregistrement annulé/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Activer avec cet appareil/ })).toBeTruthy();
  });

  it('asks for the QR code once, then verifies the code', async () => {
    render(<SecondFactorSetup enrolment={enrolment} />);

    await userEvent.click(screen.getByText("Application d'authentification"));
    await waitFor(() => expect(screen.getByAltText('QR Code MFA')).toBeTruthy());
    expect(screen.getByText('ABCD1234')).toBeTruthy();

    await userEvent.click(screen.getByText(/Choisir une autre méthode/));
    await userEvent.click(screen.getByText("Application d'authentification"));
    expect(enrolment.beginTotp).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByLabelText('Code de vérification'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Activer' }));

    await waitFor(() => expect(enrolment.confirmTotp).toHaveBeenCalledWith('123456'));
  });
});
