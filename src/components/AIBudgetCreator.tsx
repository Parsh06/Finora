import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  X, 
  Check, 
  Edit2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  Target,
  PiggyBank
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToTransactions, subscribeToRecurringPayments, addBudget, Transaction, RecurringPayment } from "@/lib/firestore";
import { toast } from "sonner";

interface AIBudgetCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onBudgetCreated?: () => void;
}

interface BudgetQuestionnaire {
  duration: "weekly" | "monthly" | "yearly" | "";
  primaryGoal: "save_more" | "control_spending" | "plan_purchase" | "maintain_lifestyle" | "";
  savingsPriority: "aggressive" | "balanced" | "relaxed" | "";
  fixedExpensesComfort: "dont_touch" | "slightly_optimize" | "reduce_aggressively" | "";
  customInput: string;
}

interface GeneratedBudget {
  category: string;
  limit: number;
  icon: string;
}

interface BudgetPreview {
  period: "weekly" | "monthly" | "yearly";
  totalIncome: number;
  recommendedSavings: number;
  budgets: GeneratedBudget[];
}

const categoryIcons: Record<string, string> = {
  food: "🍔",
  transport: "🚗",
  shopping: "🛍️",
  entertainment: "🎬",
  bills: "📄",
  health: "💊",
  education: "📚",
  other: "📦",
};

const categoryLabels: Record<string, string> = {
  food: "Food",
  transport: "Transport",
  shopping: "Shopping",
  entertainment: "Entertainment",
  bills: "Bills",
  health: "Health",
  education: "Education",
  other: "Other",
};

