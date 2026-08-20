export type MainStackParamList = {
  VaultList: undefined;
  CredentialDetail: { credentialId: string };
  /** No credentialId = create; with one = edit. */
  CredentialForm: { credentialId?: string };
  Settings: undefined;
};
