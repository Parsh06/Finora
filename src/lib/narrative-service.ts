import { 
  getTransactionsInDateRange, 
  getBudgets, 
  getMonthlyNarrative, 
  saveMonthlyNarrative,
  Transaction,
  Budget
} from "./firestore";
import { groqChatCompletion, isGroqConfigured } from "./groq-service";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  subYears, 
  getWeeksInMonth, 
  startOfWeek, 
  endOfWeek,
  isSameMonth,
  addDays,
  differenceInDays,
  getWeekOfMonth,
  parseISO
} from "date-fns";
import { Timestamp } from "firebase/firestore";

export { getMonthlyNarrative, saveMonthlyNarrative };

export interface CategoryBreakdown {
  category: string;
  spent: number;
  budget: number;
  weekBreakdown: number[];
}

export interface FinancialContext {
  month: string;
  totalSpent: number;
  budget: number;
  overspendAmount: number;
  categoryBreakdown: CategoryBreakdown[];
  sameMonthLastYear: {
    totalSpent: number;
    topCategory: string;
  };
  unusualTransactions: {
    merchant: string;
    amount: number;
    category: string;
  }[];
}

/**
 * Aggregates transaction and budget data for a specific month into a context object for AI
 */
export const getMonthlyNarrativeContext = async (
  userId: string,
  targetDate: Date
): Promise<FinancialContext> => {
  const monthStart = startOfMonth(targetDate);
  const monthEnd = endOfMonth(targetDate);
  const monthLabel = format(targetDate, "MMMM yyyy");

  // Fetch current month data
  const monthTransactions = await getTransactionsInDateRange(userId, monthStart, monthEnd);
  const budgets = await getBudgets(userId);

  // Fetch same month last year data
  const lastYearStart = subYears(monthStart, 1);
  const lastYearEnd = subYears(monthEnd, 1);
  const lastYearTransactions = await getTransactionsInDateRange(userId, lastYearStart, lastYearEnd);

  // Filter expenses
  const currentExpenses = monthTransactions.filter(t => t.type === "expense");
  const lastYearExpenses = lastYearTransactions.filter(t => t.type === "expense");

  // Calculate total spent
  const totalSpent = currentExpenses.reduce((sum, t) => sum + t.amount, 0);

  // Calculate total budget (for categories that exist in transactions or defined budgets)
  const monthlyBudgets = budgets.filter(b => b.period === "monthly");
  const totalBudget = monthlyBudgets.reduce((sum, b) => sum + b.limit, 0);

  // Category Breakdown
  const categories = Array.from(new Set([
    ...currentExpenses.map(t => t.category),
    ...monthlyBudgets.map(b => b.category)
  ]));

  const categoryBreakdown: CategoryBreakdown[] = categories.map(cat => {
    const catExpenses = currentExpenses.filter(t => t.category === cat);
    const catBudget = monthlyBudgets.find(b => b.category === cat)?.limit || 0;
    
    // Weekly Breakdown (Approximate 4-5 weeks)
    const weeks: number[] = [0, 0, 0, 0, 0];
    catExpenses.forEach(t => {
      const date = t.date instanceof Date ? t.date : (t.date as any).toDate();
      const weekIndex = Math.min(getWeekOfMonth(date) - 1, 4);
      weeks[weekIndex] += t.amount;
    });

    return {
      category: cat,
      spent: catExpenses.reduce((sum, t) => sum + t.amount, 0),
      budget: catBudget,
      weekBreakdown: weeks.slice(0, 4) // Stick to 4 weeks for AI simplicity as requested
    };
  });

  // Last Year Context
  const lastYearTotalSpent = lastYearExpenses.reduce((sum, t) => sum + t.amount, 0);
  const lastYearCatSums: Record<string, number> = {};
  lastYearExpenses.forEach(t => {
    lastYearCatSums[t.category] = (lastYearCatSums[t.category] || 0) + t.amount;
  });
  const topCategoryLastYear = Object.entries(lastYearCatSums)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "None";

  // Unusual Transactions (Top 3 by amount)
  const unusualTransactions = currentExpenses
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map(t => ({
      merchant: t.title,
      amount: t.amount,
      category: t.category
    }));

  return {
    month: monthLabel,
    totalSpent,
    budget: totalBudget,
    overspendAmount: Math.max(0, totalSpent - totalBudget),
    categoryBreakdown,
    sameMonthLastYear: {
      totalSpent: lastYearTotalSpent,
      topCategory: topCategoryLastYear
    },
    unusualTransactions
  };
};

/**
 * Generates or retrieves a monthly narrative and caches it
 */
export const getOrGenerateNarrative = async (
  userId: string,
  targetDate: Date,
  forceRefresh: boolean = false
): Promise<string> => {
  const monthKey = format(targetDate, "yyyy-MM");
  
  // Check cache unless forceRefresh
  if (!forceRefresh) {
    try {
      const cached = await getMonthlyNarrative(userId, monthKey);
      if (cached) {
        const now = Timestamp.now().toMillis();
        const expires = cached.expiresAt?.toMillis() || 0;
        if (now < expires) {
          return cached.content;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch cached narrative:", e);
    }
  }

  // Check if Groq is configured
  if (!isGroqConfigured()) {
    return "Please configure your Groq API key in the .env file to see AI-powered spending narratives.";
  }

  // Generate new narrative
  const context = await getMonthlyNarrativeContext(userId, targetDate);
  
  // Guard for no data
  if (context.totalSpent === 0 && context.categoryBreakdown.length === 0) {
    return `No spending data found for ${context.month}. Start adding transactions to see your AI narrative!`;
  }
  
  const systemPrompt = `You are Finora AI, a personal finance expert. 
Review the provided financial context and generate a short, written story (spending narrative) explaining WHY the month went over budget or summarizing the spending habits.

Rules:
1. Identify the primary driver of overspend (if any).
2. Find cross-category correlations (e.g., "when your fitness spending dropped, your food delivery jumped").
3. Compare current behavior to the same month last year.
4. Provide ONE specific, actionable suggestion for next month.
5. Be supportive but direct. Use the user's currency (implied by context amounts).
6. Length: 3-5 sentences maximum. Avoid bullet points.

Return ONLY the narrative text.`;

  const userMessage = `Financial Context for ${context.month}:
${JSON.stringify(context, null, 2)}`;

  try {
    const content = await groqChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ], {
      temperature: 0.6,
      maxTokens: 512
    });

    // Save to Firestore with 24h expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await saveMonthlyNarrative(userId, {
      month: monthKey,
      content,
      context,
      expiresAt: Timestamp.fromDate(expiresAt)
    });

    return content;
  } catch (error: any) {
    console.error("Error generating narrative:", error);
    return `I couldn't generate your spending story right now. (Error: ${error.message || 'Unknown'})`;
  }
};
