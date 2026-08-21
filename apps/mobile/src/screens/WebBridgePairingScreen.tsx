import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useTheme } from '../theme/ThemeProvider';
import { Buffer } from '../crypto';
import { BridgeSession, BridgeSessionState } from '../webbridge/bridgeSession';
import { encodeQrPayload, formatSecretForManualEntry, QrPayload } from '../webbridge/pairing';

const DEFAULT_PORT = 8443;

const TERMINAL_STATES: BridgeSessionState[] = ['completed', 'expired', 'cancelled'];

export function WebBridgePairingScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const sessionRef = useRef<BridgeSession | null>(null);
  if (!sessionRef.current) sessionRef.current = BridgeSession.create();
  const session = sessionRef.current;

  const [localIp, setLocalIp] = useState('');
  const [payload, setPayload] = useState<QrPayload | null>(null);
  const [sessionState, setSessionState] = useState<BridgeSessionState>(session.getState());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const unsubscribe = session.onTeardown(() => setSessionState(session.getState()));
    return () => {
      unsubscribe();
      if (!TERMINAL_STATES.includes(session.getState())) {
        session.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const secondsRemaining = Math.max(0, Math.round((session.expiresAt - now) / 1000));
  const isTerminal = TERMINAL_STATES.includes(sessionState);

  const handleGenerate = (): void => {
    const trimmedIp = localIp.trim();
    if (!trimmedIp) return;
    setPayload(session.qrPayload(trimmedIp, DEFAULT_PORT));
  };

  const handleCancel = (): void => {
    session.cancel();
    navigation.goBack();
  };

  const manualCode = payload ? formatSecretForManualEntry(Buffer.from(payload.secret, 'base64')) : null;
  const qrText = payload ? encodeQrPayload(payload) : null;

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        Transfer to desktop
      </Text>
      <Text style={[styles.intro, { color: theme.colors.textSecondary }]}>
        Web Bridge's local network listener isn't implemented yet — generating a code here previews the pairing
        cryptography and UI, but a desktop browser can't actually connect until that piece lands.
      </Text>

      {isTerminal ? (
        <Text testID="pairing-ended" style={{ color: theme.colors.textSecondary }}>
          This pairing session has ended ({sessionState}).
        </Text>
      ) : !payload ? (
        <>
          <TextField
            label="This device's local IP address"
            testID="local-ip-input"
            value={localIp}
            onChangeText={setLocalIp}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            label="Generate pairing code"
            onPress={handleGenerate}
            disabled={localIp.trim().length === 0}
            testID="generate-pairing-button"
          />
        </>
      ) : (
        <>
          <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Manual entry code</Text>
          <Text testID="manual-pairing-code" style={[styles.code, { color: theme.colors.textPrimary, backgroundColor: theme.colors.surface }]}>
            {manualCode}
          </Text>

          <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>QR payload (rendering not yet wired up)</Text>
          <Text testID="qr-payload-text" style={[styles.code, { color: theme.colors.textPrimary, backgroundColor: theme.colors.surface }]}>
            {qrText}
          </Text>

          <Text testID="pairing-expiry" style={[styles.expiry, { color: theme.colors.textMuted }]}>
            Expires in {secondsRemaining}s
          </Text>
        </>
      )}

      <View style={styles.spacer} />
      <Button label="Cancel" onPress={handleCancel} variant="secondary" testID="cancel-pairing-button" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 8 },
  intro: { marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  code: { fontFamily: 'monospace', padding: 12, marginBottom: 16, fontSize: 14 },
  expiry: { marginBottom: 16 },
  spacer: { height: 12 },
});
