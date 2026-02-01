import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Plus, Target, Trash2, Pencil, Check, X, Award, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToSavingsGoals, SavingsGoal, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal, addFundsToGoal, getTransactions, Transaction } from "@/lib/firestore";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { usePrivacy } from "@/contexts/PrivacyContext";

export const SavingsGoals = () => {
    const { currentUser } = useAuth();
    const { isPrivacyEnabled } = usePrivacy();
    const [goals, setGoals] = useState<SavingsGoal[]>([]);
    const [loading, setLoading] = useState(true);
    const [availableSavings, setAvailableSavings] = useState(0);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showFundModal, setShowFundModal] = useState(false);
    const [showCelebration, setShowCelebration] = useState(false); // New celebration modal
    const [celebratedGoal, setCelebratedGoal] = useState<SavingsGoal | null>(null);
    const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
    const [fundingGoal, setFundingGoal] = useState<SavingsGoal | null>(null);

    // Form state
    const [name, setName] = useState("");
    const [targetAmount, setTargetAmount] = useState("");
    const [currentAmount, setCurrentAmount] = useState(""); // For initial setup
    const [deadline, setDeadline] = useState("");
    const [icon, setIcon] = useState("🎯");
    const [color, setColor] = useState("#10B981");
    const [fundAmount, setFundAmount] = useState("");

    const icons = ["🎯", "🏠", "🚗", "✈️", "💍", "👶", "🎓", "📱", "💻", "🏥"];
    const colors = ["#10B981", "#3B82F6", "#F59E0B", "#EC4899", "#8B5CF6", "#06B6D4"];

    useEffect(() => {
        if (!currentUser) return;
        const unsubscribe = subscribeToSavingsGoals(currentUser.uid, (data) => {
            setGoals(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [currentUser]);

    // Calculate Available Savings
    useEffect(() => {
        const fetchFinancials = async () => {
            if (!currentUser) return;
            const transactions = await getTransactions(currentUser.uid);

            const income = transactions
                .filter(t => t.type === "income")
                .reduce((sum, t) => sum + t.amount, 0);

            const expense = transactions
                .filter(t => t.type === "expense")
                .reduce((sum, t) => sum + t.amount, 0);

            const allocated = goals.reduce((sum, g) => sum + g.currentAmount, 0);

            // Available = (Income - Expense) - Already Allocated into Goals
            // Currently assuming 'Expense' includes everything EXCEPT transfers to savings.
            // If transfers to savings are logged as expenses, we should arguably add them back, 
            // but for simplicity let's assume 'Savings' is a separate bucket.
            // Net Cash Flow = Income - Expense.
            // Available for Allocation = Net Cash Flow - Currently Allocated.

            setAvailableSavings((income - expense) - allocated);
        };
        fetchFinancials();
    }, [currentUser, goals, showAddModal, showFundModal]); // Re-run when goals change

    const resetForm = () => {
        setName("");
        setTargetAmount("");
        setCurrentAmount("");
        setDeadline("");
        setIcon("🎯");
        setColor("#10B981");
        setFundAmount("");
        setEditingGoal(null);
        setFundingGoal(null);
    };

    const handleCreate = async () => {
        if (!currentUser) return;
        try {
            await addSavingsGoal(currentUser.uid, {
                name,
                targetAmount: Number(targetAmount),
                currentAmount: Number(currentAmount) || 0,
                icon,
                color,
                deadline: deadline || undefined,
                status: Number(currentAmount) >= Number(targetAmount) ? "completed" : "active",
            });
            toast.success("Savings goal created!");
            setShowAddModal(false);
            resetForm();
        } catch (error) {
            toast.error("Failed to create goal");
        }
    };

    const handleUpdate = async () => {
        if (!currentUser || !editingGoal?.id) return;
        try {
            await updateSavingsGoal(currentUser.uid, editingGoal.id, {
                name,
                targetAmount: Number(targetAmount),
                icon,
                color,
                deadline: deadline || undefined,
            });
            toast.success("Goal updated!");
            setShowEditModal(false);
            resetForm();
        } catch (error) {
            toast.error("Failed to update goal");
        }
    };

    const handleDelete = async (goalId: string) => {
        if (!currentUser) return;
        if (!confirm("Delete this goal?")) return;
        try {
            await deleteSavingsGoal(currentUser.uid, goalId);
            toast.success("Goal deleted");
        } catch (error) {
            toast.error("Failed to delete goal");
        }
    };

    const handleAddFunds = async () => {
        if (!currentUser || !fundingGoal?.id) return;
        const amount = Number(fundAmount);
        if (amount <= 0) return;

        try {
            await addFundsToGoal(currentUser.uid, fundingGoal.id, amount);
            const newAmount = fundingGoal.currentAmount + amount;

            setShowFundModal(false);
            resetForm();

            if (newAmount >= fundingGoal.targetAmount) {
                confetti({
                    particleCount: 200,
                    spread: 100,
                    origin: { y: 0.6 },
                    scalar: 1.2
                });
                setCelebratedGoal({ ...fundingGoal, currentAmount: newAmount });
                setShowCelebration(true);
            } else {
                toast.success(`Added ₹${amount.toLocaleString()} to ${fundingGoal.name}`);
            }
        } catch (error) {
            toast.error("Failed to add funds");
        }
    };

    const openEdit = (goal: SavingsGoal) => {
        setEditingGoal(goal);
        setName(goal.name);
        setTargetAmount(goal.targetAmount.toString());
        setCurrentAmount(goal.currentAmount.toString());
        setIcon(goal.icon);
        setColor(goal.color);
        setDeadline(goal.deadline || "");
        setShowEditModal(true);
    };

    const openFund = (goal: SavingsGoal) => {
        setFundingGoal(goal);
        setFundAmount("");
        setShowFundModal(true);
    };

    const getProgress = (current: number, target: number) => {
        return Math.min(Math.round((current / target) * 100), 100);
    };

    const blurClass = isPrivacyEnabled ? "blur-sm select-none" : "";

    return (
        <div className="min-h-screen pb-24">
            <header className="px-5 pt-6 pb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        Savings Goals <Target className="w-6 h-6 text-primary" />
                    </h1>
                    <p className="text-sm text-muted-foreground">Track your dreams and wishes</p>
                </div>
                <div className="glass-card px-4 py-2 flex flex-col items-end hidden sm:flex">
                    <span className="text-xs text-muted-foreground">Available to Save</span>
                    <span className={`font-bold text-primary ${blurClass}`}>₹{availableSavings > 0 ? availableSavings.toLocaleString() : "0"}</span>
                </div>
                <motion.button
                    onClick={() => { resetForm(); setShowAddModal(true); }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25"
                >
                    <Plus className="w-5 h-5 text-primary-foreground" />
                </motion.button>
            </header>

            {loading ? (
                <div className="text-center py-12 text-muted-foreground">Loading goals...</div>
            ) : goals.length === 0 ? (
                <div className="px-5 text-center mt-12">
                    <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                        <Target className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium">No savings goals yet</h3>
                    <p className="text-muted-foreground text-sm mt-1">Start saving for your next big thing!</p>
                </div>
            ) : (
                <div className="px-5 space-y-4">
                    {goals.map(goal => {
                        const progress = getProgress(goal.currentAmount, goal.targetAmount);
                        const isCompleted = progress >= 100;

                        return (
                            <motion.div
                                key={goal.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`glass-card p-5 relative overflow-hidden ${isCompleted ? "border-success/50 bg-success/5" : ""}`}
                            >
                                {/* Background Progress Bar */}
                                <div
                                    className="absolute bottom-0 left-0 h-1 transition-all duration-1000 ease-out"
                                    style={{
                                        width: `${progress}%`,
                                        backgroundColor: goal.color
                                    }}
                                />

                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner"
                                            style={{ backgroundColor: `${goal.color}20` }}
                                        >
                                            {goal.icon}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">{goal.name}</h3>
                                            {goal.deadline && (
                                                <p className="text-xs text-muted-foreground">Goal: {goal.deadline}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => openEdit(goal)} className="p-2 hover:bg-muted rounded-lg"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                                        <button onClick={() => handleDelete(goal.id!)} className="p-2 hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4 text-muted-foreground" /></button>
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className={`text-muted-foreground ${blurClass}`}>₹{goal.currentAmount.toLocaleString()} saved</span>
                                        <span className={`font-medium ${blurClass}`}>₹{goal.targetAmount.toLocaleString()}</span>
                                    </div>
                                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 1 }}
                                            className="h-full rounded-full"
                                            style={{ backgroundColor: goal.color }}
                                        />
                                    </div>
                                </div>

                                {!isCompleted ? (
                                    <motion.button
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => openFund(goal)}
                                        className="w-full py-2.5 rounded-xl bg-background border border-border font-medium text-sm flex items-center justify-center gap-2 hover:bg-secondary transition-colors"
                                    >
                                        <Plus className="w-4 h-4" /> Add Money
                                    </motion.button>
                                ) : (
                                    <div className="w-full py-2.5 rounded-xl bg-success/20 text-success font-medium text-sm flex items-center justify-center gap-2">
                                        <Award className="w-4 h-4" /> Goal Completed!
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Add/Edit Modal */}
            <AnimatePresence>
                {(showAddModal || showEditModal) && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
                    >
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold">{showEditModal ? "Edit Goal" : "New Goal"}</h2>
                                <button onClick={() => { setShowAddModal(false); setShowEditModal(false); }}><X className="w-6 h-6" /></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-muted-foreground block mb-1">Goal Name</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-secondary p-3 rounded-xl outline-none" placeholder="New Mac, Vacation..." />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm text-muted-foreground block mb-1">Target Amount (₹)</label>
                                        <input type="number" value={targetAmount} onChange={e => setTargetAmount(e.target.value)} className="w-full bg-secondary p-3 rounded-xl outline-none" placeholder="50000" />
                                    </div>
                                </div>
                                {showAddModal && (
                                    <div className="col-span-2">
                                        <div className="bg-secondary/30 p-3 rounded-lg flex justify-between items-center text-xs mb-2">
                                            <span className="text-muted-foreground">Available to allocate:</span>
                                            <span className={`font-bold ${blurClass}`}>₹{availableSavings > 0 ? availableSavings.toLocaleString() : 0}</span>
                                        </div>
                                        <label className="text-sm text-muted-foreground block mb-1">Starting Amount (₹)</label>
                                        <div className="flex gap-2">
                                            <input type="number" value={currentAmount} onChange={e => setCurrentAmount(e.target.value)} className="w-full bg-secondary p-3 rounded-xl outline-none" placeholder="0" />
                                            <button
                                                onClick={() => setCurrentAmount(availableSavings.toString())}
                                                className="bg-secondary hover:bg-muted px-4 rounded-xl text-xs font-medium transition-colors"
                                            >
                                                Max
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground block mb-2">Icon</label>
                                <div className="flex gap-2 overflow-x-auto pb-2">
                                    {icons.map(ic => (
                                        <button key={ic} onClick={() => setIcon(ic)} className={`w-10 h-10 rounded-lg text-xl flex-shrink-0 flex items-center justify-center transition-colors ${icon === ic ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                                            {ic}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-muted-foreground block mb-2">Color</label>
                                <div className="flex gap-2">
                                    {colors.map(col => (
                                        <button key={col} onClick={() => setColor(col)} className={`w-8 h-8 rounded-full border-2 ${color === col ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: col }} />
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={showEditModal ? handleUpdate : handleCreate}
                                disabled={!name || !targetAmount}
                                className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold mt-4 disabled:opacity-50"
                            >
                                {showEditModal ? "Save Changes" : "Create Goal"}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Fund Modal */}
            <AnimatePresence>
                {showFundModal && fundingGoal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card w-full max-w-sm rounded-3xl p-6 m-4"
                        >
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center text-3xl" style={{ backgroundColor: `${fundingGoal.color}20` }}>
                                    {fundingGoal.icon}
                                </div>
                                <h3 className="font-bold text-xl">{fundingGoal.name}</h3>
                                <p className="text-sm text-muted-foreground">Add funds to reach your goal</p>
                            </div>

                            <div className="bg-secondary/50 p-4 rounded-2xl mb-6">
                                <label className="text-xs text-muted-foreground block mb-1 uppercase tracking-wider font-semibold text-center">Amount to Add</label>
                                <div className="flex items-center justify-center gap-1">
                                    <span className="text-2xl text-muted-foreground">₹</span>
                                    <input
                                        type="number"
                                        autoFocus
                                        value={fundAmount}
                                        onChange={e => setFundAmount(e.target.value)}
                                        className="bg-transparent text-4xl font-bold text-center w-32 outline-none"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="bg-secondary/30 p-3 rounded-xl mb-4 text-center text-xs">
                                <span className="text-muted-foreground">Available to add: </span>
                                <span className={`font-bold ${blurClass}`}>₹{availableSavings.toLocaleString()}</span>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setShowFundModal(false)} className="flex-1 py-3 rounded-xl font-medium hover:bg-secondary transition-colors">Cancel</button>
                                <button
                                    onClick={handleAddFunds}
                                    disabled={!fundAmount || Number(fundAmount) <= 0}
                                    className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-bold disabled:opacity-50"
                                >
                                    Add Funds
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >

            {/* Celebration Modal */}
            <AnimatePresence>
                {
                    showCelebration && celebratedGoal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                            onClick={() => setShowCelebration(false)} // Close on background click
                        >
                            <motion.div
                                initial={{ scale: 0.5, y: 100, opacity: 0 }}
                                animate={{ scale: 1, y: 0, opacity: 1 }}
                                exit={{ scale: 0.5, y: 100, opacity: 0 }}
                                transition={{ type: "spring", bounce: 0.5 }}
                                className="bg-card w-full max-w-sm rounded-[2rem] p-8 text-center relative overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Decorative background elements */}
                                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/10 to-transparent" />

                                <div className="relative z-10">
                                    <motion.div
                                        initial={{ scale: 0, rotate: -180 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ delay: 0.2, type: "spring" }}
                                        className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center text-5xl shadow-xl bg-background border-4 border-primary/20"
                                    >
                                        {celebratedGoal.icon}
                                    </motion.div>

                                    <motion.h2
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.4 }}
                                        className="text-3xl font-bold mb-2 bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent"
                                    >
                                        Goal Reached!
                                    </motion.h2>

                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.5 }}
                                        className="text-muted-foreground mb-8"
                                    >
                                        You've saved <span className="font-bold text-foreground">₹{celebratedGoal.targetAmount.toLocaleString()}</span> for <span className="font-bold text-foreground">{celebratedGoal.name}</span>.
                                    </motion.p>

                                    <motion.button
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.6 }}
                                        onClick={() => setShowCelebration(false)}
                                        className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-shadow"
                                    >
                                        Awesome! 🚀
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )
                }
            </AnimatePresence >
        </div >
    );
};
