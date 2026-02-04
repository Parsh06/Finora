import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Users, Plus, ArrowRight, Trash2, Receipt, ArrowLeftRight, Pencil, Check, Sparkles, Wand2, Scan } from "lucide-react";
import { groqJsonCompletion, GroqMessage } from "@/lib/groq-service";
import { BillScanner } from "@/components/BillScanner";
import { BillData } from "@/lib/gemini-service";
import { useAuth } from "@/contexts/AuthContext";
import {
    subscribeToExpenseGroups,
    ExpenseGroup,
    GroupExpense,
    addExpenseGroup,
    deleteExpenseGroup,
    subscribeToGroupExpenses,
    addGroupExpense,
    deleteGroupExpense,
    updateExpenseGroup
} from "@/lib/firestore";
import { toast } from "sonner";
import { format } from "date-fns";
import { usePrivacy } from "@/contexts/PrivacyContext";

// Simplified Debt Calculation
interface Debt {
    from: string;
    to: string;
    amount: number;
}

const calculateDebts = (expenses: GroupExpense[], members: string[]) => {
    const balances: Record<string, number> = {};
    members.forEach(m => balances[m] = 0);

    expenses.forEach(exp => {
        const payer = exp.paidBy;
        const amount = exp.amount;

        // Determine who is involved in the split
        const involvedMembers = exp.splitWith && exp.splitWith.length > 0 ? exp.splitWith : members;
        const splitAmount = amount / involvedMembers.length;

        // Payer "paid" full amount (positive balance)
        balances[payer] = (balances[payer] || 0) + amount;

        // Involved members (including payer) "consume" splitAmount (negative)
        involvedMembers.forEach(m => {
            balances[m] = (balances[m] || 0) - splitAmount;
        });
    });

    const debts: Debt[] = [];
    const debtors = Object.entries(balances).filter(([, bal]) => bal < -0.01).sort(([, a], [, b]) => a - b);
    const creditors = Object.entries(balances).filter(([, bal]) => bal > 0.01).sort(([, a], [, b]) => b - a);

    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];

        const amount = Math.min(Math.abs(debtor[1]), creditor[1]);

        // Round to 2 decimal
        if (amount > 0) {
            debts.push({ from: debtor[0], to: creditor[0], amount: Math.round(amount) });
        }

        debtor[1] += amount;
        creditor[1] -= amount;

        if (Math.abs(debtor[1]) < 0.01) i++;
        if (Math.abs(creditor[1]) < 0.01) j++;
    }

    return debts;
};

