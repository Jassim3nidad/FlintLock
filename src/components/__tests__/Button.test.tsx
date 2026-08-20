import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { Button } from '../Button';

jest.mock('../../preferences/native');

function withTheme(ui: React.ReactElement) {
  return <ThemeProvider>{ui}</ThemeProvider>;
}

describe('Button', () => {
  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(withTheme(<Button label="Save" onPress={onPress} testID="save-btn" />));
    await fireEvent.press(screen.getByTestId('save-btn'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(withTheme(<Button label="Save" onPress={onPress} disabled testID="save-btn" />));
    await fireEvent.press(screen.getByTestId('save-btn'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not call onPress while loading', async () => {
    const onPress = jest.fn();
    await render(withTheme(<Button label="Save" onPress={onPress} loading testID="save-btn" />));
    await fireEvent.press(screen.getByTestId('save-btn'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('exposes an accessible button role', async () => {
    await render(withTheme(<Button label="Save" onPress={() => {}} testID="save-btn" />));
    expect(screen.getByRole('button')).toBeTruthy();
  });
});
