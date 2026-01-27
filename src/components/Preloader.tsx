import { motion } from "framer-motion";
import { FinoraLogo } from "./FinoraLogo";
import { TrendingUp, Sparkles } from "lucide-react";

interface PreloaderProps {
  message?: string;
  fullScreen?: boolean;
}

export const Preloader = ({ message = "Loading...", fullScreen = true }: PreloaderProps) => {
  return (
    <motion.div
      className={`${fullScreen ? "fixed inset-0" : "min-h-screen"} bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center z-50 overflow-hidden`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-primary/20"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Floating orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-32 h-32 sm:w-48 sm:h-48 rounded-full bg-primary/10 blur-3xl"
        animate={{
          x: [0, 50, 0],
          y: [0, 30, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-40 h-40 sm:w-56 sm:h-56 rounded-full bg-accent/10 blur-3xl"
        animate={{
          x: [0, -40, 0],
          y: [0, -20, 0],
          scale: [1, 1.3, 1],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="relative flex flex-col items-center justify-center gap-6 sm:gap-8 px-4 z-10">
        {/* Animated Logo Container */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            duration: 0.8,
          }}
          className="relative"
        >
          {/* Rotating ring around logo */}
          <motion.div
            className="absolute inset-0 -inset-4 sm:-inset-6"
            animate={{ rotate: 360 }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "linear",
            }}
          >
            <svg className="w-full h-full" viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="url(#ringGradient)"
                strokeWidth="2"
                strokeDasharray="10 5"
                opacity="0.3"
              />
              <defs>
                <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(165, 80%, 45%)" />
                  <stop offset="50%" stopColor="hsl(180, 70%, 35%)" />
                  <stop offset="100%" stopColor="hsl(165, 80%, 45%)" />
                </linearGradient>
              </defs>
            </svg>
          </motion.div>

          <FinoraLogo size={80} showText={false} />
          
          {/* Multi-layer glow effects */}
          <motion.div
            className="absolute inset-0 -inset-8 sm:-inset-12 rounded-full"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{
              background: "radial-gradient(circle, hsl(165, 80%, 45%) 0%, transparent 70%)",
              filter: "blur(25px)",
            }}
          />
          <motion.div
            className="absolute inset-0 -inset-4 sm:-inset-6 rounded-full"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.4, 0.6, 0.4],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5,
            }}
            style={{
              background: "radial-gradient(circle, hsl(180, 70%, 35%) 0%, transparent 60%)",
              filter: "blur(15px)",
            }}
          />
        </motion.div>

        {/* Brand Name with Sparkle Effect */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-center relative"
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <motion.h2
              className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent"
              animate={{
                backgroundPosition: ["0%", "100%", "0%"],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{
                backgroundSize: "200% 100%",
              }}
            >
              Finora
            </motion.h2>
            <motion.div
              animate={{
                rotate: [0, 360],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </motion.div>
          </div>
          <motion.p
            className="text-sm sm:text-base text-muted-foreground"
            animate={{
              opacity: [0.6, 1, 0.6],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {message}
          </motion.p>
        </motion.div>

        {/* Enhanced Progress Bar with Gradient */}
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: "100%" }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="w-full max-w-xs sm:max-w-sm"
        >
          <div className="relative h-2 sm:h-2.5 bg-secondary/50 rounded-full overflow-hidden backdrop-blur-sm">
            {/* Animated gradient bar */}
            <motion.div
              className="h-full rounded-full relative overflow-hidden"
              style={{
                background: "linear-gradient(90deg, hsl(165, 80%, 45%), hsl(180, 70%, 35%), hsl(165, 80%, 45%))",
                backgroundSize: "200% 100%",
              }}
              animate={{
                backgroundPosition: ["0%", "100%", "0%"],
                x: ["-100%", "100%"],
              }}
              transition={{
                backgroundPosition: {
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear",
                },
                x: {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
            />
            {/* Shine effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              animate={{
                x: ["-100%", "100%"],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </div>
        </motion.div>

        {/* Enhanced Loading Dots with Connection Lines */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex items-center gap-3 sm:gap-4"
        >
          {[0, 1, 2].map((index) => (
            <motion.div
              key={index}
              className="relative"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                delay: 0.7 + index * 0.1,
                type: "spring",
                stiffness: 200,
              }}
            >
              <motion.div
                className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg"
                animate={{
                  y: [0, -12, 0],
                  scale: [1, 1.2, 1],
                  boxShadow: [
                    "0 0 0px hsl(165, 80%, 45%)",
                    "0 0 15px hsl(165, 80%, 45%)",
                    "0 0 0px hsl(165, 80%, 45%)",
                  ],
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: index * 0.2,
                  ease: "easeInOut",
                }}
              />
              {/* Pulse ring */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-primary"
                animate={{
                  scale: [1, 2, 1],
                  opacity: [0.8, 0, 0.8],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: index * 0.2,
                  ease: "easeOut",
                }}
              />
            </motion.div>
          ))}
        </motion.div>

        {/* Financial Icons Animation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="flex items-center gap-4 sm:gap-6 mt-2"
        >
          <motion.div
            animate={{
              rotate: [0, 10, -10, 0],
              y: [0, -5, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary/60" />
          </motion.div>
          <motion.div
            animate={{
              rotate: [0, -10, 10, 0],
              y: [0, -5, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: 0.5,
              ease: "easeInOut",
            }}
          >
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-accent/60" />
          </motion.div>
        </motion.div>
      </div>

      {/* Animated grid pattern background */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
          }}
        />
      </div>
    </motion.div>
  );
};

export default Preloader;


