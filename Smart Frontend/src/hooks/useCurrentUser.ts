import { useContext } from 'react';
import { CurrentUserContext } from '../contexts/CurrentUserContext';
import type { CurrentUser } from '../contexts/CurrentUserContext';

export type { CurrentUser };

export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext).currentUser;
}

export function useSetCurrentUser(): (user: CurrentUser | null) => void {
  return useContext(CurrentUserContext).setCurrentUser;
}
