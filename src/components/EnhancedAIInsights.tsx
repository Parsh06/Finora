import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  Send, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Target,
  Lightbulb,
  PieChart,
  ArrowRight,
  Bot,
  User,
  Mic,
  RefreshCw
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToTransactions, subscribeToBudgets, Transaction, Budget } from "@/lib/firestore";
import { ragAIService } from "@/lib/rag-ai-service";
import { toast } from "sonner";

interface Message {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: Date;
}

interface Insight {
  id: string;
  type: "tip" | "warning" | "achievement" | "trend";
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  isNew: boolean;
}

export const EnhancedAIInsights = () => {
  const { currentUser, userProfile } = useAuth();
  const userName = userProfile?.name || currentUser?.displayName || "there";
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "ai",
      content: `Hello ${userName}! I'm Finora AI, your personal finance assistant. I've been analyzing your spending patterns and have some insights to share. What would you like to know?`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [healthScore, setHealthScore] = useState(72);
  const [liveInsights, setLiveInsights] = useState<Insight[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestedPrompts = [
    "How can I save more?",
    "What am I overspending on?",
    "Predict next month's expenses",
    "Best time to pay bills?"
  ];

  const mockInsights: Insight[] = [
    {
      id: "1",
      type: "warning",
      title: "Food Spending Alert",
      description: "You've spent 23% more on food this week compared to your average.",
      icon: AlertTriangle,
      color: "text-yellow-400",
      isNew: true
    },
    {
      id: "2",
      type: "tip",
      title: "Saving Opportunity",
      description: "Switch your Netflix to annual plan and save ₹780/year.",
      icon: Lightbulb,
      color: "text-emerald-400",
      isNew: true
    },
    {
      id: "3",
      type: "trend",
      title: "Positive Trend",
      description: "Your transportation costs dropped 15% this month. Great job!",
      icon: TrendingDown,
      color: "text-cyan-400",
      isNew: false
    },
    {
      id: "4",
      type: "achievement",
      title: "Budget Goal Reached",
      description: "You stayed within your Entertainment budget for 3 weeks straight!",
      icon: Target,
      color: "text-purple-400",
      isNew: false
    }
  ];

  const mockResponses: Record<string, string> = {
    "save": "Based on your spending patterns, here are 3 ways to save more:\n\n1. **Reduce food delivery** - You spend ₹4,500/month on delivery. Cooking more could save ₹2,500.\n\n2. **Optimize subscriptions** - Cancel unused Spotify family plan (₹119/month).\n\n3. **Use cashback cards** - Switch to HDFC Regalia for 3% on shopping.",
    "overspending": "Looking at your data, you're overspending in these categories:\n\n📱 **Shopping** - 40% over budget (₹8,000 vs ₹5,700 target)\n\n🍔 **Food & Dining** - 25% over budget (₹6,500 vs ₹5,200 target)\n\nI recommend setting up category alerts to get notified at 80% usage.",
    "predict": "Based on historical patterns, here's my prediction for next month:\n\n💰 **Expected Expenses**: ₹45,200\n📊 **Confidence**: 87%\n\nBreakdown:\n- Rent: ₹25,000 (fixed)\n- Utilities: ₹3,500\n- Food: ₹6,000\n- Transport: ₹4,200\n- Others: ₹6,500",
    "bills": "Optimal bill payment schedule based on your cash flow:\n\n📅 **1st-5th**: Rent, EMIs (when salary credited)\n📅 **10th-15th**: Utilities, subscriptions\n📅 **20th-25th**: Credit card bills\n\nThis ensures you always have buffer for emergencies.",
    "default": "I'm analyzing your financial data to give you personalized advice. Your spending shows some interesting patterns. Would you like me to focus on saving tips, budget optimization, or investment suggestions?"
  };

  // Fetch transactions and budgets
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribeTransactions = subscribeToTransactions(currentUser.uid, (data) => {
      setTransactions(data);
    });

    const unsubscribeBudgets = subscribeToBudgets(currentUser.uid, (data) => {
      setBudgets(data);
    });

    return () => {
      unsubscribeTransactions();
      unsubscribeBudgets();
    };
  }, [currentUser]);

  // Update initial message when userName changes
  useEffect(() => {
    if (userName && messages.length === 1 && messages[0].id === "1") {
      setMessages([{
        id: "1",
        type: "ai",
        content: `Hello ${userName}! I'm Finora AI, your personal finance assistant. I've been analyzing your spending patterns and have some insights to share. What would you like to know?`,
        timestamp: new Date()
      }]);
    }
  }, [userName]);

  // Generate insights using RAG when data is available
  useEffect(() => {
    const generateInsights = async () => {
      if (!currentUser || transactions.length === 0) {
        setLoadingInsights(false);
        return;
      }

      try {
        setLoadingInsights(true);
        const insightsData = await ragAIService.generateInsights(transactions, budgets, userName);
        
        setHealthScore(insightsData.healthScore);

        // Map AI insights to component format
        const iconMap: Record<string, React.ElementType> = {
          tip: Lightbulb,
          warning: AlertTriangle,
          achievement: Target,
          trend: TrendingDown,
        };

        const colorMap: Record<string, string> = {
          tip: "text-emerald-400",
          warning: "text-yellow-400",
          achievement: "text-purple-400",
          trend: "text-cyan-400",
        };

        const formattedInsights: Insight[] = insightsData.insights.map((insight, index) => ({
          id: `insight-${index}`,
          type: insight.type,
          title: insight.title,
          description: insight.description,
          icon: iconMap[insight.type] || Lightbulb,
          color: colorMap[insight.type] || "text-emerald-400",
          isNew: index < 2,
        }));

        setLiveInsights(formattedInsights);
      } catch (error: any) {
        console.error("Failed to generate insights:", error);
        toast.error("Failed to load AI insights");
        // Fallback to mock insights
        setLiveInsights(mockInsights);
      } finally {
        setLoadingInsights(false);
      }
    };

    if (transactions.length > 0) {
      generateInsights();
    }
  }, [transactions, budgets, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text: string = input) => {
    if (!text.trim()) return;
    
    if (!currentUser) {
      toast.error("Please sign in to use AI features");
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    try {
      // Check if user has any financial data
      if (transactions.length === 0) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: "ai",
          content: "I'd love to help you with financial advice! However, I don't see any transactions in your account yet. Once you start adding your income and expenses, I'll be able to provide personalized insights and recommendations.\n\n💡 **Get Started:**\n- Add your first transaction using the + button\n- Set up budgets for different categories\n- Track your spending patterns\n\nOnce you have some data, I can help you with:\n- Analyzing your spending habits\n- Finding savings opportunities\n- Budget recommendations\n- Financial health insights",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
        setIsTyping(false);
        return;
      }

      // Use RAG service to generate response with user's financial data
      const response = await ragAIService.generateAdvice(text, transactions, budgets, userName);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error: any) {
      console.error("AI error:", error);
      
      // If API is disabled, don't show error toast - fallback will handle it
      if (error.message?.includes("API_DISABLED")) {
        // Silently use fallback - don't show error
      } else {
        // Provide helpful error message for other errors
        let errorMessage = "I'm having trouble connecting to the AI service right now. ";
        
        if (error.message?.includes("API key")) {
          errorMessage += "Please check the API configuration.";
        } else if (error.message?.includes("network") || error.message?.includes("fetch")) {
          errorMessage += "Please check your internet connection and try again.";
        } else {
          errorMessage += "Using fallback analysis based on your data.";
        }
        
        // Only show toast for non-disabled API errors
        if (!error.message?.includes("API_DISABLED")) {
          toast.error(errorMessage);
        }
      }
      
      // Provide a helpful fallback response based on available data
      const lowerText = text.toLowerCase();
      let fallbackResponse = "";
      
      if (transactions.length > 0) {
        const expenses = transactions.filter(t => t.type === "expense");
        const incomes = transactions.filter(t => t.type === "income");
        const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);
        const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0);
        const savings = totalIncome - totalExpense;
        
        // Calculate monthly data
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthlyTransactions = transactions.filter((t) => {
          let date: Date;
          if (t.date instanceof Date) {
            date = t.date;
          } else if (t.date && typeof t.date === 'object' && 'toDate' in t.date) {
            date = (t.date as any).toDate();
          } else {
            date = new Date(t.date as any);
          }
          return date >= startOfMonth;
        });
        const monthlyExpenses = monthlyTransactions.filter(t => t.type === "expense");
        const monthlyIncomes = monthlyTransactions.filter(t => t.type === "income");
        const monthlyExpense = monthlyExpenses.reduce((sum, t) => sum + t.amount, 0);
        const monthlyIncome = monthlyIncomes.reduce((sum, t) => sum + t.amount, 0);
        const monthlySavings = monthlyIncome - monthlyExpense;
        const savingsRate = monthlyIncome > 0 ? Math.round((monthlySavings / monthlyIncome) * 100) : 0;
        
        // Calculate category breakdown
        const categorySpending: Record<string, number> = {};
        monthlyExpenses.forEach(e => {
          categorySpending[e.category] = (categorySpending[e.category] || 0) + e.amount;
        });
        const sortedCategories = Object.entries(categorySpending)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5);
        
        if (lowerText.includes("spending") || lowerText.includes("spend") || lowerText.includes("what are my spendings")) {
          let categoryBreakdown = "";
          sortedCategories.forEach(([cat, amt], idx) => {
            const percentage = monthlyExpense > 0 ? Math.round((amt / monthlyExpense) * 100) : 0;
            const categoryLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
            categoryBreakdown += `\n${idx + 1}. ${categoryLabel}: ₹${amt.toLocaleString()} (${percentage}%)`;
          });
          
          fallbackResponse = `Based on your financial data for this month:\n\n💰 Total Spending: ₹${monthlyExpense.toLocaleString()}\n📊 Total Income: ₹${monthlyIncome.toLocaleString()}\n💵 Net Savings: ₹${monthlySavings.toLocaleString()}\n\nSpending by Category:${categoryBreakdown || "\nNo category data available"}\n\n💡 Tip: Your top spending category is ${sortedCategories[0]?.[0] ? sortedCategories[0][0].charAt(0).toUpperCase() + sortedCategories[0][0].slice(1) : "N/A"}. Consider reviewing expenses in this category to optimize your budget.`;
        } else if (lowerText.includes("save") || lowerText.includes("saving") || lowerText.includes("how can i save")) {
          const topCategory = sortedCategories[0];
          const potentialSavings = topCategory ? Math.round(topCategory[1] * 0.1) : 0;
          const topCategoryLabel = topCategory ? topCategory[0].charAt(0).toUpperCase() + topCategory[0].slice(1) : "top category";
          
          fallbackResponse = `Your current financial snapshot:\n\n💵 Monthly Income: ₹${monthlyIncome.toLocaleString()}\n💸 Monthly Expenses: ₹${monthlyExpense.toLocaleString()}\n💰 Current Savings: ₹${monthlySavings.toLocaleString()}\n📈 Savings Rate: ${savingsRate}%\n\nSavings Opportunities:\n\n1. Reduce ${topCategoryLabel} spending - You're spending ₹${topCategory?.[1].toLocaleString() || 0} here. A 10% reduction could save ₹${potentialSavings.toLocaleString()}/month.\n\n2. Review recurring expenses - Check your recurring payments and cancel unused subscriptions.\n\n3. Set a monthly savings goal - Aim to save at least 20% of your income (₹${Math.round(monthlyIncome * 0.2).toLocaleString()}/month).\n\nYour current savings rate is ${savingsRate}%. ${savingsRate < 20 ? "Try to increase it to at least 20% for better financial health." : "Great job maintaining a healthy savings rate!"}`;
        } else {
          const categoryList = sortedCategories.length > 0 
            ? sortedCategories.map(([cat, amt], idx) => {
                const categoryLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
                return `${idx + 1}. ${categoryLabel}: ₹${amt.toLocaleString()}`;
              }).join("\n")
            : "No spending data available";
          
          fallbackResponse = `Your Financial Summary\n\n💰 This Month:\n- Income: ₹${monthlyIncome.toLocaleString()}\n- Expenses: ₹${monthlyExpense.toLocaleString()}\n- Savings: ₹${monthlySavings.toLocaleString()} (${savingsRate}%)\n\n📊 Top Spending Categories:\n${categoryList}\n\n💡 Keep tracking your expenses to maintain better financial health!`;
        }
      } else {
        fallbackResponse = "I'd love to help you analyze your finances! Please add some transactions first so I can provide personalized insights and recommendations.";
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: fallbackResponse,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreGradient = (score: number) => {
    if (score >= 80) return "from-emerald-500 to-cyan-500";
    if (score >= 60) return "from-yellow-500 to-orange-500";
    return "from-red-500 to-pink-500";
  };

  return (
    <motion.div
      className="min-h-screen bg-background pb-24 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-14 pb-4">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">AI Insights</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">Real-time financial intelligence</p>
          </div>
          <motion.div
            className="relative flex-shrink-0"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${getScoreGradient(healthScore)} p-0.5`}>
              <div className="w-full h-full rounded-full bg-card flex items-center justify-center">
                <span className={`text-xs sm:text-sm font-bold ${getScoreColor(healthScore)}`}>{healthScore}</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Financial Health Score */}
        <motion.div
          className="glass-card-elevated p-3 sm:p-4 rounded-2xl mb-4"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground">Financial Health Score</p>
                <p className={`text-lg sm:text-xl font-bold ${getScoreColor(healthScore)} truncate`}>
                  {healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : "Needs Work"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-emerald-400 text-xs sm:text-sm flex-shrink-0">
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">+5 this week</span>
              <span className="sm:hidden">+5</span>
            </div>
          </div>
          <div className="mt-3 h-2 bg-muted/30 rounded-full overflow-hidden">
            <motion.div
              className={`h-full bg-gradient-to-r ${getScoreGradient(healthScore)} rounded-full`}
              initial={{ width: 0 }}
              animate={{ width: `${healthScore}%` }}
              transition={{ duration: 1, delay: 0.5 }}
            />
          </div>
        </motion.div>

        {/* Live Insights Scroll */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">Live Insights</p>
            <motion.div
              className="flex items-center gap-1 text-xs text-primary"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <RefreshCw className="w-3 h-3" />
              Updating
            </motion.div>
          </div>
          <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 -mx-4 sm:-mx-6 px-4 sm:px-6 scrollbar-hide">
            <AnimatePresence>
              {liveInsights.map((insight, index) => (
                <motion.div
                  key={insight.id}
                  className="flex-shrink-0 w-56 sm:w-64 glass-card p-3 sm:p-4 rounded-xl relative"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  {insight.isNew && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-muted/30 flex items-center justify-center flex-shrink-0`}>
                      <insight.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${insight.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground text-xs sm:text-sm truncate">{insight.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{insight.description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 px-4 sm:px-6 overflow-y-auto">
        <div className="space-y-3 sm:space-y-4 pb-4">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className={`flex items-start gap-1.5 sm:gap-2 max-w-[85%] sm:max-w-[80%] ${message.type === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.type === "ai" 
                    ? "bg-gradient-to-br from-primary to-accent" 
                    : "bg-muted/50"
                }`}>
                  {message.type === "ai" ? (
                    <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary-foreground" />
                  ) : (
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                  )}
                </div>
                <div className={`px-3 py-2 sm:px-4 sm:py-3 rounded-2xl ${
                  message.type === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-md"
                    : "glass-card rounded-tl-md"
                }`}>
                  <p className={`text-xs sm:text-sm whitespace-pre-line break-words ${message.type === "ai" ? "text-foreground" : ""}`}>
                    {message.content}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
          
          {isTyping && (
            <motion.div
              className="flex justify-start"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="glass-card px-4 py-3 rounded-2xl rounded-tl-md">
                  <div className="flex gap-1">
                    <motion.span
                      className="w-2 h-2 bg-muted-foreground rounded-full"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                    />
                    <motion.span
                      className="w-2 h-2 bg-muted-foreground rounded-full"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                    />
                    <motion.span
                      className="w-2 h-2 bg-muted-foreground rounded-full"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggested Prompts */}
      <div className="px-4 sm:px-6 py-3">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {suggestedPrompts.map((prompt, index) => (
            <button
              key={index}
              onClick={() => handleSend(prompt)}
              className="flex-shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-muted/30 text-xs sm:text-sm text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5 sm:gap-2"
            >
              <span className="whitespace-nowrap">{prompt}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="px-4 sm:px-6 pb-4 sm:pb-6">
        <div className="glass-card rounded-2xl p-1.5 sm:p-2 flex items-center gap-1.5 sm:gap-2">
          <button className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-muted/30 flex items-center justify-center hover:bg-muted/50 transition-colors flex-shrink-0">
            <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask me anything..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-xs sm:text-sm py-1.5 sm:py-2 min-w-0"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-r from-primary to-accent flex items-center justify-center disabled:opacity-50 transition-opacity shadow-lg shadow-primary/25 flex-shrink-0"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