export const SplitGroups = () => {
    const { currentUser } = useAuth();
    const { isPrivacyEnabled } = usePrivacy();
    const [groups, setGroups] = useState<ExpenseGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeGroup, setActiveGroup] = useState<ExpenseGroup | null>(null);

    // Group List State
    const [showAddGroup, setShowAddGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupMembers, setNewGroupMembers] = useState(""); // Comma separated

    // Edit Group State
    const [showEditGroup, setShowEditGroup] = useState(false);
    const [editGroupName, setEditGroupName] = useState("");
    const [editGroupMembers, setEditGroupMembers] = useState("");

    // Active Group State
    const [expenses, setExpenses] = useState<GroupExpense[]>([]);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [view, setView] = useState<"expenses" | "balances">("expenses");

    // Add Expense State
    const [showAddExpense, setShowAddExpense] = useState(false);
    const [expenseDesc, setExpenseDesc] = useState("");
    const [expenseAmount, setExpenseAmount] = useState("");
    const [expensePayer, setExpensePayer] = useState("");
    const [expenseSplitWith, setExpenseSplitWith] = useState<string[]>([]); // Empty = Split with all

    // AI Input State
    const [aiInput, setAiInput] = useState("");
    const [isAiParsing, setIsAiParsing] = useState(false);

    // Scanner State
    const [showScanner, setShowScanner] = useState(false);

    const blurClass = isPrivacyEnabled ? "blur-sm select-none" : "";

    // Subscribe to Groups
    useEffect(() => {
        if (!currentUser) return;
        const unsubscribe = subscribeToExpenseGroups(currentUser.uid, (data) => {
            setGroups(data);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [currentUser]);

    // Subscribe to Expenses when a group is active
    useEffect(() => {
        if (!currentUser || !activeGroup) return;
        const unsubscribe = subscribeToGroupExpenses(currentUser.uid, activeGroup.id!, (data) => {
            setExpenses(data);
            setDebts(calculateDebts(data, activeGroup.members));
        });
        return () => unsubscribe();
    }, [currentUser, activeGroup]);

    // Sync Active Group with Groups Update (e.g. Total Spent change)
    useEffect(() => {
        if (activeGroup) {
            const updatedGroup = groups.find(g => g.id === activeGroup.id);
            if (updatedGroup) {
                setActiveGroup(prev => ({
                    ...prev!,
                    name: updatedGroup.name,
                    totalSpent: updatedGroup.totalSpent,
                    members: updatedGroup.members
                }));
            }
        }
    }, [groups, activeGroup?.id]); // Only deps needed

    const handleUpdateGroup = async () => {
        if (!currentUser || !activeGroup || !editGroupName) return;

        const membersList = editGroupMembers
            .split(",")
            .map(m => m.trim())
            .filter(m => m.length > 0);

        if (!membersList.includes("Me")) membersList.unshift("Me");

        try {
            await updateExpenseGroup(currentUser.uid, activeGroup.id!, {
                name: editGroupName,
                members: membersList
            });
            toast.success("Group updated!");
            setShowEditGroup(false);
        } catch (error) {
            toast.error("Failed to update group");
        }
    };

    const handleCreateGroup = async () => {
        if (!currentUser || !newGroupName) return;

        // Members array: Always include "Me" (or user name) plus entered names
        const membersList = newGroupMembers
            .split(",")
            .map(m => m.trim())
            .filter(m => m.length > 0);

        if (!membersList.includes("Me")) membersList.unshift("Me");

        try {
            await addExpenseGroup(currentUser.uid, {
                name: newGroupName,
                members: membersList,
                totalSpent: 0,
                currency: "INR"
            });
            toast.success("Group created!");
            setShowAddGroup(false);
            setNewGroupName("");
            setNewGroupMembers("");
        } catch (error) {
            toast.error("Failed to create group");
        }
    };

    const handleCreateExpense = async () => {
        if (!currentUser || !activeGroup) return;
        if (!expenseDesc || !expenseAmount || !expensePayer) return;

        try {
            const splitWithMembers = expenseSplitWith.length > 0 ? expenseSplitWith : undefined;

            await addGroupExpense(currentUser.uid, activeGroup.id!, {
                description: expenseDesc,
                amount: Number(expenseAmount),
                paidBy: expensePayer,
                splitWith: splitWithMembers,
                date: new Date()
            });
            toast.success("Expense added!");
            setShowAddExpense(false);
            setExpenseDesc("");
            setExpenseAmount("");
            setExpensePayer("");
            setExpenseSplitWith([]);
        } catch (error) {
            toast.error("Failed to add expense");
        }
    };

    const handleDeleteGroup = async (groupId: string) => {
        if (!currentUser) return;
        if (!confirm("Delete this group and all expenses?")) return;
        try {
            await deleteExpenseGroup(currentUser.uid, groupId);
            if (activeGroup?.id === groupId) setActiveGroup(null);
            toast.success("Group deleted");
        } catch (error) {
            toast.error("Failed to delete group");
        }
    };

    const handleDeleteExpense = async (expenseId: string, amount: number) => {
        if (!currentUser || !activeGroup) return;
        if (!confirm("Delete this expense?")) return;
        try {
            await deleteGroupExpense(currentUser.uid, activeGroup.id!, expenseId, amount);
            toast.success("Expense deleted");
        } catch (error) {
            toast.error("Failed to delete expense");
        }
    };

    const openEditGroup = () => {
        if (!activeGroup) return;
        setEditGroupName(activeGroup.name);
        setEditGroupMembers(activeGroup.members.filter(m => m !== "Me").join(", "));
        setShowEditGroup(true);
    };

    const toggleSplitMember = (member: string) => {
        if (expenseSplitWith.includes(member)) {
            setExpenseSplitWith(prev => prev.filter(m => m !== member));
        } else {
            setExpenseSplitWith(prev => [...prev, member]);
        }
    };

    const handleAiParse = async () => {
        if (!aiInput.trim() || !activeGroup) return;
        setIsAiParsing(true);

        try {
            const members = activeGroup.members;
            const prompt = `
                Parse expense string: "${aiInput}".
                Group Members: ${members.join(", ")}.
                "Me" refers to the current user.
                
                Return JSON:
                {
                    "description": "short title",
                    "amount": number,
                    "paidBy": "exact member name",
                    "splitWith": ["exact member names"] (empty if everyone)
                }
            `;

            const messages: GroqMessage[] = [
                { role: "system", content: "You are an expense parser. JSON only." },
                { role: "user", content: prompt }
            ];

            const result = await groqJsonCompletion<{ description: string; amount: number; paidBy: string; splitWith: string[] }>(messages);

            if (result.description) setExpenseDesc(result.description);
            if (result.amount) setExpenseAmount(result.amount.toString());

            // Match paidBy
            if (result.paidBy) {
                const match = members.find(m => m.toLowerCase() === result.paidBy.toLowerCase());
                if (match) setExpensePayer(match);
                else if (result.paidBy.toLowerCase() === "me") setExpensePayer("Me");
            }

            // Match splitWith
            if (result.splitWith && Array.isArray(result.splitWith)) {
                const matchedSplits = result.splitWith.map(s => {
                    if (s.toLowerCase() === "everyone") return null;
                    const m = members.find(mem => mem.toLowerCase() === s.toLowerCase());
                    return m;
                }).filter(Boolean) as string[];

                if (matchedSplits.length > 0) setExpenseSplitWith(matchedSplits);
                else setExpenseSplitWith([]); // Reset to all if parsing suggested everyone or failed
            }

            toast.success("Auto-filled from text!");
        } catch (error) {
            console.error(error);
            toast.error("Could not parse. Try simpler text.");
        } finally {
            setIsAiParsing(false);
        }
    };

    const handleScanComplete = (data: BillData & { splitBetween: number }) => {
        if (data.merchant) setExpenseDesc(data.merchant);
        if (data.amount) setExpenseAmount(data.amount.toString());
        // Auto-select 'Me' as payer since I'm scanning it
        setExpensePayer("Me");
        toast.success("Expense details filled from receipt!");
        // We could use data.items to populate a more detailed description if needed
        if (data.items && data.items.length > 0) {
            const itemSummary = data.items.join(", ");
            if (data.merchant) setExpenseDesc(`${data.merchant} - ${itemSummary.substring(0, 30)}${itemSummary.length > 30 ? "..." : ""}`);
        }
    };

    // --- Render Functions ---

    if (activeGroup) {
        // Compute total from visible expenses for immediate feedback
        const currentViewTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

        return (
            <div className="min-h-screen pb-24 bg-background">
                <header className="px-5 pt-6 pb-4 border-b border-border/50 sticky top-0 bg-background/80 backdrop-blur-md z-10">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setActiveGroup(null)}
                            className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors"
                        >
                            <ArrowRight className="w-5 h-5 rotate-180" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold flex items-center gap-2">
                                {activeGroup.name}
                                <button onClick={openEditGroup} className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                                    <Pencil className="w-4 h-4" />
                                </button>
                            </h1>
                            <p className="text-xs text-muted-foreground">{activeGroup.members.length} members • Total: ₹{currentViewTotal.toLocaleString()}</p>
                        </div>
                    </div>
                </header>

                {/* Tabs */}
                <div className="px-5 mt-4">
                    <div className="flex p-1 bg-secondary rounded-xl">
                        <button
                            onClick={() => setView("expenses")}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${view === "expenses" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                        >
                            Expenses
                        </button>
                        <button
                            onClick={() => setView("balances")}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${view === "balances" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                        >
                            Balances
                        </button>
                    </div>
                </div>

                <div className="px-5 mt-4 pb-20">
                    {view === "expenses" ? (
                        <div className="space-y-3">
                            {expenses.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground">
                                    <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>No expenses yet</p>
                                    <p className="text-xs">Add one to split costs</p>
                                </div>
                            ) : (
                                expenses.map(exp => (
                                    <motion.div
                                        key={exp.id}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="glass-card p-4 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                                                {exp.paidBy.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium">{exp.description}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {exp.paidBy} paid
                                                    {exp.splitWith && exp.splitWith.length > 0 ? ` (split with ${exp.splitWith.length})` : " (split equally)"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold ${blurClass}`}>₹{exp.amount.toLocaleString()}</span>
                                            <button
                                                onClick={() => handleDeleteExpense(exp.id!, exp.amount)}
                                                className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {debts.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground">
                                    <p>No settlements needed 🎉</p>
                                </div>
                            ) : (
                                debts.map((debt, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className="glass-card p-4 flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{debt.from}</span>
                                            <span className="text-muted-foreground text-xs">owes</span>
                                            <span className="font-medium">{debt.to}</span>
                                        </div>
                                        <span className={`font-bold text-primary ${blurClass}`}>₹{debt.amount.toLocaleString()}</span>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Add Expense Button */}
                <div className="fixed bottom-24 right-5">
                    <motion.button
                        onClick={() => { setExpensePayer("Me"); setExpenseSplitWith([]); setShowAddExpense(true); }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25"
                    >
                        <Plus className="w-7 h-7" />
                    </motion.button>
                </div>

                {/* Add Expense Modal */}
                <AnimatePresence>
                    {showAddExpense && (
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
                                className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 h-[80vh] overflow-y-auto"
                            >
                                <h2 className="text-xl font-bold mb-4">Add Expense</h2>

                                {/* AI Magic Input */}
                                <div className="mb-6 bg-purple-500/5 p-3 rounded-xl border border-purple-500/20">
                                    <label className="text-xs font-bold text-purple-500 block mb-2 flex items-center gap-1">
                                        <Wand2 className="w-3 h-3" /> AI Quick Add
                                    </label>
                                    <div className="flex gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={aiInput}
                                            onChange={e => setAiInput(e.target.value)}
                                            className="flex-1 bg-background p-2 rounded-lg text-sm outline-none border border-input focus:border-purple-500 transition-colors"
                                            placeholder='e.g. "Lunch 500 paid by Alice for Bob"'
                                            onKeyDown={e => e.key === 'Enter' && handleAiParse()}
                                        />
                                        <button
                                            onClick={handleAiParse}
                                            disabled={isAiParsing || !aiInput}
                                            className="bg-purple-500 text-white p-2 rounded-lg disabled:opacity-50"
                                        >
                                            {isAiParsing ? <div className="animate-spin w-4 h-4 border-2 border-white/50 border-t-white rounded-full" /> : <Sparkles className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => setShowScanner(true)}
                                            className="text-xs flex items-center gap-1 text-purple-500 hover:text-purple-600 font-medium"
                                        >
                                            <Scan className="w-3 h-3" /> Scan Receipt instead
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-muted-foreground block mb-1">Description</label>
                                        <input type="text" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} className="w-full bg-secondary p-3 rounded-xl outline-none" placeholder="Dinner, Taxi..." />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-foreground block mb-1">Amount</label>
                                        <input type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} className="w-full bg-secondary p-3 rounded-xl outline-none" placeholder="0.00" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-foreground block mb-1">Paid By</label>
                                        <div className="flex flex-wrap gap-2">
                                            {activeGroup.members.map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => setExpensePayer(m)}
                                                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${expensePayer === m ? "bg-primary text-primary-foreground border-primary" : "bg-transparent border-input"}`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Split With */}
                                    <div>
                                        <label className="text-xs text-muted-foreground block mb-1">Split With (Optional)</label>
                                        <p className="text-[10px] text-muted-foreground mb-2">Leave unselected to split equally with everyone</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {activeGroup.members.map(m => {
                                                const isSelected = expenseSplitWith.includes(m);
                                                return (
                                                    <button
                                                        key={m}
                                                        onClick={() => toggleSplitMember(m)}
                                                        className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-between transition-colors ${isSelected ? "bg-secondary/80 border-primary" : "bg-transparent border-input"}`}
                                                    >
                                                        {m}
                                                        {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex gap-3 mt-2">
                                        <button onClick={() => setShowAddExpense(false)} className="flex-1 py-3 rounded-xl text-muted-foreground hover:bg-secondary">Cancel</button>
                                        <button onClick={handleCreateExpense} disabled={!expenseDesc || !expenseAmount} className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-bold">Add</button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Edit Group Modal */}
                <AnimatePresence>
                    {showEditGroup && (
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
                                <h2 className="text-xl font-bold mb-4">Edit Group</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm text-muted-foreground block mb-1">Group Name</label>
                                        <input type="text" value={editGroupName} onChange={e => setEditGroupName(e.target.value)} className="w-full bg-secondary p-3 rounded-xl outline-none" placeholder="Group Name" />
                                    </div>

                                    <div>
                                        <label className="text-sm text-muted-foreground block mb-1">Members (comma separated)</label>
                                        <textarea
                                            value={editGroupMembers}
                                            onChange={e => setEditGroupMembers(e.target.value)}
                                            className="w-full bg-secondary p-3 rounded-xl outline-none min-h-[80px]"
                                            placeholder="Alice, Bob, Charlie..."
                                        />
                                        <p className="text-xs text-muted-foreground mt-1 text-right">"Me" is always included</p>
                                    </div>

                                    <div className="flex gap-3 mt-4">
                                        <button onClick={() => setShowEditGroup(false)} className="flex-1 py-3.5 rounded-xl text-muted-foreground hover:bg-secondary">Cancel</button>
                                        <button
                                            onClick={handleUpdateGroup}
                                            disabled={!editGroupName}
                                            className="flex-1 bg-primary text-primary-foreground py-3.5 rounded-xl font-bold disabled:opacity-50"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>
        );
    }

    // --- Main List View ---

    return (
        <div className="min-h-screen pb-24">
            <header className="px-5 pt-6 pb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        Split Bills <Users className="w-6 h-6 text-primary" />
                    </h1>
                    <p className="text-sm text-muted-foreground">Track shared expenses</p>
                </div>
                <motion.button
                    onClick={() => setShowAddGroup(true)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25"
                >
                    <Plus className="w-5 h-5 text-primary-foreground" />
                </motion.button>
            </header>

            {loading ? (
                <div className="text-center py-12 text-muted-foreground">Loading groups...</div>
            ) : groups.length === 0 ? (
                <div className="px-5 text-center mt-12">
                    <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium">No expense groups</h3>
                    <p className="text-muted-foreground text-sm mt-1">Create a group for your trip or shared bills!</p>
                </div>
            ) : (
                <div className="px-5 space-y-4">
                    {groups.map(group => (
                        <motion.div
                            key={group.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => setActiveGroup(group)}
                            className="glass-card p-5 cursor-pointer hover:bg-muted/20 transition-colors"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-semibold text-lg">{group.name}</h3>
                                    <p className="text-sm text-muted-foreground">{group.members.length} members: {group.members.join(", ")}</p>
                                </div>
                            </div>
                            <div className="mt-4 flex justify-between items-end">
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Total Spent</p>
                                    <p className={`font-bold text-xl ${blurClass}`}>₹{group.totalSpent.toLocaleString()}</p>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id!); }}
                                    className="p-2 text-muted-foreground hover:text-destructive transition-colors relative z-10"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Add Group Modal */}
            <AnimatePresence>
                {showAddGroup && (
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
                            <h2 className="text-xl font-bold mb-4">New Group</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-muted-foreground block mb-1">Group Name</label>
                                    <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full bg-secondary p-3 rounded-xl outline-none" placeholder="Goa Trip, Office Lunch..." />
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground block mb-1">Members (comma separated)</label>
                                    <input type="text" value={newGroupMembers} onChange={e => setNewGroupMembers(e.target.value)} className="w-full bg-secondary p-3 rounded-xl outline-none" placeholder="Alice, Bob, Charlie..." />
                                    <p className="text-xs text-muted-foreground mt-1 text-right">"Me" is added automatically</p>
                                </div>

                                <div className="flex gap-3 mt-4">
                                    <button onClick={() => setShowAddGroup(false)} className="flex-1 py-3.5 rounded-xl text-muted-foreground hover:bg-secondary">Cancel</button>
                                    <button
                                        onClick={handleCreateGroup}
                                        disabled={!newGroupName}
                                        className="flex-1 bg-primary text-primary-foreground py-3.5 rounded-xl font-bold disabled:opacity-50"
                                    >
                                        Create Group
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bill Scanner Modal */}
            <BillScanner
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                onScanComplete={handleScanComplete}
                mode="return_data"
            />
        </div>
    );
};
