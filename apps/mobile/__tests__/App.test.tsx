/**
 * @format
 */

jest.mock('../src/crypto/native');
jest.mock('../src/storage/native');
jest.mock('../src/biometric/native');
jest.mock('../src/preferences/native');
jest.mock('../src/clipboard/native');

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { configureNativeTestPlatform } from '../src/testUtils/configureNativePlatform';
import App from '../App';

test('renders correctly', async () => {
  configureNativeTestPlatform();
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
