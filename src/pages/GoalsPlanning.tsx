import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, TrendingDown, ArrowLeft, ShieldCheck, Plus } from "lucide-react";
import { SavingsGoals } from "@/components/SavingsGoals";
import { DebtPlanner } from "@/components/DebtPlanner";
import { TaxTracker } from "@/components/TaxTracker";

interface GoalsPlanningProps {
  onBack?: () => void;
  defaultTab?: "savings" | "debt" | "tax";
}

export const GoalsPlanning = ({ onBack, defaultTab = "savings" }: GoalsPlanningProps) => {
  const [activeTab, setActiveTab] = useState<"savings" | "debt" | "tax">(defaultTab);
  
  // Refs to hold triggers for each tab
  const addSavingsTrigger = useRef<(() => void) | null>(null);
  const addDebtTrigger = useRef<(() => void) | null>(null);
  const addTaxTrigger = useRef<(() => void) | null>(null);

  const handleAddClick = () => {
    if (activeTab === "savings" && addSavingsTrigger.current) addSavingsTrigger.current();
    if (activeTab === "debt" && addDebtTrigger.current) addDebtTrigger.current();
    if (activeTab === "tax" && addTaxTrigger.current) addTaxTrigger.current();
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header with internal tabs */}
      <header className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {onBack && (
              <button 
                onClick={onBack}
                className="p-2 rounded-xl bg-secondary hover:bg-muted transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-foreground italic">Goals & Planning</h1>
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Strategize your future</p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAddClick}
            className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25"
          >
            <Plus className="w-6 h-6" />
          </motion.button>
        </div>

        <div className="flex p-1 bg-secondary/50 rounded-2xl border border-border/50">
          <button
            onClick={() => setActiveTab("savings")}
            className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === "savings" 
                ? "bg-card text-primary shadow-sm" 
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <Target className="w-4 h-4" /> Savings
          </button>
          <button
            onClick={() => setActiveTab("debt")}
            className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === "debt" 
                ? "bg-rose-500/10 text-rose-500 shadow-sm" 
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <TrendingDown className="w-4 h-4" /> Debt
          </button>
          <button
            onClick={() => setActiveTab("tax")}
            className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === "tax" 
                ? "bg-primary/10 text-primary shadow-sm" 
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Tax
          </button>
        </div>
      </header>

      <main className="px-5">
        <AnimatePresence mode="wait">
          {activeTab === "savings" ? (
            <motion.div
              key="savings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <SavingsGoals hideHeader={true} onAddTrigger={(cb) => { addSavingsTrigger.current = cb; }} />
            </motion.div>
          ) : activeTab === "debt" ? (
            <motion.div
              key="debt"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <DebtPlanner onAddTrigger={(cb) => { addDebtTrigger.current = cb; }} />
            </motion.div>
          ) : (
            <motion.div
              key="tax"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <TaxTracker onAddTrigger={(cb) => { addTaxTrigger.current = cb; }} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default GoalsPlanning;
