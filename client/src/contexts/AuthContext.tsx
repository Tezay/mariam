/**
 * MARIAM - Contexte d'authentification
 *
 * Gère l'état d'authentification global (support MFA).
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, User } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ mfaRequired: boolean; mfaToken?: string; user?: User }>;
  verifyMfa: (mfaToken: string, code: string) => Promise<User>;
  loginWithPasskey: (challengeToken: string, credential: unknown) => Promise<User>;
  activateComplete: (user: User) => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Vérifier l'authentification au chargement
  useEffect(() => {
    const initAuth = async () => {
      if (authApi.isAuthenticated()) {
        try {
          const currentUser = await authApi.getCurrentUser();
          setUser(currentUser);
        } catch {
          authApi.logout();
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await authApi.login(email, password);

    if (result.mfaRequired) {
      return { mfaRequired: true, mfaToken: result.mfaToken };
    }

    setUser(result.user);
    // Returned as well as stored: the caller redirects on role before the
    // context state has propagated.
    return { mfaRequired: false, user: result.user };
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

  const activateComplete = (user: User) => {
    setUser(user);
  };

  const refreshUser = async () => {
    const currentUser = await authApi.getCurrentUser();
    setUser(currentUser);
  };

  const logout = () => {
    authApi.logout();
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
