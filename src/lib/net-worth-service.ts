import { 
  Asset, 
  Liability, 
  NetWorthSnapshot,
  getAssets,
  getLiabilities,
  getNetWorthHistory,
  saveNetWorthSnapshot,
  getUserProfile,
  getRecurringPayments
} from "./firestore";
import { format, subMonths, startOfMonth } from "date-fns";

export interface NetWorthSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  assetsBreakdown: Record<string, number>;
  liabilitiesBreakdown: Record<string, number>;
  monthlyChange: number;
}

/**
 * Calculates current net worth summary for a user
 */
export const calculateNetWorth = async (userId: string): Promise<NetWorthSummary> => {
  const [profile, assets, liabilities, recurring, history] = await Promise.all([
    getUserProfile(userId),
    getAssets(userId),
    getLiabilities(userId),
    getRecurringPayments(userId),
    getNetWorthHistory(userId, 1)
  ]);

  const manualAssetsTotal = assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.outstandingAmount, 0);
  
  // SIP investments from recurring payments also count as manual intent
  const sipTotal = recurring
    .filter(p => p.isSIP && p.status === "active")
    .reduce((sum, p) => sum + (p.currentValue || 0), 0);

  // If the user hasn't added ANY manual assets, liabilities, or SIPs, 
  // we show net worth as 0 as per user request, even if they have a bank balance.
  const hasManualData = assets.length > 0 || liabilities.length > 0 || sipTotal > 0;
  
  const assetsBreakdown: Record<string, number> = {
    liquid: hasManualData ? (profile?.currentBalance || 0) : 0,
    investment: sipTotal,
    physical: 0,
    other: 0
  };

  // Add manual assets to breakdown
  assets.forEach(asset => {
    assetsBreakdown[asset.category] = (assetsBreakdown[asset.category] || 0) + asset.currentValue;
  });

  const totalAssets = Object.values(assetsBreakdown).reduce((sum, val) => sum + val, 0);

  // Liabilities breakdown
  const liabilitiesBreakdown: Record<string, number> = {
    homeloan: 0,
    carloan: 0,
    creditcard: 0,
    other: 0
  };

  liabilities.forEach(l => {
    liabilitiesBreakdown[l.category] = (liabilitiesBreakdown[l.category] || 0) + l.outstandingAmount;
  });

  const netWorth = hasManualData ? (totalAssets - totalLiabilities) : 0;

  // Calculate MoM change
  const lastMonthSnapshot = history.length > 0 ? history[0] : null;
  const monthlyChange = lastMonthSnapshot ? netWorth - lastMonthSnapshot.netWorth : 0;

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    assetsBreakdown,
    liabilitiesBreakdown,
    monthlyChange
  };
};

/**
 * Captures a snapshot for the current month
 */
export const captureNetWorthSnapshot = async (userId: string): Promise<void> => {
  const summary = await calculateNetWorth(userId);
  const month = format(new Date(), "yyyy-MM");

  await saveNetWorthSnapshot(userId, {
    month,
    totalAssets: summary.totalAssets,
    totalLiabilities: summary.totalLiabilities,
    netWorth: summary.netWorth,
    assetsBreakdown: summary.assetsBreakdown,
    liabilitiesBreakdown: summary.liabilitiesBreakdown
  });
};

/**
 * Ensures a snapshot exists for previous months if missing (backfill)
 */
export const ensureHistoryData = async (userId: string): Promise<void> => {
  const history = await getNetWorthHistory(userId, 12);
  if (history.length === 0) {
    // Take first snapshot today
    await captureNetWorthSnapshot(userId);
  }
};
