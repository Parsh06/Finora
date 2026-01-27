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
  recurringPaymentId?: string; // Link back to recurring payment record
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RecurringPayment {
  id?: string;
  userId: string;
  name: string;
  amount: number;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  startDate: string; // Anchor date - ISO format (yyyy-MM-dd)
  nextRunDate: string; // Next date when transaction should be created (yyyy-MM-dd)
  category: string;
  type: "expense" | "income";
  paymentMethod?: string;
  icon: string;
  color: string;
  status: "active" | "paused" | "cancelled";
  reminderEnabled: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  // Legacy fields for backward compatibility
  nextDate?: string;
  isActive?: boolean;
}

export interface UserProfile {
  id?: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  currency: string;
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
  const transactionRef = doc(
    db,
    "users",
    userId,
    "transactions",
    transactionId
  );
  await deleteDoc(transactionRef);
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
  
  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });
  
  await updateDoc(paymentRef, updateData);
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

