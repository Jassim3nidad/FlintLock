export type MainStackParamList = {
  VaultList: undefined;
  CredentialDetail: { credentialId: string };
  /** No credentialId = create; with one = edit. */
  CredentialForm: { credentialId?: string };
  /** Attaches to a credential when provided; standalone otherwise. */
  AddTotp: { credentialId?: string };
  Settings: undefined;
  TagManagement: undefined;
  SecurityDashboard: undefined;
};
