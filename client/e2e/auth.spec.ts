import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { at, proxyApi } from './support';

const EMAIL = 'demo@mariam.app';
const PASSWORD = process.env.E2E_PASSWORD;
const DASHBOARD = /\/admin(\/calendar)?$/;

// The flow adds passkeys to the demo account: a second attempt would find them there.
test.describe.configure({ retries: 0 });

test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }));

async function addAuthenticator(cdp: CDPSession, transport: 'usb' | 'internal') {
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport,
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  return authenticatorId;
}

// With it on, an authenticator also answers the address field's request at once, unasked.
async function setPresence(cdp: CDPSession, authenticatorId: string, enabled: boolean) {
  await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled });
}

async function credentialsOf(cdp: CDPSession, authenticatorId: string) {
  return (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials.length;
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'demo' }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test('a passkey made on the phone signs a computer in, which then gets its own', async ({
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
  const phone = await addAuthenticator(cdp, 'usb');

  await test.step('the phone gets a passkey after a password sign-in', async () => {
    await page.goto(at('demo', '/login'));
    await page.getByLabel('Adresse e-mail').fill(EMAIL);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD!);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/security$/);
    await page.getByRole('button', { name: /Empreinte digitale/ }).click();
    await page.getByRole('button', { name: 'Activer avec cet appareil' }).click();
    await expect(page).toHaveURL(DASHBOARD);
    expect(await credentialsOf(cdp, phone)).toBe(1);
    await signOut(page);
  });

  const computer = await addAuthenticator(cdp, 'internal');

  await test.step("the phone's passkey signs the computer in, which is offered its own", async () => {
    await setPresence(cdp, computer, false);
    await page.getByRole('button', { name: 'Se connecter avec cet appareil' }).click();
    await expect(page.getByText('Connexion réussie')).toBeVisible();

    await setPresence(cdp, computer, true);
    await page.getByRole('button', { name: 'Créer une passkey' }).click();
    await expect(page.getByText('Passkey créée')).toBeVisible();
    expect(await credentialsOf(cdp, computer)).toBe(1);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page).toHaveURL(DASHBOARD);
    await setPresence(cdp, computer, false);
    await signOut(page);
  });

  await test.step("the computer's own passkey signs it in from the address field, unoffered", async () => {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: phone });
    await setPresence(cdp, computer, true);
    await page.reload();
    await expect(page).toHaveURL(DASHBOARD);
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: computer });
    await signOut(page);
  });

  await test.step('the dashboard is closed once signed out', async () => {
    await page.goto(at('demo', '/admin/calendar'));
    await expect(page).toHaveURL(/\/login$/);
  });
});
