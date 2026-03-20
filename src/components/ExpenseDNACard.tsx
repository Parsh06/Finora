import React from "react";
import { motion } from "framer-motion";
import { 
  Zap, 
  Share2, 
  TrendingDown, 
  Calendar, 
  PieChart,
  Shield,
  Coffee,
  Moon,
  Tv,
  ShoppingBag,
  Sparkles
} from "lucide-react";
import { ExpenseDNA } from "../lib/firestore";
import { format } from "date-fns";
import confetti from "canvas-confetti";

interface ExpenseDNACardProps {
  dna: ExpenseDNA;
  onShare?: () => void;
}

const getArchetypeTheme = (archetype: string) => {
  switch (archetype) {
    case "weekend_splurger":
      return {
        bg: "from-orange-500/20 to-rose-500/20",
        border: "border-orange-500/30",
        icon: <Zap className="w-6 h-6 text-orange-400" />,
        accent: "text-orange-400"
      };
    case "night_owl":
      return {
        bg: "from-indigo-600/20 to-purple-600/20",
        border: "border-indigo-500/30",
        icon: <Moon className="w-6 h-6 text-indigo-400" />,
        accent: "text-indigo-400"
      };
    case "sub_hoarder":
      return {
        bg: "from-blue-500/20 to-cyan-500/20",
        border: "border-blue-500/30",
        icon: <Tv className="w-6 h-6 text-blue-400" />,
        accent: "text-blue-400"
      };
    case "food_first":
      return {
        bg: "from-yellow-500/20 to-orange-500/20",
        border: "border-yellow-500/30",
        icon: <Coffee className="w-6 h-6 text-yellow-400" />,
        accent: "text-yellow-400"
      };
    case "sip_warrior":
      return {
        bg: "from-emerald-500/20 to-teal-500/20",
        border: "border-emerald-500/30",
        icon: <Shield className="w-6 h-6 text-emerald-400" />,
        accent: "text-emerald-400"
      };
    case "impulse_buyer":
      return {
        bg: "from-pink-500/20 to-rose-500/20",
        border: "border-pink-500/30",
        icon: <ShoppingBag className="w-6 h-6 text-pink-400" />,
        accent: "text-pink-400"
      };
    default:
      return {
        bg: "from-slate-500/20 to-slate-700/20",
        border: "border-slate-500/30",
        icon: <Sparkles className="w-6 h-6 text-slate-400" />,
        accent: "text-slate-400"
      };
  }
};

const ExpenseDNACard: React.FC<ExpenseDNACardProps> = ({ dna, onShare }) => {
  const theme = getArchetypeTheme(dna.archetype);

  const handleShare = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    if (onShare) onShare();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-6 mb-6`}
    >
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <div className="text-8xl">{dna.emoji}</div>
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-xl bg-background/40 backdrop-blur-sm border ${theme.border}`}>
            {theme.icon}
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Monthly Spending DNA
            </span>
            <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
              {dna.title} {dna.emoji}
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {dna.traits.map((trait, i) => (
            <span 
              key={i}
              className="px-3 py-1 rounded-full bg-background/30 backdrop-blur-sm border border-border/50 text-xs font-medium text-foreground"
            >
              {trait}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="glass-card p-3 rounded-xl bg-background/20">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium uppercase">Peak Activity</span>
            </div>
            <p className="text-sm font-semibold">{dna.peakSpendDay}</p>
          </div>
          <div className="glass-card p-3 rounded-xl bg-background/20">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <PieChart className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium uppercase">Top Category</span>
            </div>
            <p className="text-sm font-semibold">{dna.topCategory}</p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
          <div className="relative glass-card p-4 rounded-xl bg-background/40 border border-border/50 mb-4">
            <p className="text-sm italic text-foreground leading-relaxed">
              "{dna.insight}"
            </p>
          </div>
        </div>

        <button
          onClick={handleShare}
          className="w-full py-2.5 rounded-xl bg-background/40 hover:bg-background/60 border border-border/50 flex items-center justify-center gap-2 text-sm font-medium transition-all group"
        >
          <Share2 className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          Share Your DNA
        </button>
      </div>
    </motion.div>
  );
};

export default ExpenseDNACard;
