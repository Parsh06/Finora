// RAG-based AI Service using Groq API
// Retrieves user's financial data and augments prompts for better responses

import { Transaction, Budget } from "./firestore";

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
  budgets?: Budget[];
  totalIncome?: number;
  totalExpense?: number;
  savings?: number;
}

/**
 * Retrieves and structures financial data for RAG context
 */
export const retrieveFinancialContext = (transactions: Transaction[], budgets?: Budget[]): FinancialContext => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  // Filter transactions by time period
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

  const weeklyTransactions = transactions.filter((t) => {
    let date: Date;
    if (t.date instanceof Date) {
      date = t.date;
    } else if (t.date && typeof t.date === 'object' && 'toDate' in t.date) {
      date = (t.date as any).toDate();
    } else {
      date = new Date(t.date as any);
    }
    return date >= startOfWeek;
  });

  // Calculate totals
  const totalIncome = monthlyTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = monthlyTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const weeklyIncome = weeklyTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const weeklyExpense = weeklyTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    transactions: monthlyTransactions,
    budgets,
    totalIncome,
    totalExpense,
    savings: totalIncome - totalExpense,
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
  
  let prompt = `User: ${name}\nFinancial Data:\n`;
  prompt += `Income: ₹${context.totalIncome?.toLocaleString() || 0} | Expenses: ₹${context.totalExpense?.toLocaleString() || 0} | Savings: ₹${((context.totalIncome || 0) - (context.totalExpense || 0)).toLocaleString()} (${savingsRate}%)\n`;
  
  if (topCategories.length > 0) {
    prompt += `Top Categories: ${topCategories.slice(0, 3).map((c: any) => `${c.category} ₹${c.amount.toLocaleString()}`).join(', ')}\n`;
  }
  
  if (context.budgets && context.budgets.length > 0) {
    const overBudget = context.budgets.filter(b => b.spent > b.limit);
    if (overBudget.length > 0) {
      prompt += `Over Budget: ${overBudget.map(b => `${b.category} (₹${b.spent.toLocaleString()}/₹${b.limit.toLocaleString()})`).join(', ')}\n`;
    }
  }
  
  prompt += `\nQuestion: ${userQuestion}\n\nAnswer briefly (2-4 sentences max). Use specific numbers from the data. Format: ₹ for amounts. Address the user as ${name} if appropriate.`;

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
    userName?: string
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
      const context = retrieveFinancialContext(transactions, budgets);

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
    userName?: string
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
      const context = retrieveFinancialContext(transactions, budgets);
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
      const context = retrieveFinancialContext(transactions, budgets);
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
      const context = retrieveFinancialContext(transactions, budgets);

      const insightSavingsRate = context.totalIncome ? Math.round(((context.totalIncome - (context.totalExpense || 0)) / context.totalIncome) * 100) : 0;
      const insightCategorySpending: Record<string, number> = {};
      context.transactions.filter(t => t.type === "expense").forEach(e => {
        insightCategorySpending[e.category] = (insightCategorySpending[e.category] || 0) + e.amount;
      });
      const topCategory = Object.entries(insightCategorySpending).sort(([,a], [,b]) => b - a)[0];
      
      const analysisPrompt = `Data: Income ₹${context.totalIncome?.toLocaleString() || 0}, Expenses ₹${context.totalExpense?.toLocaleString() || 0}, Savings ${insightSavingsRate}%${topCategory ? `, Top: ${topCategory[0]} ₹${topCategory[1].toLocaleString()}` : ''}${context.budgets && context.budgets.length > 0 ? `, Budgets: ${context.budgets.map(b => `${b.category} ${Math.round((b.spent/b.limit)*100)}%`).join(', ')}` : ''}

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
      const context = retrieveFinancialContext(transactions, budgets);
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

