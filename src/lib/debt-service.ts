import { Liability } from "./firestore";

export interface Debt extends Liability {
  // We'll use Liability but ensure interestRate and monthlyEmi are treated as required for simulation
  interestRate: number;
  monthlyEmi: number;
}

export interface MonthSnapshot {
  month: number;
  totalRemaining: number;
  debts: {
    id: string;
    name: string;
    remaining: number;
    paidThisMonth: number;
    isCleared: boolean;
  }[];
}

export interface SimulationResult {
  strategy: "avalanche" | "snowball";
  totalInterestPaid: number;
  payoffMonth: number;
  schedule: MonthSnapshot[];
  debtPayoffDates: Record<string, number>; // debtId -> payoff month
}

/**
 * Simulates a debt payoff strategy
 */
export const simulatePayoff = (
  initialDebts: Liability[],
  extraBudget: number,
  strategy: "avalanche" | "snowball"
): SimulationResult => {
  // Filter out liabilities with no outstanding amount or rate info
  let debts = initialDebts
    .filter(d => d.outstandingAmount > 0)
    .map(d => ({
      ...d,
      remaining: d.outstandingAmount,
      interestRate: d.interestRate || 0,
      monthlyEmi: d.monthlyEmi || 0,
    }));

  const schedule: MonthSnapshot[] = [];
  const debtPayoffDates: Record<string, number> = {};
  let totalInterestPaid = 0;
  let month = 0;
  const MAX_MONTHS = 360; // 30 years cap

  while (debts.some(d => d.remaining > 0) && month < MAX_MONTHS) {
    month++;
    let monthlyExtra = extraBudget;
    let monthTotalRemaining = 0;
    const snapshots: MonthSnapshot["debts"] = [];

    // 1. Sort debts based on strategy
    const sortedDebts = [...debts].sort((a, b) => {
      if (strategy === "avalanche") {
        return b.interestRate - a.interestRate; // Highest interest first
      } else {
        return a.remaining - b.remaining; // Smallest balance first
      }
    });

    // 2. Pay minimums first and calculate interest
    const monthPayments: Record<string, number> = {};
    
    // First, handle interest accrual and mandatory minimums
    debts.forEach(d => {
      if (d.remaining <= 0) {
        monthPayments[d.id!] = 0;
        return;
      }

      const monthlyRate = (d.interestRate / 100) / 12;
      const interestCharge = d.remaining * monthlyRate;
      totalInterestPaid += interestCharge;
      d.remaining += interestCharge;

      const minPay = Math.min(d.remaining, d.monthlyEmi);
      d.remaining -= minPay;
      monthPayments[d.id!] = minPay;
    });

    // 3. Apply extra budget to prioritized debt
    for (const d of sortedDebts) {
      if (d.remaining > 0 && monthlyExtra > 0) {
        const extraPayment = Math.min(d.remaining, monthlyExtra);
        d.remaining -= extraPayment;
        monthlyExtra -= extraPayment;
        monthPayments[d.id!] += extraPayment;
      }
    }

    // 4. Record snapshots
    debts.forEach(d => {
      monthTotalRemaining += d.remaining;
      if (d.remaining <= 0 && !debtPayoffDates[d.id!]) {
        debtPayoffDates[d.id!] = month;
      }
      snapshots.push({
        id: d.id!,
        name: d.name,
        remaining: d.remaining,
        paidThisMonth: monthPayments[d.id!],
        isCleared: d.remaining <= 0
      });
    });

    schedule.push({
      month,
      totalRemaining: monthTotalRemaining,
      debts: snapshots
    });
  }

  return {
    strategy,
    totalInterestPaid: Math.round(totalInterestPaid),
    payoffMonth: month,
    schedule,
    debtPayoffDates
  };
};

/**
 * Utility to calculate current monthly surplus
 */
export const calculateSurplus = (income: number, expenses: number, recurringTotal: number): number => {
  const surplus = income - (expenses + recurringTotal);
  return Math.max(0, surplus);
};
