import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { processRecurringPayments } from "@/lib/recurring-transactions";

/**
 * Get current time in IST (UTC+5:30)
 */
const getCurrentIST = (): Date => {
  const now = new Date();
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
 * Calculate milliseconds until next 4:00 AM IST
 */
const getMsUntil4AMIST = (): number => {
  const istNow = getCurrentIST();
  const next4AM = new Date(istNow);
  
  if (istNow.getHours() >= 4) {
    // Already past 4 AM today, schedule for tomorrow
    next4AM.setDate(next4AM.getDate() + 1);
  }
  next4AM.setHours(4, 0, 0, 0);
  
  // Convert back to UTC for setTimeout
  const utcOffset = 5.5 * 60 * 60 * 1000;
  const utcTime = next4AM.getTime() - utcOffset;
  const now = new Date();
  const nowUtc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  
  return utcTime - nowUtc;
};

/**
 * Hook to automatically process recurring payments daily at 4:00 AM IST
 * Runs once per day when the app is open
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
      
      // Only process if it's after 4:00 AM IST
      if (!isAfter4AMIST()) {
        return;
      }
      
      const today = new Date().toDateString();
      
      // Skip if already processed today
      if (lastProcessedDateRef.current === today) {
        return;
      }

      processingRef.current = true;
      
      try {
        const stats = await processRecurringPayments(currentUser.uid);
        
        if (stats.created > 0) {
          console.log(`✅ Created ${stats.created} recurring transaction(s) at 4:00 AM IST`);
        }
        
        lastProcessedDateRef.current = today;
      } catch (error) {
        console.error("Error processing recurring transactions:", error);
      } finally {
        processingRef.current = false;
      }
    };

    // Process immediately if it's after 4:00 AM IST
    checkAndProcess();

    // Set up interval to check every hour (in case user keeps app open)
    const interval = setInterval(() => {
      checkAndProcess();
    }, 60 * 60 * 1000); // Every hour

    // Schedule next check at 4:00 AM IST
    const msUntil4AM = getMsUntil4AMIST();
    const fourAMTimeout = setTimeout(() => {
      checkAndProcess();
      // Then set up daily interval to check at 4 AM
      const dailyInterval = setInterval(() => {
        checkAndProcess();
      }, 24 * 60 * 60 * 1000); // Every 24 hours
      
      return () => clearInterval(dailyInterval);
    }, Math.max(msUntil4AM, 0));

    return () => {
      clearInterval(interval);
      clearTimeout(fourAMTimeout);
    };
  }, [currentUser]);
};

