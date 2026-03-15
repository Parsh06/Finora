import { Transaction, RecurringPayment } from "./firestore";
import { subDays, isAfter, parseISO, differenceInDays } from "date-fns";

export interface SubscriptionInsight {
  id: string;
  type: "potential" | "zombie" | "hike";
  merchant: string;
  amount: number;
  frequency: string;
  confidence: number;
  message: string;
  lastTransactionDate?: Date;
  change?: number; // For price hikes
}

/**
 * Service to analyze transactions and identify subscription patterns
 */
export const analyzeSubscriptions = (
  transactions: Transaction[],
  recurringPayments: RecurringPayment[]
): SubscriptionInsight[] => {
  const insights: SubscriptionInsight[] = [];
  const now = new Date();

  // 1. Group transactions by merchant
  const merchantGroups: Record<string, Transaction[]> = {};
  transactions.forEach((t) => {
    if (t.type !== "expense") return;
    const key = t.title.toLowerCase().trim();
    if (!merchantGroups[key]) merchantGroups[key] = [];
    merchantGroups[key].push(t);
  });

  // 2. Identify Potential New Subscriptions (3+ consecutive months of similar amounts)
  Object.entries(merchantGroups).forEach(([merchant, history]) => {
    if (history.length < 3) return;

    // Sort by date desc
    const sorted = [...history].sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : (a.date as any).toDate();
      const dateB = b.date instanceof Date ? b.date : (b.date as any).toDate();
      return dateB.getTime() - dateA.getTime();
    });

    // Check if it's already in recurring payments
    const isAlreadyRecurring = recurringPayments.some(
      (rp) => rp.name.toLowerCase().trim() === merchant
    );
    if (isAlreadyRecurring) return;

    // Simple pattern matching: last 3 transactions are roughly 30 days apart
    let isMonthlyPattern = true;
    for (let i = 0; i < 2; i++) {
        const d1 = sorted[i].date instanceof Date ? sorted[i].date : (sorted[i].date as any).toDate();
        const d2 = sorted[i+1].date instanceof Date ? sorted[i+1].date : (sorted[i+1].date as any).toDate();
        const diff = differenceInDays(d1, d2);
        if (diff < 25 || diff > 35) {
            isMonthlyPattern = false;
            break;
        }
    }

    if (isMonthlyPattern) {
      insights.push({
        id: `pot-${merchant}`,
        type: "potential",
        merchant: history[0].title,
        amount: history[0].amount,
        frequency: "monthly",
        confidence: 0.8,
        message: `Found a monthly pattern for "${history[0].title}". Add as a recurring payment?`
      });
    }
  });

  // 3. Detect Price Hikes
  recurringPayments.forEach((rp) => {
    if (rp.status !== "active") return;
    
    const history = merchantGroups[rp.name.toLowerCase().trim()] || [];
    if (history.length < 2) return;

    // Sort by date desc
    const sorted = [...history].sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : (a.date as any).toDate();
        const dateB = b.date instanceof Date ? b.date : (b.date as any).toDate();
        return dateB.getTime() - dateA.getTime();
    });

    const latest = sorted[0];
    const previous = sorted[1];

    if (latest.amount > previous.amount) {
      insights.push({
        id: `hike-${rp.id}`,
        type: "hike",
        merchant: rp.name,
        amount: latest.amount,
        change: latest.amount - previous.amount,
        frequency: rp.frequency,
        confidence: 0.9,
        message: `Price increased by ₹${latest.amount - previous.amount} for ${rp.name}!`
      });
    }
  });

  // 4. Detect "Zombie" Subscriptions (Recurring but no transaction in last 45 days)
  recurringPayments.forEach((rp) => {
    if (rp.status !== "active" || rp.frequency !== "monthly") return;

    const history = merchantGroups[rp.name.toLowerCase().trim()] || [];
    const fortyFiveDaysAgo = subDays(now, 45);

    const hasRecentTransaction = history.some((t) => {
      const date = t.date instanceof Date ? t.date : (t.date as any).toDate();
      return isAfter(date, fortyFiveDaysAgo);
    });

    if (!hasRecentTransaction && history.length > 0) {
      insights.push({
        id: `zombie-${rp.id}`,
        type: "zombie",
        merchant: rp.name,
        amount: rp.amount,
        frequency: rp.frequency,
        confidence: 0.7,
        message: `You're paying for ${rp.name} but haven't used it lately. Cancel it?`
      });
    }
  });

  return insights;
};
