jest.mock('../../crypto/native');
jest.mock('../../preferences/native');

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { WebBridgePairingScreen } from '../WebBridgePairingScreen';

const Stack = createNativeStackNavigator();

async function renderScreen(): Promise<void> {
  await render(
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="WebBridge" component={WebBridgePairingScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
  await waitFor(() => {
    expect(screen.getByTestId('local-ip-input')).toBeTruthy();
  });
}

describe('WebBridgePairingScreen', () => {
  it('keeps the generate button disabled until an IP is entered', async () => {
    await renderScreen();
    expect(screen.getByTestId('generate-pairing-button').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('local-ip-input'), '192.168.1.42');
    expect(screen.getByTestId('generate-pairing-button').props.accessibilityState.disabled).toBe(false);
  });

  it('generates a manual pairing code and QR payload text once an IP is provided', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId('local-ip-input'), '192.168.1.42');
    await fireEvent.press(screen.getByTestId('generate-pairing-button'));

    await waitFor(() => {
      expect(screen.getByTestId('manual-pairing-code')).toBeTruthy();
    });
    const code = screen.getByTestId('manual-pairing-code').props.children as string;
    expect(code).toMatch(/^([A-Z2-7]{4}-)+[A-Z2-7]{4}$/);

    const qrText = screen.getByTestId('qr-payload-text').props.children as string;
    expect(qrText).toContain('flintlock-bridge://192.168.1.42:8443/');

    expect(screen.getByTestId('pairing-expiry')).toBeTruthy();
  });

  it('ends the session when Cancel is pressed', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('cancel-pairing-button'));

    await waitFor(() => {
      expect(screen.getByTestId('pairing-ended')).toHaveTextContent(/cancelled/i);
    });
  });
});
