import { createContext, useContext } from 'react';

type ShowToast = (message: string) => void;

export const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
