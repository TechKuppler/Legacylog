'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Record Audio is now a tab inside Capture Experience
export default function RecordRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/capture'); }, [router]);
  return null;
}
