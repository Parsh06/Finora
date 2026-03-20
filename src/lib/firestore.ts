import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

// Types
export interface Transaction {
  id?: string;
  userId: string;
  title: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  date: Timestamp | Date;
  icon?: string;
  paymentMethod?: string;
  note?: string;
  isRecurring?: boolean; // Flag to indicate if this was auto-generated
  isLearned?: boolean; // Flag to indicate if this was predicted by the learning engine
  recurringPaymentId?: string; // Link back to recurring payment record
  receiptId?: string; // Link to a scanned receipt for line-item grouping
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Budget {
  id?: string;
  userId: string;
  category: string;
  icon: string;
  limit: number;
  spent: number;
  period: "weekly" | "monthly" | "yearly";
  rolloverEnabled?: boolean;
  rolloverAmount?: number;
  lastProcessedPeriod?: string; // YYYY-MM or YYYY-WW
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RecurringPayment {
  id?: string;
  userId: string;
  name: string;
  amount: number;
  frequency: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  repeatDays?: string[]; // Array of days: "MON", "TUE", etc.
  startDate: string; // Anchor date - ISO format (yyyy-MM-dd)
  nextRunDate: string; // Next date when transaction should be created (yyyy-MM-dd)
  category: string;
  type: "expense" | "income";
  paymentMethod?: string;
  icon: string;
  color: string;
  status: "active" | "paused" | "cancelled";
  reminderEnabled: boolean;
  // SIP Step-up fields
  isSIP?: boolean;
  stepUpPercentage?: number;
  stepUpFrequency?: "monthly" | "yearly";
  lastStepUpDate?: string; // ISO yyyy-MM-dd
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  // Legacy fields for backward compatibility
  nextDate?: string;
  isActive?: boolean;
  pausedAt?: string; // ISO date string when it was paused
  remainingDays?: number; // Days remaining until next trigger at time of pause
  currentValue?: number; // For SIPs: Units * NAV
  lastValueUpdated?: Timestamp;
  benchmarkReturn?: number; // For comparison (e.g. Nifty 50)
  taxBenefit80C?: boolean;
  taxBenefitNPS?: boolean;
}

export interface Asset {
  id?: string;
  userId: string;
  name: string;
  category: "liquid" | "investment" | "physical" | "other";
  currentValue: number;
  lastUpdated: Timestamp;
  linkedSipId?: string;
  taxBenefit80C?: boolean;
}

export interface Liability {
  id?: string;
  userId: string;
  name: string;
  category: "homeloan" | "carloan" | "creditcard" | "other" | "loan";
  outstandingAmount: number;
  monthlyEmi?: number;
  interestRate?: number;
  minimumPayment?: number;
  lastUpdated: Timestamp | Date;
}

export interface NetWorthSnapshot {
  id?: string;
  userId: string;
  month: string; // YYYY-MM
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  assetsBreakdown: Record<string, number>;
  liabilitiesBreakdown: Record<string, number>;
  timestamp: Timestamp;
}

export interface MonthlyNarrative {
  id?: string;
  userId: string;
  month: string; // YYYY-MM
  content: string;
  context: any; // The financial context object used for generation
  generatedAt: Timestamp;
  expiresAt: Timestamp; // 24 hours after generation
}

export interface ExpenseDNA {
  archetype: string;
  title: string;
  emoji: string;
  traits: string[];
  insight: string;
  peakSpendDay: string;
  topCategory: string;
  generatedAt: Timestamp;
  month: string; // YYYY-MM
}

export interface UserProfile {
  id?: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  currency: string;
  currentBalance?: number;
  cashFlowSafetyFloor?: number;
  salaryDate?: number;
  salaryAmount?: number;
  budgetingMode?: "limit" | "zerobased";
  savingsFirstPercent?: number;
  merchantWatchlist?: string[]; // Array of normalized merchant names
  dnaProfile?: ExpenseDNA;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Category {
  id?: string;
  userId: string;
  name: string;
  type: "expense" | "income";
  icon: string;
  color: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MerchantMapping {
  id?: string;
  userId: string;
  merchant: string; // Normalized name
  preferredCategory: string;
  correctionCount: number;
  confidence: number;
  aiOriginalCategory?: string;
  lastCorrected: Timestamp | Date;
}

// Transactions
export const transactionsCollection = (userId: string) =>
  collection(db, "users", userId, "transactions");

export const getTransactions = async (
  userId: string,
  limitCount?: number
): Promise<Transaction[]> => {
  const q = query(
    transactionsCollection(userId),
    orderBy("date", "desc"),
    ...(limitCount ? [limit(limitCount)] : [])
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    date: doc.data().date?.toDate() || new Date(),
  })) as Transaction[];
};

export const subscribeToTransactions = (
  userId: string,
  callback: (transactions: Transaction[]) => void,
  limitCount?: number
) => {
  const q = query(
    transactionsCollection(userId),
    orderBy("date", "desc"),
    ...(limitCount ? [limit(limitCount)] : [])
  );
  return onSnapshot(q, (snapshot) => {
    const transactions = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: data.date?.toDate ? data.date.toDate() : (data.date instanceof Date ? data.date : new Date()),
      } as Transaction;
    });
    console.log(`📊 Transactions updated: ${transactions.length} transactions received`);
    callback(transactions);
  }, (error) => {
    console.error("❌ Error in transaction subscription:", error);
    callback([]);
  });
};

