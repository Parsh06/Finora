import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Sparkles, Scan, Target, RefreshCw, Mic, Trash2, Eye, EyeOff, Users, BarChart3 } from "lucide-react";
import { FinancialHeatmap } from "./FinancialHeatmap";
import { FinoraLogo } from "./FinoraLogo";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToTransactions, Transaction, deleteTransaction } from "@/lib/firestore";
import { format, isToday, isYesterday, differenceInDays, startOfYear, endOfYear, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { DateFilter, DateFilterState } from "./DateFilter";
import { toast } from "sonner";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { 
  subscribeToRecurringPayments, 
  subscribeToSavingsGoals, 
  subscribeToBudgets,
  RecurringPayment,
  SavingsGoal,
  Budget 
} from "@/lib/firestore";
import { AIChatDrawer } from "./AIChatDrawer";
import { FinancialContext } from "@/lib/rag-ai-service";
import { SubscriptionAuditor } from "./SubscriptionAuditor";
import { analyzeSubscriptions, SubscriptionInsight } from "@/lib/subscription-service";

interface DashboardProps {
  onNavigate?: (tab: string) => void;
  onScanBill?: () => void;
  onVoiceTransaction?: () => void;
}

const categoryIcons: Record<string, string> = {
  // Expense categories
  food: "🍔",
  transport: "🚗",
  shopping: "🛍️",
  entertainment: "🎬",
  bills: "📄",
  health: "💊",
  education: "📚",
  other: "📦",
  // Income categories
  salary: "💰",
  freelance: "💼",
  business: "🏢",
  investment: "📈",
  gift: "🎁",
  refund: "↩️",
  bonus: "🎯",
};

export const Dashboard = ({ onNavigate, onScanBill, onVoiceTransaction }: DashboardProps) => {
  const { currentUser, userProfile } = useAuth();
  const { isPrivacyEnabled, togglePrivacy } = usePrivacy();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ mode: "all" });
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [ignoredInsights, setIgnoredInsights] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUser) return;

    // Remove limit to get all transactions for accurate totals
    const unsubscribe = subscribeToTransactions(currentUser.uid, (data) => {
      console.log("📊 Dashboard: Received transactions:", data.length);
      setTransactions(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const unsubBills = subscribeToRecurringPayments(currentUser.uid, setRecurringPayments);
    const unsubGoals = subscribeToSavingsGoals(currentUser.uid, setSavingsGoals);
    const unsubBudgets = subscribeToBudgets(currentUser.uid, setBudgets);

    return () => {
      unsubBills();
      unsubGoals();
      unsubBudgets();
    };
  }, [currentUser]);

  const now = new Date();

  // Calculate All-Time Stats
  const allTimeIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const allTimeExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalBalance = allTimeIncome - allTimeExpense;

  const financialContext: FinancialContext = {
    balance: totalBalance,
    upcomingBills: recurringPayments.filter(p => p.status === "active"),
    budgets,
    recentTransactions: transactions.slice(0, 10),
    savingsGoals
  };

  const subscriptionInsights = useMemo(() => {
    const rawInsights = analyzeSubscriptions(transactions, recurringPayments);
    return rawInsights.filter(insight => !ignoredInsights.includes(insight.id));
  }, [transactions, recurringPayments, ignoredInsights]);

  const handleIgnoreInsight = (id: string) => {
    setIgnoredInsights(prev => [...prev, id]);
  };

  const handleAddRecurringFromInsight = (insight: SubscriptionInsight) => {
    // In a real app, this would open the Add Recurring modal with pre-filled data
    // For now, we'll navigate and toast
    onNavigate?.("recurring");
    toast.info(`Add "${insight.merchant}" in the Recurring Payments page.`);
    handleIgnoreInsight(insight.id);
  };

  // Filter transactions based on date filter for the list/graphs if needed
  // For the main balance cards, we use all-time stats as requested
  const filteredTransactions = transactions.filter((t) => {
    const date = t.date instanceof Date ? t.date : t.date.toDate();

    if (dateFilter.mode === "year" && dateFilter.year !== undefined) {
      const yearStart = startOfYear(new Date(dateFilter.year, 0, 1));
      const yearEnd = endOfYear(new Date(dateFilter.year, 11, 31));
      return date >= yearStart && date <= yearEnd;
    } else if (dateFilter.mode === "month" && dateFilter.year !== undefined && dateFilter.month !== undefined) {
      const monthStart = startOfMonth(new Date(dateFilter.year, dateFilter.month, 1));
      const monthEnd = endOfMonth(new Date(dateFilter.year, dateFilter.month, 1));
      return date >= monthStart && date <= monthEnd;
    } else if (dateFilter.mode === "day" && dateFilter.year !== undefined && dateFilter.month !== undefined && dateFilter.day !== undefined) {
      const dayStart = startOfDay(new Date(dateFilter.year, dateFilter.month, dateFilter.day));
      const dayEnd = endOfDay(new Date(dateFilter.year, dateFilter.month, dateFilter.day));
      return date >= dayStart && date <= dayEnd;
    }

    // Default: show current month
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return date >= startOfCurrentMonth;
  });

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayTransactions = transactions.filter((t) => {
    const date = t.date instanceof Date ? t.date : t.date.toDate();
    return date >= startOfToday;
  });

  const handleDeleteTransaction = async (transactionId: string, transactionTitle: string) => {
    if (!currentUser) return;

    if (!confirm(`Are you sure you want to delete "${transactionTitle}"?`)) {
      return;
    }

    try {
      await deleteTransaction(currentUser.uid, transactionId);
      toast.success("Transaction deleted successfully");
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Failed to delete transaction");
    }
  };

  const todaySpend = todayTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  // Calculate savings based on filter
  let savingsValue = 0;
  let savingsLabel = "Monthly Savings";

  if (dateFilter.mode === "month" && dateFilter.year !== undefined && dateFilter.month !== undefined) {
    const monthStart = startOfMonth(new Date(dateFilter.year, dateFilter.month, 1));
    const monthEnd = endOfMonth(new Date(dateFilter.year, dateFilter.month, 1));

    const monthTransactions = transactions.filter(t => {
      const date = t.date instanceof Date ? t.date : t.date.toDate();
      return date >= monthStart && date <= monthEnd;
    });

    const income = monthTransactions.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const expense = monthTransactions.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);

    savingsValue = income - expense;
    savingsLabel = `${format(monthStart, "MMMM")} Savings`;
  } else if (dateFilter.mode === "year" && dateFilter.year !== undefined) {
    const yearStart = startOfYear(new Date(dateFilter.year, 0, 1));
    const yearEnd = endOfYear(new Date(dateFilter.year, 11, 31));

    const yearTransactions = transactions.filter(t => {
      const date = t.date instanceof Date ? t.date : t.date.toDate();
      return date >= yearStart && date <= yearEnd;
    });

    const income = yearTransactions.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const expense = yearTransactions.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);

    savingsValue = income - expense;
    savingsLabel = `${dateFilter.year} Savings`;
  } else {
    // Default to current month
    const currentMonthTransactions = transactions.filter(t => {
      const date = t.date instanceof Date ? t.date : t.date.toDate();
      return date >= startOfMonth(now) && date <= endOfMonth(now);
    });

    const income = currentMonthTransactions.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const expense = currentMonthTransactions.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);

    savingsValue = income - expense;
    savingsLabel = "Monthly Savings";
  }

  const formatDate = (date: Date | any): string => {
    const d = date instanceof Date ? date : date.toDate();
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    const daysDiff = differenceInDays(now, d);
    if (daysDiff < 7) return `${daysDiff} days ago`;
    return format(d, "MMM d");
  };

  const recentTransactions = filteredTransactions.slice(0, 4);

  const blurClass = isPrivacyEnabled ? "blur-md select-none transition-all duration-300" : "transition-all duration-300";

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Header */}
      <header className="px-4 sm:px-5 pt-4 sm:pt-6 pb-3 sm:pb-4 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs sm:text-sm truncate">Welcome back,</p>
          <h1 className="text-lg sm:text-xl font-semibold text-foreground truncate">
            {userProfile?.name || currentUser?.displayName || "User"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={togglePrivacy}
            className="p-2 rounded-full bg-secondary hover:bg-muted transition-colors"
            title={isPrivacyEnabled ? "Show Balance" : "Hide Balance"}
          >
            {isPrivacyEnabled ? (
              <EyeOff className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Eye className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
          <div className="flex-shrink-0 ml-2">
            <FinoraLogo size={32} showText={false} />
          </div>
        </div>
      </header>

      {/* Date Filter */}
      <div className="px-4 sm:px-5 mb-4">
        <DateFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mx-4 sm:mx-5 mb-4 sm:mb-6"
      >
        <div className="glass-card-elevated p-4 sm:p-6 relative overflow-hidden rounded-2xl">
          <div className="absolute top-0 right-0 w-32 h-32 sm:w-40 sm:h-40 opacity-20"
            style={{ background: "radial-gradient(circle, hsl(165, 80%, 45%) 0%, transparent 70%)" }}
          />
          <p className="text-muted-foreground text-xs sm:text-sm mb-1">Total Balance</p>
          <h2 className={`stat-value text-3xl sm:text-4xl mb-3 sm:mb-4 font-bold ${blurClass}`}>₹{totalBalance.toLocaleString()}</h2>

          <div className="flex gap-3 sm:gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-success/20 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Income</p>
                <p className={`text-sm sm:text-base font-semibold text-success truncate ${blurClass}`}>₹{allTimeIncome.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-destructive/20 flex items-center justify-center flex-shrink-0">
                <TrendingDown className="w-4 h-4 text-destructive" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Expense</p>
                <p className={`text-sm sm:text-base font-semibold text-destructive truncate ${blurClass}`}>₹{allTimeExpense.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="px-4 sm:px-5 mb-4 sm:mb-6"
      >
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="glass-card p-3 sm:p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Today's Spend</span>
            </div>
            <p className={`text-lg sm:text-xl font-bold text-foreground ${blurClass}`}>₹{todaySpend.toLocaleString()}</p>
          </div>
          <div className="glass-card p-3 sm:p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="w-4 h-4 text-success flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{savingsLabel}</span>
            </div>
            <p className={`text-lg sm:text-xl font-bold ${savingsValue >= 0 ? "text-success" : "text-destructive"} ${blurClass}`}>
              ₹{savingsValue.toLocaleString()}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="px-4 sm:px-5 mb-4 sm:mb-6"
      >
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <button
            onClick={onScanBill}
            className="glass-card p-3 sm:p-4 flex flex-col items-center gap-2 hover:bg-muted/30 transition-colors rounded-xl active:scale-95"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
              <Scan className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
            </div>
            <div className="text-center min-w-0">
              <p className="font-medium text-foreground text-xs truncate">Scan Bill</p>
              <p className="text-[10px] text-muted-foreground truncate">Auto-add</p>
            </div>
          </button>

          <button
            onClick={onVoiceTransaction}
            className="glass-card p-3 sm:p-4 flex flex-col items-center gap-2 hover:bg-muted/30 transition-colors rounded-xl active:scale-95"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-success/20 flex items-center justify-center flex-shrink-0">
              <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
            </div>
            <div className="text-center min-w-0">
              <p className="font-medium text-foreground text-xs truncate">Voice</p>
              <p className="text-[10px] text-muted-foreground truncate">Transaction</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate?.("budgets")}
            className="glass-card p-3 sm:p-4 flex flex-col items-center gap-2 hover:bg-muted/30 transition-colors rounded-xl active:scale-95"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Target className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="text-center min-w-0">
              <p className="font-medium text-foreground text-xs truncate">Budgets</p>
              <p className="text-[10px] text-muted-foreground truncate">Track goals</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate?.("savings")}
            className="glass-card p-3 sm:p-4 flex flex-col items-center gap-2 hover:bg-muted/30 transition-colors rounded-xl active:scale-95"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-warning/20 flex items-center justify-center flex-shrink-0">
              <PiggyBank className="w-4 h-4 sm:w-5 sm:h-5 text-warning" />
            </div>
            <div className="text-center min-w-0">
              <p className="font-medium text-foreground text-xs truncate">Wishlist</p>
              <p className="text-[10px] text-muted-foreground truncate">Save money</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate?.("split")}
            className="glass-card p-3 sm:p-4 flex flex-col items-center gap-2 hover:bg-muted/30 transition-colors rounded-xl active:scale-95"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500" />
            </div>
            <div className="text-center min-w-0">
              <p className="font-medium text-foreground text-xs truncate">Split Bill</p>
              <p className="text-[10px] text-muted-foreground truncate">Trip Mode</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate?.("analytics")}
            className="glass-card p-3 sm:p-4 flex flex-col items-center gap-2 hover:bg-muted/30 transition-colors rounded-xl active:scale-95"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-500/20 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
            </div>
            <div className="text-center min-w-0">
              <p className="font-medium text-foreground text-xs truncate">Stats</p>
              <p className="text-[10px] text-muted-foreground truncate">Insights</p>
            </div>
          </button>

        </div>
      </motion.div>

      {/* Financial Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="px-4 sm:px-5 mb-4 sm:mb-6"
      >
        <FinancialHeatmap transactions={transactions} />
      </motion.div>

      {/* Subscription Auditor Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="px-4 sm:px-5"
      >
        <SubscriptionAuditor 
          insights={subscriptionInsights} 
          onAddRecurring={handleAddRecurringFromInsight}
          onIgnore={handleIgnoreInsight}
        />
      </motion.div>

      {/* Recent Transactions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="px-4 sm:px-5"
      >
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="font-semibold text-foreground text-sm sm:text-base">Recent Transactions</h3>
          <button
            onClick={() => onNavigate?.("transactions")}
            className="text-xs sm:text-sm text-primary font-medium hover:underline"
          >
            See All
          </button>
        </div>

        <div className="space-y-2 sm:space-y-3">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading transactions...</div>
          ) : recentTransactions.length === 0 ? (
            <div className="glass-card p-6 sm:p-8 rounded-xl text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-muted/30 flex items-center justify-center">
                <Wallet className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm sm:text-base text-muted-foreground mb-1">No transactions yet</p>
              <p className="text-xs text-muted-foreground">Add your first transaction to get started!</p>
            </div>
          ) : (
            recentTransactions.map((transaction, index) => {
              const date = transaction.date instanceof Date ? transaction.date : transaction.date.toDate();
              const icon = categoryIcons[transaction.category.toLowerCase()] || categoryIcons.other;

              return (
                <motion.div
                  key={transaction.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  className="glass-card p-3 sm:p-4 flex items-center justify-between rounded-xl hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-secondary flex items-center justify-center text-lg sm:text-xl flex-shrink-0">
                      {icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground text-sm sm:text-base truncate">{transaction.title}</p>
                        {transaction.isRecurring && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-primary/20 text-primary flex-shrink-0">
                            <RefreshCw className="w-3 h-3" />
                            <span className="hidden sm:inline">Recurring</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {transaction.category.charAt(0).toUpperCase() + transaction.category.slice(1)} • {formatDate(date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <p className={`font-semibold text-sm sm:text-base ${transaction.type === "income" ? "text-success" : "text-foreground"
                      } ${blurClass}`}>
                      {transaction.type === "income" ? "+" : "-"}₹{transaction.amount.toLocaleString()}
                    </p>
                    {transaction.id && (
                      <button
                        onClick={() => handleDeleteTransaction(transaction.id!, transaction.title)}
                        className="p-1.5 sm:p-2 rounded-lg bg-muted/30 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-all"
                        aria-label="Delete transaction"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>
      {/* Floating Action Button for AI Chat */}
      <motion.button
        onClick={() => setIsAIChatOpen(true)}
        whileHover={{ scale: 1.1, rotate: 5 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 z-40 border-2 border-primary-foreground/20"
      >
        <Sparkles className="w-6 h-6" />
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-success rounded-full border-2 border-background animate-pulse" />
      </motion.button>

      {/* AI Chat Drawer */}
      <AIChatDrawer 
        isOpen={isAIChatOpen} 
        onClose={() => setIsAIChatOpen(false)} 
        context={financialContext}
      />
    </div>
  );
};

export default Dashboard;
