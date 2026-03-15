import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { processRecurringPayments } from "@/lib/recurring-transactions";

/**
 * Calculate milliseconds until next midnight
 */
const getMsUntilMidnight = (): number => {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);
  
  return nextMidnight.getTime() - now.getTime();
};

/**
 * Hook to automatically process recurring payments daily
 * Runs whenever the app is open and refreshes at midnight
 */
export const useRecurringTransactions = () => {
  const { currentUser } = useAuth();
  const lastProcessedDateRef = useRef<string | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    if (!currentUser) return;

    const checkAndProcess = async () => {
      // Prevent concurrent processing
      if (processingRef.current) return;
      
      const today = new Date().toDateString();
      
      // Skip if already processed today
      if (lastProcessedDateRef.current === today) {
        return;
      }

      processingRef.current = true;
      
      try {
        console.log(`🕒 [Recurring] Checking payments for ${today}...`);
        const stats = await processRecurringPayments(currentUser.uid);
        
        if (stats.created > 0) {
          console.log(`✅ [Recurring] Created ${stats.created} transaction(s)`);
        } else {
          console.log(`ℹ️ [Recurring] Already up to date (skipped ${stats.skipped})`);
        }
        
        lastProcessedDateRef.current = today;
      } catch (error) {
        console.error("❌ [Recurring] Error processing transactions:", error);
      } finally {
        processingRef.current = false;
      }
    };

    // Process immediately on launch
    checkAndProcess();

    // Set up interval to check every hour (in case user keeps app open over midnight)
    const interval = setInterval(() => {
      checkAndProcess();
    }, 60 * 60 * 1000);

    // Schedule next check at exactly midnight
    const msUntilMidnight = getMsUntilMidnight();
    const midnightTimeout = setTimeout(() => {
      checkAndProcess();
      // Then set up daily interval to check at midnight
      const dailyInterval = setInterval(() => {
        checkAndProcess();
      }, 24 * 60 * 60 * 1000);
      
      return () => clearInterval(dailyInterval);
    }, Math.max(msUntilMidnight, 0));

    return () => {
      clearInterval(interval);
      clearTimeout(midnightTimeout);
    };
  }, [currentUser]);
};

