import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Shield, TrendingUp } from "lucide-react";
import { FinoraLogo } from "./FinoraLogo";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const AuthPages = () => {
  const { loginWithGoogle } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      await loginWithGoogle();
      // Redirect will happen — do NOT show success toast here
    } catch (err) {
      console.error("Google login failed:", err);
      toast.error("Google sign-in failed. Please try again.");
      setIsLoading(false);
    }
  };

  const features = [
    { icon: Sparkles, text: "AI-Powered Insights" },
    { icon: Shield, text: "Secure & Private" },
    { icon: TrendingUp, text: "Smart Budgeting" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <motion.div
        className="pt-10 pb-6 px-6 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex justify-center mb-4">
          <FinoraLogo size={48} />
        </div>
        <h1 className="text-2xl font-bold">Welcome to Finora</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Sign in to manage your finances smarter
        </p>
      </motion.div>

      <div className="flex justify-center gap-2 flex-wrap px-6 mb-6">
        {features.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20"
          >
            <f.icon className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-primary">
              {f.text}
            </span>
          </div>
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="glass-card p-8 rounded-3xl max-w-md w-full">
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-3 shadow border disabled:opacity-50 bg-white text-gray-900 hover:bg-gray-50 transition-colors"
          >
            {isLoading ? (
              <motion.div
                className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1 }}
              />
            ) : (
              <>
                {/* Simple Google "G" logo using SVG so it works everywhere */}
                <span className="flex items-center justify-center w-6 h-6 rounded-sm bg-white">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="w-5 h-5"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6 1.54 7.38 2.84l5.4-5.4C33.64 4.04 29.3 2 24 2 14.82 2 7.22 7.64 4.28 15.26l6.9 5.36C12.61 14.04 17.8 9.5 24 9.5z"
                    />
                    <path
                      fill="#34A853"
                      d="M46.5 24c0-1.36-.12-2.68-.34-3.96H24v7.52h12.7c-.55 2.96-2.2 5.48-4.7 7.18l7.27 5.64C43.86 36.44 46.5 30.68 46.5 24z"
                    />
                    <path
                      fill="#4A90E2"
                      d="M11.18 28.62A14.5 14.5 0 0 1 9.5 24c0-1.6.27-3.14.75-4.58l-6.9-5.36A21.92 21.92 0 0 0 2 24c0 3.6.86 7 2.38 10.02l6.8-5.4z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M24 46c5.76 0 10.6-1.9 14.13-5.18l-7.27-5.64C29.01 36.35 26.7 37 24 37c-6.2 0-11.39-4.54-12.92-10.88l-6.8 5.4C7.22 40.36 14.82 46 24 46z"
                    />
                  </svg>
                </span>
                <span className="text-sm sm:text-base">Continue with Google</span>
              </>
            )}
          </button>

          <p className="text-xs text-muted-foreground text-center mt-6">
            An account will be created automatically if you don’t have one
          </p>
        </div>
      </div>
    </div>
  );
};
