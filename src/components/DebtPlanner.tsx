import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  TrendingDown, 
  Zap, 
  Snowflake, 
  Calendar, 
  DollarSign, 
  ArrowRight, 
  AlertCircle,
  CheckCircle2,
  Info,
  Sparkles,
  ChevronRight,
  Calculator,
  Plus,
  X
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getLiabilities, Liability, subscribeToTransactions, Transaction, subscribeToRecurringPayments, RecurringPayment, addLiability } from "@/lib/firestore";
import { simulatePayoff, SimulationResult } from "@/lib/debt-service";
import { format, addMonths } from "date-fns";
import { toast } from "sonner";
import { usePrivacy } from "@/contexts/PrivacyContext";

export const DebtPlanner = ({ onAddTrigger }: { onAddTrigger?: (callback: () => void) => void }) => {
  const { currentUser, userProfile } = useAuth();
  const { isPrivacyEnabled } = usePrivacy();
  
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [extraPayment, setExtraPayment] = useState<number>(0);
  const [activeStrategy, setActiveStrategy] = useState<"avalanche" | "snowball">("avalanche");
  const [showLogicInfo, setShowLogicInfo] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state for new debt
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [interest, setInterest] = useState("");
  const [minPayment, setMinPayment] = useState("");
  const [type, setType] = useState<"loan" | "creditcard">("loan");

  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      const libs = await getLiabilities(currentUser.uid);
      setLiabilities(libs);
      setLoading(false);
    };

    fetchData();

    const unsubTxs = subscribeToTransactions(currentUser.uid, setTransactions);
    const unsubRec = subscribeToRecurringPayments(currentUser.uid, setRecurring);

    return () => {
      unsubTxs();
      unsubRec();
    };
  }, [currentUser]);

  useEffect(() => {
    if (onAddTrigger) {
      onAddTrigger(() => {
        setName("");
        setAmount("");
        setInterest("");
        setMinPayment("");
        setShowAddModal(true);
      });
    }
  }, [onAddTrigger]);

  const handleCreateDebt = async () => {
    if (!currentUser) return;
    try {
      await addLiability(currentUser.uid, {
        name,
        outstandingAmount: Number(amount),
        interestRate: Number(interest),
        minimumPayment: Number(minPayment),
        category: type,
      });
      toast.success("Debt added to planner!");
      setShowAddModal(false);
      // Refresh local list
      const libs = await getLiabilities(currentUser.uid);
      setLiabilities(libs);
    } catch (error) {
      toast.error("Failed to add debt");
    }
  };

  // Calculate suggested extra budget
  useEffect(() => {
    if (userProfile?.salaryAmount && !extraPayment) {
      // Very simple safe surplus logic: Salary - (Avg Monthly Expense + Bills)
      const monthlyBills = recurring
        .filter(r => r.type === "expense" && r.status === "active")
        .reduce((sum, r) => sum + r.amount, 0);
      
      const lastMonthTxs = transactions.filter(t => {
        const d = t.date instanceof Date ? t.date : (t.date as any).toDate();
        const monthStart = new Date();
        monthStart.setMonth(monthStart.getMonth() - 1);
        return t.type === "expense" && d >= monthStart;
      });
      
      const avgExpense = lastMonthTxs.reduce((sum, t) => sum + t.amount, 0);
      const surplus = userProfile.salaryAmount - (avgExpense + monthlyBills);
      
      if (surplus > 0) {
        setExtraPayment(Math.round(surplus * 0.2)); // Suggest 20% of surplus
      }
    }
  }, [userProfile, transactions, recurring]);

  const avalancheResults = useMemo(() => 
    simulatePayoff(liabilities, extraPayment, "avalanche"), 
  [liabilities, extraPayment]);

  const snowballResults = useMemo(() => 
    simulatePayoff(liabilities, extraPayment, "snowball"), 
  [liabilities, extraPayment]);

  const currentResult = activeStrategy === "avalanche" ? avalancheResults : snowballResults;
  const otherResult = activeStrategy === "avalanche" ? snowballResults : avalancheResults;
  
  const interestSaved = Math.max(0, snowballResults.totalInterestPaid - avalancheResults.totalInterestPaid);
  const monthDifference = Math.abs(snowballResults.payoffMonth - avalancheResults.payoffMonth);

  const blurClass = isPrivacyEnabled ? "blur-md select-none" : "";

  if (loading) {
    return <div className="flex items-center justify-center p-12">
      <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>;
  }

  if (liabilities.length === 0) {
    return (
      <div className="p-8 text-center bg-card/50 rounded-3xl border border-border mt-6">
        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
          <TrendingDown className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-bold mb-2">No Debts Found</h3>
        <p className="text-muted-foreground text-sm mb-6">Start planning your payoff strategy by adding your first loan or credit card.</p>
        <button
          onClick={() => {
            setName("");
            setAmount("");
            setInterest("");
            setMinPayment("");
            setShowAddModal(true);
          }}
          className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold flex items-center gap-2 mx-auto hover:opacity-90 transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" /> Add First Debt
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Strategy Switcher & Header */}
      <div className="glass-card p-2 rounded-2xl flex gap-1 mb-8">
        <button
          onClick={() => setActiveStrategy("avalanche")}
          className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            activeStrategy === "avalanche" 
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Zap className="w-4 h-4" /> Avalanche
        </button>
        <button
          onClick={() => setActiveStrategy("snowball")}
          className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            activeStrategy === "snowball" 
              ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" 
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Snowflake className="w-4 h-4" /> Snowball
        </button>
      </div>

      {/* Input Section */}
      <div className="glass-card p-6 rounded-3xl relative overflow-hidden group">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
        
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold flex items-center gap-2">
              Monthly Extra Budget <Calculator className="w-4 h-4 text-primary" />
            </h3>
            <p className="text-xs text-muted-foreground">Additional amount you can pay above minimums</p>
          </div>
          <motion.button
            whileHover={{ rotate: 10 }}
            onClick={() => setShowLogicInfo(!showLogicInfo)}
            className="p-2 rounded-lg bg-secondary text-muted-foreground"
          >
            <Info className="w-4 h-4" />
          </motion.button>
        </div>

        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">₹</span>
          <input
            type="number"
            value={extraPayment || ""}
            onChange={(e) => setExtraPayment(Number(e.target.value))}
            placeholder="0"
            className="w-full bg-background/50 border-2 border-primary/20 focus:border-primary rounded-2xl py-5 pl-10 pr-4 text-3xl font-black outline-none transition-all"
          />
        </div>

        <AnimatePresence>
          {showLogicInfo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mt-4 pt-4 border-t border-border/50"
            >
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <p className="text-xs font-bold text-primary uppercase mb-1 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Avalanche Method (Recommended)
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Prioritizes debt with the **highest interest rate**. Mathematically saves you the most money over time.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs font-bold text-blue-500 uppercase mb-1 flex items-center gap-1">
                    <Snowflake className="w-3 h-3" /> Snowball Method
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Prioritizes debt with the **smallest balance**. Great for psychological momentum as you clear debts quickly.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hero Summary Card */}
      <motion.div
        key={activeStrategy}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`glass-card-elevated p-6 rounded-[2rem] border-l-8 ${
          activeStrategy === "avalanche" ? "border-l-primary" : "border-l-blue-500"
        }`}
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Estimated Debt-Free Date</p>
            <h2 className="text-3xl font-black text-foreground">
              {format(addMonths(new Date(), currentResult.payoffMonth), "MMMM yyyy")}
            </h2>
          </div>
          <div className="p-3 rounded-2xl bg-foreground/5">
            <Calendar className="w-6 h-6 text-muted-foreground" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-background/40 p-4 rounded-2xl border border-border/50">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Time Remaining</p>
            <p className="text-lg font-black">{currentResult.payoffMonth} Months</p>
            {monthDifference > 0 && (
              <p className={`text-[10px] mt-1 font-bold ${activeStrategy === "avalanche" ? "text-success" : "text-destructive"}`}>
                {activeStrategy === "avalanche" ? ` Saves ${monthDifference} mo` : ` Adds ${monthDifference} mo`}
              </p>
            )}
          </div>
          <div className="bg-background/40 p-4 rounded-2xl border border-border/50">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Total Interest</p>
            <p className={`text-lg font-black ${blurClass}`}>₹{currentResult.totalInterestPaid.toLocaleString()}</p>
            {interestSaved > 0 && (
              <p className={`text-[10px] mt-1 font-bold ${activeStrategy === "avalanche" ? "text-success" : "text-destructive"}`}>
                {activeStrategy === "avalanche" ? ` Saves ₹${interestSaved.toLocaleString()}` : ` Extra ₹${interestSaved.toLocaleString()}`}
              </p>
            )}
          </div>
        </div>

        {interestSaved > 0 && activeStrategy === "snowball" && (
          <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-500/90 leading-relaxed font-medium">
              Avalanche would save you <span className="font-bold">₹{interestSaved.toLocaleString()}</span> and clarify your debt <span className="font-bold">{monthDifference} months</span> faster.
            </p>
          </div>
        )}
      </motion.div>

      {/* Individual Debt Progress */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">Payoff Timeline</h3>
        {liabilities.filter(l => l.outstandingAmount > 0).map((debt) => {
          const payoffMonth = currentResult.debtPayoffDates[debt.id!] || 0;
          const isFinished = payoffMonth <= 1; // Simplified for demo
          
          return (
            <motion.div
              layout
              key={debt.id}
              className="glass-card p-5 rounded-3xl"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${
                    activeStrategy === "avalanche" ? "bg-primary/10 text-primary" : "bg-blue-500/10 text-blue-500"
                  }`}>
                    {debt.interestRate}%
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">{debt.name}</h4>
                    <p className={`text-[10px] text-muted-foreground uppercase font-bold ${blurClass}`}>₹{debt.outstandingAmount.toLocaleString()} Left</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-0.5">Cleared In</p>
                  <p className="text-sm font-black text-foreground">{payoffMonth} Months</p>
                </div>
              </div>

              {/* Visual timeline bar */}
              <div className="relative pt-2">
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className={`h-full rounded-full ${activeStrategy === "avalanche" ? "bg-primary" : "bg-blue-500"}`}
                    style={{ 
                      width: `${Math.max(10, (payoffMonth / currentResult.payoffMonth) * 100)}%`,
                      opacity: 0.8
                    }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground font-bold">Today</span>
                  <span className="text-[10px] text-muted-foreground font-bold">Month {payoffMonth}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="glass-card p-6 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-500">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm">Financial OS Integration</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your "Safe Surplus" is derived from your **Cash Flow Engine** and **Net Worth** liabilities. 
              Keep them updated for real-time accuracy.
            </p>
          </div>
        </div>
      </div>

      {/* Add Debt Modal */}
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
                <h2 className="text-xl font-bold italic flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-primary" />
                  Add New Debt
                </h2>
                <button onClick={() => setShowAddModal(false)}><X className="w-6 h-6" /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Debt Name</label>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    className="w-full bg-muted/30 border border-border/50 p-3 rounded-xl outline-none" 
                    placeholder="Home Loan, Axis Credit Card..." 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Outstanding (₹)</label>
                    <input 
                      type="number" 
                      value={amount} 
                      onChange={e => setAmount(e.target.value)} 
                      className="w-full bg-muted/30 border border-border/50 p-3 rounded-xl outline-none" 
                      placeholder="50000" 
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Interest Rate (% p.a.)</label>
                    <input 
                      type="number" 
                      value={interest} 
                      onChange={e => setInterest(e.target.value)} 
                      className="w-full bg-muted/30 border border-border/50 p-3 rounded-xl outline-none" 
                      placeholder="12" 
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Min. Monthly Payment (₹)</label>
                  <input 
                    type="number" 
                    value={minPayment} 
                    onChange={e => setMinPayment(e.target.value)} 
                    className="w-full bg-muted/30 border border-border/50 p-3 rounded-xl outline-none" 
                    placeholder="2500" 
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">Debt Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setType("loan")}
                      className={`py-3 rounded-xl text-sm font-bold border transition-all ${type === "loan" ? "bg-primary/20 border-primary text-primary" : "bg-muted/30 border-transparent text-muted-foreground"}`}
                    >
                      Loan
                    </button>
                    <button
                      onClick={() => setType("creditcard")}
                      className={`py-3 rounded-xl text-sm font-bold border transition-all ${type === "creditcard" ? "bg-primary/20 border-primary text-primary" : "bg-muted/30 border-transparent text-muted-foreground"}`}
                    >
                      Credit Card
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreateDebt}
                disabled={!name || !amount || !interest || !minPayment}
                className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold mt-6 disabled:opacity-50 shadow-lg shadow-primary/20"
              >
                Add to Planner
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
