import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Tag,
  TrendingUp,
  TrendingDown,
  Search,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Category,
  subscribeToCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getCategoryUsageCount,
  reassignTransactions,
  initializeDefaultCategories,
} from "@/lib/firestore";
import { toast } from "sonner";

interface CategoryManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

const commonIcons = [
  "🍔", "🚗", "🏠", "💡", "🛍️", "🎬", "💊", "📚", "📱", "📦",
  "💰", "🏢", "💼", "📈", "↩️", "🎁", "🎯", "✈️", "🏋️", "🎨",
  "🍕", "☕", "🎮", "📺", "🎵", "🏥", "🎓", "💳", "🏦", "🌐",
];

const commonColors = [
  "#EF4444", "#3B82F6", "#8B5CF6", "#F59E0B", "#EC4899",
  "#10B981", "#06B6D4", "#6366F1", "#F97316", "#6B7280",
  "#84CC16", "#14B8A6", "#A855F7", "#F43F5E", "#0EA5E9",
];

export const CategoryManagement = ({ isOpen, onClose }: CategoryManagementProps) => {
  const { currentUser } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [reassignToCategory, setReassignToCategory] = useState<string>("");

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "expense" as "expense" | "income",
    icon: "📦",
    color: "#6B7280",
    isActive: true,
  });

  useEffect(() => {
    if (!isOpen || !currentUser) return;

    // Initialize default categories if needed
    initializeDefaultCategories(currentUser.uid).catch((error) => {
      console.error("Failed to initialize categories:", error);
    });

    const unsubscribe = subscribeToCategories(currentUser.uid, (data) => {
      setCategories(data);
    });

    return () => unsubscribe();
  }, [isOpen, currentUser]);

  // Filter categories by type and search
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      const matchesType = cat.type === activeTab;
      const matchesSearch = cat.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [categories, activeTab, searchQuery]);

  // Get available categories for reassignment
  const availableCategories = useMemo(() => {
    return categories.filter(
      (cat) =>
        cat.type === deletingCategory?.type &&
        cat.id !== deletingCategory?.id &&
        cat.isActive
    );
  }, [categories, deletingCategory]);

  const handleAddClick = () => {
    setFormData({
      name: "",
      type: activeTab,
      icon: "📦",
      color: "#6B7280",
      isActive: true,
    });
    setShowAddModal(true);
  };

  const handleEditClick = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      type: category.type,
      icon: category.icon,
      color: category.color,
      isActive: category.isActive,
    });
    setShowEditModal(true);
  };

  const handleDeleteClick = async (category: Category) => {
    if (!currentUser) return;

    setDeletingCategory(category);
    const count = await getCategoryUsageCount(currentUser.uid, category.name);
    setUsageCount(count);

    if (count > 0) {
      setShowReassignModal(true);
    } else {
      setShowDeleteModal(true);
    }
  };

  const handleSaveAdd = async () => {
    if (!currentUser || !formData.name.trim()) {
      toast.error("Please enter a category name");
      return;
    }

    // Check for duplicate names
    const duplicate = categories.find(
      (cat) =>
        cat.name.toLowerCase().trim() === formData.name.toLowerCase().trim() &&
        cat.type === formData.type
    );

    if (duplicate) {
      toast.error("A category with this name already exists");
      return;
    }

    try {
      await addCategory(currentUser.uid, {
        name: formData.name.trim(),
        type: formData.type,
        icon: formData.icon,
        color: formData.color,
        isDefault: false,
        isActive: formData.isActive,
      });
      toast.success("Category added successfully");
      setShowAddModal(false);
      setFormData({
        name: "",
        type: activeTab,
        icon: "📦",
        color: "#6B7280",
        isActive: true,
      });
    } catch (error: any) {
      console.error("Error adding category:", error);
      toast.error("Failed to add category");
    }
  };

  const handleSaveEdit = async () => {
    if (!currentUser || !editingCategory || !formData.name.trim()) {
      toast.error("Please enter a category name");
      return;
    }

    // Check for duplicate names (excluding current category)
    const duplicate = categories.find(
      (cat) =>
        cat.id !== editingCategory.id &&
        cat.name.toLowerCase().trim() === formData.name.trim().toLowerCase() &&
        cat.type === formData.type
    );

    if (duplicate) {
      toast.error("A category with this name already exists");
      return;
    }

    try {
      await updateCategory(currentUser.uid, editingCategory.id!, {
        name: formData.name.trim(),
        icon: formData.icon,
        color: formData.color,
        isActive: formData.isActive,
      });
      toast.success("Category updated successfully");
      setShowEditModal(false);
      setEditingCategory(null);
    } catch (error: any) {
      console.error("Error updating category:", error);
      toast.error("Failed to update category");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!currentUser || !deletingCategory) return;

    try {
      await deleteCategory(currentUser.uid, deletingCategory.id!);
      toast.success("Category deleted successfully");
      setShowDeleteModal(false);
      setDeletingCategory(null);
    } catch (error: any) {
      console.error("Error deleting category:", error);
      toast.error("Failed to delete category");
    }
  };

  const handleReassignConfirm = async () => {
    if (!currentUser || !deletingCategory || !reassignToCategory) {
      toast.error("Please select a category to reassign to");
      return;
    }

    try {
      const targetCategory = categories.find((cat) => cat.id === reassignToCategory);
      if (!targetCategory) {
        toast.error("Invalid category selected");
        return;
      }

      await reassignTransactions(currentUser.uid, deletingCategory.name, targetCategory.name);
      await deleteCategory(currentUser.uid, deletingCategory.id!);
      toast.success(`Category deleted. ${usageCount} transaction(s) moved to ${targetCategory.name}`);
      setShowReassignModal(false);
      setDeletingCategory(null);
      setReassignToCategory("");
    } catch (error: any) {
      console.error("Error reassigning and deleting category:", error);
      toast.error("Failed to delete category");
    }
  };

  const toggleCategoryActive = async (category: Category) => {
    if (!currentUser) return;

    try {
      await updateCategory(currentUser.uid, category.id!, {
        isActive: !category.isActive,
      });
      toast.success(
        `Category ${!category.isActive ? "enabled" : "disabled"} successfully`
      );
    } catch (error: any) {
      console.error("Error toggling category:", error);
      toast.error("Failed to update category");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-4xl bg-card rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] sm:max-h-[85vh] flex flex-col"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                    Manage Categories
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Organize your expenses and income
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {/* Tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setActiveTab("expense")}
                  className={`flex-1 py-2 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${activeTab === "expense"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
                    }`}
                >
                  <TrendingDown className="w-4 h-4" />
                  Expenses
                </button>
                <button
                  onClick={() => setActiveTab("income")}
                  className={`flex-1 py-2 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${activeTab === "income"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
                    }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  Income
                </button>
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-muted/20 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Add Button */}
              <button
                onClick={handleAddClick}
                className="w-full mb-4 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add {activeTab === "expense" ? "Expense" : "Income"} Category
              </button>

              {/* Categories List */}
              <div className="space-y-2">
                {filteredCategories.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Tag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No categories found</p>
                  </div>
                ) : (
                  filteredCategories.map((category) => (
                    <motion.div
                      key={category.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-4 rounded-xl border transition-all ${category.isActive
                          ? "bg-muted/20 border-border/50"
                          : "bg-muted/10 border-border/30 opacity-60"
                        }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                          style={{ backgroundColor: `${category.color}20` }}
                        >
                          {category.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground">
                              {category.name}
                            </p>
                            {category.isDefault && (
                              <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">
                                Default
                              </span>
                            )}
                            {!category.isActive && (
                              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div
                            className="w-4 h-4 rounded-full mt-1"
                            style={{ backgroundColor: category.color }}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleCategoryActive(category)}
                            className={`w-10 h-6 rounded-full transition-all ${category.isActive ? "bg-primary" : "bg-muted/50"
                              }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full bg-white transition-all ${category.isActive ? "translate-x-5" : "translate-x-1"
                                }`}
                            />
                          </button>
                          <button
                            onClick={() => handleEditClick(category)}
                            className="w-9 h-9 rounded-lg bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-colors"
                          >
                            <Edit2 className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(category)}
                            className="w-9 h-9 rounded-lg bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>

            {/* Add/Edit Modal */}
            <AnimatePresence>
              {(showAddModal || showEditModal) && (
                <motion.div
                  className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={() => {
                      setShowAddModal(false);
                      setShowEditModal(false);
                    }}
                  />
                  <motion.div
                    className="relative w-full max-w-md bg-card rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                  >
                    <h3 className="text-xl font-semibold text-foreground mb-6">
                      {showAddModal ? "Add Category" : "Edit Category"}
                    </h3>

                    <div className="space-y-4">
                      {/* Name */}
                      <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">
                          Category Name
                        </label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                          placeholder="e.g., Gym, Travel"
                          className="w-full px-4 py-3 bg-muted/20 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>

                      {/* Icon Selector */}
                      <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">
                          Icon
                        </label>
                        <div className="grid grid-cols-10 gap-2">
                          {commonIcons.map((icon) => (
                            <button
                              key={icon}
                              onClick={() => setFormData({ ...formData, icon })}
                              className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${formData.icon === icon
                                  ? "bg-primary text-primary-foreground scale-110"
                                  : "bg-muted/20 hover:bg-muted/40"
                                }`}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Color Selector */}
                      <div>
                        <label className="text-sm font-medium text-foreground mb-2 block">
                          Color
                        </label>
                        <div className="grid grid-cols-10 gap-2">
                          {commonColors.map((color) => (
                            <button
                              key={color}
                              onClick={() => setFormData({ ...formData, color })}
                              className={`w-10 h-10 rounded-lg transition-all ${formData.color === color
                                  ? "ring-2 ring-primary ring-offset-2 scale-110"
                                  : "hover:scale-105"
                                }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Active Toggle (only for edit) */}
                      {showEditModal && (
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-foreground">
                            Active
                          </label>
                          <button
                            onClick={() =>
                              setFormData({
                                ...formData,
                                isActive: !formData.isActive,
                              })
                            }
                            className={`w-12 h-6 rounded-full transition-all ${formData.isActive ? "bg-primary" : "bg-muted/50"
                              }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full bg-white transition-all ${formData.isActive ? "translate-x-7" : "translate-x-1"
                                }`}
                            />
                          </button>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => {
                            setShowAddModal(false);
                            setShowEditModal(false);
                          }}
                          className="flex-1 py-3 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={showAddModal ? handleSaveAdd : handleSaveEdit}
                          disabled={!formData.name.trim()}
                          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {showAddModal ? "Add" : "Save"}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
              {showDeleteModal && deletingCategory && (
                <motion.div
                  className="fixed inset-0 z-[60] flex items-center justify-center px-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeletingCategory(null);
                    }}
                  />
                  <motion.div
                    className="relative w-full max-w-sm bg-card rounded-3xl p-6 text-center"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                  >
                    <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                      <Trash2 className="w-8 h-8 text-destructive" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      Delete Category?
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Are you sure you want to delete "{deletingCategory.name}"? This action cannot be undone.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowDeleteModal(false);
                          setDeletingCategory(null);
                        }}
                        className="flex-1 py-3 rounded-xl bg-muted/30 text-foreground font-medium hover:bg-muted/50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteConfirm}
                        className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Reassign Modal */}
            <AnimatePresence>
              {showReassignModal && deletingCategory && (
                <motion.div
                  className="fixed inset-0 z-[60] flex items-center justify-center px-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={() => {
                      setShowReassignModal(false);
                      setDeletingCategory(null);
                      setReassignToCategory("");
                    }}
                  />
                  <motion.div
                    className="relative w-full max-w-md bg-card rounded-3xl p-6"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-warning" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-foreground">
                          Category in Use
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {usageCount} transaction(s) use this category
                        </p>
                      </div>
                    </div>
                    <p className="text-muted-foreground mb-4">
                      Please select another category to move all transactions from "{deletingCategory.name}" to:
                    </p>
                    <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
                      {availableCategories.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No other {deletingCategory.type} categories available
                        </p>
                      ) : (
                        availableCategories.map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => setReassignToCategory(cat.id!)}
                            className={`w-full p-3 rounded-xl border-2 transition-all text-left ${reassignToCategory === cat.id
                                ? "border-primary bg-primary/10"
                                : "border-border/50 bg-muted/20 hover:border-primary/50"
                              }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                                style={{ backgroundColor: `${cat.color}20` }}
                              >
                                {cat.icon}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-foreground">{cat.name}</p>
                              </div>
                              {reassignToCategory === cat.id && (
                                <Check className="w-5 h-5 text-primary" />
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowReassignModal(false);
                          setDeletingCategory(null);
                          setReassignToCategory("");
                        }}
                        className="flex-1 py-3 rounded-xl bg-muted/30 text-foreground font-medium hover:bg-muted/50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleReassignConfirm}
                        disabled={!reassignToCategory}
                        className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Delete & Reassign
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
