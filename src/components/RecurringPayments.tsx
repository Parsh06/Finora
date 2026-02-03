import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Plus,
  Calendar,
  Bell,
  Trash2,
  Edit2,
  Zap,
  Wifi,
  Smartphone,
  Home,
  Car,
  Dumbbell,
  Music,
  Film,
  X,
  Check,
  AlertCircle,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  subscribeToRecurringPayments,
  addRecurringPayment,
  updateRecurringPayment,
  deleteRecurringPayment,
  RecurringPayment as FirestoreRecurringPayment
} from "@/lib/firestore";
import { format, parseISO, isBefore, isToday, differenceInDays, startOfDay } from "date-fns";
import { calculateNextRunDate } from "@/lib/recurring-transactions";
import { toast } from "sonner";
import { useCategories } from "@/hooks/useCategories";

const iconMap: Record<string, React.ElementType> = {
  Film,
  Music,
  Dumbbell,
  Zap,
  Wifi,
  Smartphone,
  Home,
  Car,
};

const colorMap: Record<string, string> = {
  Entertainment: "text-red-400",
  Health: "text-orange-400",
  Utilities: "text-yellow-400",
  Housing: "text-cyan-400",
  Transportation: "text-pink-400",
};

const paymentMethods = [
  { id: "cash", label: "Cash", icon: "💵" },
  { id: "card", label: "Card", icon: "💳" },
  { id: "online", label: "Online", icon: "📱" },
];

