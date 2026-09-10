import localFont from 'next/font/local';

// Same two weights as the RN apps (src/theme/index.js) — Proxima Nova only ships
// Regular and Bold, there is no medium/semibold to fall back on.
export const proxima = localFont({
  src: [
    { path: './ProximaNovaRegular.otf', weight: '400', style: 'normal' },
    { path: './ProximaNovaBold.otf', weight: '700', style: 'normal' },
  ],
  variable: '--font-proxima',
  display: 'swap',
});
