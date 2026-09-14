import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Vendored components (installed via shadcn). They're written for the React
    // Compiler and trip a few compiler rules; keep them as-is.
    //   - beUI motion components
    //   - evilcharts ECharts components, which hold the chart instance in a ref
    //     and mutate it from effects and chart callbacks — the rule reports
    //     that as render-time ref access, but every site is effect-scoped.
    files: [
      'src/components/motion/combobox/**',
      'src/components/motion/animated-toast-stack.tsx',
      'src/components/evilcharts/**',
    ],
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    'eslint.config.mjs',
    'playwright.config.ts',
  ]),
]);
