import { 
  RecurringPayment, 
  Transaction, 
  addTransaction, 
  getTransactions,
  recurringPaymentsCollection,
  updateRecurringPayment 
} from "./firestore";
import { 
  addDays, 
  addWeeks, 
  addMonths, 
  addYears, 
  format, 
  parseISO, 
  startOfMonth, 
  endOfMonth,
  isSameDay,
  isBefore,
  startOfDay,
  isToday
} from "date-fns";
import { getDocs, query, where, Timestamp } from "firebase/firestore";

/**
 * Convert a date to 4:00 AM IST (10:30 PM UTC previous day)
 * IST is UTC+5:30, so 4:00 AM IST = 10:30 PM UTC (previous day)
 * Since we store dates as strings (yyyy-MM-dd), this function is mainly for
 * calculating the next date. The actual time (4:00 AM IST) is handled during processing.
 */
const setTo4AMIST = (date: Date): Date => {
  // We just return the date as-is since we store dates as strings
  // The 4:00 AM IST time is handled in the processing logic
  return startOfDay(date);
};

/**
 * Calculate the next run date based on frequency and start date
 * Returns date set to 4:00 AM IST (10:30 PM UTC previous day)
 */
export const calculateNextRunDate = (
  startDate: Date,
  frequency: "daily" | "weekly" | "monthly" | "yearly",
  currentDate: Date = new Date()
): Date => {
  const start = startOfDay(startDate);
  const now = startOfDay(currentDate);
  let nextDate: Date;
  
  if (frequency === "daily") {
    // Next day at 4:00 AM IST
    nextDate = addDays(now, 1);
  } else if (frequency === "weekly") {
    // Next week at 4:00 AM IST
    nextDate = addWeeks(now, 1);
  } else if (frequency === "monthly") {
    // Monthly: startDate + 30 days (exactly 30 days from startDate anchor)
    // Calculate how many 30-day periods have passed since startDate
    const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const periodsPassed = Math.floor(daysSinceStart / 30);
    // Next run is (periodsPassed + 1) * 30 days from startDate
    nextDate = addDays(start, (periodsPassed + 1) * 30);
    
    // If the calculated date is today or in the past, add another 30 days
    if (isBefore(nextDate, now) || isSameDay(nextDate, now)) {
      nextDate = addDays(nextDate, 30);
    }
  } else if (frequency === "yearly") {
    // Use the same day and month as start date
    nextDate = new Date(now.getFullYear(), start.getMonth(), start.getDate());
    
    // If the date is today or in the past, move to next year
    if (isBefore(nextDate, now) || isSameDay(nextDate, now)) {
      nextDate = new Date(now.getFullYear() + 1, start.getMonth(), start.getDate());
    }
  } else {
    nextDate = now;
  }
  
  // Return the date (we store dates as strings, 4:00 AM IST is handled during processing)
  return startOfDay(nextDate);
};

/**
 * Check if a transaction already exists for a recurring payment on a specific date
 * This prevents duplicate transactions from being created
 */
export const transactionExists = async (
  userId: string,
  recurringPaymentId: string,
  date: Date
): Promise<boolean> => {
  try {
    const transactions = await getTransactions(userId);
    const targetDate = format(startOfDay(date), "yyyy-MM-dd");
    
    return transactions.some((txn) => {
      let txnDate: string;
      if (txn.date instanceof Date) {
        txnDate = format(startOfDay(txn.date), "yyyy-MM-dd");
      } else if (txn.date && typeof txn.date.toDate === 'function') {
        txnDate = format(startOfDay(txn.date.toDate()), "yyyy-MM-dd");
      } else {
        return false;
      }
      
      // Check if transaction exists with same recurringPaymentId and date
      return (
        txn.recurringPaymentId === recurringPaymentId &&
        txnDate === targetDate
      );
    });
  } catch (error) {
    console.error("Error checking transaction existence:", error);
    return false;
  }
};

/**
 * Create a transaction from a recurring payment
 */
