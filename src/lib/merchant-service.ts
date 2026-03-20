import { 
  getMerchantMapping, 
  updateMerchantMapping, 
  MerchantMapping,
  batchUpdateTransactionsCategory
} from "./firestore";

/**
 * Normalizes merchant names for consistent lookup
 * Example: "SWIGGY IT", "Swiggy.", "swiggy" -> "swiggy"
 */
export const normalizeMerchantName = (name: string): string => {
  if (!name) return "";
  
  return name
    .toLowerCase()
    .trim()
    // Remove common suffixes/prefixes and punctuation
    .replace(/\s+/g, ' ')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
    .replace(/\s(it|inc|limited|ltd|corp|corporation|pvt|private|services|store|shop|online|india)\b/g, "")
    .trim();
};

/**
 * Calculates confidence score based on manual correction counts
 * Formula: correctionCount / (correctionCount + 1)
 */
export const calculateCorrectionConfidence = (correctionCount: number): number => {
  if (correctionCount <= 0) return 0;
  return correctionCount / (correctionCount + 1);
};

const CONFIDENCE_THRESHOLD = 0.8;

interface PredictionResult {
  category: string;
  isLearned: boolean;
  confidence: number;
}

/**
 * Predicts the preferred category for a merchant based on historical learning
 */
export const predictCategory = async (
  userId: string, 
  merchantName: string, 
  aiCategory: string
): Promise<PredictionResult> => {
  const normalized = normalizeMerchantName(merchantName);
  if (!normalized) return { category: aiCategory, isLearned: false, confidence: 0 };

  const mapping = await getMerchantMapping(userId, normalized);
  
  if (mapping && mapping.confidence >= CONFIDENCE_THRESHOLD) {
    return { 
      category: mapping.preferredCategory, 
      isLearned: true, 
      confidence: mapping.confidence 
    };
  }

  return { 
    category: aiCategory, 
    isLearned: false, 
    confidence: mapping?.confidence || 0 
  };
};

/**
 * Records a category correction and updates the learning model
 */
export const recordCorrection = async (
  userId: string,
  merchantName: string,
  newCategory: string,
  aiOriginalCategory?: string
): Promise<void> => {
  const normalized = normalizeMerchantName(merchantName);
  const existing = await getMerchantMapping(userId, normalized);

  const correctionCount = (existing?.correctionCount || 0) + 1;
  const confidence = calculateCorrectionConfidence(correctionCount);

  await updateMerchantMapping(userId, {
    merchant: normalized,
    preferredCategory: newCategory,
    correctionCount,
    confidence,
    aiOriginalCategory: existing?.aiOriginalCategory || aiOriginalCategory,
    lastCorrected: new Date()
  });
};

export { batchUpdateTransactionsCategory };

/**
 * Groups transactions by normalized merchant name for a specific category
 */
export const groupTransactionsByMerchant = (
  transactions: any[],
  category: string
) => {
  const filtered = transactions.filter(t => 
    t.type === "expense" && 
    t.category.toLowerCase() === category.toLowerCase()
  );

  const merchantGroups: Record<string, { 
    name: string; 
    total: number; 
    count: number; 
    transactions: any[] 
  }> = {};

  filtered.forEach(t => {
    const normalized = normalizeMerchantName(t.merchant || "Unknown");
    const displayName = t.merchant || "Unknown";

    if (!merchantGroups[normalized]) {
      merchantGroups[normalized] = {
        name: displayName,
        total: 0,
        count: 0,
        transactions: []
      };
    }
    merchantGroups[normalized].total += t.amount;
    merchantGroups[normalized].count += 1;
    merchantGroups[normalized].transactions.push(t);
  });

  return Object.values(merchantGroups).sort((a, b) => b.total - a.total);
};

/**
 * Calculates monthly totals for the last 6 months for a specific merchant
 */
export const getMerchantSparklineData = (
  allTransactions: any[],
  normalizedMerchantName: string
) => {
  const now = new Date();
  const months = [];
  
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      total: 0
    });
  }

  allTransactions.forEach(t => {
    if (normalizeMerchantName(t.merchant) !== normalizedMerchantName) return;
    
    const tDate = t.date instanceof Date ? t.date : (t.date as any).toDate();
    const tKey = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
    
    const monthIndex = months.findIndex(m => m.key === tKey);
    if (monthIndex !== -1) {
      months[monthIndex].total += t.amount;
    }
  });

  return months.map(m => m.total);
};
