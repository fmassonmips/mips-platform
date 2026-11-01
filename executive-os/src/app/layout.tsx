import './globals.css';
import type { Metadata } from 'next';
import { themeInitScript } from '@/components/shell/theme-toggle';

export const metadata: Metadata = { title: 'MIPS Executive OS', description: 'Financial intelligence, payment economics and executive decision platform' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body className="min-h-screen font-sans text-[14px]">{children}</body>
    </html>
  );
}
