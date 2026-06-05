import { AuthProvider } from '@/lib/AuthContext';
import '@/styles/globals.css';

export const metadata = {
  title:       'LegacyLog | Kuppler Knowledge Base',
  description: 'Internal knowledge management platform for Kuppler',
};

export const viewport = {
  width:        'device-width',
  initialScale: 1,
  maximumScale: 1,   // prevents double-tap zoom on iOS
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