export const addTransaction = async (
  userId: string,
  transaction: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<string> => {
  // Validate required fields
  if (!userId || !userId.trim()) {
    throw new Error("User ID is required");
  }

  if (!transaction.title || !transaction.title.trim()) {
    throw new Error("Transaction title is required");
  }

  if (!transaction.category || !transaction.category.trim()) {
    throw new Error("Transaction category is required");
  }

  if (typeof transaction.amount !== "number" || isNaN(transaction.amount) || transaction.amount <= 0) {
    throw new Error(`Invalid transaction amount: ${transaction.amount}`);
  }

  if (!transaction.type || (transaction.type !== "income" && transaction.type !== "expense")) {
    throw new Error(`Invalid transaction type: ${transaction.type}`);
  }

  if (!transaction.date) {
    throw new Error("Transaction date is required");
  }

  // Convert date to Timestamp if it's a Date object
  let dateTimestamp: Timestamp;
  if (transaction.date instanceof Date) {
    dateTimestamp = Timestamp.fromDate(transaction.date);
  } else if (transaction.date instanceof Timestamp) {
    dateTimestamp = transaction.date;
  } else {
    // If it's already a Timestamp or other format, try to convert
    try {
      dateTimestamp = Timestamp.fromDate(new Date(transaction.date as any));
    } catch {
      dateTimestamp = Timestamp.now();
    }
  }

  // Filter out undefined values as Firestore doesn't support them
  const cleanedTransaction: any = {
    userId: userId.trim(),
    title: transaction.title.trim(),
    category: transaction.category.trim(),
    amount: Number(transaction.amount),
    type: transaction.type,
    date: dateTimestamp,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  // Only add optional fields if they have values
  if (transaction.icon !== undefined && transaction.icon !== null && transaction.icon !== "") {
    cleanedTransaction.icon = transaction.icon;
  }
  if (transaction.paymentMethod !== undefined && transaction.paymentMethod !== null && transaction.paymentMethod !== "") {
    cleanedTransaction.paymentMethod = transaction.paymentMethod.trim();
  }
  if (transaction.note !== undefined && transaction.note !== null && transaction.note !== "") {
    cleanedTransaction.note = transaction.note.trim();
  }
  if (transaction.receiptId !== undefined && transaction.receiptId !== null && transaction.receiptId !== "") {
    cleanedTransaction.receiptId = transaction.receiptId.trim();
  }

  try {
    const collectionPath = `users/${userId}/transactions`;
    console.log("📝 Adding transaction to Firestore:", {
      userId,
      collectionPath,
      transactionData: cleanedTransaction,
      dateType: cleanedTransaction.date?.constructor?.name,
    });

    // Verify collection path
    const collectionRef = transactionsCollection(userId);
    console.log("Collection reference:", collectionRef.path);

    const docRef = await addDoc(collectionRef, cleanedTransaction);

    console.log("✅ Transaction saved successfully!");
    console.log("Document ID:", docRef.id);
    console.log("Document path:", docRef.path);
    console.log("Saved data:", {
      id: docRef.id,
      ...cleanedTransaction,
      date: cleanedTransaction.date?.toDate?.()?.toISOString() || cleanedTransaction.date,
    });

    return docRef.id;
  } catch (error: any) {
    console.error("❌ Firestore error adding transaction:", error);
    console.error("Error details:", {
      code: error.code,
      message: error.message,
      stack: error.stack,
    });

    // Provide more helpful error messages
    if (error.code === "permission-denied") {
      throw new Error("Permission denied. Please check your Firestore security rules.");
    } else if (error.code === "invalid-argument") {
      throw new Error(`Invalid data: ${error.message}`);
    } else if (error.code === "unavailable") {
      throw new Error("Firestore service is temporarily unavailable. Please try again.");
    }

    throw error;
  }
};

export const updateTransaction = async (
  userId: string,
  transactionId: string,
  updates: Partial<Transaction>
): Promise<void> => {
  const transactionRef = doc(
    db,
    "users",
    userId,
    "transactions",
    transactionId
  );

  // Filter out undefined values and build update data
  const updateData: any = {
    updatedAt: Timestamp.now(),
  };

  // Only include fields that are actually being updated (not undefined)
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.amount !== undefined) updateData.amount = updates.amount;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.icon !== undefined) updateData.icon = updates.icon;
  if (updates.paymentMethod !== undefined && updates.paymentMethod !== null && updates.paymentMethod !== "") {
    updateData.paymentMethod = updates.paymentMethod;
  }
  if (updates.note !== undefined && updates.note !== null && updates.note !== "") {
    updateData.note = updates.note;
  }
  if (updates.receiptId !== undefined && updates.receiptId !== null && updates.receiptId !== "") {
    updateData.receiptId = updates.receiptId;
  }

  // Convert date if it's a Date object
  if (updates.date !== undefined) {
    updateData.date = updates.date instanceof Date ? Timestamp.fromDate(updates.date) : updates.date;
  }

  await updateDoc(transactionRef, updateData);
};

