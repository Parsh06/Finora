import { motion } from "framer-motion";
import { 
  Scan, Mic, Target, Trophy, Users, 
  BarChart3, Wallet, Sparkles, Plus, 
  ChevronRight, ArrowRight
} from "lucide-react";
import { LucideIcon } from "lucide-react";

interface ActionItem {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  bgShadow: string;
  action: () => void;
}

interface QuickActionsGridProps {
  onNavigate?: (tab: string) => void;
  onScanBill?: () => void;
  onVoiceTransaction?: () => void;
  onAddTransaction?: () => void;
  variant?: "dashboard" | "drawer";
}

export const QuickActionsGrid = ({ 
  onNavigate, 
  onScanBill, 
  onVoiceTransaction,
  onAddTransaction,
  variant = "dashboard" 
}: QuickActionsGridProps) => {
  const actions: ActionItem[] = [
    {
      id: "scan",
      title: "Scan Bill",
      subtitle: "Auto-add",
      icon: Scan,
      color: "text-accent",
      bgShadow: "shadow-accent/20",
      action: () => onScanBill?.(),
    },
    {
      id: "voice",
      title: "Voice",
      subtitle: "Transaction",
      icon: Mic,
      color: "text-success",
      bgShadow: "shadow-success/20",
      action: () => onVoiceTransaction?.(),
    },
    {
      id: "budgets",
      title: "Budgets",
      subtitle: "Track goals",
      icon: Target,
      color: "text-primary",
      bgShadow: "shadow-primary/20",
      action: () => onNavigate?.("budgets"),
    },
    {
      id: "goals",
      title: "Goals",
      subtitle: "Debt & Savings",
      icon: Trophy,
      color: "text-warning",
      bgShadow: "shadow-warning/20",
      action: () => onNavigate?.("savings"),
    },
    {
      id: "split",
      title: "Split Bill",
      subtitle: "Trip Mode",
      icon: Users,
      color: "text-indigo-500",
      bgShadow: "shadow-indigo-500/20",
      action: () => onNavigate?.("split"),
    },
    {
      id: "stats",
      title: "Stats",
      subtitle: "Insights",
      icon: BarChart3,
      color: "text-rose-500",
      bgShadow: "shadow-rose-500/20",
      action: () => onNavigate?.("analytics"),
    },
    {
      id: "networth",
      title: "Net Worth",
      subtitle: "Live Assets",
      icon: Wallet,
      color: "text-indigo-400",
      bgShadow: "shadow-indigo-400/20",
      action: () => onNavigate?.("networth"),
    },
    {
      id: "forecast",
      title: "Forecast",
      subtitle: "Cash Flow",
      icon: Sparkles,
      color: "text-primary",
      bgShadow: "shadow-primary/20",
      action: () => onNavigate?.("cashflow"),
    },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className={`grid ${variant === "drawer" ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-3 sm:gap-4`}
    >
      {actions.map((action) => (
        <motion.button
          key={action.id}
          variants={item}
          whileHover={{ scale: 1.05, y: -4 }}
          whileTap={{ scale: 0.95 }}
          onClick={action.action}
          className="group relative glass-card p-4 sm:p-5 flex flex-col items-start gap-4 hover:bg-muted/30 transition-all duration-500 rounded-3xl border-white/10 active:shadow-inner"
        >
          {/* Glass Shimmer Effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden rounded-3xl">
            <motion.div 
              className="absolute inset-x-[-100%] inset-y-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg]"
              animate={{ translateX: ["0%", "200%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          </div>

          {/* Background Glow */}
          <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-br from-white/20 to-transparent pointer-events-none`} />
          
          <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-secondary/80 flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg ${action.bgShadow} border border-white/5`}>
            <action.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${action.color} drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]`} />
          </div>
          
          <div className="text-left w-full">
            <h4 className="font-black text-foreground text-sm flex items-center justify-between w-full tracking-tight">
              {action.title}
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-500 text-primary" />
            </h4>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1 opacity-70 group-hover:opacity-100 transition-opacity">
              {action.subtitle}
            </p>
          </div>
        </motion.button>
      ))}
    </motion.div>
  );
};
