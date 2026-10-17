import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, DEFAULT_PREFERENCES, errorMessage, mergePreferences, type Preferences } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../components/Toast';

interface PreferencesContextValue {
  preferences: Preferences;
  /** True once the account's settings have arrived. */
  loaded: boolean;
  /** Changes settings straight away and saves them to the account. */
  update: (patch: Partial<Preferences> | ((current: Preferences) => Partial<Preferences>)) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/** Settings saved with the account, such as custom colours and the spelling dictionary. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const current = useRef(preferences);
  current.current = preferences;
  const userId = user?.id;

  useEffect(() => {
    setPreferences(DEFAULT_PREFERENCES);
    setLoaded(false);
    if (!userId) return;
    let live = true;
    api
      .getPreferences()
      .then((p) => live && setPreferences(p))
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [userId]);

  const update = useCallback<PreferencesContextValue['update']>(
    (change) => {
      const patch = typeof change === 'function' ? change(current.current) : change;
      const next = mergePreferences(current.current, patch);
      current.current = next;
      setPreferences(next);
      api
        .updatePreferences(patch)
        .then((saved) => {
          // Keep anything changed since this request left.
          setPreferences((now) => (now === next ? saved : now));
        })
        .catch((e) => toast(`Your settings were not saved. ${errorMessage(e)}`, { tone: 'error' }));
    },
    [toast],
  );

  const value = useMemo(() => ({ preferences, loaded, update }), [preferences, loaded, update]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences needs a PreferencesProvider');
  return value;
}
