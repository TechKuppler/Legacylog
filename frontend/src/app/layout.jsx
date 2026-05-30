import { AuthProvider } from '@/lib/AuthContext';
import '@/styles/globals.css';

export const metadata = {
  title:       'LegacyLog | Kuppler Knowledge Base',
  description: 'Internal knowledge management platform for Kuppler',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
