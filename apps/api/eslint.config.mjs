import base from '@madart/config/eslint.base.mjs';

export default [
  ...base,
  {
    // NestJS resolves constructor injection from emitted decorator metadata, which
    // needs value imports of the injected classes – `import type` would break DI.
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
];
