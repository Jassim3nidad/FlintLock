module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        // React's act() (from 'react-test-renderer' or
        // '@testing-library/react-native') needs its own returned promise
        // to *resolve*, even when the code under test is expected to
        // throw/reject -- act() uses that resolution to know it's safe to
        // flush pending effects and hand control back. Letting act()'s own
        // promise reject instead (via `expect(act(...)).rejects`,
        // `act(...).catch(...)`, or awaiting act() inside a try/catch that
        // expects the act() call itself to throw) leaves React's
        // test-renderer act() environment unable to flush whatever render
        // the *next* test attempts -- confirmed by a real, ~25%-of-full-
        // suite-runs flake in VaultSessionProvider.test.tsx (see that
        // file's own header comment), found by a reorder experiment after
        // two unrelated hypotheses each looked plausible and each turned
        // out not to be the cause. Catch the rejection *inside* the act()
        // callback instead, so act() itself always resolves -- see that
        // same test file's "a wrong password rejects and leaves the
        // session locked" for the corrected pattern.
        'no-restricted-syntax': [
          'error',
          {
            selector: 'MemberExpression[property.name="rejects"] CallExpression[callee.name="act"]',
            message:
              "Don't let act()'s own promise reject (expect(act(...)).rejects). Catch the rejection inside the act() callback instead -- letting act() itself reject can corrupt React's test-renderer state for whatever the *next* test tries to render. See VaultSessionProvider.test.tsx's header comment.",
          },
          {
            selector: 'CallExpression[callee.property.name="catch"][callee.object.callee.name="act"]',
            message:
              "Don't chain .catch() onto act(...) directly -- that still lets act()'s own promise settle as rejected. Catch inside the act() callback instead. See VaultSessionProvider.test.tsx's header comment.",
          },
          {
            selector: 'TryStatement AwaitExpression > CallExpression[callee.name="act"]',
            message:
              "Don't await act(...) inside a try/catch that expects act() itself to throw -- that still lets act()'s own promise reject. Catch inside the act() callback instead. See VaultSessionProvider.test.tsx's header comment.",
          },
        ],
      },
    },
  ],
};
