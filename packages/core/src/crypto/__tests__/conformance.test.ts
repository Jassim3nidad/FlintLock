import { describeCryptoProviderConformance } from '../../testing/cryptoProviderConformance';
import { createNodeCryptoProvider, unsafeKeyHandleBytesForTests } from '../../testing/nodeCryptoProvider';

// Reference run of the shared conformance suite against the Node-backed
// provider. apps/mobile and (later) apps/web run the identical suite
// against their own concrete CryptoProvider — see cryptoProviderConformance.ts.
describeCryptoProviderConformance('reference (Node)', createNodeCryptoProvider, unsafeKeyHandleBytesForTests);
