import { 
  Transaction, 
  RecurringPayment, 
   ExpenseDNA,
  getTransactionsInDateRange,
  getRecurringPayments,
  getUserProfile
} from "./firestore";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { groqChatCompletion } from "./groq-service";
import { 
  format, 
  startOfMonth, 
  subDays, 
  isWeekend, 
  getHours,
  parseISO
} from "date-fns";
import { Timestamp } from "firebase/firestore";

export interface ArchetypeResult {
  archetype: string;
  title: string;
  emoji: string;
  traits: string[];
  peakSpendDay: string;
  topCategory: string;
}

/**
 * Analyzes transactions to determine the spending personality (Archetype)
 */
export const detectArchetype = (
  transactions: Transaction[], 
  recurringPayments: RecurringPayment[]
): ArchetypeResult => {
  const expenses = transactions.filter(t => t.type === "expense");
  if (expenses.length === 0) {
    return {
      archetype: "balanced_budgeter",
      title: "Balanced Budgeter",
      emoji: "⚖️",
      traits: ["Starting Out", "Goal Oriented", "Cautious"],
      peakSpendDay: "N/A",
      topCategory: "None"
    };
  }

  const totalSpend = expenses.reduce((sum, t) => sum + t.amount, 0);
  
  // 1. Weekend Logic
  const weekendSpend = expenses.filter(t => {
    const date = t.date instanceof Date ? t.date : (t.date as any).toDate();
    return isWeekend(date) || format(date, "EEEE") === "Friday";
  }).reduce((sum, t) => sum + t.amount, 0);

  // 2. Night Owl Logic (10pm - 2am)
  const nightOwlSpend = expenses.filter(t => {
    const date = t.date instanceof Date ? t.date : (t.date as any).toDate();
    const hour = getHours(date);
    return hour >= 22 || hour < 2;
  }).reduce((sum, t) => sum + t.amount, 0);

  // 3. Subscription Count
  const activeSubs = recurringPayments.filter(p => p.status === "active").length;

  // 4. Food Dominance
  const catTotals: Record<string, number> = {};
  expenses.forEach(t => {
    catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
  });
  const topCategoryEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const topCategory = topCategoryEntry[0];
  const topCategoryRatio = topCategoryEntry[1] / totalSpend;

  // 5. Impulse Buying (< 300)
  const impulseCount = expenses.filter(t => t.amount < 300).length;
  const impulseRatio = impulseCount / expenses.length;

  // 6. Peak Day
  const dayTotals: Record<string, number> = {};
  expenses.forEach(t => {
    const date = t.date instanceof Date ? t.date : (t.date as any).toDate();
    const day = format(date, "EEEE");
    dayTotals[day] = (dayTotals[day] || 0) + t.amount;
  });
  const peakSpendDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0][0];

  // 7. SIP Warrior (Simplified check)
  const sipTotal = recurringPayments
    .filter(p => p.isSIP && p.status === "active")
    .reduce((sum, p) => sum + p.amount, 0);

  // Detection Tree
  if (sipTotal > totalSpend * 0.25) {
    return {
      archetype: "sip_warrior",
      title: "SIP Warrior",
      emoji: "🛡️",
      traits: ["Future Focused", "Disciplined", "Wealth Builder"],
      peakSpendDay,
      topCategory
    };
  }

  if (nightOwlSpend > totalSpend * 0.4) {
    return {
      archetype: "night_owl",
      title: "Night Owl Spender",
      emoji: "🦉",
      traits: ["Late Night Spender", "Convenience Searcher", "Active After Dark"],
      peakSpendDay,
      topCategory
    };
  }

  if (activeSubs >= 8) {
    return {
      archetype: "sub_hoarder",
      title: "Subscription Hoarder",
      emoji: "📜",
      traits: ["Recurring Heavy", "Content Lover", "Forgetful Canceller"],
      peakSpendDay,
      topCategory
    };
  }

  if (weekendSpend > totalSpend * 0.7) {
    return {
      archetype: "weekend_splurger",
      title: "Weekend Splurger",
      emoji: "🎉",
      traits: ["Fri-Sun Dominant", "Leisure Focused", "Social Butterfly"],
      peakSpendDay,
      topCategory
    };
  }

  if (topCategory.toLowerCase().includes("food") && topCategoryRatio > 0.3) {
    return {
      archetype: "food_first",
      title: "Food-First Financer",
      emoji: "🍔",
      traits: ["Foodie", "Delivery Dependent", "Dining Enthusiast"],
      peakSpendDay,
      topCategory
    };
  }

  if (impulseRatio > 0.4 && expenses.length > 15) {
    return {
      archetype: "impulse_buyer",
      title: "Impulse Buyer",
      emoji: "⚡",
      traits: ["Small Items Add Up", "Quick Decisions", "Frequent Transactions"],
      peakSpendDay,
      topCategory
    };
  }

  // Default
  return {
    archetype: "balanced_budgeter",
    title: "Steady Streamer",
    emoji: "🌊",
    traits: ["Consistent", "Predictable", "Measured"],
    peakSpendDay,
    topCategory
  };
};

/**
 * Generates the full DNA profile using Groq for the custom insight
 */
export const generateExpenseDNA = async (userId: string): Promise<ExpenseDNA> => {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const ninetyDaysAgo = subDays(now, 90);

  const transactions = await getTransactionsInDateRange(userId, ninetyDaysAgo, now);
  const recurring = await getRecurringPayments(userId);

  const archetype = detectArchetype(transactions, recurring);
  const monthKey = format(now, "yyyy-MM");

  const systemPrompt = `You are a witty financial psychologist.
The user has been categorized into a spending archetype: ${archetype.title}.
Traits: ${archetype.traits.join(", ")}.
Top Category: ${archetype.topCategory}.
Peak Spending Day: ${archetype.peakSpendDay}.

Generate ONE witty, short (max 15 words) insight or recommendation for this "Spending Personality". 
Match the tone to the emoji: ${archetype.emoji}.
Avoid generic advice. Be specific to the patterns mentioned.`;

  try {
    const insight = await groqChatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: "Tell me about my spending DNA." }
    ], { temperature: 0.8, maxTokens: 60 });

    const dnaProfile: ExpenseDNA = {
      ...archetype,
      insight,
      month: monthKey,
      generatedAt: Timestamp.now()
    };

    // Save to profile
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, { dnaProfile });

    return dnaProfile;
  } catch (error) {
    console.error("Error generating Expense DNA:", error);
    // Return fallback without Groq if it fails
    return {
      ...archetype,
      insight: `Your ${archetype.topCategory} habit peaks on ${archetype.peakSpendDay}. Stay mindful!`,
      month: monthKey,
      generatedAt: Timestamp.now()
    };
  }
};
