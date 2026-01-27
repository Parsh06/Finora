import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import { Sparkles, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToBudgets, subscribeToTransactions, Budget, Transaction, addBudget, updateBudget, deleteBudget } from "@/lib/firestore";
import { toast } from "sonner";
import { AIBudgetCreator } from "./AIBudgetCreator";
import { useCategories } from "@/hooks/useCategories";

const getStatusColor = (percentage: number) => {
  if (percentage >= 100) return "bg-destructive";
  if (percentage >= 80) return "bg-warning";
  return "bg-primary";
};

const getStatusTextColor = (percentage: number) => {
  if (percentage >= 100) return "text-destructive";
  if (percentage >= 80) return "text-warning";
  return "text-primary";
};

export const BudgetManagement = () => {
  const { currentUser } = useAuth();
  const { expenseCategories, getCategoryIcon } = useCategories();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAICreator, setShowAICreator] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  
  // Form state
  const [selectedCategory, setSelectedCategory] = useState("");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [budgetPeriod, setBudgetPeriod] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribeBudgets = subscribeToBudgets(currentUser.uid, (data) => {
      setBudgets(data);
      setLoading(false);
    });

    const unsubscribeTransactions = subscribeToTransactions(currentUser.uid, (data) => {
      setTransactions(data);
    });

    return () => {
      unsubscribeBudgets();
      unsubscribeTransactions();
    };
  }, [currentUser]);

  // Format categories for display
  const formattedCategories = expenseCategories.map(cat => ({
    id: cat.name, // Use name as id for consistency
    label: cat.name,
    icon: cat.icon,
    color: cat.color,
  }));

  // Calculate spent amount for each budget based on transactions
  const budgetsWithSpent = budgets.map((budget) => {
    const now = new Date();
    const startOfPeriod = new Date();
    
    if (budget.period === "weekly") {
      startOfPeriod.setDate(now.getDate() - 7);
    } else if (budget.period === "monthly") {
      startOfPeriod.setMonth(now.getMonth() - 1);
    } else {
      startOfPeriod.setFullYear(now.getFullYear() - 1);
    }

    const spent = transactions
      .filter((t) => {
        const date = t.date instanceof Date ? t.date : t.date.toDate();
        return (
          t.type === "expense" &&
          t.category.toLowerCase() === budget.category.toLowerCase() &&
          date >= startOfPeriod
        );
      })
      .reduce((sum, t) => sum + t.amount, 0);

    return { ...budget, spent };
  });

  const totalBudget = budgetsWithSpent.reduce((sum, b) => sum + b.limit, 0);
  const totalSpent = budgetsWithSpent.reduce((sum, b) => sum + b.spent, 0);
  const overallPercentage = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  // Calculate AI suggestion based on actual budget data
  const aiSuggestion = useMemo(() => {
    if (budgetsWithSpent.length === 0) {
      return {
        title: "Get Started",
        message: "Create your first budget to start tracking your spending and get personalized recommendations!",
        type: "info" as const
      };
    }

    // Find budgets that are over limit
    const overBudget = budgetsWithSpent.filter(b => {
      const percentage = Math.round((b.spent / b.limit) * 100);
      return percentage >= 100;
    });

    if (overBudget.length > 0) {
      const topOverBudget = overBudget.sort((a, b) => {
        const aPct = Math.round((a.spent / a.limit) * 100);
        const bPct = Math.round((b.spent / b.limit) * 100);
        return bPct - aPct;
      })[0];
      
      const overAmount = topOverBudget.spent - topOverBudget.limit;
      const categoryLabel = topOverBudget.category.charAt(0).toUpperCase() + topOverBudget.category.slice(1);
      
      return {
        title: "Budget Alert",
        message: `Your ${categoryLabel} budget is over limit by ₹${overAmount.toLocaleString()}. Consider reducing spending or adjusting your budget.`,
        type: "warning" as const
      };
    }

    // Find budgets that are close to limit (80-99%)
    const warningBudget = budgetsWithSpent.find(b => {
      const percentage = Math.round((b.spent / b.limit) * 100);
      return percentage >= 80 && percentage < 100;
    });

    if (warningBudget) {
      const remaining = warningBudget.limit - warningBudget.spent;
      const categoryLabel = warningBudget.category.charAt(0).toUpperCase() + warningBudget.category.slice(1);
      
      return {
        title: "Budget Warning",
        message: `Your ${categoryLabel} budget is ${Math.round((warningBudget.spent / warningBudget.limit) * 100)}% used. Only ₹${remaining.toLocaleString()} remaining.`,
        type: "warning" as const
      };
    }

    // Find budgets with good savings
    const goodBudgets = budgetsWithSpent.filter(b => {
      const percentage = Math.round((b.spent / b.limit) * 100);
      return percentage < 50;
    });

    if (goodBudgets.length > 0) {
      return {
        title: "Great Job!",
        message: `You're doing well with ${goodBudgets.length} budget${goodBudgets.length > 1 ? 's' : ''} under 50% usage. Keep it up!`,
        type: "success" as const
      };
    }

    return {
      title: "On Track",
      message: "All your budgets are within limits. Keep monitoring to maintain healthy spending habits!",
      type: "info" as const
    };
  }, [budgetsWithSpent]);

  const handleAddClick = () => {
    setSelectedCategory("");
    setBudgetLimit("");
    setBudgetPeriod("monthly");
    setShowAddModal(true);
  };

  const handleEditClick = (budget: Budget) => {
    setEditingBudget(budget);
    setSelectedCategory(budget.category);
    setBudgetLimit(budget.limit.toString());
    setBudgetPeriod(budget.period);
    setShowEditModal(true);
  };

  const handleSaveBudget = async () => {
    if (!currentUser || !selectedCategory || !budgetLimit) {
      toast.error("Please fill in all fields");
      return;
    }

    const limitNum = parseFloat(budgetLimit);
    if (isNaN(limitNum) || limitNum <= 0) {
      toast.error("Please enter a valid budget amount");
      return;
    }

    setIsSaving(true);

    try {
      const categoryData = formattedCategories.find(cat => cat.id === selectedCategory);
      const icon = categoryData?.icon || getCategoryIcon(selectedCategory, "expense");

      if (showAddModal) {
        // Add new budget
        await addBudget(currentUser.uid, {
          category: selectedCategory,
          icon: icon,
          limit: limitNum,
          spent: 0,
          period: budgetPeriod,
        });
        toast.success("Budget added successfully!");
        setShowAddModal(false);
      } else if (showEditModal && editingBudget) {
        // Update existing budget
        await updateBudget(currentUser.uid, editingBudget.id!, {
          category: selectedCategory,
          icon: icon,
          limit: limitNum,
          period: budgetPeriod,
        });
        toast.success("Budget updated successfully!");
        setShowEditModal(false);
        setEditingBudget(null);
      }

      // Reset form
      setSelectedCategory("");
      setBudgetLimit("");
      setBudgetPeriod("monthly");
    } catch (error) {
      console.error("Error saving budget:", error);
      toast.error("Failed to save budget. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (budgetId: string) => {
    if (!currentUser) return;
    if (!confirm("Are you sure you want to delete this budget?")) return;
    
    try {
      await deleteBudget(currentUser.uid, budgetId);
      toast.success("Budget deleted successfully");
    } catch (error) {
      console.error("Error deleting budget:", error);
      toast.error("Failed to delete budget");
    }
  };

  const closeModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setEditingBudget(null);
    setSelectedCategory("");
    setBudgetLimit("");
    setBudgetPeriod("monthly");
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="px-4 sm:px-5 pt-4 sm:pt-6 pb-4">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Budgets</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">Manage your spending limits</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <motion.button
              onClick={() => setShowAICreator(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-primary to-accent flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium text-primary-foreground"
            >
              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">AI Create</span>
              <span className="sm:hidden">AI</span>
            </motion.button>
            <motion.button
              onClick={handleAddClick}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
            </motion.button>
          </div>
        </div>
      </header>

      {/* Overall Budget Card */}
      {budgetsWithSpent.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-4 sm:px-5 mb-4 sm:mb-6"
        >
          <div className="glass-card-elevated p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4 gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-muted-foreground">Total Budget Overview</p>
                <p className="text-xl sm:text-2xl font-bold truncate">
                  ₹{totalSpent.toLocaleString()}{" "}
                  <span className="text-muted-foreground font-normal text-sm sm:text-base">
                    / ₹{totalBudget.toLocaleString()}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {budgetsWithSpent.length} budget{budgetsWithSpent.length > 1 ? 's' : ''} active
                </p>
              </div>
              <div className={`text-xl sm:text-2xl font-bold flex-shrink-0 ${getStatusTextColor(overallPercentage)}`}>
                {overallPercentage}%
              </div>
            </div>
            <div className="progress-bar h-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(overallPercentage, 100)}%` }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className={`h-full rounded-full ${getStatusColor(overallPercentage)}`}
              />
            </div>
            {overallPercentage >= 100 && (
              <p className="text-xs text-destructive mt-2">
                Over total budget by ₹{(totalSpent - totalBudget).toLocaleString()}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* AI Budget Suggestion */}
      {budgetsWithSpent.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="px-4 sm:px-5 mb-4 sm:mb-6"
        >
          <div className={`insight-card ${
            aiSuggestion.type === "warning" ? "border-warning/30 bg-warning/5" :
            aiSuggestion.type === "success" ? "border-success/30 bg-success/5" :
            "border-primary/30 bg-primary/5"
          }`}>
            <div className="flex items-start gap-2 sm:gap-3">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                aiSuggestion.type === "warning" ? "bg-warning/20" :
                aiSuggestion.type === "success" ? "bg-success/20" :
                "bg-primary/20"
              }`}>
                <Sparkles className={`w-4 h-4 sm:w-5 sm:h-5 ${
                  aiSuggestion.type === "warning" ? "text-warning" :
                  aiSuggestion.type === "success" ? "text-success" :
                  "text-primary"
                }`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-xs sm:text-sm font-medium mb-1 ${
                  aiSuggestion.type === "warning" ? "text-warning" :
                  aiSuggestion.type === "success" ? "text-success" :
                  "text-foreground"
                }`}>
                  {aiSuggestion.title}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {aiSuggestion.message}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Budget Categories */}
      <div className="px-4 sm:px-5">
        <h3 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Category Budgets</h3>
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm">Loading budgets...</p>
          </div>
        ) : budgetsWithSpent.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-8 sm:p-12 rounded-xl text-center"
          >
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">No budgets set yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first budget to track spending and stay on top of your finances!
            </p>
            <motion.button
              onClick={handleAddClick}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold flex items-center gap-2 mx-auto shadow-lg shadow-primary/25"
            >
              <Plus className="w-5 h-5" />
              Create Your First Budget
            </motion.button>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {budgetsWithSpent.map((budget, index) => {
            const percentage = Math.round((budget.spent / budget.limit) * 100);
            const isOverBudget = percentage >= 100;
            const isWarning = percentage >= 80 && percentage < 100;

            return (
              <motion.div
                key={budget.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.05 }}
                className={`glass-card p-4 ${
                  isOverBudget ? "border-destructive/50" : isWarning ? "border-warning/50" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-3 gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-secondary flex items-center justify-center text-lg sm:text-xl flex-shrink-0">
                        {getCategoryIcon(budget.category, "expense")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm sm:text-base truncate">{budget.category}</p>
                        <p className="text-xs text-muted-foreground capitalize">{budget.period}</p>
                      </div>
                    </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    <button 
                      onClick={() => handleEditClick(budget)}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-secondary flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
                    </button>
                    <button 
                      onClick={() => handleDelete(budget.id!)}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-secondary flex items-center justify-center hover:bg-destructive/20 transition-colors"
                    >
                      <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-2 text-xs sm:text-sm gap-2">
                  <span className="text-muted-foreground truncate min-w-0">
                    ₹{budget.spent.toLocaleString()} / ₹{budget.limit.toLocaleString()}
                  </span>
                  <span className={`font-medium flex-shrink-0 ${getStatusTextColor(percentage)}`}>
                    {percentage}%
                    {isOverBudget && " ⚠️"}
                  </span>
                </div>

                <div className="progress-bar">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(percentage, 100)}%` }}
                    transition={{ delay: 0.3 + index * 0.05, duration: 0.6 }}
                    className={`h-full rounded-full ${getStatusColor(percentage)}`}
                  />
                </div>

                {isOverBudget && (
                  <p className="text-xs text-destructive mt-2">
                    Over budget by ₹{(budget.spent - budget.limit).toLocaleString()}
                  </p>
                )}
              </motion.div>
            );
          })}
          </div>
        )}
      </div>

      {/* Add/Edit Budget Modal */}
      <AnimatePresence>
        {(showAddModal || showEditModal) && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModals}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            />

            {/* Modal */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-12 h-1.5 rounded-full bg-muted" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border/50">
                <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                  {showEditModal ? "Edit Budget" : "Add Budget"}
                </h2>
                <button
                  onClick={closeModals}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="px-4 sm:px-5 py-4 sm:py-6 space-y-4 sm:space-y-6">
                {/* Category Selection */}
                <div>
                  <label className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3 block">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {formattedCategories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition-all text-xs sm:text-sm font-medium ${
                          selectedCategory === category.id
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                            : "bg-secondary text-foreground hover:bg-muted"
                        }`}
                      >
                        <span>{category.icon}</span>
                        <span>{category.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Budget Amount */}
                <div>
                  <label className="text-xs sm:text-sm text-muted-foreground mb-2 block">Budget Amount</label>
                  <div className="glass-card p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                    <span className="text-xl sm:text-2xl text-muted-foreground flex-shrink-0">₹</span>
                    <input
                      type="number"
                      value={budgetLimit}
                      onChange={(e) => setBudgetLimit(e.target.value)}
                      placeholder="0.00"
                      className="bg-transparent text-2xl sm:text-3xl font-bold flex-1 outline-none text-foreground placeholder:text-muted min-w-0"
                    />
                  </div>
                </div>

                {/* Period Selection */}
                <div>
                  <label className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3 block">Period</label>
                  <div className="flex gap-2 sm:gap-3">
                    {(["weekly", "monthly", "yearly"] as const).map((period) => (
                      <button
                        key={period}
                        onClick={() => setBudgetPeriod(period)}
                        className={`flex-1 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-medium transition-all capitalize ${
                          budgetPeriod === period
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save Button */}
                <div className="pt-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSaveBudget}
                    disabled={!selectedCategory || !budgetLimit || isSaving}
                    className={`w-full py-3 sm:py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all text-sm sm:text-base ${
                      isSaving
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "text-primary-foreground disabled:opacity-50"
                    }`}
                    style={!isSaving ? { background: "var(--gradient-primary)" } : undefined}
                  >
                    {isSaving ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full"
                      />
                    ) : (
                      <>
                        <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                        {showEditModal ? "Update Budget" : "Add Budget"}
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* AI Budget Creator */}
      <AIBudgetCreator
        isOpen={showAICreator}
        onClose={() => setShowAICreator(false)}
        onBudgetCreated={() => {
          setShowAICreator(false);
          toast.success("Budgets created successfully!");
        }}
      />
    </div>
  );
};

export default BudgetManagement;
