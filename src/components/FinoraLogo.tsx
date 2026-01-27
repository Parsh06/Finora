import { motion } from "framer-motion";

export const FinoraLogo = ({ size = 40, showText = true }: { size?: number; showText?: boolean }) => {
  return (
    <div className="flex items-center gap-3">
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", duration: 0.8 }}
        className="relative"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Gradients & shadow */}
          <defs>
            <linearGradient id="finoraOuter" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(165, 80%, 46%)" />
              <stop offset="50%" stopColor="hsl(180, 70%, 42%)" />
              <stop offset="100%" stopColor="hsl(250, 70%, 60%)" />
            </linearGradient>
            <linearGradient id="finoraInner" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(220, 20%, 14%)" />
              <stop offset="100%" stopColor="hsl(220, 20%, 6%)" />
            </linearGradient>
            <linearGradient id="finoraAccent" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(165, 80%, 65%)" />
              <stop offset="100%" stopColor="hsl(155, 85%, 50%)" />
            </linearGradient>
            <filter id="finoraShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="rgba(0,0,0,0.45)" />
            </filter>
          </defs>

          {/* Outer rounded shape */}
          <rect
            x="7"
            y="7"
            width="86"
            height="86"
            rx="28"
            fill="url(#finoraOuter)"
            filter="url(#finoraShadow)"
          />

          {/* Inner dark card */}
          <rect
            x="16"
            y="16"
            width="68"
            height="68"
            rx="22"
            fill="url(#finoraInner)"
          />

          {/* Stylized F with bar chart / growth */}
          <path
            d="M36 64V34.5C36 31.5 38 29.5 41 29.5H57C59.5 29.5 61.5 31.4 61.5 33.9C61.5 36.5 59.5 38.4 57 38.4H44.2V44.8H53.5C56 44.8 58 46.7 58 49.3C58 51.9 56 53.8 53.5 53.8H44.2V64C44.2 67 42.2 69 39.6 69C37 69 36 67.1 36 64Z"
            fill="url(#finoraAccent)"
          />

          {/* Rising bars on the right */}
          <motion.rect
            initial={{ height: 0, y: 68 }}
            animate={{ height: 10, y: 58 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            x="60"
            width="4.5"
            rx="2"
            fill="hsl(155, 85%, 60%)"
          />
          <motion.rect
            initial={{ height: 0, y: 68 }}
            animate={{ height: 16, y: 52 }}
            transition={{ delay: 0.45, duration: 0.45 }}
            x="66.5"
            width="4.5"
            rx="2"
            fill="hsl(155, 85%, 70%)"
          />
          <motion.rect
            initial={{ height: 0, y: 68 }}
            animate={{ height: 22, y: 46 }}
            transition={{ delay: 0.55, duration: 0.5 }}
            x="73"
            width="4.5"
            rx="2"
            fill="hsl(155, 90%, 78%)"
          />

          {/* Subtle top highlight */}
          <path
            d="M18 30C23 22 32 17 42 17H58C67 17 75 21 82 28"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </motion.div>
      
      {showText && (
        <motion.span
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-2xl font-semibold tracking-tight gradient-text"
        >
          Finora
        </motion.span>
      )}
    </div>
  );
};

export default FinoraLogo;
