import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Traducător Română — EN · IT · EL · DE · FR',
  description: 'Traduceri profesionale din română în engleză, italiană, greacă, germană și franceză.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
