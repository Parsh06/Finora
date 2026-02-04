// RAG-based AI Service using Groq API
// Retrieves user's financial data and augments prompts for better responses

import { Transaction, Budget, RecurringPayment } from "./firestore";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || import.meta.env.VITE_GROK_API_KEY || "";

// Track API failures to prevent excessive retries
let apiFailureCount = 0;
const MAX_FAILURES = 3;
let apiDisabled = false;

// Validate API key format
const isValidApiKey = (key: string): boolean => {
  return key && key.length > 20;
};

// Check if API should be disabled due to repeated failures
const shouldSkipApiCall = (): boolean => {
  if (apiDisabled) return true;
  if (apiFailureCount >= MAX_FAILURES) {
    apiDisabled = true;
    console.warn("[Groq API] Disabled due to repeated failures. Using fallback responses.");
    return true;
  }
  return false;
};

// Reset failure count on success
const resetFailureCount = () => {
  apiFailureCount = 0;
  apiDisabled = false;
};

// Increment failure count
const incrementFailureCount = () => {
  apiFailureCount++;
};

interface FinancialContext {
  transactions: Transaction[];
  recentTransactions: Transaction[];
  budgets?: Budget[];
  recurringPayments?: RecurringPayment[];
  totalIncome?: number;
  totalExpense?: number;
  savings?: number;
  monthlyTrends: Record<string, { income: number; expense: number }>;
}

/**
 * Retrieves and structures financial data for RAG context
 */
export const retrieveFinancialContext = (
  transactions: Transaction[],
  budgets?: Budget[],
  recurringPayments?: RecurringPayment[]
): FinancialContext => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  // 1. Current Month Transactions
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

  // 2. Recent Transactions (Last 2 Months)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const recentTransactions = transactions.filter((t) => {
    let date: Date;
    if (t.date instanceof Date) {
      date = t.date;
    } else if (t.date && typeof t.date === 'object' && 'toDate' in t.date) {
      date = (t.date as any).toDate();
    } else {
      date = new Date(t.date as any);
    }
    return date >= startOfLastMonth;
  });

  // Calculate trends for last 6 months
  const monthlyTrends: Record<string, { income: number; expense: number }> = {};

  // Initialize last 6 months keys
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
    monthlyTrends[key] = { income: 0, expense: 0 };
  }

  // Populate trends with all transactions
  transactions.forEach(t => {
    let date: Date;
    if (t.date instanceof Date) {
      date = t.date;
    } else if (t.date && typeof t.date === 'object' && 'toDate' in t.date) {
      date = (t.date as any).toDate();
    } else {
      date = new Date(t.date as any);
    }

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (monthlyTrends[key]) {
      if (t.type === 'income') monthlyTrends[key].income += t.amount;
      else if (t.type === 'expense') monthlyTrends[key].expense += t.amount;
    }
  });

  // Calculate totals for current month
  const totalIncome = monthlyTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = monthlyTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    transactions: monthlyTransactions,
    recentTransactions,
    budgets,
    recurringPayments,
    totalIncome,
    totalExpense,
    savings: totalIncome - totalExpense,
    monthlyTrends
  };
};

/**
 * Builds a comprehensive financial data prompt for RAG
 */