export const RecurringPayments = () => {
  const { currentUser } = useAuth();
  const { expenseCategories, incomeCategories, getCategoryIcon } = useCategories();
  const [payments, setPayments] = useState<FirestoreRecurringPayment[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<FirestoreRecurringPayment | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "amount" | "nextDate" | "frequency">("nextDate");

  // Form state
  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formFrequency, setFormFrequency] = useState<"daily" | "weekly" | "monthly" | "yearly" | "custom">("monthly");
  const [formRepeatDays, setFormRepeatDays] = useState<string[]>([]);
  const [formCategory, setFormCategory] = useState("");
  const [formType, setFormType] = useState<"expense" | "income">("expense");
  const [formPaymentMethod, setFormPaymentMethod] = useState("");
  const [formStartDate, setFormStartDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Format categories for display
  const formattedExpenseCategories = expenseCategories.map(cat => ({
    id: cat.name,
    label: cat.name,
    icon: cat.icon,
    color: cat.color,
  }));

  const formattedIncomeCategories = incomeCategories.map(cat => ({
    id: cat.name,
    label: cat.name,
    icon: cat.icon,
    color: cat.color,
  }));

  const currentCategories = formType === "expense" ? formattedExpenseCategories : formattedIncomeCategories;

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToRecurringPayments(currentUser.uid, (data) => {
      setPayments(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Get active payments
  const activePayments = useMemo(() => {
    return payments.filter(p => {
      const status = p.status || (p.isActive ? "active" : "paused");
      return status === "active";
    });
  }, [payments]);

  // Calculate stats
  const stats = useMemo(() => {
    // Calculate monthly equivalent for all frequencies
    // This shows projected monthly spending based on frequency
    const calculateMonthlyEquivalent = (amount: number, frequency: string): number => {
      switch (frequency) {
        case "daily":
          return amount * 30; // 30 days per month
        case "weekly":
          return amount * 4.33; // Average weeks per month (52/12)
        case "monthly":
          return amount; // Already monthly
        case "yearly":
          return amount / 12; // Monthly portion of yearly
        default:
          return amount;
      }
    };

    const monthlyExpenses = activePayments
      .filter(p => p.type === "expense")
      .reduce((sum, p) => sum + calculateMonthlyEquivalent(p.amount, p.frequency || "monthly"), 0);

    const monthlyIncome = activePayments
      .filter(p => p.type === "income")
      .reduce((sum, p) => sum + calculateMonthlyEquivalent(p.amount, p.frequency || "monthly"), 0);

    const totalMonthly = monthlyIncome - monthlyExpenses;

    // Upcoming: payments where nextRunDate is within next 7 days
    const today = startOfDay(new Date());
    const upcomingCount = activePayments.filter(p => {
      const nextDateStr = p.nextRunDate || p.nextDate;
      if (!nextDateStr) return false;
      const nextDate = startOfDay(parseISO(nextDateStr));
      const daysUntil = differenceInDays(nextDate, today);
      return daysUntil >= 0 && daysUntil <= 7;
    }).length;

    const hasDailyOrWeeklyExpenses = activePayments.some(p =>
      p.type === "expense" && (p.frequency === "daily" || p.frequency === "weekly")
    );

    const hasDailyOrWeeklyIncome = activePayments.some(p =>
      p.type === "income" && (p.frequency === "daily" || p.frequency === "weekly")
    );

    return {
      monthlyExpenses,
      monthlyIncome,
      totalMonthly,
      activeCount: activePayments.length,
      pausedCount: payments.length - activePayments.length,
      upcomingCount,
      hasDailyOrWeeklyExpenses,
      hasDailyOrWeeklyIncome,
    };
  }, [payments, activePayments]);

  const togglePayment = async (id: string) => {
    if (!currentUser) return;
    const payment = payments.find(p => p.id === id);
    if (!payment) return;

    try {
      const currentStatus = payment.status || (payment.isActive ? "active" : "paused");
      const newStatus = currentStatus === "active" ? "paused" : "active";
      await updateRecurringPayment(currentUser.uid, id, {
        status: newStatus,
      });
      toast.success(newStatus === "active" ? "Payment activated" : "Payment paused");
    } catch (error) {
      console.error("Error toggling payment:", error);
      toast.error("Failed to update payment");
    }
  };

  const toggleReminder = async (id: string) => {
    if (!currentUser) return;
    const payment = payments.find(p => p.id === id);
    if (!payment) return;

    try {
      await updateRecurringPayment(currentUser.uid, id, {
        reminderEnabled: !payment.reminderEnabled,
      });
      toast.success(payment.reminderEnabled ? "Reminder disabled" : "Reminder enabled");
    } catch (error) {
      console.error("Error toggling reminder:", error);
      toast.error("Failed to update reminder");
    }
  };

  const handleDelete = async (id: string) => {
    if (!currentUser) return;
    if (!confirm("Are you sure you want to delete this recurring payment?")) return;

    try {
      await deleteRecurringPayment(currentUser.uid, id);
      toast.success("Recurring payment deleted");
    } catch (error) {
      console.error("Error deleting payment:", error);
      toast.error("Failed to delete payment");
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormAmount("");
    setFormCategory("");
    setFormPaymentMethod("");
    setFormType("expense");
    setFormFrequency("monthly");
    setFormStartDate(format(new Date(), "yyyy-MM-dd"));
    setFormRepeatDays([]);
    setEditingPayment(null);
  };

  const openEditModal = (payment: FirestoreRecurringPayment) => {
    setEditingPayment(payment);
    setFormName(payment.name);
    setFormAmount(payment.amount.toString());
    setFormFrequency(payment.frequency || "monthly");
    setFormRepeatDays(payment.repeatDays || []);
    setFormCategory(payment.category);
    setFormType(payment.type || "expense");
    setFormPaymentMethod(payment.paymentMethod || "");
    setFormStartDate(payment.startDate || format(new Date(), "yyyy-MM-dd"));
    setShowEditModal(true);
  };

  const handleAddPayment = async () => {
    if (!currentUser || !formName || !formAmount || !formCategory) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      const amount = parseFloat(formAmount);
      if (isNaN(amount) || amount <= 0) {
        toast.error("Please enter a valid amount");
        return;
      }

      if (formFrequency === "custom" && formRepeatDays.length === 0) {
        toast.error("Please select at least one day for custom recurrence");
        return;
      }

      const startDate = parseISO(formStartDate);
      const nextRunDate = calculateNextRunDate(startDate, formFrequency, startDate, formRepeatDays);

      await addRecurringPayment(currentUser.uid, {
        name: formName,
        amount,
        frequency: formFrequency,
        repeatDays: formRepeatDays,
        startDate: format(startDate, "yyyy-MM-dd"),
        nextRunDate: format(nextRunDate, "yyyy-MM-dd"),
        category: formCategory,
        type: formType,
        paymentMethod: formPaymentMethod || undefined,
        icon: getCategoryIcon(formCategory, formType) || "📦",
        color: (formType === "expense" ? expenseCategories : incomeCategories).find(c => c.name === formCategory)?.color || "#6B7280",
        status: "active",
        reminderEnabled: false,
      });

      toast.success("Recurring payment added");
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error("Error adding payment:", error);
      toast.error("Failed to add payment");
    }
  };

  const handleUpdatePayment = async () => {
    if (!currentUser || !editingPayment || !formName || !formAmount || !formCategory) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      const amount = parseFloat(formAmount);
      if (isNaN(amount) || amount <= 0) {
        toast.error("Please enter a valid amount");
        return;
      }

      const startDate = parseISO(formStartDate);

      // Recalculate nextRunDate if frequency, startDate, or repeatDays changed
      const frequencyChanged = editingPayment.frequency !== formFrequency;
      const startDateChanged = editingPayment.startDate !== format(startDate, "yyyy-MM-dd");
      const repeatDaysChanged = JSON.stringify(editingPayment.repeatDays?.sort()) !== JSON.stringify(formRepeatDays.sort());

      let nextRunDate = parseISO(editingPayment.nextRunDate || editingPayment.nextDate || format(new Date(), "yyyy-MM-dd"));

      if (frequencyChanged || startDateChanged || repeatDaysChanged) {
        // Recalculate next run date based on new frequency/startDate
        nextRunDate = calculateNextRunDate(startDate, formFrequency, startDate, formRepeatDays);
      }

      await updateRecurringPayment(currentUser.uid, editingPayment.id!, {
        name: formName,
        amount,
        frequency: formFrequency,
        repeatDays: formRepeatDays,
        startDate: format(startDate, "yyyy-MM-dd"),
        nextRunDate: format(nextRunDate, "yyyy-MM-dd"),
        category: formCategory,
        type: formType,
        paymentMethod: formPaymentMethod || undefined,
        icon: getCategoryIcon(formCategory, formType) || editingPayment.icon || "📦",
        color: (formType === "expense" ? expenseCategories : incomeCategories).find(c => c.name === formCategory)?.color || editingPayment.color || "#6B7280",
      });

      toast.success("Recurring payment updated");
      setShowEditModal(false);
      resetForm();
    } catch (error) {
      console.error("Error updating payment:", error);
      toast.error("Failed to update payment");
    }
  };

  // Filter and sort payments
  const filteredAndSortedPayments = useMemo(() => {
    let filtered = payments.filter(p => {
      const status = p.status || (p.isActive ? "active" : "paused");

      // Status filter
      if (filter === "active" && status !== "active") return false;
      if (filter === "paused" && status !== "paused") return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesCategory = p.category.toLowerCase().includes(query);
        if (!matchesName && !matchesCategory) return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "amount":
          return b.amount - a.amount;
        case "frequency":
          const freqOrder = { daily: 1, weekly: 2, monthly: 3, yearly: 4 };
          return (freqOrder[a.frequency] || 0) - (freqOrder[b.frequency] || 0);
        case "nextDate":
        default:
          const dateA = parseISO(a.nextRunDate || a.nextDate || "9999-12-31");
          const dateB = parseISO(b.nextRunDate || b.nextDate || "9999-12-31");
          return dateA.getTime() - dateB.getTime();
      }
    });

    return filtered;
  }, [payments, filter, searchQuery, sortBy]);

  // Upcoming payments this week
  const upcomingPayments = useMemo(() => {
    const today = startOfDay(new Date());
    return payments
      .filter(p => {
        const status = p.status || (p.isActive ? "active" : "paused");
        if (status !== "active") return false;
        const nextDateStr = p.nextRunDate || p.nextDate;
        if (!nextDateStr) return false;
        const nextDate = startOfDay(parseISO(nextDateStr));
        const daysUntil = differenceInDays(nextDate, today);
        return daysUntil >= 0 && daysUntil <= 7;
      })
      .sort((a, b) => {
        const dateA = parseISO(a.nextRunDate || a.nextDate || "9999-12-31");
        const dateB = parseISO(b.nextRunDate || b.nextDate || "9999-12-31");
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 3);
  }, [payments]);

  return (
    <motion.div
      className="min-h-screen bg-background pb-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-14 pb-4 sm:pb-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Recurring Payments</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">Manage your subscriptions</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 hover:scale-105 transition-transform"
          >
            <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
          <motion.div
            className="glass-card p-3 sm:p-4 rounded-xl"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-destructive" />
              <p className="text-xs text-muted-foreground">Monthly Expenses</p>
            </div>
            <p className="text-lg sm:text-xl font-bold text-destructive">₹{Math.round(stats.monthlyExpenses).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.hasDailyOrWeeklyExpenses
                ? "Projected (daily/weekly converted)"
                : "Total monthly"}
            </p>
          </motion.div>

          <motion.div
            className="glass-card p-3 sm:p-4 rounded-xl"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-success" />
              <p className="text-xs text-muted-foreground">Monthly Income</p>
            </div>
            <p className="text-lg sm:text-xl font-bold text-success">₹{Math.round(stats.monthlyIncome).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.hasDailyOrWeeklyIncome
                ? "Projected (daily/weekly converted)"
                : "Total monthly"}
            </p>
          </motion.div>

          <motion.div
            className="glass-card p-3 sm:p-4 rounded-xl"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-primary" />
              <p className="text-xs text-muted-foreground">Net Monthly</p>
            </div>
            <p className={`text-lg sm:text-xl font-bold ${stats.totalMonthly >= 0 ? "text-success" : "text-destructive"}`}>
              {stats.totalMonthly >= 0 ? "+" : ""}₹{Math.round(Math.abs(stats.totalMonthly)).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Income - Expenses</p>
          </motion.div>

          <motion.div
            className="glass-card p-3 sm:p-4 rounded-xl"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-warning" />
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </div>
            <p className="text-lg sm:text-xl font-bold text-foreground">{stats.upcomingCount}</p>
          </motion.div>
        </div>

        {/* Summary Card */}
        <motion.div
          className="glass-card-elevated p-4 sm:p-5 rounded-2xl"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Active Payments</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground">{stats.activeCount}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs sm:text-sm text-muted-foreground">{stats.activeCount} Active</p>
              <p className="text-xs text-yellow-400">{stats.pausedCount} Paused</p>
            </div>
          </div>

          {/* Upcoming Section */}
          {upcomingPayments.length > 0 && (
            <div className="pt-3 sm:pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-2 sm:mb-3">Upcoming This Week</p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {upcomingPayments.map((payment) => {
                  const nextDate = parseISO(payment.nextRunDate || payment.nextDate || new Date().toISOString());
                  const daysUntil = differenceInDays(nextDate, new Date());
                  return (
                    <div
                      key={payment.id}
                      className="flex-shrink-0 flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-muted/30"
                    >
                      <span className="text-base sm:text-lg">{getCategoryIcon(payment.category, payment.type) || "📦"}</span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs sm:text-sm text-foreground font-medium truncate">{payment.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Search and Filters */}
      <div className="px-4 sm:px-6 mb-4">
        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search payments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-muted/30 border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter and Sort */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {/* Status Filters */}
          {(["all", "active", "paused"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${filter === tab
                ? "bg-primary text-primary-foreground"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}

          {/* Sort Dropdown */}
          <div className="ml-auto flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-muted/30 border border-border/50 rounded-xl px-3 py-1.5 text-xs sm:text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="nextDate">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="amount">Sort by Amount</option>
              <option value="frequency">Sort by Frequency</option>
            </select>
          </div>
        </div>
      </div>

      {/* Payments List */}
      <div className="px-4 sm:px-6 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading payments...</div>
        ) : filteredAndSortedPayments.length === 0 ? (
          <div className="glass-card p-8 sm:p-12 rounded-xl text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
            </div>
            <p className="text-sm sm:text-base font-medium text-foreground mb-1">No recurring payments found</p>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4">
              {searchQuery ? "Try adjusting your search" : "Add your first recurring payment to track subscriptions!"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"
              >
                Add Payment
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence>
            {filteredAndSortedPayments.map((payment, index) => {
              const status = payment.status || (payment.isActive ? "active" : "paused");
              const nextDate = parseISO(payment.nextRunDate || payment.nextDate || new Date().toISOString());
              const daysUntil = differenceInDays(nextDate, new Date());
              const isOverdue = isBefore(nextDate, new Date()) && !isToday(nextDate);

              return (
                <motion.div
                  key={payment.id}
                  className={`glass-card p-3 sm:p-4 rounded-xl ${status !== "active" ? "opacity-60" : ""}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: status === "active" ? 1 : 0.6, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  layout
                >
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-muted/30 flex items-center justify-center flex-shrink-0 text-lg sm:text-xl">
                        {getCategoryIcon(payment.category, payment.type) || "📦"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-sm sm:text-base text-foreground truncate">{payment.name}</p>
                          {isOverdue && status === "active" && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-destructive/20 text-destructive flex-shrink-0">
                              Overdue
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-muted-foreground flex-wrap">
                          <span className={`capitalize ${payment.type === "income" ? "text-success font-medium" : ""}`}>
                            {payment.type || "expense"}
                          </span>
                          <span>•</span>
                          <span className="capitalize">{payment.category}</span>
                          <span>•</span>
                          <span className="capitalize">{payment.frequency}</span>
                          {(payment.frequency === "custom" || (payment.repeatDays && payment.repeatDays.length > 0)) && (
                            <>
                              <span>•</span>
                              <span className="text-xs uppercase tracking-tight max-w-[120px] truncate" title={payment.repeatDays?.join(", ")}>
                                {payment.repeatDays?.join(", ")}
                              </span>
                            </>
                          )}
                          {payment.paymentMethod && (
                            <>
                              <span>•</span>
                              <span className="capitalize">{payment.paymentMethod}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`font-bold text-sm sm:text-base ${payment.type === "income" ? "text-success" : "text-foreground"}`}>
                        {payment.type === "income" ? "+" : ""}₹{payment.amount.toLocaleString()}
                      </p>
                      <p className={`text-xs ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : daysUntil < 0 ? `${Math.abs(daysUntil)}d ago` : `In ${daysUntil}d`}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border/30">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <button
                        onClick={() => toggleReminder(payment.id!)}
                        className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${payment.reminderEnabled
                          ? "bg-primary/20 text-primary"
                          : "bg-muted/30 text-muted-foreground"
                          }`}
                      >
                        <Bell className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        <span className="hidden sm:inline">Reminder</span>
                      </button>
                      <button
                        onClick={() => openEditModal(payment)}
                        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-muted/30 text-muted-foreground text-xs font-medium hover:bg-primary/20 hover:text-primary transition-all"
                      >
                        <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(payment.id!)}
                        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-muted/30 text-muted-foreground text-xs font-medium hover:bg-destructive/20 hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                    <button
                      onClick={() => togglePayment(payment.id!)}
                      className={`relative w-11 h-6 sm:w-12 sm:h-6 rounded-full transition-all flex-shrink-0 ${status === "active" ? "bg-primary" : "bg-muted/50"
                        }`}
                    >
                      <motion.div
                        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
                        animate={{
                          left: status === "active" ? "calc(100% - 18px)" : "4px"
                        }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Add Payment Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setShowAddModal(false);
                resetForm();
              }}
            />
            <motion.div
              className="relative w-full max-w-lg bg-card rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 max-h-[90vh] overflow-hidden flex flex-col"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4 sm:mb-6 flex-shrink-0">
                <h2 className="text-lg sm:text-xl font-semibold text-foreground">Add Recurring Payment</h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                <div className="space-y-4 pb-4">
                  {/* Name */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Name *</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g., Netflix, Gym, Rent"
                      className="w-full bg-muted/30 border border-border/50 rounded-xl py-3 px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="₹0.00"
                      className="w-full bg-muted/30 border border-border/50 rounded-xl py-3 px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Type *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["expense", "income"] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setFormType(type);
                            setFormCategory(""); // Reset category when type changes
                          }}
                          className={`py-3 rounded-xl transition-all text-sm font-medium capitalize ${formType === type
                            ? "bg-primary text-primary-foreground shadow-lg"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                            }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Category *</label>
                    <div className="grid grid-cols-4 gap-2">
                      {currentCategories.map((category) => (
                        <button
                          key={category.id}
                          onClick={() => setFormCategory(category.id)}
                          className={`flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-xl transition-all ${formCategory === category.id
                            ? "bg-primary text-primary-foreground shadow-lg scale-105"
                            : "bg-muted/30 text-foreground hover:bg-muted/50"
                            }`}
                        >
                          <span className="text-xl sm:text-2xl">{category.icon}</span>
                          <span className="text-xs font-medium text-center leading-tight">{category.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Frequency *</label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {(["daily", "weekly", "monthly", "yearly", "custom"] as const).map((freq) => (
                        <button
                          key={freq}
                          onClick={() => setFormFrequency(freq)}
                          className={`py-2 rounded-xl transition-all text-xs font-medium capitalize ${formFrequency === freq
                            ? "bg-primary text-primary-foreground shadow-lg"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                            }`}
                        >
                          {freq}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Day Selector */}
                  {(formFrequency === "weekly" || formFrequency === "daily" || formFrequency === "custom") && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <label className="text-sm text-muted-foreground block">
                        Repeat On {(formFrequency === "daily" || formFrequency === "weekly") && <span className="text-xs text-muted-foreground/70">(Optional override)</span>}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => {
                          const isSelected = formRepeatDays.includes(day);
                          return (
                            <button
                              key={day}
                              onClick={() => {
                                const newDays = isSelected
                                  ? formRepeatDays.filter((d) => d !== day)
                                  : [...formRepeatDays, day];
                                setFormRepeatDays(newDays);
                              }}
                              className={`w-9 h-9 rounded-full text-xs font-medium transition-all ${isSelected
                                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                                }`}
                            >
                              {day.charAt(0)}
                            </button>
                          );
                        })}
                      </div>
                      {formRepeatDays.length === 0 && formFrequency === "custom" && (
                        <p className="text-xs text-destructive mt-1">Please select at least one day.</p>
                      )}
                    </motion.div>
                  )}

                  {/* Start Date */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Start Date *</label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full bg-muted/30 border border-border/50 rounded-xl py-3 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* Payment Method */}
                  {formType === "expense" && (
                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">Payment Method (Optional)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {paymentMethods.map((method) => (
                          <button
                            key={method.id}
                            onClick={() => setFormPaymentMethod(method.id)}
                            className={`flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-xl transition-all ${formPaymentMethod === method.id
                              ? "bg-primary text-primary-foreground shadow-lg"
                              : "bg-muted/30 text-foreground hover:bg-muted/50"
                              }`}
                          >
                            <span className="text-xl sm:text-2xl">{method.icon}</span>
                            <span className="text-xs font-medium">{method.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Button */}
              <div className="pt-4 border-t border-border/30 flex-shrink-0">
                <button
                  onClick={handleAddPayment}
                  disabled={!formName || !formAmount || !formCategory}
                  className="w-full py-3 sm:py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg"
                >
                  Add Payment
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Payment Modal */}
      <AnimatePresence>
        {showEditModal && editingPayment && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setShowEditModal(false);
                resetForm();
              }}
            />
            <motion.div
              className="relative w-full max-w-lg bg-card rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 max-h-[90vh] overflow-hidden flex flex-col"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4 sm:mb-6 flex-shrink-0">
                <h2 className="text-lg sm:text-xl font-semibold text-foreground">Edit Recurring Payment</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                <div className="space-y-4 pb-4">
                  {/* Name */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Name *</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g., Netflix, Gym, Rent"
                      className="w-full bg-muted/30 border border-border/50 rounded-xl py-3 px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="₹0.00"
                      className="w-full bg-muted/30 border border-border/50 rounded-xl py-3 px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Type *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["expense", "income"] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setFormType(type);
                            if (formCategory && !(formType === "expense" ? expenseCategories : incomeCategories).find(c => c.name === formCategory)) {
                              setFormCategory(""); // Reset category if it doesn't exist in new type
                            }
                          }}
                          className={`py-3 rounded-xl transition-all text-sm font-medium capitalize ${formType === type
                            ? "bg-primary text-primary-foreground shadow-lg"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                            }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Category *</label>
                    <div className="grid grid-cols-4 gap-2">
                      {currentCategories.map((category) => (
                        <button
                          key={category.id}
                          onClick={() => setFormCategory(category.id)}
                          className={`flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-xl transition-all ${formCategory === category.id
                            ? "bg-primary text-primary-foreground shadow-lg scale-105"
                            : "bg-muted/30 text-foreground hover:bg-muted/50"
                            }`}
                        >
                          <span className="text-xl sm:text-2xl">{category.icon}</span>
                          <span className="text-xs font-medium text-center leading-tight">{category.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Frequency *</label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {(["daily", "weekly", "monthly", "yearly", "custom"] as const).map((freq) => (
                        <button
                          key={freq}
                          onClick={() => setFormFrequency(freq)}
                          className={`py-2 rounded-xl transition-all text-xs font-medium capitalize ${formFrequency === freq
                            ? "bg-primary text-primary-foreground shadow-lg"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                            }`}
                        >
                          {freq}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Day Selector */}
                  {(formFrequency === "weekly" || formFrequency === "daily" || formFrequency === "custom") && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <label className="text-sm text-muted-foreground block">
                        Repeat On {(formFrequency === "daily" || formFrequency === "weekly") && <span className="text-xs text-muted-foreground/70">(Optional override)</span>}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => {
                          const isSelected = formRepeatDays.includes(day);
                          return (
                            <button
                              key={day}
                              onClick={() => {
                                const newDays = isSelected
                                  ? formRepeatDays.filter((d) => d !== day)
                                  : [...formRepeatDays, day];
                                setFormRepeatDays(newDays);
                              }}
                              className={`w-9 h-9 rounded-full text-xs font-medium transition-all ${isSelected
                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                                : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                                }`}
                            >
                              {day.charAt(0)}
                            </button>
                          );
                        })}
                      </div>
                      {formRepeatDays.length === 0 && formFrequency === "custom" && (
                        <p className="text-xs text-destructive mt-1">Please select at least one day.</p>
                      )}
                    </motion.div>
                  )}

                  {/* Start Date */}
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">Start Date *</label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full bg-muted/30 border border-border/50 rounded-xl py-3 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {/* Payment Method */}
                  {formType === "expense" && (
                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">Payment Method (Optional)</label>
                      <div className="grid grid-cols-3 gap-2">
                        {paymentMethods.map((method) => (
                          <button
                            key={method.id}
                            onClick={() => setFormPaymentMethod(method.id)}
                            className={`flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-xl transition-all ${formPaymentMethod === method.id
                              ? "bg-primary text-primary-foreground shadow-lg"
                              : "bg-muted/30 text-foreground hover:bg-muted/50"
                              }`}
                          >
                            <span className="text-xl sm:text-2xl">{method.icon}</span>
                            <span className="text-xs font-medium">{method.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Button */}
              <div className="pt-4 border-t border-border/30 flex-shrink-0">
                <button
                  onClick={handleUpdatePayment}
                  disabled={!formName || !formAmount || !formCategory}
                  className="w-full py-3 sm:py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg"
                >
                  Update Payment
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
