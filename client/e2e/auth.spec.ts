import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { at, proxyApi } from './support';

const EMAIL = 'demo@mariam.app';
const PASSWORD = process.env.E2E_PASSWORD;
const DASHBOARD = /\/admin(\/calendar)?$/;

// The flow adds a passkey to the demo account: a second attempt would find it there.
test.describe.configure({ retries: 0 });

test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

// With it on, the authenticator answers the address field's request at once, unasked.
async function setPresence(cdp: CDPSession, authenticatorId: string, enabled: boolean) {
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled });
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'demo' }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test('a passkey enrolled after a password sign-in then signs in from the address field', async ({
  page,
}) => {
  test.skip(!PASSWORD, 'E2E_PASSWORD is the password given to flask seed-demo');
  await proxyApi(page);
  // The install page and the guided tour open on a first visit, and are not under test.
  await page.addInitScript(() => localStorage.setItem('mariam-pwa-install-done', '1'));
  await page.addLocatorHandler(
    page.getByRole('alertdialog').getByRole('button', { name: 'Fermer' }),
    (close) => close.click()
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });

  await test.step('a password sign-in enrols the passkey the account must have', async () => {
    await page.goto(at('demo', '/login'));
    await page.getByLabel('Adresse e-mail').fill(EMAIL);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD!);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/security$/);
    await page.getByRole('button', { name: /Empreinte digitale/ }).click();
    await page.getByRole('button', { name: 'Activer avec cet appareil' }).click();
    await expect(page).toHaveURL(DASHBOARD);
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    expect(credentials).toHaveLength(1);
    await setPresence(cdp, authenticatorId, false);
    await signOut(page);
  });

  await test.step('the passkey signs in from the address field', async () => {
    await setPresence(cdp, authenticatorId, true);
    await page.reload();
    await expect(page).toHaveURL(DASHBOARD);
  });

  await test.step('the dashboard is closed once signed out', async () => {
    await setPresence(cdp, authenticatorId, false);
    await signOut(page);
    await page.goto(at('demo', '/admin/calendar'));
    await expect(page).toHaveURL(/\/login$/);
  });
});
