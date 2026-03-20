import { Budget, Transaction, transactionsCollection } from "./firestore";
import { getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { startOfMonth, subMonths, format } from "date-fns";

/**
 * Service for Zero-Based Budgeting logic and AI suggestions
 */

export interface ZBBAllocation {
  category: string;
  amount: number;
  percentage: number;
}

/**
 * Deducts a savings percentage from total income before allocation
 */
export const calculateSavingsFirst = (income: number, savingsPercent: number): { 
  savingsAmount: number; 
  remainingToAllocate: number 
} => {
  const savingsAmount = (income * savingsPercent) / 100;
  return {
    savingsAmount,
    remainingToAllocate: income - savingsAmount
  };
};

/**
 * Aggregates actual spending over the last 3 months to inform budget suggestions
 */
export const getLast3MonthsSpending = async (userId: string): Promise<Record<string, number>> => {
  const threeMonthsAgo = startOfMonth(subMonths(new Date(), 3));
  const q = query(
    transactionsCollection(userId),
    where("date", ">=", Timestamp.fromDate(threeMonthsAgo)),
    where("type", "==", "expense")
  );

  const snapshot = await getDocs(q);
  const spendingByCategory: Record<string, number> = {};

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const category = data.category.toLowerCase();
    const amount = data.amount || 0;
    spendingByCategory[category] = (spendingByCategory[category] || 0) + (amount / 3); // Average per month
  });

  return spendingByCategory;
};

/**
 * Call Groq AI to suggest a Zero-Based Budget allocation
 */
export const getSuggestedZBBAllocation = async (
  userId: string, 
  monthlyIncome: number,
  existingCategories: string[]
): Promise<ZBBAllocation[]> => {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error("Groq API key not found");

  const averageSpend = await getLast3MonthsSpending(userId);
  
  const systemPrompt = `You are a professional financial planner. 
Suggest a Zero-Based Budget (ZBB) allocation where Total Income = Total Allocated.
The user's monthly income is ₹${monthlyIncome}.

Available Categories: ${existingCategories.join(", ")}
Past 3-month average spending (per month):
${JSON.stringify(averageSpend, null, 2)}

Requirements:
1. Total sum of amounts MUST EXACTLY equal ₹${monthlyIncome}.
2. Ensure high-priority items like Rent, Bills, and Savings (suggest a 'Savings' category if not present) are covered.
3. If past spending exceeds income, shave 10-15% off discretionary categories like "Food" or "Entertainment".
4. Return ONLY a JSON array of objects: { "category": "categoryName", "amount": number, "percentage": number }`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }],
      temperature: 0.3,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) throw new Error("Failed to get AI suggestion");
  const result = await response.json();
  const content = JSON.parse(result.choices[0].message.content);
  
  // The content might be { "allocations": [...] } or just the array depending on AI interpretation
  const rawAllocations = Array.isArray(content) ? content : (content.allocations || Object.values(content)[0]);
  
  return rawAllocations as ZBBAllocation[];
};
