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
  RecurringPayment as FirestoreRecurringPayment,
  getTransactions,
  Transaction
} from "@/lib/firestore";
import { format, parseISO, isBefore, isToday, differenceInDays, startOfDay, addDays, differenceInMonths, differenceInYears } from "date-fns";
import { calculateNextRunDate } from "@/lib/recurring-transactions";
import { toast } from "sonner";
import { useCategories } from "@/hooks/useCategories";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { calculateXIRR, getSIPCashflows, calculateRealReturn } from "@/lib/sip-utils";
import { updateSipPortfolioValue } from "@/lib/firestore";

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
  const { isPrivacyEnabled } = usePrivacy();
  const { expenseCategories, incomeCategories, getCategoryIcon } = useCategories();
  const [payments, setPayments] = useState<FirestoreRecurringPayment[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<FirestoreRecurringPayment | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "amount" | "nextDate" | "frequency">("nextDate");
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Form state
  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formFrequency, setFormFrequency] = useState<"daily" | "weekly" | "monthly" | "yearly" | "custom">("monthly");
  const [formRepeatDays, setFormRepeatDays] = useState<string[]>([]);
  const [formCategory, setFormCategory] = useState("");
  const [formType, setFormType] = useState<"expense" | "income">("expense");
  const [formPaymentMethod, setFormPaymentMethod] = useState("");
  const [formStartDate, setFormStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formNextRunDate, setFormNextRunDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formIsSIP, setFormIsSIP] = useState(false);
  const [formStepUpPercentage, setFormStepUpPercentage] = useState("10");
  const [formStepUpFrequency, setFormStepUpFrequency] = useState<"monthly" | "yearly">("yearly");
  const [formTaxBenefit80C, setFormTaxBenefit80C] = useState(false);
  const [formTaxBenefitNPS, setFormTaxBenefitNPS] = useState(false);
  const [showValueModal, setShowValueModal] = useState(false);
  const [updatingSip, setUpdatingSip] = useState<FirestoreRecurringPayment | null>(null);
  const [newValue, setNewValue] = useState("");
  const [showRealReturn, setShowRealReturn] = useState(false);
  const inflationRate = 0.055; // 5.5% CPI

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

    // Fetch transactions for SIP stats
    const fetchTransactions = async () => {
      const data = await getTransactions(currentUser.uid);
      setTransactions(data);
    };
    fetchTransactions();

    return () => unsubscribe();
  }, [currentUser]);

  // Auto-calculate nextRunDate when start date or frequency changes in the form
  useEffect(() => {
    // Only auto-update if we are in the Add modal or if we haven't manually changed the date significantly
    // For simplicity, just auto-compute when form details change
    try {
      const startDate = parseISO(formStartDate);
      const computedNextDate = calculateNextRunDate(startDate, formFrequency, startDate, formRepeatDays);
      setFormNextRunDate(format(computedNextDate, "yyyy-MM-dd"));
    } catch (e) {
      console.error("Error auto-calculating next run date:", e);
    }
  }, [formStartDate, formFrequency, formRepeatDays]);

  const blurClass = isPrivacyEnabled ? "blur-md select-none transition-all duration-300" : "transition-all duration-300";

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

  // Calculate SIP specific stats
  const sipStats = useMemo(() => {
    const sips = payments.filter(p => p.isSIP);
    const sipTransactions = transactions.filter(t => t.isRecurring && t.recurringPaymentId);
    
    const sipCounts = new Map<string, number>();
    sipTransactions.forEach(t => {
      if (sips.some(s => s.id === t.recurringPaymentId)) {
        sipCounts.set(t.recurringPaymentId!, (sipCounts.get(t.recurringPaymentId!) || 0) + 1);
      }
    });

    const totalInvested = sipTransactions.reduce((sum, t) => sum + t.amount, 0);

    const activeMonthlySIP = activePayments
      .filter(p => p.isSIP && p.type === "expense")
      .reduce((sum, p) => {
        if (p.frequency === "monthly") return sum + p.amount;
        if (p.frequency === "yearly") return sum + (p.amount / 12);
        return sum;
      }, 0);

    const nextYearProjectedSIP = activePayments
      .filter(p => p.isSIP && p.type === "expense")
      .reduce((sum, p) => {
        let amount = p.amount;
        if (p.isSIP && p.stepUpPercentage) {
          amount *= (1 + p.stepUpPercentage / 100);
        }
        if (p.frequency === "monthly") return sum + amount;
        if (p.frequency === "yearly") return sum + (amount / 12);
        return sum;
      }, 0);

    // Calculate Portfolio XIRR
    const allPortfolioValue = sips.reduce((sum, s) => sum + (s.currentValue || 0), 0);
    const { cashflows: allCashflows, dates: allDates } = getSIPCashflows(sipTransactions, allPortfolioValue);
    const portfolioXIRR = calculateXIRR(allCashflows, allDates);

    return {
      totalInvested,
      totalCurrentValue: allPortfolioValue,
      portfolioXIRR,
      activeMonthlySIP,
      nextYearProjectedSIP,
      activeSipCount: sips.filter(s => (s.status || (s.isActive ? "active" : "paused")) === "active").length,
      sipCounts
    };
  }, [payments, transactions, activePayments]);

  const getTenureString = (startDateStr: string) => {
    try {
      const start = parseISO(startDateStr);
      const today = new Date();
      const years = differenceInYears(today, start);
      const months = differenceInMonths(today, start) % 12;

      if (years === 0 && months === 0) return "Just started";
      if (years === 0) return `${months} mo active`;
      if (months === 0) return `${years} yr active`;
      return `${years} yr ${months} mo active`;
    } catch (e) {
      return "Active";
    }
  };

  const togglePayment = async (id: string) => {
    if (!currentUser) return;
    const payment = payments.find(p => p.id === id);
    if (!payment) return;

    try {
      const currentStatus = payment.status || (payment.isActive ? "active" : "paused");
      const newStatus = currentStatus === "active" ? "paused" : "active";
      const today = startOfDay(new Date());

      if (newStatus === "paused") {
        // Pausing: Store remaining days until next trigger
        const nextDate = parseISO(payment.nextRunDate || payment.nextDate || format(today, "yyyy-MM-dd"));
        const remainingDays = Math.max(0, differenceInDays(startOfDay(nextDate), today));

        await updateRecurringPayment(currentUser.uid, id, {
          status: newStatus,
          pausedAt: format(today, "yyyy-MM-dd"),
          remainingDays: remainingDays
        });
        toast.info(`Paused: ${remainingDays} days were pending`);
      } else {
        // Resuming: Calculate new next run date based on preserved remaining days
        const remainingDays = payment.remainingDays || 0;
        const newNextRunDate = addDays(today, remainingDays);

        await updateRecurringPayment(currentUser.uid, id, {
          status: newStatus,
          nextRunDate: format(newNextRunDate, "yyyy-MM-dd")
        });
        toast.success(`Resumed: Next trigger in ${remainingDays} days`);
      }
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
    setFormNextRunDate(format(new Date(), "yyyy-MM-dd"));
    setFormRepeatDays([]);
    setFormIsSIP(false);
    setFormStepUpPercentage("10");
    setFormStepUpFrequency("yearly");
    setFormTaxBenefit80C(false);
    setFormTaxBenefitNPS(false);
    setEditingPayment(null);
  };

  const handleUpdateSipValue = async () => {
    if (!currentUser || !updatingSip || !newValue) return;
    
    try {
      const value = parseFloat(newValue);
      if (isNaN(value) || value < 0) {
        toast.error("Please enter a valid value");
        return;
      }

      await updateSipPortfolioValue(currentUser.uid, updatingSip.id!, value);
      toast.success("Portfolio value updated");
      setShowValueModal(false);
      setUpdatingSip(null);
      setNewValue("");
    } catch (error) {
      console.error("Error updating SIP value:", error);
      toast.error("Failed to update value");
    }
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
    setFormNextRunDate(payment.nextRunDate || payment.nextDate || format(new Date(), "yyyy-MM-dd"));
    setFormIsSIP(payment.isSIP || false);
    setFormStepUpPercentage(payment.stepUpPercentage?.toString() || "10");
    setFormStepUpFrequency(payment.stepUpFrequency || "yearly");
    setFormTaxBenefit80C(payment.taxBenefit80C || false);
    setFormTaxBenefitNPS(payment.taxBenefitNPS || false);
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
      const nextRunDate = parseISO(formNextRunDate);

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
        isSIP: formIsSIP,
        stepUpPercentage: formIsSIP ? parseFloat(formStepUpPercentage) : undefined,
        stepUpFrequency: formIsSIP ? formStepUpFrequency : undefined,
        lastStepUpDate: formIsSIP ? format(startDate, "yyyy-MM-dd") : undefined,
        taxBenefit80C: formTaxBenefit80C,
        taxBenefitNPS: formTaxBenefitNPS,
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

      let nextRunDate = parseISO(formNextRunDate);

      if (frequencyChanged || startDateChanged || repeatDaysChanged) {
        // Recalculate next run date based on new frequency/startDate IF the user didn't manually edit the nextRunDate input
        // Since we have a manual input now, we only recalculate if the user hasn't explicitly set a different one
        // For simplicity, if they change the anchor fields, we suggest a new next date unless they manually edited it.
        if (formNextRunDate === (editingPayment.nextRunDate || editingPayment.nextDate)) {
          nextRunDate = calculateNextRunDate(startDate, formFrequency, startDate, formRepeatDays);
        }
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
        isSIP: formIsSIP,
        stepUpPercentage: formIsSIP ? parseFloat(formStepUpPercentage) : undefined,
        stepUpFrequency: formIsSIP ? formStepUpFrequency : undefined,
        taxBenefit80C: formTaxBenefit80C,
        taxBenefitNPS: formTaxBenefitNPS,
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
            <p className={`text-lg sm:text-xl font-bold text-destructive ${blurClass}`}>₹{Math.round(stats.monthlyExpenses).toLocaleString()}</p>
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
            <p className={`text-lg sm:text-xl font-bold text-success ${blurClass}`}>₹{Math.round(stats.monthlyIncome).toLocaleString()}</p>
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
            <p className={`text-lg sm:text-xl font-bold ${stats.totalMonthly >= 0 ? "text-success" : "text-destructive"} ${blurClass}`}>
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

        {/* SIP Analysis Header */}
        <AnimatePresence>
          {sipStats.activeSipCount > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-6 sm:mt-8 overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">SIP Performance Analysis</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="glass-card-elevated p-4 rounded-xl border-l-4 border-l-primary relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-5">
                    <TrendingUp className="w-12 h-12" />
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Total SIP Capital</p>
                  <p className={`text-xl font-black text-foreground ${blurClass}`}>₹{sipStats.totalInvested.toLocaleString()}</p>
                  <p className="text-[10px] text-primary mt-1">Sum of all SIP deposits</p>
                </div>

                <div className="glass-card-elevated p-4 rounded-xl border-l-4 border-l-indigo-500 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-5">
                    <RefreshCw className="w-12 h-12" />
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Portfolio Value</p>
                  <p className={`text-xl font-black text-foreground ${blurClass}`}>₹{sipStats.totalCurrentValue.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Total of all SIP current values</p>
                </div>

                <div className="glass-card-elevated p-4 rounded-xl border-l-4 border-l-success relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-5">
                    <Zap className="w-12 h-12" />
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Portfolio XIRR</p>
                  <p className={`text-xl font-black text-success ${blurClass}`}>
                    {(sipStats.portfolioXIRR * 100).toFixed(1)}%
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] text-success">Real: {((sipStats.portfolioXIRR - inflationRate) * 100).toFixed(1)}%</span>
                  </div>
                </div>

                <div className="glass-card-elevated p-4 rounded-xl border-l-4 border-l-accent relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-5">
                    <Clock className="w-12 h-12" />
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Active Plans</p>
                  <p className={`text-xl font-black text-accent ${blurClass}`}>{sipStats.activeSipCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Across all fund houses</p>
                </div>
              </div>

              {/* Real Return Toggle */}
              <div className="mt-4 flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/30">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Inflation-Adjusted Returns</h4>
                  <p className="text-[10px] text-muted-foreground">Showing real growth (XIRR - {inflationRate * 100}% CPI)</p>
                </div>
                <button
                  onClick={() => setShowRealReturn(!showRealReturn)}
                  className={`w-12 h-6 rounded-full p-1 transition-colors ${showRealReturn ? "bg-primary" : "bg-muted"}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showRealReturn ? "translate-x-6" : "translate-x-0"}`} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
              className="nice-select !h-9 !w-32 !px-3"
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
                          {payment.isSIP && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/20 text-primary font-bold flex-shrink-0 flex items-center gap-1">
                              <TrendingUp className="w-2.5 h-2.5" />
                              SIP {payment.stepUpPercentage}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-muted-foreground flex-wrap">
                          <span className={`capitalize ${payment.type === "income" ? "text-success font-medium" : ""}`}>
                            {payment.type || "expense"}
                          </span>
                          {payment.isSIP && (
                            <>
                              <span>•</span>
                              <span className="text-primary font-medium">Step-up {payment.stepUpFrequency}</span>
                            </>
                          )}
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
                        {payment.isSIP && (
                          <div className="mt-2 flex items-center gap-3">
                            <div className="flex items-center gap-1 text-[10px] text-primary/80 font-medium">
                                <Clock className="w-3 h-3" />
                                {getTenureString(payment.startDate)}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-success/80 font-medium border-l border-border/30 pl-3">
                                <DollarSign className="w-3 h-3" />
                                ₹{((sipStats.sipCounts.get(payment.id!) || 0) * payment.amount).toLocaleString()} total
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold text-sm sm:text-base ${payment.type === "income" ? "text-success" : "text-foreground"} ${blurClass}`}>
                          {payment.type === "income" ? "+" : ""}₹{payment.amount.toLocaleString()}
                        </p>
                        <p className={`text-xs ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : daysUntil < 0 ? `${Math.abs(daysUntil)}d ago` : `In ${daysUntil}d`}
                        </p>
                      </div>
                    </div>

                    {/* SIP Performance Section */}
                    {payment.isSIP && (
                      <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Performance Metrics</p>
                          <button 
                            onClick={() => {
                              setUpdatingSip(payment);
                              setNewValue(payment.currentValue?.toString() || "");
                              setShowValueModal(true);
                            }}
                            className="text-[10px] text-primary font-bold hover:underline"
                          >
                            Update Value
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-2 rounded-lg bg-background/50">
                            <p className="text-[10px] text-muted-foreground mb-0.5">Value</p>
                            <p className="text-xs font-black text-foreground">₹{(payment.currentValue || 0).toLocaleString()}</p>
                          </div>
                          
                          {(() => {
                            const sipTransactions = transactions.filter(t => t.recurringPaymentId === payment.id);
                            const { cashflows, dates } = getSIPCashflows(sipTransactions, payment.currentValue);
                            const xirrValue = calculateXIRR(cashflows, dates);
                            const realReturnValue = calculateRealReturn(xirrValue, inflationRate);
                            
                            return (
                              <>
                                <div className="text-center p-2 rounded-lg bg-background/50">
                                  <p className="text-[10px] text-muted-foreground mb-0.5">XIRR</p>
                                  <p className={`text-xs font-black ${xirrValue >= 0 ? "text-success" : "text-destructive"}`}>
                                    {(xirrValue * 100).toFixed(1)}%
                                  </p>
                                </div>
                                <div className="text-center p-2 rounded-lg bg-background/50">
                                  <p className="text-[10px] text-muted-foreground mb-0.5">{showRealReturn ? "Real" : "MoM"}</p>
                                  <p className="text-xs font-black text-primary">
                                    {showRealReturn ? (realReturnValue * 100).toFixed(1) : "---"}%
                                  </p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}

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

                    <div className="flex flex-col items-end gap-1">
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
                      {status === "paused" && payment.remainingDays !== undefined && (
                        <span className="text-[10px] text-yellow-500 font-medium">
                          {payment.remainingDays}d preserved
                        </span>
                      )}
                    </div>
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

                  {/* Next Run Date */}
                  <div className="pt-2">
                    <label className="text-sm font-medium text-primary mb-2 block flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Next Payment Date
                    </label>
                    <input
                      type="date"
                      value={formNextRunDate}
                      onChange={(e) => setFormNextRunDate(e.target.value)}
                      className="w-full bg-primary/5 border border-primary/20 rounded-xl py-3 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1 px-1">
                      <AlertCircle className="w-3 h-3" />
                      When the first payment should trigger.
                    </p>
                  </div>

                  {/* SIP Step-up Section */}
                  <div className="pt-4 border-t border-border/30">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Step-up SIP</p>
                          <p className="text-[10px] text-muted-foreground font-normal">Automatically increase amount over time</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormIsSIP(!formIsSIP)}
                        className={`relative w-11 h-6 rounded-full transition-all ${formIsSIP ? "bg-primary" : "bg-muted/50"}`}
                      >
                        <motion.div
                          className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
                          animate={{ left: formIsSIP ? "calc(100% - 20px)" : "4px" }}
                        />
                      </button>
                    </div>

                    <AnimatePresence>
                      {formIsSIP && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-4 overflow-hidden"
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1.5 block">Increase (%)</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  value={formStepUpPercentage}
                                  onChange={(e) => setFormStepUpPercentage(e.target.value)}
                                  className="w-full bg-muted/30 border border-border/50 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
                                  placeholder="10"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1.5 block">Frequency</label>
                              <select
                                value={formStepUpFrequency}
                                onChange={(e) => setFormStepUpFrequency(e.target.value as any)}
                                className="nice-select"
                              >
                                <option value="monthly">Every Month</option>
                                <option value="yearly">Every Year</option>
                              </select>
                            </div>
                          </div>
                          <p className="text-[10px] text-primary/70 bg-primary/5 p-2 rounded-lg border border-primary/10">
                            💡 Example: ₹1,000 will become ₹{Math.round(1000 * (1 + parseFloat(formStepUpPercentage || "10") / 100)).toLocaleString()} after your first {formStepUpFrequency === "monthly" ? "month" : "year"}.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Tax Benefits */}
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${formTaxBenefit80C ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            <Check className={`w-4 h-4 ${formTaxBenefit80C ? "opacity-100" : "opacity-0"}`} />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">Tax Benefit (Section 80C)</p>
                            <p className="text-[10px] text-muted-foreground">ELSS, LIC, etc. (Max ₹1.5L)</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormTaxBenefit80C(!formTaxBenefit80C)}
                          className={`relative w-10 h-5 rounded-full transition-all ${formTaxBenefit80C ? "bg-primary" : "bg-muted/50"}`}
                        >
                          <motion.div
                            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
                            animate={{ left: formTaxBenefit80C ? "calc(100% - 18px)" : "2px" }}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${formTaxBenefitNPS ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            <Check className={`w-4 h-4 ${formTaxBenefitNPS ? "opacity-100" : "opacity-0"}`} />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">Tax Benefit (Section 80CCD - NPS)</p>
                            <p className="text-[10px] text-muted-foreground">National Pension Scheme (Max ₹50k)</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormTaxBenefitNPS(!formTaxBenefitNPS)}
                          className={`relative w-10 h-5 rounded-full transition-all ${formTaxBenefitNPS ? "bg-primary" : "bg-muted/50"}`}
                        >
                          <motion.div
                            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
                            animate={{ left: formTaxBenefitNPS ? "calc(100% - 18px)" : "2px" }}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
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

                  {/* Next Run Date */}
                  <div className="pt-2">
                    <label className="text-sm font-medium text-primary mb-2 block flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Next Payment Date
                    </label>
                    <input
                      type="date"
                      value={formNextRunDate}
                      onChange={(e) => setFormNextRunDate(e.target.value)}
                      className="w-full bg-primary/5 border border-primary/20 rounded-xl py-3 px-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1 px-1">
                      <AlertCircle className="w-3 h-3" />
                      Manually override when the next transaction will trigger.
                    </p>
                  </div>

                  {/* SIP Step-up Section (Edit) */}
                  <div className="pt-4 border-t border-border/30">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Step-up SIP</p>
                          <p className="text-[10px] text-muted-foreground font-normal">Automatically increase amount over time</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormIsSIP(!formIsSIP)}
                        className={`relative w-11 h-6 rounded-full transition-all ${formIsSIP ? "bg-primary" : "bg-muted/50"}`}
                      >
                        <motion.div
                          className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
                          animate={{ left: formIsSIP ? "calc(100% - 20px)" : "4px" }}
                        />
                      </button>
                    </div>

                    <AnimatePresence>
                      {formIsSIP && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-4 overflow-hidden"
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1.5 block">Increase (%)</label>
                              <div className="relative">
                                <input
                                  type="number"
                                  value={formStepUpPercentage}
                                  onChange={(e) => setFormStepUpPercentage(e.target.value)}
                                  className="w-full bg-muted/30 border border-border/50 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
                                  placeholder="10"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1.5 block">Frequency</label>
                              <select
                                value={formStepUpFrequency}
                                onChange={(e) => setFormStepUpFrequency(e.target.value as any)}
                                className="nice-select"
                              >
                                <option value="monthly">Every Month</option>
                                <option value="yearly">Every Year</option>
                              </select>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Tax Benefits (Edit) */}
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${formTaxBenefit80C ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            <Check className={`w-4 h-4 ${formTaxBenefit80C ? "opacity-100" : "opacity-0"}`} />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">Tax Benefit (Section 80C)</p>
                            <p className="text-[10px] text-muted-foreground">ELSS, LIC, etc. (Max ₹1.5L)</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormTaxBenefit80C(!formTaxBenefit80C)}
                          className={`relative w-10 h-5 rounded-full transition-all ${formTaxBenefit80C ? "bg-primary" : "bg-muted/50"}`}
                        >
                          <motion.div
                            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
                            animate={{ left: formTaxBenefit80C ? "calc(100% - 18px)" : "2px" }}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${formTaxBenefitNPS ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            <Check className={`w-4 h-4 ${formTaxBenefitNPS ? "opacity-100" : "opacity-0"}`} />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">Tax Benefit (Section 80CCD - NPS)</p>
                            <p className="text-[10px] text-muted-foreground">National Pension Scheme (Max ₹50k)</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormTaxBenefitNPS(!formTaxBenefitNPS)}
                          className={`relative w-10 h-5 rounded-full transition-all ${formTaxBenefitNPS ? "bg-primary" : "bg-muted/50"}`}
                        >
                          <motion.div
                            className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
                            animate={{ left: formTaxBenefitNPS ? "calc(100% - 18px)" : "2px" }}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
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

      {/* Update SIP Value Modal */}
      <AnimatePresence>
        {showValueModal && updatingSip && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowValueModal(false)}
            />
            <motion.div
              className="relative w-full max-w-sm bg-card rounded-2xl p-6 shadow-2xl border border-primary/20"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <h3 className="text-lg font-bold text-foreground mb-2">Update Portfolio Value</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Enter the current value of your <strong>{updatingSip.name}</strong> investment from your fund app.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-black text-muted-foreground mb-1 block">Current Value (₹)</label>
                  <input
                    type="number"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="e.g. 50000"
                    className="nice-input !text-lg !font-black !py-4"
                    autoFocus
                  />
                </div>
                
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setShowValueModal(false)}
                    className="flex-1 py-3 rounded-xl bg-muted/30 text-muted-foreground font-bold text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateSipValue}
                    className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20"
                  >
                    Update
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
