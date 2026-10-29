import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '@/lib/api/auth';
import { dropStoredTokens, hasSession, onSessionEnd } from '@/lib/api/session';
import { userApi, type Account } from '@/lib/api/user';

interface AuthContextType {
  user: Account | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ user: Account } | { mfaToken: string }>;
  verifyMfa: (mfaToken: string, code: string) => Promise<Account>;
  loginWithPasskey: (challengeToken: string, credential: unknown) => Promise<Account>;
  activateComplete: (user: Account) => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    dropStoredTokens();
    const stop = onSessionEnd(() => setUser(null));
    const initAuth = async () => {
      if (hasSession()) {
        try {
          setUser(await userApi.get());
        } catch {
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
    return stop;
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    // Returned as well as stored: the caller redirects on the role before the next render.
    if ('user' in result) setUser(result.user);
    return result;
  };

  const verifyMfa = async (mfaToken: string, code: string) => {
    const loggedUser = await authApi.verifyMfa(mfaToken, code);
    setUser(loggedUser);
    return loggedUser;
  };

  const loginWithPasskey = async (challengeToken: string, credential: unknown) => {
    const loggedUser = await authApi.passkeyLoginComplete(challengeToken, credential);
    setUser(loggedUser);
    return loggedUser;
  };

  const activateComplete = (user: Account) => {
    setUser(user);
  };

  const refreshUser = async () => {
    const currentUser = await userApi.get();
    setUser(currentUser);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    verifyMfa,
    loginWithPasskey,
    activateComplete,
    refreshUser,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
