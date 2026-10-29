import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'DAF Logistics — مصر · مركز القيادة', description: 'مركز العمليات اللوجستية — مهام وطلبات ومخزون وتنفيذ', robots: { index: false, follow: false }, referrer: 'no-referrer', icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' } };
export default function RootLayout({ children }: {
    children: React.ReactNode;
}) { return <html lang="ar" dir="rtl"><body>{children}</body></html>; }
