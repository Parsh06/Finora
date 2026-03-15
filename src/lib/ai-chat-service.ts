import { startOfDay, addDays, format, parseISO } from "date-fns";
import { Transaction, RecurringPayment, SavingsGoal } from "./firestore";
import { aiCache } from "./cache-service";

const CONFIG = {
  // Use Groq for text chat to avoid Gemini quota issues
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
  baseUrl: "https://api.groq.com/openai/v1/chat/completions",
} as const;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface FinancialContext {
  balance: number;
  upcomingBills: RecurringPayment[];
  budgets: any[];
  recentTransactions: Transaction[];
  savingsGoals: SavingsGoal[];
}

const generatePrompt = (context: FinancialContext, userMessage: string) => {
  const today = format(new Date(), "yyyy-MM-dd");
  
  const upcomingBillsStr = context.upcomingBills
    .map(b => `- ${b.name}: ₹${b.amount} on ${b.nextDate || b.nextRunDate}`)
    .join("\n");

  const savingsGoalsStr = context.savingsGoals
    .map(g => `- ${g.name}: Target ₹${g.targetAmount} (Saved: ₹${g.currentAmount})`)
    .join("\n");

  const budgetsStr = context.budgets
    .map(b => {
      const percentage = (b.spent / b.limit) * 100;
      return `- ${b.category}: ₹${b.spent} used of ₹${b.limit} (${Math.round(percentage)}%)`;
    })
    .join("\n");

  const recentTxStr = context.recentTransactions
    .map(t => `- ${t.date instanceof Date ? format(t.date, "MMM d") : "Recent"}: ${t.title} (${t.type === "expense" ? "-" : "+"}₹${t.amount})`)
    .join("\n");

  return `
You are Finora AI, a world-class personal finance advisor. 
Today is ${today}.

USER FINANCIAL SNAPSHOT:
- Current Available Balance: ₹${context.balance.toLocaleString()}

BUDGET STATUS:
${budgetsStr || "No budgets set yet."}

UPCOMING BILLS (Next 7-30 days):
${upcomingBillsStr || "No major upcoming bills detected."}

SAVINGS GOALS:
${savingsGoalsStr || "No active savings goals."}

RECENT ACTIVITY (Last 10 transactions):
${recentTxStr || "No recent transactions found."}

USER QUERY: "${userMessage}"

GUIDELINES:
1. "CAN I AFFORD IT?": If the user asks this, perform a deep check:
   - Subtract upcoming bills from the balance.
   - Check if they are already near or over budget for that item's category.
   - If they have a savings goal, consider if this purchase slows them down.
   - Give a "Verdict": [Affordable / Caution / Not Recommended].
2. TONE: Be professional, insightful, and slightly encouraging.
3. CONCISE: Max 3-4 sentences. Use markdown for clarity (e.g., bolding amounts).
4. CURRENCY: Always use ₹ symbol.
5. PROACTIVE: If you see a budget exceeded or a big bill tomorrow, mention it as a "By the way...".

Response only with the advisory text.
`;
};

export const getAIChatResponse = async (
  messages: ChatMessage[],
  context: FinancialContext
): Promise<string> => {
  if (!CONFIG.apiKey) {
    return "Groq API key is not configured. Please check your .env file.";
  }

  const lastMessage = messages[messages.length - 1].content;
  
  // 1. Try Cache First
  const cacheKey = aiCache.generateKey("chat", { context, lastMessage });
  const cachedResponse = aiCache.get<string>(cacheKey);
  
  if (cachedResponse) {
    console.log("🚀 Serving chat response from cache");
    return cachedResponse;
  }

  const prompt = generatePrompt(context, lastMessage);

  try {
    const response = await fetch(CONFIG.baseUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.model,
        messages: [
          {
            role: "system",
            content: "You are Finora AI, a world-class financial advisor. You provide helpful, accurate, and concise financial advice based on the user's data."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to fetch Groq response");
    }

    const data = await response.json();
    const aiText = data.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that request.";

    // 2. Cache the response (TTL: 15 minutes is usually enough for chat context)
    aiCache.set(cacheKey, aiText, 15);

    return aiText;
  } catch (error) {
    console.error("Groq AI Error:", error);
    return "Sorry, I'm having trouble connecting to my brain right now. Please try again later.";
  }
};