export const buildRAGPrompt = (
  userQuestion: string,
  context: FinancialContext,
  userName?: string
): string => {
  // Structure the financial data
  const expenses = context.transactions
    .filter((t) => t.type === "expense")
    .map((t) => {
      let date: Date;
      if (t.date instanceof Date) {
        date = t.date;
      } else if (t.date && typeof t.date === 'object' && 'toDate' in t.date) {
        date = (t.date as any).toDate();
      } else {
        date = new Date(t.date as any);
      }
      return {
        title: t.title,
        category: t.category,
        amount: t.amount,
        date: date,
        paymentMethod: t.paymentMethod,
        note: t.note,
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const incomes = context.transactions
    .filter((t) => t.type === "income")
    .map((t) => {
      let date: Date;
      if (t.date instanceof Date) {
        date = t.date;
      } else if (t.date && typeof t.date === 'object' && 'toDate' in t.date) {
        date = (t.date as any).toDate();
      } else {
        date = new Date(t.date as any);
      }
      return {
        title: t.title,
        category: t.category,
        amount: t.amount,
        date: date,
        note: t.note,
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // Calculate category-wise spending
  const categorySpending = expenses.reduce((acc: any, expense) => {
    acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
    return acc;
  }, {});

  const categoryList = Object.entries(categorySpending)
    .sort(([, a]: any, [, b]: any) => b - a)
    .map(([category, amount]: any) => `- ${category}: ₹${amount.toLocaleString()}`)
    .join("\n");

  // Calculate spending trends and patterns
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const lastMonthExpenses = expenses.filter((e) => {
    return e.date >= lastMonth && e.date <= lastMonthEnd;
  });

  const lastMonthTotal = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const currentMonthTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const expenseChange = lastMonthTotal > 0
    ? Math.round(((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100)
    : 0;

  // Top spending categories
  const topCategories = Object.entries(categorySpending)
    .sort(([, a]: any, [, b]: any) => b - a)
    .slice(0, 5)
    .map(([cat, amt]: any) => ({ category: cat, amount: amt }));

  // Average transaction amount
  const avgExpense = expenses.length > 0 ? currentMonthTotal / expenses.length : 0;
  const avgIncome = incomes.length > 0 ? (context.totalIncome || 0) / incomes.length : 0;

  // Build concise RAG prompt - only essential data
  const savingsRate = context.totalIncome ? Math.round(((context.totalIncome - (context.totalExpense || 0)) / context.totalIncome) * 100) : 0;
  const name = userName || "User";
  // Reuse existing 'now' from line 173 (implied) or ensure it matches scope.
  // Actually, 'now' is declared in line 173. I should not redeclare it.
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let prompt = `User: ${name}\n`;
  prompt += `Current Date: ${now.toLocaleDateString()}\n\n`;

  // 1. Current Month Overview
  prompt += `--- Current Month (${now.toLocaleString('default', { month: 'long' })}) ---\n`;
  prompt += `Income: ₹${context.totalIncome?.toLocaleString() || 0} | Expenses: ₹${context.totalExpense?.toLocaleString() || 0} | Savings: ₹${((context.totalIncome || 0) - (context.totalExpense || 0)).toLocaleString()} (${savingsRate}%)\n`;

  if (topCategories.length > 0) {
    prompt += `Top Categories: ${topCategories.slice(0, 3).map((c: any) => `${c.category} ₹${c.amount.toLocaleString()}`).join(', ')}\n`;
  }

  // 2. Budget Alerts
  if (context.budgets && context.budgets.length > 0) {
    const overBudget = context.budgets.filter(b => b.spent > b.limit);
    if (overBudget.length > 0) {
      prompt += `⚠️ Over Budget: ${overBudget.map(b => `${b.category} (₹${b.spent.toLocaleString()}/₹${b.limit.toLocaleString()})`).join(', ')}\n`;
    }
  }

  // 3. Recurring Payments / Fixed Expenses
  if (context.recurringPayments && context.recurringPayments.length > 0) {
    const activeRecurring = context.recurringPayments.filter(p => p.status === 'active');
    if (activeRecurring.length > 0) {
      prompt += `\n--- Recurring Payments (Fixed Expenses) ---\n`;
      const recurringTotal = activeRecurring.reduce((sum, p) => sum + p.amount, 0);
      prompt += `Projected Monthly Fixed: ₹${recurringTotal.toLocaleString()}\n`;
      activeRecurring.slice(0, 5).forEach(p => {
        prompt += `- ${p.name}: ₹${p.amount.toLocaleString()} (${p.frequency})\n`;
      });
      if (activeRecurring.length > 5) prompt += `...and ${activeRecurring.length - 5} more.\n`;
    }
  }

  // 4. Financial History (Last 6 Months)
  prompt += `\n--- Financial History (Last 6 Months) ---\n`;

  if (context.monthlyTrends) {
    const historyEntries = Object.entries(context.monthlyTrends)
      .sort((a, b) => b[0].localeCompare(a[0])) // Descending order (newest first)
      .filter(([key]) => key !== currentMonthKey); // Exclude current month as it's already shown above

    if (historyEntries.length > 0) {
      historyEntries.forEach(([monthKey, data]) => {
        // Parse YYYY-MM to Readable "Jan 2025"
        const [y, m] = monthKey.split('-');
        const dateObj = new Date(parseInt(y), parseInt(m) - 1);
        const monthName = dateObj.toLocaleString('default', { month: 'short', year: 'numeric' });
        const mSavings = data.income - data.expense;
        prompt += `${monthName}: Income ₹${data.income.toLocaleString()} | Exp ₹${data.expense.toLocaleString()} | Net ₹${mSavings.toLocaleString()}\n`;
      });
    } else {
      prompt += "No historical data available.\n";
    }
  }

  // 4. Detailed Last Month Transactions
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  if (context.recentTransactions && context.recentTransactions.length > 0) {
    const lastMonthTransactions = context.recentTransactions.filter(t => {
      const d = t.date instanceof Date ? t.date : (t.date as any).toDate ? (t.date as any).toDate() : new Date(t.date as any);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === lastMonthKey;
    }).sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : (a.date as any).toDate ? (a.date as any).toDate() : new Date(a.date as any);
      const dateB = b.date instanceof Date ? b.date : (b.date as any).toDate ? (b.date as any).toDate() : new Date(b.date as any);
      return dateB.getTime() - dateA.getTime();
    });

    if (lastMonthTransactions.length > 0) {
      prompt += `\n--- Detailed Transactions (Last Month: ${lastMonth.toLocaleString('default', { month: 'long' })}) ---\n`;
      // Show top 30 to avoid hitting limits
      lastMonthTransactions.slice(0, 30).forEach(t => {
        const d = t.date instanceof Date ? t.date : (t.date as any).toDate ? (t.date as any).toDate() : new Date(t.date as any);
        const dateStr = d.getDate(); // Just the day
        prompt += `${dateStr}th: ${t.type === 'income' ? 'Income' : 'Exp'} ${t.title} (${t.category}) ₹${t.amount}\n`;
      });
      if (lastMonthTransactions.length > 30) prompt += `... and ${lastMonthTransactions.length - 30} more.\n`;
    }
  }

  prompt += `\nUser Question: "${userQuestion}"\n\n`;
  prompt += `Instructions:\n`;
  prompt += `1. Answer the specific question briefly (2-4 sentences).\n`;
  prompt += `2. If asked about "last month", refer to the history section or detailed list.\n`;
  prompt += `3. Use specific numbers. Format amounts with ₹.\n`;
  prompt += `4. Be encouraging but factual.\n`;

  return prompt;
};

/**
 * RAG-based AI service using Groq API
 */
export const ragAIService = {
  /**
   * Generate financial advice using RAG
   */
  async generateAdvice(
    userQuestion: string,
    transactions: Transaction[],
    budgets?: Budget[],
    userName?: string,
    recurringPayments?: RecurringPayment[]
  ): Promise<string> {
    if (!GROQ_API_KEY || !isValidApiKey(GROQ_API_KEY)) {
      throw new Error("Groq API key is not configured or invalid. Please set VITE_GROQ_API_KEY in your .env file.");
    }

    // Skip API call if disabled due to repeated failures
    if (shouldSkipApiCall()) {
      throw new Error("API_DISABLED");
    }

    try {
      // Retrieve financial context
      const context = retrieveFinancialContext(transactions, budgets, recurringPayments);

      // Build RAG prompt with financial data
      const ragPrompt = buildRAGPrompt(userQuestion, context, userName);

      // Try different Groq model names as fallback
      const models = ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
      let lastError: Error | null = null;

      for (const model of models) {
        try {
          console.log(`[Groq API] Attempting model: ${model}`);
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: model,
              messages: [
                {
                  role: "system",
                  content:
                    "You are Finora AI, a concise financial advisor. Provide brief, direct answers (2-4 sentences max). Use specific numbers from the data. Format: ₹ for amounts. No emojis. No repetitive sections. Be factual and actionable.",
                },
                {
                  role: "user",
                  content: ragPrompt,
                },
              ],
              temperature: 0.7,
              max_tokens: 300,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`[Groq API] Success with model: ${model}`);
            resetFailureCount(); // Reset on success

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
              throw new Error("Invalid response format from API");
            }

            return data.choices[0].message.content || "No response generated";
          } else {
            let errorData: any = {};
            let errorMsg = `Status ${response.status}`;
            try {
              const text = await response.text();
              if (text) {
                errorData = JSON.parse(text);
                errorMsg = errorData.error?.message || errorData.message || errorData.error?.code || errorMsg;
              }
            } catch (e) {
              errorMsg = response.statusText || errorMsg;
            }
            console.error(`[Groq API] Model ${model} failed:`, {
              status: response.status,
              statusText: response.statusText,
              error: errorData,
              message: errorMsg
            });
            lastError = new Error(`Model ${model}: ${errorMsg}`);
            incrementFailureCount();
            // Try next model
            continue;
          }
        } catch (error: any) {
          console.error(`[Groq API] Model ${model} exception:`, error);
          lastError = error;
          incrementFailureCount();
          // Try next model
          continue;
        }
      }

      // If all models failed, throw the last error
      throw lastError || new Error("All model attempts failed");

    } catch (error: any) {
      console.error("Groq AI Service error:", error);
      throw new Error(error.message || "Failed to get AI response");
    }
  },

  /**
   * Generate financial insights and health score
   */
  async generateInsights(
    transactions: Transaction[],
    budgets?: Budget[],
    userName?: string,
    recurringPayments?: RecurringPayment[]
  ): Promise<{
    healthScore: number;
    insights: Array<{
      type: "tip" | "warning" | "achievement" | "trend";
      title: string;
      description: string;
    }>;
  }> {
    if (!GROQ_API_KEY || !isValidApiKey(GROQ_API_KEY)) {
      // Return fallback insights instead of throwing error
      const context = retrieveFinancialContext(transactions, budgets, recurringPayments);
      const savingsRate = context.totalIncome
        ? ((context.totalIncome - (context.totalExpense || 0)) / context.totalIncome) * 100
        : 0;
      const healthScore = Math.max(0, Math.min(100, 50 + savingsRate));

      // Calculate insights from actual data
      const insights = [];

      if (savingsRate < 0) {
        insights.push({
          type: "warning" as const,
          title: "Negative Savings",
          description: `You're spending ₹${Math.abs(context.totalIncome ? (context.totalIncome - (context.totalExpense || 0)) : 0).toLocaleString()} more than you earn. Consider reducing expenses or increasing income.`,
        });
      } else if (savingsRate < 20) {
        insights.push({
          type: "tip" as const,
          title: "Low Savings Rate",
          description: `Your savings rate is ${Math.round(savingsRate)}%. Aim for at least 20% to build a healthy financial cushion.`,
        });
      } else {
        insights.push({
          type: "achievement" as const,
          title: "Good Savings Rate",
          description: `Great job! You're saving ${Math.round(savingsRate)}% of your income. Keep it up!`,
        });
      }

      if (context.budgets && context.budgets.length > 0) {
        const overBudget = context.budgets.filter(b => b.spent > b.limit);
        if (overBudget.length > 0) {
          insights.push({
            type: "warning" as const,
            title: "Over Budget",
            description: `You're over budget in ${overBudget.length} categor${overBudget.length > 1 ? 'ies' : 'y'}. Review your spending in these areas.`,
          });
        }
      }

      if (insights.length === 0) {
        insights.push({
          type: "tip" as const,
          title: "Financial Tracking",
          description: `Your current savings rate is ${Math.round(savingsRate)}%. Keep tracking your expenses for better insights.`,
        });
      }

      return {
        healthScore,
        insights,
      };
    }

    // Skip API call if disabled due to repeated failures
    if (shouldSkipApiCall()) {
      // Return fallback insights
      const context = retrieveFinancialContext(transactions, budgets, recurringPayments);
      const savingsRate = context.totalIncome
        ? ((context.totalIncome - (context.totalExpense || 0)) / context.totalIncome) * 100
        : 0;
      const healthScore = Math.max(0, Math.min(100, 50 + savingsRate));

      return {
        healthScore,
        insights: [
          {
            type: "tip" as const,
            title: "Financial Tracking",
            description: `Your current savings rate is ${Math.round(savingsRate)}%. Keep tracking your expenses for better insights.`,
          },
        ],
      };
    }

    try {
      const context = retrieveFinancialContext(transactions, budgets, recurringPayments);

      const insightSavingsRate = context.totalIncome ? Math.round(((context.totalIncome - (context.totalExpense || 0)) / context.totalIncome) * 100) : 0;
      const insightCategorySpending: Record<string, number> = {};
      context.transactions.filter(t => t.type === "expense").forEach(e => {
        insightCategorySpending[e.category] = (insightCategorySpending[e.category] || 0) + e.amount;
      });
      const topCategory = Object.entries(insightCategorySpending).sort(([, a], [, b]) => b - a)[0];

      const analysisPrompt = `Data: Income ₹${context.totalIncome?.toLocaleString() || 0}, Expenses ₹${context.totalExpense?.toLocaleString() || 0}, Savings ${insightSavingsRate}%${topCategory ? `, Top: ${topCategory[0]} ₹${topCategory[1].toLocaleString()}` : ''}${context.budgets && context.budgets.length > 0 ? `, Budgets: ${context.budgets.map(b => `${b.category} ${Math.round((b.spent / b.limit) * 100)}%`).join(', ')}` : ''}

JSON: {"healthScore": 0-100, "insights": [{"type": "tip"|"warning"|"achievement"|"trend", "title": "short", "description": "max 30 words"}]}. Max 3 insights.`;

      // Try different Groq model names as fallback
      const models = ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
      let lastError: Error | null = null;
      let responseData: any = null;

      for (const model of models) {
        try {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: model,
              messages: [
                {
                  role: "system",
                  content:
                    "Financial AI. Respond with JSON only: {\"healthScore\": number, \"insights\": [{\"type\": \"tip\"|\"warning\"|\"achievement\"|\"trend\", \"title\": \"short\", \"description\": \"brief (max 30 words)\"}]}. Max 3 insights.",
                },
                {
                  role: "user",
                  content: analysisPrompt,
                },
              ],
              temperature: 0.5,
              max_tokens: 400,
            }),
          });

          if (response.ok) {
            responseData = await response.json();
            console.log(`[Groq API] Insights success with model: ${model}`);
            resetFailureCount(); // Reset on success
            break; // Success, exit loop
          } else {
            let errorData: any = {};
            let errorMsg = `Status ${response.status}`;
            try {
              const text = await response.text();
              if (text) {
                errorData = JSON.parse(text);
                errorMsg = errorData.error?.message || errorData.message || errorData.error?.code || errorMsg;
              }
            } catch (e) {
              // If JSON parsing fails, use status text
              errorMsg = response.statusText || errorMsg;
            }
            console.error(`[Groq API] Model ${model} failed:`, {
              status: response.status,
              statusText: response.statusText,
              error: errorData,
              message: errorMsg,
              fullError: errorData
            });
            lastError = new Error(`Model ${model}: ${errorMsg}`);
            incrementFailureCount(); // Track failures
            // Try next model
            continue;
          }
        } catch (error: any) {
          console.error(`[Groq API] Model ${model} exception:`, error);
          lastError = error;
          incrementFailureCount(); // Track failures
          // Try next model
          continue;
        }
      }

      if (!responseData) {
        // If all models failed, throw error and use fallback
        throw lastError || new Error("All model attempts failed");
      }

      if (!responseData.choices || !responseData.choices[0] || !responseData.choices[0].message) {
        throw new Error("Invalid response format from API");
      }

      const content = responseData.choices[0].message.content || "";

      // Extract JSON from response (handle code blocks or plain JSON)
      let jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Try to find JSON in code blocks
        jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          jsonMatch[0] = jsonMatch[1];
        }
      }

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            healthScore: Math.max(0, Math.min(100, parsed.healthScore || 70)),
            insights: Array.isArray(parsed.insights) ? parsed.insights.slice(0, 5) : [],
          };
        } catch (parseError) {
          console.error("JSON parse error:", parseError);
          // Fall through to fallback
        }
      }

      // Fallback - calculate from actual data
      const savingsRate = context.totalIncome
        ? ((context.totalIncome - (context.totalExpense || 0)) / context.totalIncome) * 100
        : 0;
      const healthScore = Math.max(0, Math.min(100, 50 + savingsRate));

      return {
        healthScore,
        insights: [
          {
            type: "tip" as const,
            title: "Financial Tracking",
            description: `Your current savings rate is ${Math.round(savingsRate)}%. Keep tracking your expenses for better insights.`,
          },
        ],
      };
    } catch (error: any) {
      console.error("Failed to generate insights:", error);
      // Calculate basic health score from data
      const context = retrieveFinancialContext(transactions, budgets, recurringPayments);
      const savingsRate = context.totalIncome
        ? ((context.totalIncome - (context.totalExpense || 0)) / context.totalIncome) * 100
        : 0;
      const healthScore = Math.max(0, Math.min(100, 50 + savingsRate));

      return {
        healthScore,
        insights: [
          {
            type: "tip",
            title: "Financial Analysis",
            description: `Your current savings rate is ${Math.round(savingsRate)}%. Keep tracking your expenses for better insights.`,
          },
        ],
      };
    }
  },
};

