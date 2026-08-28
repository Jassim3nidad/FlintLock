module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { es2022: true, node: true },
  ignorePatterns: ['node_modules/'],
  rules: {
    // `.buffer` on a typed array/Buffer can expose a wider, pooled
    // ArrayBuffer than the view itself covers — handing that to
    // crypto.subtle (or anything else that reads a raw ArrayBuffer
    // without respecting byteOffset/byteLength) is a memory-disclosure
    // bug, not a style nit. Use Buffer.from(view) or pass the typed
    // array itself (BufferSource-aware APIs honor byteOffset/length)
    // instead of ever reaching for `.buffer` in this package.
    'no-restricted-syntax': [
      'error',
      {
        selector: "MemberExpression[property.name='buffer'][computed=false]",
        message:
          'Do not access `.buffer` in packages/core — it can expose a wider shared ArrayBuffer than the view itself covers. Use Buffer.from(view) (copies, always safe) instead.',
      },
      {
        selector: "CallExpression[callee.property.name='unsafeDekForTests']",
        message:
          "VaultStore.unsafeDekForTests() exists only so a test can capture a DEK handle before lock() and assert its bytes are zeroed after — production code never needs the DEK itself, only what it can decrypt through getRecord/putRecord. Its name is a convention, not a boundary the compiler enforces; this rule is the actual boundary. Only call it from a *.test.ts/*.test.tsx file.",
      },
    ],
  },
  overrides: [
    {
      // The one sanctioned caller of unsafeDekForTests(): a test that
      // needs to assert a DEK was actually zeroed, not just that its
      // reference became unreachable (see VaultStore.unsafeDekForTests()'s
      // own doc comment, and F4 in docs/AUDIT-2026-08-25.md for the
      // regression this exists to catch). The .buffer ban still applies
      // here — that hazard doesn't become safe just because it's a test.
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "MemberExpression[property.name='buffer'][computed=false]",
            message:
              'Do not access `.buffer` in packages/core — it can expose a wider shared ArrayBuffer than the view itself covers. Use Buffer.from(view) (copies, always safe) instead.',
          },
        ],
      },
    },
  ],
};
