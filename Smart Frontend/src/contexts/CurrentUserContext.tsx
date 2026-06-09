import { createContext, useState, useEffect } from 'react';
import { api } from '../api/client';
import { clearStoredSession, clearStoredUser, hasStoredSession, readStoredUser, writeStoredUser, type SessionUser } from '../lib/session';
import { onInvalidate } from '../lib/invalidate';

export interface CurrentUser extends SessionUser {}

export interface CurrentUserContextValue {
  currentUser: CurrentUser | null;
  setCurrentUser: (user: CurrentUser | null) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const CurrentUserContext = createContext<CurrentUserContextValue>({
  currentUser: null,
  setCurrentUser: () => {},
});

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<CurrentUser | null>(() => (
    hasStoredSession() ? readStoredUser() : null
  ));

  function setCurrentUser(user: CurrentUser | null) {
    setCurrentUserState(user);

    if (user) {
      writeStoredUser(user);
      return;
    }

    clearStoredUser();
  }

  useEffect(() => {
    if (!hasStoredSession()) {
      clearStoredSession();
      setCurrentUserState(null);
      return;
    }

    let active = true;

    function loadUser() {
      api.get<{ user: CurrentUser }>('/auth/me')
        .then(res => {
          if (!active) return;
          setCurrentUserState(res.data.user);
          writeStoredUser(res.data.user);
        })
        .catch(err => {
          if (!active) return;
          if (err?.response?.status === 401) {
            clearStoredSession();
            setCurrentUserState(null);
            return;
          }

          setCurrentUserState(readStoredUser());
        });
    }

    loadUser();

    const unsub = onInvalidate(({ resource }) => {
      if (resource === 'users') {
        loadUser();
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  return (
    <CurrentUserContext.Provider value={{ currentUser, setCurrentUser }}>
      {children}
    </CurrentUserContext.Provider>
  );
}
