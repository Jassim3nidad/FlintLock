let value = '';

export const Clipboard = {
  setString: async (content: string): Promise<void> => {
    value = content;
  },
  getString: async (): Promise<string> => value,
};