export const AIBudgetCreator = ({ isOpen, onClose, onBudgetCreated }: AIBudgetCreatorProps) => {
  const { currentUser } = useAuth();
  const [stage, setStage] = useState<"questionnaire" | "generating" | "preview" | "saving">("questionnaire");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [questionnaire, setQuestionnaire] = useState<BudgetQuestionnaire>({
    duration: "",
    primaryGoal: "",
    savingsPriority: "",
    fixedExpensesComfort: "",
    customInput: "",
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [generatedBudget, setGeneratedBudget] = useState<BudgetPreview | null>(null);
  const [editableBudgets, setEditableBudgets] = useState<GeneratedBudget[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>("");

  // Fetch financial data
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const unsubscribeTransactions = subscribeToTransactions(currentUser.uid, (data) => {
      setTransactions(data);
    });

    const unsubscribeRecurring = subscribeToRecurringPayments(currentUser.uid, (data) => {
      setRecurringPayments(data);
    });

    return () => {
      unsubscribeTransactions();
      unsubscribeRecurring();
    };
  }, [isOpen, currentUser]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStage("questionnaire");
      setCurrentQuestion(0);
      setQuestionnaire({
        duration: "",
        primaryGoal: "",
        savingsPriority: "",
        fixedExpensesComfort: "",
        customInput: "",
      });
      setGeneratedBudget(null);
      setEditableBudgets([]);
      setError("");
    }
  }, [isOpen]);

  const questions = [
    {
      id: "duration",
      title: "Budget Duration",
      subtitle: "How long should this budget last?",
      type: "mcq" as const,
      options: [
        { value: "weekly", label: "Weekly", icon: "📅" },
        { value: "monthly", label: "Monthly", icon: "📆" },
        { value: "yearly", label: "Yearly", icon: "🗓️" },
      ],
    },
    {
      id: "primaryGoal",
      title: "Primary Goal",
      subtitle: "What's your main objective?",
      type: "mcq" as const,
      options: [
        { value: "save_more", label: "Save more money", icon: "💰" },
        { value: "control_spending", label: "Control overspending", icon: "📊" },
        { value: "plan_purchase", label: "Plan for a purchase", icon: "🎯" },
        { value: "maintain_lifestyle", label: "Maintain current lifestyle", icon: "✨" },
      ],
    },
    {
      id: "savingsPriority",
      title: "Savings Priority",
      subtitle: "How aggressive should savings be?",
      type: "mcq" as const,
      options: [
        { value: "aggressive", label: "Aggressive (high savings)", icon: "🚀" },
        { value: "balanced", label: "Balanced", icon: "⚖️" },
        { value: "relaxed", label: "Relaxed", icon: "😌" },
      ],
    },
    {
      id: "fixedExpensesComfort",
      title: "Fixed Expenses",
      subtitle: "How should we handle fixed expenses?",
      type: "mcq" as const,
      options: [
        { value: "dont_touch", label: "Don't touch fixed expenses", icon: "🔒" },
        { value: "slightly_optimize", label: "Slightly optimize", icon: "🔧" },
        { value: "reduce_aggressively", label: "Reduce aggressively", icon: "✂️" },
      ],
    },
    {
      id: "customInput",
      title: "Additional Context",
      subtitle: "Any upcoming expenses or goals? (Optional)",
      type: "text" as const,
      placeholder: "e.g., Trip next month, Buying a phone, Loan repayment",
    },
  ];

  const handleAnswer = (questionId: keyof BudgetQuestionnaire, value: string) => {
    setQuestionnaire((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleNext = () => {
    const question = questions[currentQuestion];
    if (question.type === "mcq" && !questionnaire[question.id as keyof BudgetQuestionnaire]) {
      toast.error("Please select an option");
      return;
    }
    
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      generateBudget();
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const generateBudget = async () => {
    if (!currentUser) {
      toast.error("Please sign in");
      return;
    }

    setStage("generating");
    setIsProcessing(true);
    setError("");

    try {
      // Calculate financial context
      const now = new Date();
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(now.getMonth() - 6);

      // Filter recent transactions
      const recentTransactions = transactions.filter((t) => {
        const date = t.date instanceof Date ? t.date : t.date.toDate();
        return date >= sixMonthsAgo;
      });

      // Calculate category-wise expenses
      const categoryExpenses: Record<string, number> = {};
      recentTransactions
        .filter((t) => t.type === "expense")
        .forEach((t) => {
          const category = t.category.toLowerCase();
          categoryExpenses[category] = (categoryExpenses[category] || 0) + t.amount;
        });

      // Calculate average monthly expenses first (needed for income estimation)
      const monthlyExpenses = Object.values(categoryExpenses).reduce((sum, amt) => sum + amt, 0) / 6;

      // Calculate recurring expenses
      const recurringExpenses = recurringPayments
        .filter((p) => p.type === "expense" && p.status === "active")
        .reduce((sum, p) => {
          // Convert to monthly equivalent
          let monthlyAmount = p.amount;
          if (p.frequency === "weekly") monthlyAmount = p.amount * 4.33;
          else if (p.frequency === "yearly") monthlyAmount = p.amount / 12;
          return sum + monthlyAmount;
        }, 0);

      // Calculate total income
      const totalIncome = recentTransactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0);

      // Calculate average monthly income
      // If no income transactions or income is too low, estimate from expenses + buffer
      let monthlyIncome = totalIncome / 6;
      if (monthlyIncome === 0 || monthlyIncome < 1000) {
        // If no income data, estimate income as total expenses (including recurring) + 20% buffer
        const totalMonthlyExpenses = monthlyExpenses + recurringExpenses;
        const estimatedIncome = totalMonthlyExpenses > 0 ? totalMonthlyExpenses * 1.2 : 50000;
        monthlyIncome = estimatedIncome;
        console.warn("No income data found or income too low, using estimated income:", monthlyIncome);
      }

      // Build context for AI
      const financialContext = {
        monthlyIncome: monthlyIncome || 0,
        monthlyExpenses: monthlyExpenses || 0,
        recurringExpenses: recurringExpenses || 0,
        categoryExpenses,
        averageSavings: monthlyIncome - monthlyExpenses,
        questionnaire,
      };

      // Generate budget using Groq AI
      const budgetData = await generateBudgetWithAI(financialContext);

      setGeneratedBudget(budgetData);
      setEditableBudgets(budgetData.budgets);
      setStage("preview");
      setIsProcessing(false);
    } catch (error: any) {
      console.error("Error generating budget:", error);
      setError(error.message || "Failed to generate budget. Please try again.");
      setIsProcessing(false);
      setStage("questionnaire");
      toast.error(error.message || "Failed to generate budget");
    }
  };

  const generateBudgetWithAI = async (context: any): Promise<BudgetPreview> => {
    const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || import.meta.env.VITE_GROK_API_KEY;

    if (!GROQ_API_KEY) {
      throw new Error("Groq API key is not configured. Please set VITE_GROQ_API_KEY in your .env file.");
    }

    const prompt = `You are a budgeting assistant AI. Generate a realistic budget based on the following data:

Financial Context:
- Monthly Income: ₹${context.monthlyIncome.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
- Monthly Expenses (avg): ₹${context.monthlyExpenses.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
- Recurring Expenses: ₹${context.recurringExpenses.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
- Average Monthly Savings: ₹${context.averageSavings.toLocaleString("en-IN", { maximumFractionDigits: 2 })}

Category-wise Expenses (last 6 months):
${Object.entries(context.categoryExpenses)
  .map(([cat, amt]: [string, any]) => `- ${cat}: ₹${(amt / 6).toLocaleString("en-IN", { maximumFractionDigits: 2 })}/month`)
  .join("\n")}

User Preferences:
- Budget Duration: ${context.questionnaire.duration}
- Primary Goal: ${context.questionnaire.primaryGoal}
- Savings Priority: ${context.questionnaire.savingsPriority}
- Fixed Expenses: ${context.questionnaire.fixedExpensesComfort}
- Additional Context: ${context.questionnaire.customInput || "None"}

Generate a realistic budget that:
1. Is based on historical spending patterns
2. Aligns with user's goals and preferences
3. Ensures total expenses ≤ income (unless user explicitly allows deficit)
4. Optimizes for savings based on priority level
5. Includes all major expense categories

Return ONLY valid JSON in this exact format:
{
  "period": "${context.questionnaire.duration}",
  "totalIncome": ${context.monthlyIncome},
  "recommendedSavings": <calculated savings amount>,
  "budgets": [
    { "category": "food", "limit": <amount>, "icon": "🍔" },
    { "category": "transport", "limit": <amount>, "icon": "🚗" },
    { "category": "shopping", "limit": <amount>, "icon": "🛍️" },
    { "category": "entertainment", "limit": <amount>, "icon": "🎬" },
    { "category": "bills", "limit": <amount>, "icon": "📄" },
    { "category": "health", "limit": <amount>, "icon": "💊" },
    { "category": "education", "limit": <amount>, "icon": "📚" },
    { "category": "other", "limit": <amount>, "icon": "📦" }
  ]
}

Important:
- Only include categories with meaningful limits (> 0)
- Ensure sum of all budgets + recommendedSavings ≤ totalIncome
- Use realistic limits based on historical data
- Round amounts to nearest 100`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "You are a financial budgeting assistant. Return only valid JSON, no markdown, no explanations.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        // Note: Groq API may not support response_format, so we'll parse JSON from text response
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`AI generation failed: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse JSON response (handle markdown code blocks if present)
    let parsed: any;
    try {
      let jsonString = content.trim();
      // Remove markdown code blocks if present
      if (jsonString.includes("```")) {
        const jsonMatch = jsonString.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          jsonString = jsonMatch[1];
        } else {
          // Try to extract JSON object
          const objectMatch = jsonString.match(/(\{[\s\S]*\})/);
          if (objectMatch) {
            jsonString = objectMatch[1];
          }
        }
      }
      parsed = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      console.error("Parse error:", parseError);
      throw new Error("Failed to parse budget data. Please try again.");
    }

    // Validate and normalize
    if (!parsed.budgets || !Array.isArray(parsed.budgets)) {
      throw new Error("Invalid budget format");
    }

    // Ensure all budgets have icons
    parsed.budgets = parsed.budgets.map((b: any) => ({
      ...b,
      icon: b.icon || categoryIcons[b.category] || "📦",
    }));

    return {
      period: parsed.period || context.questionnaire.duration,
      totalIncome: parsed.totalIncome || context.monthlyIncome,
      recommendedSavings: parsed.recommendedSavings || 0,
      budgets: parsed.budgets,
    };
  };

  const handleBudgetEdit = (index: number, field: "category" | "limit", value: string | number) => {
    const updated = [...editableBudgets];
    updated[index] = { ...updated[index], [field]: value };
    setEditableBudgets(updated);
  };

  const handleAddCategory = () => {
    setEditableBudgets([
      ...editableBudgets,
      { category: "other", limit: 0, icon: "📦" },
    ]);
  };

  const handleRemoveCategory = (index: number) => {
    setEditableBudgets(editableBudgets.filter((_, i) => i !== index));
  };

  const handleSaveBudgets = async () => {
    if (!currentUser || !generatedBudget) {
      toast.error("Please sign in");
      return;
    }

    // Validate budgets
    const totalBudget = editableBudgets.reduce((sum, b) => sum + b.limit, 0);
    const totalAllocated = totalBudget + generatedBudget.recommendedSavings;

    // Warn if budget significantly exceeds income, but allow saving
    if (totalAllocated > generatedBudget.totalIncome * 1.1) {
      const confirmed = window.confirm(
        `Warning: Your total budget (₹${totalAllocated.toLocaleString("en-IN", { maximumFractionDigits: 0 })}) exceeds your income (₹${generatedBudget.totalIncome.toLocaleString("en-IN", { maximumFractionDigits: 0 })}). This may lead to overspending.\n\nDo you still want to save this budget?`
      );
      if (!confirmed) {
        return;
      }
    }

    setStage("saving");
    setIsProcessing(true);

    try {

      // Save each budget
      for (const budget of editableBudgets) {
        if (budget.limit > 0) {
          await addBudget(currentUser.uid, {
            category: budget.category,
            icon: budget.icon,
            limit: budget.limit,
            spent: 0,
            period: generatedBudget.period,
          });
        }
      }

      toast.success(`Budget created successfully! ${editableBudgets.length} categories added.`);
      
      if (onBudgetCreated) {
        onBudgetCreated();
      }

      setTimeout(() => {
        resetAndClose();
        setIsProcessing(false);
      }, 1500);
    } catch (error: any) {
      console.error("Error saving budgets:", error);
      toast.error("Failed to save budgets. Please try again.");
      setIsProcessing(false);
      setStage("preview");
    }
  };

  const resetAndClose = () => {
    onClose();
    setStage("questionnaire");
    setCurrentQuestion(0);
    setQuestionnaire({
      duration: "",
      primaryGoal: "",
      savingsPriority: "",
      fixedExpensesComfort: "",
      customInput: "",
    });
    setGeneratedBudget(null);
    setEditableBudgets([]);
    setError("");
  };

  const totalBudget = editableBudgets.reduce((sum, b) => sum + b.limit, 0);
  const totalAllocated = totalBudget + (generatedBudget?.recommendedSavings || 0);
  const remaining = (generatedBudget?.totalIncome || 0) - totalAllocated;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={resetAndClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-2xl bg-card rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] sm:max-h-[85vh]"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">AI Budget Creator</h2>
                  <p className="text-xs text-muted-foreground">
                    {stage === "questionnaire" && `Question ${currentQuestion + 1} of ${questions.length}`}
                    {stage === "generating" && "Analyzing your finances..."}
                    {stage === "preview" && "Review & Edit Budget"}
                    {stage === "saving" && "Saving Budget..."}
                  </p>
                </div>
              </div>
              <button
                onClick={resetAndClose}
                className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <AnimatePresence mode="wait">
                {/* Questionnaire Stage */}
                {stage === "questionnaire" && (
                  <motion.div
                    key="questionnaire"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-xl font-semibold text-foreground mb-2">
                        {questions[currentQuestion].title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {questions[currentQuestion].subtitle}
                      </p>
                    </div>

                    {questions[currentQuestion].type === "mcq" && (
                      <div className="space-y-3">
                        {questions[currentQuestion].options?.map((option) => (
                          <button
                            key={option.value}
                            onClick={() =>
                              handleAnswer(
                                questions[currentQuestion].id as keyof BudgetQuestionnaire,
                                option.value
                              )
                            }
                            className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                              questionnaire[questions[currentQuestion].id as keyof BudgetQuestionnaire] ===
                              option.value
                                ? "border-primary bg-primary/10"
                                : "border-border/50 bg-muted/20 hover:border-primary/50"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{option.icon}</span>
                              <span className="font-medium text-foreground">{option.label}</span>
                              {questionnaire[questions[currentQuestion].id as keyof BudgetQuestionnaire] ===
                                option.value && (
                                <Check className="w-5 h-5 text-primary ml-auto" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {questions[currentQuestion].type === "text" && (
                      <textarea
                        value={questionnaire.customInput}
                        onChange={(e) => handleAnswer("customInput", e.target.value)}
                        placeholder={questions[currentQuestion].placeholder}
                        className="w-full p-4 rounded-xl border border-border/50 bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                        rows={4}
                      />
                    )}

                    {/* Navigation */}
                    <div className="flex gap-3 pt-4">
                      {currentQuestion > 0 && (
                        <button
                          onClick={handlePrevious}
                          className="flex-1 py-3 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors font-medium flex items-center justify-center gap-2"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Previous
                        </button>
                      )}
                      <button
                        onClick={handleNext}
                        disabled={
                          questions[currentQuestion].type === "mcq" &&
                          !questionnaire[questions[currentQuestion].id as keyof BudgetQuestionnaire]
                        }
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {currentQuestion === questions.length - 1 ? "Generate Budget" : "Next"}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Generating Stage */}
                {stage === "generating" && (
                  <motion.div
                    key="generating"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="py-12 flex flex-col items-center gap-4"
                  >
                    <Loader2 className="w-16 h-16 text-primary animate-spin" />
                    <div className="text-center">
                      <p className="text-lg font-semibold text-foreground mb-2">
                        Analyzing your finances...
                      </p>
                      <p className="text-sm text-muted-foreground">
                        We're creating a personalized budget based on your spending patterns
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Preview Stage */}
                {stage === "preview" && generatedBudget && (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-6"
                  >
                    {/* Success Badge */}
                    <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <Check className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">
                        Budget generated! Review and edit as needed
                      </span>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Income</p>
                        <p className="text-lg font-bold text-foreground">
                          ₹{generatedBudget.totalIncome.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Budget</p>
                        <p className="text-lg font-bold text-foreground">
                          ₹{totalBudget.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Savings</p>
                        <p className="text-lg font-bold text-success">
                          ₹{generatedBudget.recommendedSavings.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>

                    {/* Warning if exceeds income */}
                    {totalAllocated > generatedBudget.totalIncome && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20">
                        <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-warning">
                          Total budget exceeds income by ₹
                          {(totalAllocated - generatedBudget.totalIncome).toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                          . Please adjust.
                        </p>
                      </div>
                    )}

                    {/* Budget Items */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-foreground">Category Budgets</h3>
                        <button
                          onClick={handleAddCategory}
                          className="text-xs text-primary font-medium hover:underline"
                        >
                          + Add Category
                        </button>
                      </div>

                      {editableBudgets.map((budget, index) => (
                        <div
                          key={index}
                          className="p-4 rounded-xl bg-muted/20 border border-border/50 flex items-center gap-4"
                        >
                          <span className="text-2xl">{budget.icon}</span>
                          <select
                            value={budget.category}
                            onChange={(e) => handleBudgetEdit(index, "category", e.target.value)}
                            className="flex-1 bg-background border border-primary/50 rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            {Object.entries(categoryLabels).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">₹</span>
                            <input
                              type="number"
                              value={budget.limit}
                              onChange={(e) =>
                                handleBudgetEdit(index, "limit", parseFloat(e.target.value) || 0)
                              }
                              className="w-24 bg-background border border-primary/50 rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                              min="0"
                              step="100"
                            />
                          </div>
                          <button
                            onClick={() => handleRemoveCategory(index)}
                            className="w-8 h-8 rounded-lg bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center transition-colors"
                          >
                            <X className="w-4 h-4 text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => {
                          setStage("questionnaire");
                          setCurrentQuestion(0);
                        }}
                        disabled={isProcessing}
                        className="flex-1 py-3 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors font-medium disabled:opacity-50"
                      >
                        Start Over
                      </button>
                      <button
                        onClick={handleSaveBudgets}
                        disabled={
                          isProcessing ||
                          editableBudgets.length === 0 ||
                          totalBudget <= 0
                        }
                        className={`flex-1 py-3 rounded-xl font-semibold shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                          totalAllocated > generatedBudget.totalIncome * 1.1
                            ? "bg-warning text-warning-foreground hover:bg-warning/90"
                            : "bg-gradient-to-r from-primary to-accent text-primary-foreground"
                        }`}
                      >
                        {isProcessing ? "Saving..." : totalAllocated > generatedBudget.totalIncome * 1.1 ? "Save Anyway (Warning)" : "Save Budget"}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Saving Stage */}
                {stage === "saving" && (
                  <motion.div
                    key="saving"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="py-12 flex flex-col items-center gap-4"
                  >
                    <Loader2 className="w-16 h-16 text-primary animate-spin" />
                    <p className="text-lg font-semibold text-foreground">Saving your budget...</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

