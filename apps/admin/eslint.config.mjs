import base from '@madart/config/eslint.base.mjs';
export default [...base, { ignores: ['.next/**', 'next-env.d.ts'] }];
