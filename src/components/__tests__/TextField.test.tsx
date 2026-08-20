import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { TextField } from '../TextField';

jest.mock('../../preferences/native');

function withTheme(ui: React.ReactElement) {
  return <ThemeProvider>{ui}</ThemeProvider>;
}

describe('TextField', () => {
  it('renders the label and forwards text changes', async () => {
    const onChangeText = jest.fn();
    await render(withTheme(<TextField label="Title" testID="title" onChangeText={onChangeText} value="" />));
    expect(screen.getByText('Title')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('title'), 'Example');
    expect(onChangeText).toHaveBeenCalledWith('Example');
  });

  it('shows an error message when provided', async () => {
    await render(withTheme(<TextField label="Title" testID="title" value="" error="Title is required" />));
    expect(screen.getByText('Title is required')).toBeTruthy();
  });

  it('password fields mask text by default and reveal on toggle', async () => {
    await render(withTheme(<TextField label="Password" testID="pw" isPassword value="hunter2" />));
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByTestId('pw-toggle-reveal'));
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(false);
  });

  it('non-password fields never render a reveal toggle', async () => {
    await render(withTheme(<TextField label="Title" testID="title" value="" />));
    expect(screen.queryByTestId('title-toggle-reveal')).toBeNull();
  });
});