export const deleteTransaction = async (
  userId: string,
  transactionId: string
): Promise<void> => {
  const transactionRef = doc(db, "users", userId, "transactions", transactionId);
  await deleteDoc(transactionRef);
};

export const updateUserSettings = async (
  userId: string,
  settings: Partial<UserProfile>
): Promise<void> => {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    ...settings,
    updatedAt: Timestamp.now(),
  });
};

// Budgets
export const budgetsCollection = (userId: string) =>
  collection(db, "users", userId, "budgets");

export const getBudgets = async (userId: string): Promise<Budget[]> => {
  const querySnapshot = await getDocs(budgetsCollection(userId));
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Budget[];
};

export const subscribeToBudgets = (
  userId: string,
  callback: (budgets: Budget[]) => void
) => {
  return onSnapshot(budgetsCollection(userId), (snapshot) => {
    const budgets = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Budget[];
    callback(budgets);
  });
};

export const addBudget = async (
  userId: string,
  budget: Omit<Budget, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<string> => {
  // Filter out undefined values as Firestore doesn't support them
  const budgetData: any = {
    userId,
    category: budget.category,
    icon: budget.icon,
    limit: budget.limit,
    spent: budget.spent || 0,
    period: budget.period,
    rolloverEnabled: budget.rolloverEnabled || false,
    rolloverAmount: budget.rolloverAmount || 0,
    lastProcessedPeriod: budget.lastProcessedPeriod || "",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(budgetsCollection(userId), budgetData);
  return docRef.id;
};

export const updateBudget = async (
  userId: string,
  budgetId: string,
  updates: Partial<Budget>
): Promise<void> => {
  const budgetRef = doc(
    db,
    "users",
    userId,
    "budgets",
    budgetId
  );

  // Filter out undefined values
  const updateData: any = {
    updatedAt: Timestamp.now(),
  };

  // Only include fields that are actually being updated (not undefined)
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.icon !== undefined) updateData.icon = updates.icon;
  if (updates.limit !== undefined) updateData.limit = updates.limit;
  if (updates.spent !== undefined) updateData.spent = updates.spent;
  if (updates.period !== undefined) updateData.period = updates.period;
  if (updates.rolloverEnabled !== undefined) updateData.rolloverEnabled = updates.rolloverEnabled;
  if (updates.rolloverAmount !== undefined) updateData.rolloverAmount = updates.rolloverAmount;
  if (updates.lastProcessedPeriod !== undefined) updateData.lastProcessedPeriod = updates.lastProcessedPeriod;

  await updateDoc(budgetRef, updateData);
};

export const deleteBudget = async (
  userId: string,
  budgetId: string
): Promise<void> => {
  const budgetRef = doc(
    db,
    "users",
    userId,
    "budgets",
    budgetId
  );
  await deleteDoc(budgetRef);
};

// Recurring Payments
export const recurringPaymentsCollection = (userId: string) =>
  collection(db, "users", userId, "recurringPayments");

export const getRecurringPayments = async (
  userId: string
): Promise<RecurringPayment[]> => {
  const querySnapshot = await getDocs(recurringPaymentsCollection(userId));
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as RecurringPayment[];
};

export const subscribeToRecurringPayments = (
  userId: string,
  callback: (payments: RecurringPayment[]) => void
) => {
  return onSnapshot(recurringPaymentsCollection(userId), (snapshot) => {
    const payments = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as RecurringPayment[];
    callback(payments);
  });
};

export const addRecurringPayment = async (
  userId: string,
  payment: Omit<RecurringPayment, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<string> => {
  // Import here to avoid circular dependency
  const { createTransactionFromRecurring, calculateNextRunDate } = await import("./recurring-transactions");
  const { format, parseISO, isToday, startOfDay } = await import("date-fns");

  // Filter out undefined values as Firestore doesn't support them
  const startDateStr = payment.startDate || payment.nextDate || format(new Date(), "yyyy-MM-dd");
  const startDate = parseISO(startDateStr);
  const today = startOfDay(new Date());
  const startDateDay = startOfDay(startDate);

  // Calculate next run date (will be set to 4:00 AM IST)
  const nextRunDate = calculateNextRunDate(
    startDate,
    payment.frequency || "monthly",
    startDate
  );

  const paymentData: any = {
    userId,
    name: payment.name,
    amount: payment.amount,
    frequency: payment.frequency,
    repeatDays: payment.repeatDays || [],
    startDate: startDateStr,
    nextRunDate: format(nextRunDate, "yyyy-MM-dd"),
    category: payment.category,
    type: payment.type || "expense",
    paymentMethod: payment.paymentMethod || undefined,
    icon: payment.icon,
    color: payment.color,
    status: payment.status || (payment.isActive === false ? "paused" : "active"),
    reminderEnabled: payment.reminderEnabled !== undefined ? payment.reminderEnabled : false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    // Legacy fields for backward compatibility
    nextDate: format(nextRunDate, "yyyy-MM-dd"),
    isActive: payment.status === "active" || payment.isActive !== false,
  };

  // Remove undefined values
  Object.keys(paymentData).forEach(key => {
    if (paymentData[key] === undefined) {
      delete paymentData[key];
    }
  });

  const docRef = await addDoc(recurringPaymentsCollection(userId), paymentData);
  const recurringPaymentId = docRef.id;

  // If startDate === today AND status is active, create transaction immediately
  if (isToday(startDateDay) && paymentData.status === "active") {
    try {
      const recurringPayment: RecurringPayment = {
        id: recurringPaymentId,
        ...paymentData,
      };

      await createTransactionFromRecurring(
        userId,
        recurringPayment,
        startDateDay
      );
      console.log(`✅ Created immediate transaction for recurring payment: ${payment.name}`);
    } catch (error) {
      console.error("Error creating immediate transaction for recurring payment:", error);
      // Don't throw - the recurring payment was created successfully
      // Transaction can be created later by the background job
    }
  }

  return recurringPaymentId;
};

export const updateRecurringPayment = async (
  userId: string,
  paymentId: string,
  updates: Partial<RecurringPayment>
): Promise<void> => {
  const paymentRef = doc(
    db,
    "users",
    userId,
    "recurringPayments",
    paymentId
  );

  // Filter out undefined values
  const updateData: any = {
    updatedAt: Timestamp.now(),
  };

  // Only include fields that are actually being updated (not undefined)
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.amount !== undefined) updateData.amount = updates.amount;
  if (updates.frequency !== undefined) updateData.frequency = updates.frequency;
  if (updates.repeatDays !== undefined) updateData.repeatDays = updates.repeatDays;
  if (updates.startDate !== undefined) updateData.startDate = updates.startDate;
  if (updates.nextRunDate !== undefined) updateData.nextRunDate = updates.nextRunDate;
  if (updates.nextDate !== undefined) updateData.nextDate = updates.nextDate; // Legacy
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.paymentMethod !== undefined) updateData.paymentMethod = updates.paymentMethod;
  if (updates.icon !== undefined) updateData.icon = updates.icon;
  if (updates.color !== undefined) updateData.color = updates.color;
  if (updates.status !== undefined) {
    updateData.status = updates.status;
    updateData.isActive = updates.status === "active"; // Legacy compatibility
  }
  if (updates.isActive !== undefined) {
    updateData.isActive = updates.isActive;
    updateData.status = updates.isActive ? "active" : "paused"; // Sync status
  }
  if (updates.reminderEnabled !== undefined) updateData.reminderEnabled = updates.reminderEnabled;
  if (updates.pausedAt !== undefined) updateData.pausedAt = updates.pausedAt;
  if (updates.remainingDays !== undefined) updateData.remainingDays = updates.remainingDays;

  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  await updateDoc(paymentRef, updateData);
};

