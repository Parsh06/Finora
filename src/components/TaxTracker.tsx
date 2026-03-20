import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShieldCheck, 
  TrendingUp, 
  Clock, 
  AlertCircle, 
  Info, 
  ChevronRight, 
  Sparkles,
  ArrowUpRight,
  HeartPulse,
  Home,
  Plus,
  X
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, Timestamp } from "firebase/firestore";
import { Transaction, RecurringPayment, Asset } from "@/lib/firestore";
import { calculateTaxProgress, TaxProgress, getDaysToDeadline, getTaxAdvice } from "@/lib/tax-service";
import { toast } from "sonner";

export const TaxTracker: React.FC<{ onAddTrigger?: (callback: () => void) => void }> = ({ onAddTrigger }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Form state
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [section, setSection] = useState<"80C" | "80D" | "NPS" | "HRA">("80C");
  const [progress, setProgress] = useState<TaxProgress | null>(null);
  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const daysLeft = getDaysToDeadline();

  useEffect(() => {
    if (!currentUser) return;

    // Fetch all necessary data to calculate tax progress
    const transactionsQuery = query(collection(db, `users/${currentUser.uid}/transactions`));
    const recurringQuery = query(collection(db, `users/${currentUser.uid}/recurringPayments`));
    const assetsQuery = query(collection(db, `users/${currentUser.uid}/assets`));

    let transactions: Transaction[] = [];
    let recurring: RecurringPayment[] = [];
    let assets: Asset[] = [];

    const unsubscribeT = onSnapshot(transactionsQuery, (snapshot) => {
      transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      updateProgress();
    });

    const unsubscribeR = onSnapshot(recurringQuery, (snapshot) => {
      recurring = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecurringPayment));
      updateProgress();
    });

    const unsubscribeA = onSnapshot(assetsQuery, (snapshot) => {
      assets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
      updateProgress();
    });

    const updateProgress = () => {
      const p = calculateTaxProgress(transactions, recurring, assets);
      setProgress(p);
      setLoading(false);
    };

    return () => {
      unsubscribeT();
      unsubscribeR();
      unsubscribeA();
    };
  }, [currentUser]);

  useEffect(() => {
    if (onAddTrigger) {
      onAddTrigger(() => {
        setName("");
        setAmount("");
        setShowAddModal(true);
      });
    }
  }, [onAddTrigger]);

  const handleCreateManualTax = async () => {
    if (!currentUser) return;
    try {
      // Manual tax entries are stored as transactions with a specific tag
      // or we can use a dedicated collection. User requested:
      // "Manual entry Health insurance premium transactions"
      await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
        userId: currentUser.uid,
        title: name,
        amount: Number(amount),
        type: "expense",
        category: "Tax Saving",
        date: Timestamp.now(),
        note: `Tax Deduction: ${section}`,
        createdAt: Timestamp.now()
      });
      toast.success("Tax deduction logged!");
      setShowAddModal(false);
    } catch (error) {
      toast.error("Failed to log tax deduction");
    }
  };

  useEffect(() => {
    if (progress && !aiAdvice && !loadingAdvice) {
      generateAdvice();
    }
  }, [progress]);

  const generateAdvice = async () => {
    if (!progress) return;
    setLoadingAdvice(true);
    try {
      const advice = await getTaxAdvice(progress);
      setAiAdvice(advice);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingAdvice(false);
    }
  };

  if (loading || !progress) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const sections = [
    {
      id: "80c",
      title: "Section 80C",
      subtitle: "ELSS, PPF, LIC, EPF",
      limit: progress.section80C.limit,
      filled: progress.section80C.filled,
      icon: <ShieldCheck className="w-5 h-5 text-primary" />,
      color: "from-primary/20 to-primary/10",
      accent: "bg-primary",
      sources: progress.section80C.sources
    },
    {
      id: "nps",
      title: "Section 80CCD (NPS)",
      subtitle: "National Pension Scheme",
      limit: progress.sectionNPS.limit,
      filled: progress.sectionNPS.filled,
      icon: <TrendingUp className="w-5 h-5 text-accent" />,
      color: "from-accent/20 to-accent/10",
      accent: "bg-accent",
      sources: progress.sectionNPS.sources
    },
    {
      id: "80d",
      title: "Section 80D",
      subtitle: "Health Insurance Premiums",
      limit: progress.section80D.limit,
      filled: progress.section80D.filled,
      icon: <HeartPulse className="w-5 h-5 text-success" />,
      color: "from-success/20 to-success/10",
      accent: "bg-success",
      sources: progress.section80D.sources
    },
    {
      id: "hra",
      title: "House Rent Allowance",
      subtitle: "Based on rent transactions",
      limit: 0, // Dynamic
      filled: progress.hra.rentPaid,
      icon: <Home className="w-5 h-5 text-orange-500" />,
      color: "from-orange-500/20 to-orange-500/10",
      accent: "bg-orange-500",
      sources: progress.hra.sources,
      isNoLimit: true
    }
  ];

  const totalFilled = sections.reduce((sum, s) => sum + s.filled, 0);

  if (totalFilled === 0) {
    return (
      <div className="space-y-6">
        <div className="glass-card p-10 rounded-[2rem] border-dashed border-2 border-border/50 text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShieldCheck className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-2 italic">Optimize Your Tax</h3>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto mb-8">
                Log your 80C, 80D, or NPS investments to see your tax-saving progress in real time.
            </p>
            <button
                onClick={() => {
                    setName("");
                    setAmount("");
                    setShowAddModal(true);
                }}
                className="bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-bold flex items-center gap-3 mx-auto hover:opacity-90 transition-all shadow-xl shadow-primary/25"
            >
                <Plus className="w-6 h-6" /> Log First Deduction
            </button>
        </div>
        
        {/* Still show advisor even if empty */}
        <div className="glass-card p-6 rounded-2xl border-primary/20 bg-gradient-to-br from-primary/5 to-transparent relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
            <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                Finora AI Tax Advisor
                </h3>
                <p className="text-sm text-foreground/90 leading-relaxed italic mt-2">
                "Ready to save some tax? Start by logging any insurance premiums or ELSS investments you've made this year."
                </p>
            </div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="glass-card p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <ShieldCheck className="w-24 h-24 text-primary rotate-12" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              Tax Harvest FY 2024-25
              <span className="px-2 py-0.5 rounded text-[10px] bg-primary/20 text-primary font-bold uppercase tracking-wider">India</span>
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Tracking your progress toward maximum tax deductions.
            </p>
          </div>
          
          <div className="flex items-center gap-4 bg-muted/30 p-3 rounded-xl border border-border/50">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Deadline</p>
                <p className="text-sm font-semibold text-foreground">March 31, 2025</p>
              </div>
            </div>
            <div className="h-8 w-px bg-border/50"></div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Time Remaining</p>
              <p className={`text-sm font-bold ${daysLeft < 30 ? "text-destructive" : "text-primary"}`}>
                {daysLeft} Days
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Buckets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((section) => {
          const percentage = section.isNoLimit ? 100 : Math.min(100, (section.filled / section.limit) * 100);
          const remaining = section.isNoLimit ? 0 : Math.max(0, section.limit - section.filled);
          
          return (
            <motion.div 
              key={section.id}
              className="glass-card p-5 rounded-2xl border-border/40 hover:border-primary/30 transition-all group"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${section.color} flex items-center justify-center`}>
                    {section.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{section.title}</h3>
                    <p className="text-[10px] text-muted-foreground">{section.subtitle}</p>
                  </div>
                </div>
                {!section.isNoLimit && (
                  <div className="text-right">
                    <p className="text-xs font-medium text-muted-foreground">Utilized</p>
                    <p className="text-sm font-bold text-foreground">{Math.round(percentage)}%</p>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {!section.isNoLimit && (
                <div className="space-y-2 mb-4">
                  <div className="h-2 w-full bg-muted/40 rounded-full overflow-hidden border border-border/10">
                    <motion.div 
                      className={`h-full ${section.accent}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-muted-foreground font-medium">₹{section.filled.toLocaleString()} filled</span>
                    <span className="text-primary font-bold tracking-tight">Limit ₹{section.limit.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {section.isNoLimit && (
                <div className="bg-muted/30 p-3 rounded-xl mb-4 border border-border/30">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Total Rent Detected</span>
                    <span className="text-sm font-bold text-foreground">₹{section.filled.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Action/Insight */}
              {!section.isNoLimit && remaining > 0 ? (
                <div className="flex items-center justify-between text-[11px] p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-primary">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Invest ₹{remaining.toLocaleString()} more to save tax</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              ) : !section.isNoLimit && (
                <div className="flex items-center gap-2 text-[11px] p-2.5 rounded-lg bg-success/10 border border-success/20 text-success">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Limit fully utilized! You're maximized here.</span>
                </div>
              )}

              {/* Sources Dropdown (Simplified) */}
              {section.sources.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-2">Sources</p>
                  <div className="space-y-1.5">
                    {section.sources.slice(0, 3).map((source, i) => (
                      <div key={i} className="flex justify-between items-center text-[10px]">
                        <span className="text-foreground/80">{source.name}</span>
                        <span className="font-medium">₹{source.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    {section.sources.length > 3 && (
                      <p className="text-[9px] text-muted-foreground italic">+{section.sources.length - 3} more sources</p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* AI Tax Advisor */}
      <div className="glass-card p-6 rounded-2xl border-primary/20 bg-gradient-to-br from-primary/5 to-transparent relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
              Finora AI Tax Advisor
            </h3>
            <div className="mt-2 space-y-3">
              {loadingAdvice ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                  Thinking...
                </div>
              ) : (
                <p className="text-sm text-foreground/90 leading-relaxed italic">
                  "{aiAdvice || "Based on your current investments, we are calculating the best tax strategy for you..."}"
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => generateAdvice()}
                  disabled={loadingAdvice}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {aiAdvice ? "Refresh AI Insights" : "Generate AI Insights"}
                </button>
                <button className="px-3 py-1.5 rounded-lg bg-muted/50 text-foreground text-xs font-medium hover:bg-muted transition-all border border-border/50">
                  Download Guide
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Deduction Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  Log Tax Deduction
                </h2>
                <button onClick={() => setShowAddModal(false)}><X className="w-6 h-6" /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Description</label>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full bg-muted/30 border border-border/50 p-3 rounded-xl outline-none" 
                    placeholder="Health Insurance, PPF Deposit..." 
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Amount (₹)</label>
                  <input 
                    type="number" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    className="w-full bg-muted/30 border border-border/50 p-3 rounded-xl outline-none" 
                    placeholder="15000" 
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Deduction Section</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["80C", "80D", "NPS", "HRA"].map(sec => (
                      <button
                        key={sec}
                        onClick={() => setSection(sec as any)}
                        className={`py-3 rounded-xl text-sm font-bold border transition-all ${section === sec ? "bg-primary/20 border-primary text-primary" : "bg-muted/30 border-transparent text-muted-foreground"}`}
                      >
                        {sec}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreateManualTax}
                disabled={!name || !amount}
                className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold mt-6 disabled:opacity-50 shadow-lg shadow-primary/20"
              >
                Log Deduction
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TaxTracker;
