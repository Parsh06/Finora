import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Sparkles, Scan, Target, RefreshCw, Mic, Trash2 } from "lucide-react";
import { FinoraLogo } from "./FinoraLogo";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToTransactions, Transaction, deleteTransaction } from "@/lib/firestore";
import { format, isToday, isYesterday, differenceInDays, startOfYear, endOfYear, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { DateFilter, DateFilterState } from "./DateFilter";
import { toast } from "sonner";

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ mode: "all" });

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToTransactions(currentUser.uid, (data) => {
      console.log("📊 Dashboard: Received transactions:", data.length);
      console.log("📊 Dashboard: Transaction IDs:", data.map(t => t.id));
      setTransactions(data);
      setLoading(false);
    }, 10); // Get last 10 transactions

    return () => unsubscribe();
  }, [currentUser]);

  // Calculate stats from transactions
  const now = new Date();
  
  // Filter transactions based on date filter
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

  const monthlyTransactions = filteredTransactions;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayTransactions = filteredTransactions.filter((t) => {
    const date = t.date instanceof Date ? t.date : t.date.toDate();
    return date >= startOfToday;
  });

  const monthlyIncome = monthlyTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const monthlyExpense = monthlyTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

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

  const monthlySavings = monthlyIncome - monthlyExpense;
  
  // Calculate total balance (assuming starting balance + all income - all expenses)
  // For now, we'll use monthly income as a proxy
  const totalBalance = monthlyIncome - monthlyExpense;

  const formatDate = (date: Date | any): string => {
    const d = date instanceof Date ? date : date.toDate();
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    const daysDiff = differenceInDays(now, d);
    if (daysDiff < 7) return `${daysDiff} days ago`;
    return format(d, "MMM d");
  };

  const recentTransactions = filteredTransactions.slice(0, 4);

  // Calculate AI Insight from actual data
  const calculateAIInsight = () => {
    if (transactions.length === 0) {
      return {
        text: "Start tracking your expenses to get personalized insights!",
        type: "info" as const
      };
    }

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(startOfWeek.getDate() - 7);
    const lastWeekEnd = new Date(startOfWeek);

    const thisWeekExpenses = transactions.filter((t) => {
      const date = t.date instanceof Date ? t.date : t.date.toDate();
      return date >= startOfWeek && t.type === "expense";
    });

    const lastWeekExpenses = transactions.filter((t) => {
      const date = t.date instanceof Date ? t.date : t.date.toDate();
      return date >= lastWeekStart && date < lastWeekEnd && t.type === "expense";
    });

    const thisWeekTotal = thisWeekExpenses.reduce((sum, t) => sum + t.amount, 0);
    const lastWeekTotal = lastWeekExpenses.reduce((sum, t) => sum + t.amount, 0);

    if (lastWeekTotal === 0 && thisWeekTotal > 0) {
      return {
        text: `You've spent ₹${thisWeekTotal.toLocaleString()} this week. Keep tracking to see trends!`,
        type: "info" as const
      };
    }

    if (lastWeekTotal === 0) {
      return {
        text: "Add more transactions to get personalized spending insights!",
        type: "info" as const
      };
    }

    const change = ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100;
    const categorySpending: Record<string, number> = {};
    
    thisWeekExpenses.forEach(e => {
      categorySpending[e.category] = (categorySpending[e.category] || 0) + e.amount;
    });

    const topCategory = Object.entries(categorySpending).sort(([,a], [,b]) => b - a)[0];

    if (Math.abs(change) < 5) {
      return {
        text: `Your spending is stable. Top category: ${topCategory?.[0] || "N/A"} (₹${topCategory?.[1].toLocaleString() || 0})`,
        type: "info" as const
      };
    }

    if (change > 0) {
      return {
        text: `You spent ${Math.round(change)}% more this week. Top category: ${topCategory?.[0] || "N/A"} (₹${topCategory?.[1].toLocaleString() || 0})`,
        type: "warning" as const
      };
    } else {
      return {
        text: `Great! You spent ${Math.abs(Math.round(change))}% less this week. Keep it up!`,
        type: "success" as const
      };
    }
  };

  const aiInsight = calculateAIInsight();

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
        <div className="flex-shrink-0 ml-2">
          <FinoraLogo size={32} showText={false} />
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
          <h2 className="stat-value text-3xl sm:text-4xl mb-3 sm:mb-4 font-bold">₹{totalBalance.toLocaleString()}</h2>
          
          <div className="flex gap-3 sm:gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-success/20 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Income</p>
                <p className="text-sm sm:text-base font-semibold text-success truncate">₹{monthlyIncome.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-destructive/20 flex items-center justify-center flex-shrink-0">
                <TrendingDown className="w-4 h-4 text-destructive" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Expense</p>
                <p className="text-sm sm:text-base font-semibold text-destructive truncate">₹{monthlyExpense.toLocaleString()}</p>
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
            <p className="text-lg sm:text-xl font-bold text-foreground">₹{todaySpend.toLocaleString()}</p>
          </div>
          <div className="glass-card p-3 sm:p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="w-4 h-4 text-success flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Monthly Savings</span>
            </div>
            <p className={`text-lg sm:text-xl font-bold ${monthlySavings >= 0 ? "text-success" : "text-destructive"}`}>
              ₹{monthlySavings.toLocaleString()}
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
        </div>
      </motion.div>

      {/* AI Insight Card */}
      {transactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="px-4 sm:px-5 mb-4 sm:mb-6"
        >
          <button 
            onClick={() => onNavigate?.("insights")}
            className="w-full glass-card p-3 sm:p-4 text-left hover:bg-muted/30 transition-colors rounded-xl active:scale-95 border border-primary/10"
          >
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-semibold text-foreground mb-1">AI Insight</p>
                <p className={`text-xs sm:text-sm leading-relaxed ${
                  aiInsight.type === "warning" ? "text-warning" : 
                  aiInsight.type === "success" ? "text-success" : 
                  "text-muted-foreground"
                }`}>
                  {aiInsight.text}
                </p>
                <p className="text-xs text-primary mt-1 font-medium">Tap for more insights →</p>
              </div>
            </div>
          </button>
        </motion.div>
      )}

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
                    <p className={`font-semibold text-sm sm:text-base ${
                      transaction.type === "income" ? "text-success" : "text-foreground"
                    }`}>
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
    </div>
  );
};

export default Dashboard;
