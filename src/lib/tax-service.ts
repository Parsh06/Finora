import { Transaction, RecurringPayment, Asset } from "./firestore";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, format, differenceInDays } from "date-fns";
import { groqChatCompletion } from "./groq-service";

export interface TaxProgress {
  section80C: {
    limit: number;
    filled: number;
    sources: { name: string; amount: number }[];
  };
  sectionNPS: {
    limit: number;
    filled: number;
    sources: { name: string; amount: number }[];
  };
  section80D: {
    limit: number;
    filled: number;
    sources: { name: string; amount: number }[];
  };
  hra: {
    rentPaid: number;
    sources: { name: string; amount: number }[];
  };
}

/**
 * Returns the start and end dates of the current Indian Financial Year (April 1 to March 31)
 */
export const getFinancialYearRange = (date = new Date()) => {
  const currentMonth = date.getMonth(); // 0-indexed (0 = Jan, 3 = April)
  const currentYear = date.getFullYear();
  
  let startYear = currentYear;
  if (currentMonth < 3) {
    // If we are in Jan/Feb/March, the FY started in the previous calendar year
    startYear = currentYear - 1;
  }
  
  const start = new Date(startYear, 3, 1); // April 1st
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59); // March 31st next year
  
  return { start, end };
};

/**
 * Aggregates tax-saving contributions across transactions, SIPs, and assets
 */
export const calculateTaxProgress = (
  transactions: Transaction[],
  recurring: RecurringPayment[],
  assets: Asset[]
): TaxProgress => {
  const { start, end } = getFinancialYearRange();
  
  const progress: TaxProgress = {
    section80C: { limit: 150000, filled: 0, sources: [] },
    sectionNPS: { limit: 50000, filled: 0, sources: [] },
    section80D: { limit: 25000, filled: 0, sources: [] },
    hra: { rentPaid: 0, sources: [] },
  };

  // 1. Process SIPs (Recurring Payments)
  recurring.forEach(p => {
    if (p.status !== "active" || p.type !== "expense") return;
    
    // Calculate how many times this SIP triggered/will trigger in the current FY
    // For simplicity, we'll assume monthly frequency for most tax-saving SIPs
    if (p.frequency === "monthly") {
      const SIPMonthsInFY = 12; // Simplified: assume it runs every month
      const yearlyContribution = p.amount * SIPMonthsInFY;

      if (p.taxBenefit80C) {
        progress.section80C.filled += yearlyContribution;
        progress.section80C.sources.push({ name: `${p.name} (SIP)`, amount: yearlyContribution });
      }
      if (p.taxBenefitNPS) {
        progress.sectionNPS.filled += yearlyContribution;
        progress.sectionNPS.sources.push({ name: `${p.name} (SIP)`, amount: yearlyContribution });
      }
    }
  });

  // 2. Process Assets (Lump-sum 80C entries like PPF/ELSS)
  assets.forEach(a => {
    if (a.taxBenefit80C) {
      // For assets, we assume the current value is the contribution if it was updated in this FY
      // Simplified: Just add it if tagged
      progress.section80C.filled += a.currentValue;
      progress.section80C.sources.push({ name: `${a.name} (Asset)`, amount: a.currentValue });
    }
  });

  // 3. Process Transactions (80D Insurance / Rent HRA)
  transactions.forEach(t => {
    const tDate = t.date instanceof Date ? t.date : (t.date as any).toDate?.() || new Date(t.date as any);
    if (!isWithinInterval(tDate, { start, end })) return;

    const cat = t.category.toLowerCase();
    
    // Health Insurance (80D)
    if (cat === "health" || cat === "insurance") {
      progress.section80D.filled += t.amount;
      progress.section80D.sources.push({ name: t.title, amount: t.amount });
    }

    // Rent Paid (HRA)
    if (cat === "rent" || t.title.toLowerCase().includes("rent")) {
      progress.hra.rentPaid += t.amount;
      progress.hra.sources.push({ name: t.title, amount: t.amount });
    }
  });

  return progress;
};

export const getDaysToDeadline = () => {
  const { end } = getFinancialYearRange();
  const today = new Date();
  return Math.max(0, differenceInDays(end, today));
};

/**
 * Generates personalized AI tax advice based on current progress
 */
export const getTaxAdvice = async (progress: TaxProgress): Promise<string> => {
  const daysLeft = getDaysToDeadline();
  
  const prompt = `
    You are a tax expert advisor for Finora, a premium Indian personal finance app.
    Based on the following tax-saving progress for the current Financial Year (FY 2024-25), 
    provide exactly 2 sentences of high-impact, actionable advice.
    
    Current Progress:
    - Section 80C: ₹${progress.section80C.filled} reached out of ₹1,50,000 limit.
    - Section 80D (Health Insurance): ₹${progress.section80D.filled} paid (Limit ₹25,000).
    - Section NPS (80CCD): ₹${progress.sectionNPS.filled} contributed out of extra ₹50,000 limit.
    - HRA (Rent Paid): ₹${progress.hra.rentPaid} detected.
    - Days remaining until March 31st deadline: ${daysLeft} days.
    
    Advice guidelines:
    - Be professional, encouraging, and focused on maximizing tax savings.
    - If 80C is not filled, suggest ELSS or PPF.
    - If NPS is not utilized, mention the additional ₹50k benefit.
    - Keep it under 50 words total.
    - Do not mention other sections unless progress is 0.
  `;

  try {
    const advice = await groqChatCompletion([
      { role: "system", content: "You are a concise Indian tax expert." },
      { role: "user", content: prompt }
    ], { temperature: 0.5, maxTokens: 150 });
    
    return advice.trim().replace(/^"|"$/g, '');
  } catch (error) {
    console.error("Failed to get AI tax advice:", error);
    return `You have ₹${Math.max(0, 150000 - progress.section80C.filled).toLocaleString()} remaining in 80C. Consider investing in ELSS or PPF before the March 31st deadline to maximize your tax savings.`;
  }
};
