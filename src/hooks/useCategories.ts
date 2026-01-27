import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Category, subscribeToCategories, initializeDefaultCategories } from "@/lib/firestore";

export const useCategories = () => {
  const { currentUser } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setCategories([]);
      setLoading(false);
      return;
    }

    // Initialize default categories if needed
    initializeDefaultCategories(currentUser.uid).catch((error) => {
      console.error("Failed to initialize categories:", error);
    });

    const unsubscribe = subscribeToCategories(currentUser.uid, (data) => {
      setCategories(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Get active expense categories
  const expenseCategories = categories.filter(
    (cat) => cat.type === "expense" && cat.isActive
  );

  // Get active income categories
  const incomeCategories = categories.filter(
    (cat) => cat.type === "income" && cat.isActive
  );

  // Get category by name
  const getCategoryByName = (name: string, type: "expense" | "income") => {
    return categories.find(
      (cat) => cat.name.toLowerCase() === name.toLowerCase() && cat.type === type
    );
  };

  // Get category icon
  const getCategoryIcon = (name: string, type: "expense" | "income") => {
    const category = getCategoryByName(name, type);
    return category?.icon || "📦";
  };

  // Get category color
  const getCategoryColor = (name: string, type: "expense" | "income") => {
    const category = getCategoryByName(name, type);
    return category?.color || "#6B7280";
  };

  return {
    categories,
    expenseCategories,
    incomeCategories,
    loading,
    getCategoryByName,
    getCategoryIcon,
    getCategoryColor,
  };
};

