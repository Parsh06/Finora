import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Filter, Search, Calendar, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToTransactions, Transaction, deleteTransaction } from "@/lib/firestore";
import { format, isToday, isYesterday, differenceInDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, startOfDay, endOfDay } from "date-fns";
import { toast } from "sonner";
import { DateFilter, DateFilterState } from "./DateFilter";

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

type FilterType = "all" | "income" | "expense";
type PeriodType = "all" | "today" | "week" | "month";

export const Transactions = ({ onBack }: { onBack?: () => void }) => {
  const { currentUser } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [period, setPeriod] = useState<PeriodType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ mode: "all" });

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToTransactions(currentUser.uid, (data) => {
      setTransactions(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const now = new Date();
  const formatDate = (date: Date | any): string => {
    const d = date instanceof Date ? date : date.toDate();
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    const daysDiff = differenceInDays(now, d);
    if (daysDiff < 7) return `${daysDiff} days ago`;
    return format(d, "MMM d, yyyy");
  };

  const formatTime = (date: Date | any): string => {
    const d = date instanceof Date ? date : date.toDate();
    return format(d, "h:mm a");
  };

  // Filter transactions based on date filter and other filters
  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      // Type filter
      if (filter === "income" && transaction.type !== "income") return false;
      if (filter === "expense" && transaction.type !== "expense") return false;

      // Date filter
      const date = transaction.date instanceof Date ? transaction.date : transaction.date.toDate();
      
      if (dateFilter.mode === "year" && dateFilter.year !== undefined) {
        const yearStart = startOfYear(new Date(dateFilter.year, 0, 1));
        const yearEnd = endOfYear(new Date(dateFilter.year, 11, 31));
        if (date < yearStart || date > yearEnd) return false;
      } else if (dateFilter.mode === "month" && dateFilter.year !== undefined && dateFilter.month !== undefined) {
        const monthStart = startOfMonth(new Date(dateFilter.year, dateFilter.month, 1));
        const monthEnd = endOfMonth(new Date(dateFilter.year, dateFilter.month, 1));
        if (date < monthStart || date > monthEnd) return false;
      } else if (dateFilter.mode === "day" && dateFilter.year !== undefined && dateFilter.month !== undefined && dateFilter.day !== undefined) {
        const dayStart = startOfDay(new Date(dateFilter.year, dateFilter.month, dateFilter.day));
        const dayEnd = endOfDay(new Date(dateFilter.year, dateFilter.month, dateFilter.day));
        if (date < dayStart || date > dayEnd) return false;
      }

      // Legacy period filter (only if date filter is "all")
      if (dateFilter.mode === "all") {
        if (period === "today") {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (date < today) return false;
        } else if (period === "week") {
          const weekStart = startOfWeek(now);
          if (date < weekStart) return false;
        } else if (period === "month") {
          const monthStart = startOfMonth(now);
          if (date < monthStart) return false;
        }
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = transaction.title.toLowerCase().includes(query);
        const matchesCategory = transaction.category.toLowerCase().includes(query);
        const matchesNote = transaction.note?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesCategory && !matchesNote) return false;
      }

      return true;
    });
  }, [transactions, filter, dateFilter, period, searchQuery, now]);

  // Group transactions by date based on filter mode
  const groupedTransactions = useMemo(() => {
    const grouped: Record<string, Transaction[]> = {};
    
    filteredTransactions.forEach((transaction) => {
      const date = transaction.date instanceof Date ? transaction.date : transaction.date.toDate();
      let dateKey: string;
      
      if (dateFilter.mode === "year") {
        // Group by month and day: "2024-01-15"
        dateKey = format(date, "yyyy-MM-dd");
      } else if (dateFilter.mode === "month") {
        // Group by day: "2024-01-15"
        dateKey = format(date, "yyyy-MM-dd");
      } else if (dateFilter.mode === "day") {
        // All transactions for the day: single group
        dateKey = format(date, "yyyy-MM-dd");
      } else {
        // Default: group by day
        dateKey = format(date, "yyyy-MM-dd");
      }
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(transaction);
    });
    
    return grouped;
  }, [filteredTransactions, dateFilter.mode]);

  const groupedEntries = useMemo(() => {
    return Object.entries(groupedTransactions).sort(([a], [b]) => b.localeCompare(a));
  }, [groupedTransactions]);

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

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="px-4 sm:px-5 pt-4 sm:pt-6 pb-3 sm:pb-4">
          <div className="flex items-center gap-3 mb-4">
            {onBack && (
              <button
                onClick={onBack}
                className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-muted transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
            )}
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">All Transactions</h1>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 glass-card rounded-xl bg-muted/30 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-muted"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("income")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === "income"
                  ? "bg-success/20 text-success border border-success/30"
                  : "bg-secondary text-muted-foreground hover:bg-muted"
              }`}
            >
              Income
            </button>
            <button
              onClick={() => setFilter("expense")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === "expense"
                  ? "bg-destructive/20 text-destructive border border-destructive/30"
                  : "bg-secondary text-muted-foreground hover:bg-muted"
              }`}
            >
              Expenses
            </button>
          </div>

          {/* Date Filter */}
          <div className="flex gap-2 mt-2 items-center">
            <DateFilter value={dateFilter} onChange={setDateFilter} />
            {dateFilter.mode === "all" && (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button
                  onClick={() => setPeriod("today")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    period === "today"
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-secondary text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setPeriod("week")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    period === "week"
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-secondary text-muted-foreground hover:bg-muted"
                  }`}
                >
                  This Week
                </button>
                <button
                  onClick={() => setPeriod("month")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    period === "month"
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-secondary text-muted-foreground hover:bg-muted"
                  }`}
                >
                  This Month
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Transactions List */}
      <div className="px-4 sm:px-5 pt-4">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading transactions...</div>
        ) : groupedEntries.length === 0 ? (
          <div className="glass-card p-8 sm:p-12 rounded-xl text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
              <Search className="w-10 h-10 text-muted-foreground" />
            </div>
            <p className="text-base sm:text-lg text-foreground mb-1 font-medium">No transactions found</p>
            <p className="text-sm text-muted-foreground">
              {searchQuery || filter !== "all" || period !== "all"
                ? "Try adjusting your filters"
                : "Add your first transaction to get started!"}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedEntries.map(([dateKey, dayTransactions]) => {
              const date = new Date(dateKey);
              const isTodayDate = isToday(date);
              const isYesterdayDate = isYesterday(date);
              
              let dateLabel: string;
              if (dateFilter.mode === "year") {
                // Show "Month Day, Year" for year view
                dateLabel = format(date, "MMMM d, yyyy");
              } else if (dateFilter.mode === "month") {
                // Show "Day" or "Today/Yesterday" for month view
                if (isTodayDate) dateLabel = "Today";
                else if (isYesterdayDate) dateLabel = "Yesterday";
                else dateLabel = format(date, "d");
              } else if (dateFilter.mode === "day") {
                // Show full date for day view
                dateLabel = format(date, "MMMM d, yyyy");
              } else {
                // Default format
                if (isTodayDate) dateLabel = "Today";
                else if (isYesterdayDate) dateLabel = "Yesterday";
                else dateLabel = format(date, "MMMM d, yyyy");
              }

              const dayTotal = dayTransactions.reduce((sum, t) => {
                return sum + (t.type === "income" ? t.amount : -t.amount);
              }, 0);

              return (
                <div key={dateKey} className="space-y-2">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="text-sm font-semibold text-foreground">{dateLabel}</h3>
                    <p className={`text-xs font-medium ${
                      dayTotal >= 0 ? "text-success" : "text-destructive"
                    }`}>
                      {dayTotal >= 0 ? "+" : ""}₹{Math.abs(dayTotal).toLocaleString()}
                    </p>
                  </div>
                  {dayTransactions.map((transaction) => {
                    const transactionDate = transaction.date instanceof Date ? transaction.date : transaction.date.toDate();
                    const icon = categoryIcons[transaction.category.toLowerCase()] || categoryIcons.other;

                    return (
                      <motion.div
                        key={transaction.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card p-3 sm:p-4 rounded-xl hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-secondary flex items-center justify-center text-xl sm:text-2xl flex-shrink-0">
                              {icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="font-medium text-foreground text-sm sm:text-base truncate">
                                  {transaction.title}
                                </p>
                                {transaction.isRecurring && (
                                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-primary/20 text-primary flex-shrink-0">
                                    <RefreshCw className="w-3 h-3" />
                                    <span className="hidden sm:inline">Recurring</span>
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs text-muted-foreground">
                                  {transaction.category.charAt(0).toUpperCase() + transaction.category.slice(1)}
                                </p>
                                <span className="text-muted-foreground">•</span>
                                <p className="text-xs text-muted-foreground">{formatTime(transactionDate)}</p>
                                {transaction.paymentMethod && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <p className="text-xs text-muted-foreground capitalize">
                                      {transaction.paymentMethod}
                                    </p>
                                  </>
                                )}
                              </div>
                              {transaction.note && (
                                <p className="text-xs text-muted-foreground mt-1 truncate">{transaction.note}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <p className={`font-semibold text-sm sm:text-base text-right ${
                              transaction.type === "income" ? "text-success" : "text-foreground"
                            }`}>
                              {transaction.type === "income" ? "+" : "-"}₹{transaction.amount.toLocaleString()}
                            </p>
                            {transaction.id && (
                              <button
                                onClick={() => handleDeleteTransaction(transaction.id!, transaction.title)}
                                className="p-1.5 sm:p-2 rounded-lg bg-muted/30 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-all flex-shrink-0"
                                aria-label="Delete transaction"
                              >
                                <Trash2 className="w-4 h-4 sm:w-4 sm:h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Transactions;

