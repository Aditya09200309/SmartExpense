import { useEffect } from 'react';

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} — Smart Expense` : 'Smart Expense';
    return () => { document.title = 'Smart Expense'; };
  }, [title]);
}
