jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');

import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { vaultStorage } from '../../storage/native';
import { generateTotp } from '../../totp/totp';
import { generateHotp } from '../../totp/hotp';
import { base32Decode } from '../../totp/base32';
import { renderUnlockedScreen, seedVault } from '../../testUtils/renderUnlockedScreen';
import { TotpCodeDisplay } from '../TotpCodeDisplay';
import { TotpEntry } from '../../storage/schema';

const SECRET = 'JBSWY3DPEHPK3PXP';

function makeTotpEntry(overrides: Partial<TotpEntry> = {}): TotpEntry {
  const now = Date.now();
  return {
    id: 'totp-1',
    recordType: 'totp',
    credentialId: null,
    issuer: 'Example',
    account: 'alice',
    secret: SECRET,
    algorithm: 'SHA1',
    digits: 6,
    mode: 'totp',
    period: 30,
    counter: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vaultStorage.clearAll();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('TotpCodeDisplay — totp', () => {
  it('shows the correct current code and countdown', async () => {
    const seed = await seedVault();
    const entry = makeTotpEntry();
    seed.putRecord(entry);
    seed.lock();

    function Wrapper() {
      return <TotpCodeDisplay entry={entry} onCopy={() => {}} />;
    }
    await renderUnlockedScreen(Wrapper, undefined, `totp-code-${entry.id}`);

    const expected = generateTotp(base32Decode(SECRET), { algorithm: 'SHA1', digits: 6, period: 30 });
    const displayed = screen.getByTestId(`totp-code-text-${entry.id}`).props.children.replace(/\s/g, '');
    expect(displayed).toBe(expected);
    expect(screen.getByTestId(`totp-countdown-${entry.id}`)).toBeTruthy();
  });

  it('calls onCopy with the raw (unformatted) code when tapped', async () => {
    const seed = await seedVault();
    const entry = makeTotpEntry();
    seed.putRecord(entry);
    seed.lock();

    const onCopy = jest.fn();
    function Wrapper() {
      return <TotpCodeDisplay entry={entry} onCopy={onCopy} />;
    }
    await renderUnlockedScreen(Wrapper, undefined, `totp-code-${entry.id}`);
    await fireEvent.press(screen.getByTestId(`totp-code-${entry.id}`));

    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy.mock.calls[0][0]).toMatch(/^\d{6}$/);
  });
});

describe('TotpCodeDisplay — hotp', () => {
  it('shows a placeholder until Generate is tapped, then the correct code for the current counter', async () => {
    const seed = await seedVault();
    const entry = makeTotpEntry({ mode: 'hotp', counter: 5, period: 30 });
    seed.putRecord(entry);
    seed.lock();

    function Wrapper() {
      return <TotpCodeDisplay entry={entry} onCopy={() => {}} />;
    }
    await renderUnlockedScreen(Wrapper, undefined, `totp-generate-${entry.id}`);

    expect(screen.getByTestId(`totp-code-${entry.id}`)).toHaveTextContent('------');

    await fireEvent.press(screen.getByTestId(`totp-generate-${entry.id}`));

    const expected = generateHotp(base32Decode(SECRET), 5, { algorithm: 'SHA1', digits: 6 });
    await waitFor(() => {
      const displayed = screen.getByTestId(`totp-code-text-${entry.id}`).props.children.replace(/\s/g, '');
      expect(displayed).toBe(expected);
    });
  });

  it('does not advance the counter just by rendering — only Generate does', async () => {
    const seed = await seedVault();
    const entry = makeTotpEntry({ mode: 'hotp', counter: 5, period: 30 });
    seed.putRecord(entry);

    function Wrapper() {
      return <TotpCodeDisplay entry={entry} onCopy={() => {}} />;
    }
    await renderUnlockedScreen(Wrapper, undefined, `totp-generate-${entry.id}`);
    jest.advanceTimersByTime(5000); // would advance a totp-style ticking code, should be a no-op for hotp

    expect(seed.getRecord(entry.id)).toMatchObject({ counter: 5 });
  });
});
