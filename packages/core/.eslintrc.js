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
    ],
  },
};
