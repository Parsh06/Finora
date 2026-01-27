import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  createUserProfile,
  getUserProfile,
  UserProfile,
} from "@/lib/firestore";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // 🔑 Google login (redirect-based, works everywhere)
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // Use popup for a simpler, single-page flow
    await signInWithPopup(auth, provider);
    // Do not navigate here; onAuthStateChanged will handle routing
  };

  const logout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setUserProfile(null);
    navigate("/login", { replace: true });
  };

  // 🔑 SINGLE source of truth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentUser(null);
        setUserProfile(null);
        setLoading(false);
        return;
      }

      setCurrentUser(user);

      // ✅ Create or fetch Firestore profile
      let profile = await getUserProfile(user.uid);

      if (!profile) {
        await createUserProfile(user.uid, {
          name: user.displayName || "User",
          email: user.email || "",
          currency: "INR",
        });
        profile = await getUserProfile(user.uid);
      }

      setUserProfile(profile);
      setLoading(false);

      // ✅ Navigate ONLY after auth is fully restored
      // Use the main app shell (`Index`) which includes the BottomNav and tab logic
      navigate("/", { replace: true });
    });

    return () => unsubscribe();
  }, [navigate]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
