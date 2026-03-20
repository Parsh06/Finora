import { Transaction } from "./firestore";

/**
 * Calculates Net Present Value (NPV) for a given rate, cashflows and dates
 */
function npv(rate: number, cashflows: number[], dates: Date[]): number {
  let npvValue = 0;
  const firstDate = dates[0].getTime();
  
  for (let i = 0; i < cashflows.length; i++) {
    const diffDays = (dates[i].getTime() - firstDate) / (24 * 60 * 60 * 1000);
    npvValue += cashflows[i] / Math.pow(1 + rate, diffDays / 365);
  }
  
  return npvValue;
}

/**
 * Calculates the derivative of NPV (dNPV) for a given rate, cashflows and dates
 */
function dnpv(rate: number, cashflows: number[], dates: Date[]): number {
  let dnpvValue = 0;
  const firstDate = dates[0].getTime();
  
  for (let i = 0; i < cashflows.length; i++) {
    const diffDays = (dates[i].getTime() - firstDate) / (24 * 60 * 60 * 1000);
    const fraction = diffDays / 365;
    dnpvValue -= fraction * cashflows[i] / Math.pow(1 + rate, fraction + 1);
  }
  
  return dnpvValue;
}

/**
 * Calculates XIRR (Extended Internal Rate of Return) using Newton-Raphson method
 * Returns annualized rate (e.g., 0.143 for 14.3%)
 */
export function calculateXIRR(cashflows: number[], dates: Date[]): number {
  if (cashflows.length < 2 || cashflows.length !== dates.length) return 0;

  // Initial guess: 10%
  let rate = 0.1;
  const maxIterations = 100;
  const precision = 1e-7;

  for (let i = 0; i < maxIterations; i++) {
    const f = npv(rate, cashflows, dates);
    const df = dnpv(rate, cashflows, dates);
    
    if (Math.abs(df) < 1e-10) break; // Avoid division by zero
    
    const newRate = rate - f / df;
    
    if (Math.abs(newRate - rate) < precision) {
      return newRate;
    }
    
    rate = newRate;
  }

  return rate; // Best approximation
}

/**
 * Extracts cashflows from transactions linked to a specific SIP
 * and appends the current value as the final positive cashflow.
 */
export function getSIPCashflows(transactions: Transaction[], currentValue?: number): { cashflows: number[], dates: Date[] } {
  // Sort transactions by date ascending
  const sortedTxns = [...transactions].sort((a, b) => {
    const dateA = a.date instanceof Date ? a.date : (a.date as any).toDate();
    const dateB = b.date instanceof Date ? b.date : (b.date as any).toDate();
    return dateA.getTime() - dateB.getTime();
  });

  const cashflows: number[] = sortedTxns.map(t => -Math.abs(t.amount)); // Outflows are negative
  const dates: Date[] = sortedTxns.map(t => t.date instanceof Date ? t.date : (t.date as any).toDate());

  // Add the current portfolio value as a final positive cashflow today
  if (currentValue && currentValue > 0) {
    cashflows.push(currentValue);
    dates.push(new Date());
  }

  return { cashflows, dates };
}

/**
 * Calculates real return (inflation-adjusted)
 */
export function calculateRealReturn(xirr: number, inflationRate: number = 0.055): number {
  // Formula: (1 + nominal) / (1 + inflation) - 1
  return ((1 + xirr) / (1 + inflationRate)) - 1;
}