export const createTransactionFromRecurring = async (
  userId: string,
  recurringPayment: RecurringPayment,
  transactionDate: Date
): Promise<string> => {
  // Check if transaction already exists (idempotency)
  if (recurringPayment.id) {
    const exists = await transactionExists(userId, recurringPayment.id, transactionDate);
    if (exists) {
      console.log(`Transaction already exists for ${recurringPayment.name} on ${format(transactionDate, "yyyy-MM-dd")}`);
      return "";
    }
  }

  const transactionData: Omit<Transaction, "id" | "createdAt" | "updatedAt"> = {
    userId,
    title: recurringPayment.name,
    category: recurringPayment.category,
    amount: recurringPayment.amount,
    type: recurringPayment.type || "expense",
    date: Timestamp.fromDate(transactionDate),
    paymentMethod: recurringPayment.paymentMethod,
    note: `Auto-generated from recurring payment`,
    isRecurring: true,
    recurringPaymentId: recurringPayment.id,
  };

  // Remove undefined values
  Object.keys(transactionData).forEach(key => {
    if ((transactionData as any)[key] === undefined) {
      delete (transactionData as any)[key];
    }
  });

  const transactionId = await addTransaction(userId, transactionData);
  console.log(`Created transaction for ${recurringPayment.name} on ${format(transactionDate, "yyyy-MM-dd")}`);
  
  return transactionId;
};

/**
 * Get current time in IST (UTC+5:30)
 * Returns a Date object representing current IST time
 */
const getCurrentIST = (): Date => {
  const now = new Date();
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  return new Date(utcTime + istOffset);
};

/**
 * Check if current time is after 4:00 AM IST
 */
const isAfter4AMIST = (): boolean => {
  const istNow = getCurrentIST();
  return istNow.getHours() >= 4;
};

/**
 * Process all active recurring payments and create transactions if needed
 * Runs at 4:00 AM IST daily
 */
export const processRecurringPayments = async (userId: string): Promise<{
  created: number;
  skipped: number;
  errors: number;
}> => {
  const stats = { created: 0, skipped: 0, errors: 0 };
  const now = new Date();
  const today = startOfDay(now);
  const todayStr = format(today, "yyyy-MM-dd");

  try {
    // Get all active recurring payments
    const q = query(
      recurringPaymentsCollection(userId),
      where("status", "==", "active")
    );
    
    const snapshot = await getDocs(q);
    const recurringPayments = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as RecurringPayment[];

    // Also check legacy isActive field for backward compatibility
    const legacyQ = query(
      recurringPaymentsCollection(userId),
      where("isActive", "==", true)
    );
    const legacySnapshot = await getDocs(legacyQ);
    const legacyPayments = legacySnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((p: any) => p.status !== "active" && !recurringPayments.find(rp => rp.id === p.id)) as RecurringPayment[];

    const allPayments = [...recurringPayments, ...legacyPayments];

    for (const payment of allPayments) {
      try {
        // Skip if cancelled or paused
        if (payment.status === "cancelled" || payment.status === "paused" || 
            (payment.isActive === false && payment.status !== "active")) {
          stats.skipped++;
          continue;
        }

        // Get next run date (use nextRunDate or nextDate for legacy)
        const nextRunDateStr = payment.nextRunDate || payment.nextDate;
        if (!nextRunDateStr) {
          console.warn(`Recurring payment ${payment.id} has no nextRunDate`);
          stats.skipped++;
          continue;
        }

        const nextRunDate = parseISO(nextRunDateStr);
        const nextRunDateDay = startOfDay(nextRunDate);
        
        // Check if it's time to create a transaction
        // Transaction should be created if nextRunDate is today or in the past
        // AND it's after 4:00 AM IST
        const shouldCreate = (isBefore(nextRunDateDay, today) || isSameDay(nextRunDateDay, today)) && isAfter4AMIST();
        
        if (shouldCreate) {
          // Create transaction for the date specified in nextRunDate
          const transactionDate = nextRunDateDay;
          const transactionId = await createTransactionFromRecurring(
            userId,
            payment,
            transactionDate
          );

          if (transactionId) {
            stats.created++;
            
            // Calculate next run date based on startDate and frequency
            const startDate = payment.startDate 
              ? parseISO(payment.startDate)
              : nextRunDateDay;
            
            // Calculate next run date using the startDate as anchor
            // This ensures monthly payments happen on the same day each month
            // and yearly payments happen on the same date each year
            const newNextRunDate = calculateNextRunDate(
              startDate,
              payment.frequency || "monthly",
              transactionDate
            );

            // Update recurring payment with new next run date
            if (payment.id) {
              await updateRecurringPayment(userId, payment.id, {
                nextRunDate: format(newNextRunDate, "yyyy-MM-dd"),
              });
            }
          } else {
            stats.skipped++;
          }
        } else {
          stats.skipped++;
        }
      } catch (error) {
        console.error(`Error processing recurring payment ${payment.id}:`, error);
        stats.errors++;
      }
    }

    return stats;
  } catch (error) {
    console.error("Error processing recurring payments:", error);
    throw error;
  }
};

