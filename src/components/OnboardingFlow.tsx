import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { FinoraLogo } from "./FinoraLogo";
import { ChevronRight, TrendingUp, Sparkles, Scan } from "lucide-react";

interface OnboardingProps {
  onComplete: () => void;
}

const slides = [
  {
    icon: TrendingUp,
    title: "Track every rupee effortlessly",
    description: "Automatically categorize and track all your expenses and income in one place."
  },
  {
    icon: Sparkles,
    title: "AI-powered spending insights",
    description: "Get personalized recommendations to save more and spend smarter."
  },
  {
    icon: Scan,
    title: "Scan bills in one tap",
    description: "Use OCR to instantly capture and log expenses from receipts."
  }
];

export const OnboardingFlow = ({ onComplete }: OnboardingProps) => {
  const [currentSlide, setCurrentSlide] = useState(-1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      setCurrentSlide(0);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const skipOnboarding = (e?: React.MouseEvent) => {
    // Prevent any default behavior
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Mark onboarding as complete immediately
    try {
      localStorage.setItem("finora-onboarding-complete", "true");
    } catch (error) {
      console.warn("Failed to save onboarding completion:", error);
    }
    
    // Call the completion handler immediately
    // This will trigger the parent component to hide onboarding and show auth pages
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.2, 0.1]
          }}
          transition={{ duration: 8, repeat: Infinity }}
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(165, 80%, 45%) 0%, transparent 70%)" }}
        />
        <motion.div
          animate={{ 
            scale: [1.2, 1, 1.2],
            opacity: [0.1, 0.15, 0.1]
          }}
          transition={{ duration: 10, repeat: Infinity }}
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(250, 70%, 60%) 0%, transparent 70%)" }}
        />
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-8"
          >
            <FinoraLogo size={80} />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 120 }}
              transition={{ duration: 2, ease: "easeInOut" }}
              className="h-1 rounded-full bg-primary"
            />
          </motion.div>
        ) : (
          <motion.div
            key="slides"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-md px-4 sm:px-6 flex flex-col items-center relative z-10"
          >
            <div className="mb-6 sm:mb-8">
              <div className="sm:w-12 sm:h-12 flex items-center justify-center">
                <FinoraLogo size={40} />
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="text-center mb-8 sm:mb-12"
              >
                {slides[currentSlide] && (
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", delay: 0.2 }}
                      className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 rounded-2xl glass-card flex items-center justify-center"
                    >
                      {(() => {
                        const Icon = slides[currentSlide].icon;
                        return <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />;
                      })()}
                    </motion.div>
                    <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2 sm:mb-3 px-2">
                      {slides[currentSlide].title}
                    </h2>
                    <p className="text-muted-foreground text-sm sm:text-base leading-relaxed px-2">
                      {slides[currentSlide].description}
                    </p>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Dots indicator */}
            <div className="flex gap-2 mb-6 sm:mb-8">
              {slides.map((_, index) => (
                <motion.div
                  key={index}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide ? "w-6 sm:w-8 bg-primary" : "w-2 bg-muted"
                  }`}
                />
              ))}
            </div>

            {/* Action buttons */}
            <div className="w-full space-y-2 sm:space-y-3 relative z-20">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={nextSlide}
                className="w-full py-3 sm:py-4 rounded-2xl font-semibold text-primary-foreground flex items-center justify-center gap-2 glow-effect text-sm sm:text-base relative z-10"
                style={{ background: "var(--gradient-primary)" }}
              >
                {currentSlide === slides.length - 1 ? "Get Started" : "Continue"}
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </motion.button>

              {currentSlide < slides.length - 1 && (
                <motion.button
                  whileHover={{ opacity: 0.8 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    skipOnboarding(e);
                  }}
                  type="button"
                  className="w-full py-2 sm:py-3 text-muted-foreground hover:text-foreground transition-colors text-sm sm:text-base cursor-pointer relative z-10 pointer-events-auto touch-manipulation"
                  style={{ cursor: 'pointer' }}
                  aria-label="Skip onboarding"
                >
                  Skip
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OnboardingFlow;