export const updateSipPortfolioValue = async (
  userId: string,
  paymentId: string,
  currentValue: number
): Promise<void> => {
  const paymentRef = doc(
    db,
    "users",
    userId,
    "recurringPayments",
    paymentId
  );

  await updateDoc(paymentRef, {
    currentValue,
    lastValueUpdated: Timestamp.now(),
    updatedAt: Timestamp.now()
  });
};

export const deleteRecurringPayment = async (
  userId: string,
  paymentId: string
): Promise<void> => {
  const paymentRef = doc(
    db,
    "users",
    userId,
    "recurringPayments",
    paymentId
  );
  await deleteDoc(paymentRef);
};

// User Profile
export const getUserProfile = async (
  userId: string
): Promise<UserProfile | null> => {
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    return { id: userSnap.id, ...userSnap.data() } as UserProfile;
  }
  return null;
};

export const createUserProfile = async (
  userId: string,
  profile: Omit<UserProfile, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<void> => {
  const userRef = doc(db, "users", userId);
  const profileData = {
    ...profile,
    userId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  // Use setDoc with merge to create or update the document
  await setDoc(userRef, profileData, { merge: true });
};

export const updateUserProfile = async (
  userId: string,
  updates: Partial<UserProfile>
): Promise<void> => {
  const userRef = doc(db, "users", userId);

  // Filter out undefined values
  const updateData: any = {
    updatedAt: Timestamp.now(),
  };

  // Only include fields that are actually being updated (not undefined)
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.phone !== undefined && updates.phone !== null && updates.phone !== "") {
    updateData.phone = updates.phone;
  }
  if (updates.currency !== undefined) updateData.currency = updates.currency;
  if (updates.userId !== undefined) updateData.userId = updates.userId;
  if (updates.currentBalance !== undefined) updateData.currentBalance = updates.currentBalance;
  if (updates.cashFlowSafetyFloor !== undefined) updateData.cashFlowSafetyFloor = updates.cashFlowSafetyFloor;
  if (updates.salaryDate !== undefined) updateData.salaryDate = updates.salaryDate;
  if (updates.salaryAmount !== undefined) updateData.salaryAmount = updates.salaryAmount;
  if (updates.budgetingMode !== undefined) updateData.budgetingMode = updates.budgetingMode;
  if (updates.savingsFirstPercent !== undefined) updateData.savingsFirstPercent = updates.savingsFirstPercent;
  if (updates.merchantWatchlist !== undefined) updateData.merchantWatchlist = updates.merchantWatchlist;
  await updateDoc(userRef, updateData);
};

// Categories
export const categoriesCollection = (userId: string) =>
  collection(db, "users", userId, "categories");

export const getCategories = async (userId: string): Promise<Category[]> => {
  const querySnapshot = await getDocs(categoriesCollection(userId));
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Category[];
};

export const subscribeToCategories = (
  userId: string,
  callback: (categories: Category[]) => void
) => {
  return onSnapshot(categoriesCollection(userId), (snapshot) => {
    const categories = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Category[];
    callback(categories);
  });
};

export const addCategory = async (
  userId: string,
  category: Omit<Category, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<string> => {
  const categoryData: any = {
    userId,
    name: category.name.trim(),
    type: category.type,
    icon: category.icon,
    color: category.color,
    isDefault: category.isDefault || false,
    isActive: category.isActive !== undefined ? category.isActive : true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(categoriesCollection(userId), categoryData);
  return docRef.id;
};

export const updateCategory = async (
  userId: string,
  categoryId: string,
  updates: Partial<Category>
): Promise<void> => {
  const categoryRef = doc(db, "users", userId, "categories", categoryId);

  const updateData: any = {
    updatedAt: Timestamp.now(),
  };

  if (updates.name !== undefined) updateData.name = updates.name.trim();
  if (updates.icon !== undefined) updateData.icon = updates.icon;
  if (updates.color !== undefined) updateData.color = updates.color;
  if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

  await updateDoc(categoryRef, updateData);
};

export const deleteCategory = async (
  userId: string,
  categoryId: string
): Promise<void> => {
  const categoryRef = doc(db, "users", userId, "categories", categoryId);
  await deleteDoc(categoryRef);
};

// Initialize default categories for a user
export const initializeDefaultCategories = async (userId: string): Promise<void> => {
  const existingCategories = await getCategories(userId);
  if (existingCategories.length > 0) {
    return; // Categories already initialized
  }

  const defaultCategories: Omit<Category, "id" | "userId" | "createdAt" | "updatedAt">[] = [
    // Expense Categories
    { name: "Food", type: "expense", icon: "🍔", color: "#EF4444", isDefault: true, isActive: true },
    { name: "Transport", type: "expense", icon: "🚗", color: "#3B82F6", isDefault: true, isActive: true },
    { name: "Rent", type: "expense", icon: "🏠", color: "#8B5CF6", isDefault: true, isActive: true },
    { name: "Utilities", type: "expense", icon: "💡", color: "#F59E0B", isDefault: true, isActive: true },
    { name: "Shopping", type: "expense", icon: "🛍️", color: "#EC4899", isDefault: true, isActive: true },
    { name: "Entertainment", type: "expense", icon: "🎬", color: "#10B981", isDefault: true, isActive: true },
    { name: "Health", type: "expense", icon: "💊", color: "#06B6D4", isDefault: true, isActive: true },
    { name: "Education", type: "expense", icon: "📚", color: "#6366F1", isDefault: true, isActive: true },
    { name: "Subscriptions", type: "expense", icon: "📱", color: "#F97316", isDefault: true, isActive: true },
    { name: "Other", type: "expense", icon: "📦", color: "#6B7280", isDefault: true, isActive: true },
    // Income Categories
    { name: "Salary", type: "income", icon: "💰", color: "#10B981", isDefault: true, isActive: true },
    { name: "Business", type: "income", icon: "🏢", color: "#3B82F6", isDefault: true, isActive: true },
    { name: "Freelance", type: "income", icon: "💼", color: "#8B5CF6", isDefault: true, isActive: true },
    { name: "Investment", type: "income", icon: "📈", color: "#F59E0B", isDefault: true, isActive: true },
    { name: "Refund", type: "income", icon: "↩️", color: "#06B6D4", isDefault: true, isActive: true },
    { name: "Other", type: "income", icon: "📦", color: "#6B7280", isDefault: true, isActive: true },
  ];

  // Add all default categories
  for (const category of defaultCategories) {
    await addCategory(userId, category);
  }
};

// Reassign transactions from one category to another
export const reassignTransactions = async (
  userId: string,
  fromCategory: string,
  toCategory: string
): Promise<void> => {
  const transactionsRef = transactionsCollection(userId);
  const q = query(transactionsRef, where("category", "==", fromCategory));
  const querySnapshot = await getDocs(q);

  const batch = querySnapshot.docs.map((doc) =>
    updateDoc(doc.ref, { category: toCategory, updatedAt: Timestamp.now() })
  );

  await Promise.all(batch);
};

// Check if category is used in transactions
export const getCategoryUsageCount = async (
  userId: string,
  categoryName: string
): Promise<number> => {
  const transactionsRef = transactionsCollection(userId);
  const q = query(transactionsRef, where("category", "==", categoryName));
  const querySnapshot = await getDocs(q);
  return querySnapshot.size;
};

// Savings Goals
export interface SavingsGoal {
  id?: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  icon: string;
  color: string;
  deadline?: string;
  status: "active" | "completed";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const savingsGoalsCollection = (userId: string) =>
  collection(db, "users", userId, "savingsGoals");

export const subscribeToSavingsGoals = (
  userId: string,
  callback: (goals: SavingsGoal[]) => void
) => {
  const q = query(
    savingsGoalsCollection(userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const goals = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as SavingsGoal[];
    callback(goals);
  });
};

export const addSavingsGoal = async (
  userId: string,
  goal: Omit<SavingsGoal, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<string> => {
  const goalData: any = {
    userId,
    name: goal.name,
    targetAmount: Number(goal.targetAmount),
    currentAmount: Number(goal.currentAmount || 0),
    icon: goal.icon || "🎯",
    color: goal.color || "#10B981",
    status: goal.status || "active",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  if (goal.deadline) {
    goalData.deadline = goal.deadline;
  }

  const docRef = await addDoc(savingsGoalsCollection(userId), goalData);
  return docRef.id;
};

export const updateSavingsGoal = async (
  userId: string,
  goalId: string,
  updates: Partial<SavingsGoal>
): Promise<void> => {
  const goalRef = doc(db, "users", userId, "savingsGoals", goalId);

  const updateData: any = {
    updatedAt: Timestamp.now(),
  };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.targetAmount !== undefined) updateData.targetAmount = Number(updates.targetAmount);
  if (updates.currentAmount !== undefined) updateData.currentAmount = Number(updates.currentAmount);
  if (updates.icon !== undefined) updateData.icon = updates.icon;
  if (updates.color !== undefined) updateData.color = updates.color;
  if (updates.deadline !== undefined) updateData.deadline = updates.deadline;
  if (updates.status !== undefined) updateData.status = updates.status;

  await updateDoc(goalRef, updateData);
};

export const deleteSavingsGoal = async (
  userId: string,
  goalId: string
): Promise<void> => {
  const goalRef = doc(db, "users", userId, "savingsGoals", goalId);
  await deleteDoc(goalRef);
};

export const addFundsToGoal = async (
  userId: string,
  goalId: string,
  amount: number
): Promise<void> => {
  const goalRef = doc(db, "users", userId, "savingsGoals", goalId);
  const goalSnap = await getDoc(goalRef);

  if (goalSnap.exists()) {
    const currentAmount = goalSnap.data().currentAmount || 0;
    const targetAmount = goalSnap.data().targetAmount || 0;
    const newAmount = currentAmount + amount;

    await updateDoc(goalRef, {
      currentAmount: newAmount,
      status: newAmount >= targetAmount ? "completed" : "active",
      updatedAt: Timestamp.now(),
    });
  }
};


// Expense Groups (Split Mode)
export interface ExpenseGroup {
  id?: string;
  userId: string; // The creator/owner
  name: string;
  description?: string;
  members: string[]; // List of names for simplicity (e.g. ["Me", "Alice", "Bob"])
  currency: string;
  totalSpent: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface GroupExpense {
  id?: string;
  groupId: string;
  description: string;
  amount: number;
  paidBy: string; // One of the members
  splitWith?: string[]; // Optional: if empty/undefined, split equally among all group members
  date: Timestamp | Date;
  createdAt?: Timestamp;
}

// Merchant Mappings (Learning Engine)
export const merchantMappingsCollection = (userId: string) =>
  collection(db, "users", userId, "merchantMappings");

export const getMerchantMapping = async (
  userId: string,
  normalizedMerchant: string
): Promise<MerchantMapping | null> => {
  const q = query(
    merchantMappingsCollection(userId),
    where("merchant", "==", normalizedMerchant),
    limit(1)
  );
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return null;
  const doc = querySnapshot.docs[0];
  return { id: doc.id, ...doc.data() } as MerchantMapping;
};

export const updateMerchantMapping = async (
  userId: string,
  mapping: Omit<MerchantMapping, "userId">
): Promise<void> => {
  const normalizedMerchant = mapping.merchant.toLowerCase().trim();
  const existing = await getMerchantMapping(userId, normalizedMerchant);

  const mappingData = {
    ...mapping,
    merchant: normalizedMerchant,
    userId,
    lastCorrected: Timestamp.now(),
  };

  if (existing?.id) {
    const docRef = doc(db, "users", userId, "merchantMappings", existing.id);
    await updateDoc(docRef, mappingData);
  } else {
    await addDoc(merchantMappingsCollection(userId), mappingData);
  }
};

export const batchUpdateTransactionsCategory = async (
  userId: string,
  merchantName: string,
  newCategory: string
): Promise<number> => {
  // This expects the merchant name to be matched against transaction titles
  // In a real app, we'd use a more robust fuzzy match or the same normalization
  const q = query(
    transactionsCollection(userId),
    where("title", "==", merchantName) // Simple equality for now
  );
  
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return 0;

  const batch = writeBatch(db);
  querySnapshot.docs.forEach((d) => {
    batch.update(d.ref, { 
      category: newCategory,
      updatedAt: Timestamp.now()
    });
  });

  await batch.commit();
  return querySnapshot.size;
};

export const expenseGroupsCollection = (userId: string) =>
  collection(db, "users", userId, "expenseGroups");

export const groupExpensesCollection = (userId: string, groupId: string) =>
  collection(db, "users", userId, "expenseGroups", groupId, "expenses");

// Group Operations
export const subscribeToExpenseGroups = (
  userId: string,
  callback: (groups: ExpenseGroup[]) => void
) => {
  const q = query(
    expenseGroupsCollection(userId),
    orderBy("updatedAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const groups = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ExpenseGroup[];
    callback(groups);
  });
};

export const addExpenseGroup = async (
  userId: string,
  group: Omit<ExpenseGroup, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<string> => {
  const groupData: any = {
    userId,
    name: group.name,
    description: group.description || "",
    members: group.members,
    currency: group.currency || "INR",
    totalSpent: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(expenseGroupsCollection(userId), groupData);
  return docRef.id;
};

export const updateExpenseGroup = async (
  userId: string,
  groupId: string,
  updates: Partial<ExpenseGroup>
): Promise<void> => {
  const groupRef = doc(db, "users", userId, "expenseGroups", groupId);

  const updateData: any = {
    updatedAt: Timestamp.now(),
  };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.members !== undefined) updateData.members = updates.members;
  if (updates.totalSpent !== undefined) updateData.totalSpent = updates.totalSpent;

  await updateDoc(groupRef, updateData);
};

export const deleteExpenseGroup = async (
  userId: string,
  groupId: string
): Promise<void> => {
  const groupRef = doc(db, "users", userId, "expenseGroups", groupId);
  await deleteDoc(groupRef);
};

// Expense Operations
export const subscribeToGroupExpenses = (
  userId: string,
  groupId: string,
  callback: (expenses: GroupExpense[]) => void
) => {
  const q = query(
    groupExpensesCollection(userId, groupId),
    orderBy("date", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const expenses = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: data.date?.toDate ? data.date.toDate() : (data.date instanceof Date ? data.date : new Date()),
      };
    }) as GroupExpense[];
    callback(expenses);
  });
};

export const addGroupExpense = async (
  userId: string,
  groupId: string,
  expense: Omit<GroupExpense, "id" | "groupId" | "createdAt">
): Promise<string> => {
  // Add expense
  const expenseData: any = {
    groupId,
    description: expense.description,
    amount: Number(expense.amount),
    paidBy: expense.paidBy,
    date: expense.date instanceof Date ? Timestamp.fromDate(expense.date) : expense.date,
    createdAt: Timestamp.now(),
  };

  if (expense.splitWith) {
    expenseData.splitWith = expense.splitWith;
  }

  const expenseRef = await addDoc(groupExpensesCollection(userId, groupId), expenseData);

  // Update group total
  const groupRef = doc(db, "users", userId, "expenseGroups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (groupSnap.exists()) {
    const currentTotal = groupSnap.data().totalSpent || 0;
    await updateDoc(groupRef, {
      totalSpent: currentTotal + expenseData.amount,
      updatedAt: Timestamp.now(),
    });
  }

  return expenseRef.id;
};

export const deleteGroupExpense = async (
  userId: string,
  groupId: string,
  expenseId: string,
  amount: number
): Promise<void> => {
  // Delete expense
  const expenseRef = doc(db, "users", userId, "expenseGroups", groupId, "expenses", expenseId);
  await deleteDoc(expenseRef);

  // Update group total
  const groupRef = doc(db, "users", userId, "expenseGroups", groupId);
  const groupSnap = await getDoc(groupRef);
  if (groupSnap.exists()) {
    const currentTotal = groupSnap.data().totalSpent || 0;
    await updateDoc(groupRef, {
      totalSpent: Math.max(0, currentTotal - amount),
      updatedAt: Timestamp.now(),
    });
  }
};

// Monthly Narratives
export const monthlyNarrativesCollection = (userId: string) =>
  collection(db, "users", userId, "monthlyNarratives");

export const getMonthlyNarrative = async (
  userId: string,
  month: string
): Promise<MonthlyNarrative | null> => {
  const q = query(
    monthlyNarrativesCollection(userId),
    where("month", "==", month),
    limit(1)
  );
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return null;
  const doc = querySnapshot.docs[0];
  return { id: doc.id, ...doc.data() } as MonthlyNarrative;
};

export const saveMonthlyNarrative = async (
  userId: string,
  narrative: Omit<MonthlyNarrative, "id" | "userId" | "generatedAt">
): Promise<string> => {
  const data = {
    ...narrative,
    userId,
    generatedAt: Timestamp.now(),
  };
  
  // Try to update existing one for the same month if it exists
  const existing = await getMonthlyNarrative(userId, narrative.month);
  if (existing && existing.id) {
    const ref = doc(monthlyNarrativesCollection(userId), existing.id);
    await setDoc(ref, data, { merge: true });
    return existing.id;
  }

  const docRef = await addDoc(monthlyNarrativesCollection(userId), data);
  return docRef.id;
};

// Helper to fetch transactions by date range (one-time fetch)
export const getTransactionsInDateRange = async (
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Transaction[]> => {
  const q = query(
    transactionsCollection(userId),
    where("date", ">=", Timestamp.fromDate(startDate)),
    where("date", "<=", Timestamp.fromDate(endDate)),
    orderBy("date", "desc")
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      date: data.date?.toDate ? data.date.toDate() : (data.date instanceof Date ? data.date : new Date()),
    } as Transaction;
  });
};
// Net Worth - Assets
export const assetsCollection = (userId: string) =>
  collection(db, "users", userId, "assets");

export const getAssets = async (userId: string): Promise<Asset[]> => {
  const q = query(assetsCollection(userId), orderBy("lastUpdated", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
};

export const addAsset = async (userId: string, asset: Omit<Asset, "id" | "userId" | "lastUpdated">): Promise<string> => {
  const data = { ...asset, userId, lastUpdated: Timestamp.now() };
  const docRef = await addDoc(assetsCollection(userId), data);
  return docRef.id;
};

export const updateAsset = async (userId: string, assetId: string, updates: Partial<Asset>): Promise<void> => {
  const docRef = doc(db, "users", userId, "assets", assetId);
  await updateDoc(docRef, { ...updates, lastUpdated: Timestamp.now() });
};

export const deleteAsset = async (userId: string, assetId: string): Promise<void> => {
  const docRef = doc(db, "users", userId, "assets", assetId);
  await deleteDoc(docRef);
};

// Net Worth - Liabilities
export const liabilitiesCollection = (userId: string) =>
  collection(db, "users", userId, "liabilities");

export const getLiabilities = async (userId: string): Promise<Liability[]> => {
  const q = query(liabilitiesCollection(userId), orderBy("lastUpdated", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Liability));
};

export const addLiability = async (userId: string, liability: Omit<Liability, "id" | "userId" | "lastUpdated">): Promise<string> => {
  const data = { ...liability, userId, lastUpdated: Timestamp.now() };
  const docRef = await addDoc(liabilitiesCollection(userId), data);
  return docRef.id;
};

export const updateLiability = async (userId: string, liabilityId: string, updates: Partial<Liability>): Promise<void> => {
  const docRef = doc(db, "users", userId, "liabilities", liabilityId);
  await updateDoc(docRef, { ...updates, lastUpdated: Timestamp.now() });
};

export const deleteLiability = async (userId: string, liabilityId: string): Promise<void> => {
  const docRef = doc(db, "users", userId, "liabilities", liabilityId);
  await deleteDoc(docRef);
};

// Net Worth - History Snapshots
export const netWorthHistoryCollection = (userId: string) =>
  collection(db, "users", userId, "netWorthHistory");

export const getNetWorthHistory = async (userId: string, limitCount: number = 12): Promise<NetWorthSnapshot[]> => {
  const q = query(netWorthHistoryCollection(userId), orderBy("month", "desc"), limit(limitCount));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NetWorthSnapshot)).reverse();
};

export const saveNetWorthSnapshot = async (userId: string, snapshot: Omit<NetWorthSnapshot, "id" | "userId" | "timestamp">): Promise<void> => {
  const docRef = doc(netWorthHistoryCollection(userId), snapshot.month);
  await setDoc(docRef, { ...snapshot, userId, timestamp: Timestamp.now() }, { merge: true });
};
