import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from "firebase/app";
import {
    getFirestore, doc, onSnapshot, updateDoc, setDoc,
    arrayUnion, arrayRemove, getDoc
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
    Plus, Trash2, Camera, Receipt, Settings as SettingsIcon,
    Users, CreditCard, ArrowRight, BarChart3, Loader2, Sparkles, LogOut,
    Wallet, Banknote, Share2
} from 'lucide-react';
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// --- UTILITIES ---
function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const formatINR = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

// --- CONFIGURATION ---
// TODO: Replace with your actual Firebase connection details
// You can also put these in .env.local as VITE_FIREBASE_API_KEY etc.
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSy_PLACEHOLDER",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "placeholder.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "placeholder-project",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "placeholder.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123:web:abc"
};

// Data Path Constants
const APP_ARTIFACT_ID = "fairshare-app";
const COLLECTION_PATH = `artifacts/${APP_ARTIFACT_ID}/public/data/rooms`;

// Initialize Firebase
// We use a singleton pattern to avoid re-initialization
let db, auth;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (error) {
    console.error("Firebase init failed:", error);
}

// --- COMPONENT: UI PRIMITIVES ---

const Button = ({ children, variant = "primary", size = "default", className, disabled, loading, ...props }) => {
    const variants = {
        primary: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200",
        secondary: "bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm",
        danger: "bg-red-50 hover:bg-red-100 text-red-600 border border-red-100",
        ghost: "text-gray-500 hover:text-emerald-600 hover:bg-emerald-50/50",
        outline: "border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50"
    };

    const sizes = {
        default: "h-12 px-6 rounded-xl font-medium",
        sm: "h-9 px-3 rounded-lg text-sm",
        icon: "h-10 w-10 p-2 rounded-full flex items-center justify-center"
    };

    return (
        <button
            disabled={disabled || loading}
            className={cn(
                "transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2",
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : children}
        </button>
    );
};

const Input = ({ className, error, ...props }) => (
    <div className="w-full">
        <input
            className={cn(
                "w-full h-12 px-4 rounded-xl border-2 border-gray-100 bg-gray-50 focus:border-emerald-500 focus:bg-white focus:outline-none transition-all placeholder:text-gray-400",
                error && "border-red-300 bg-red-50 focus:border-red-500",
                className
            )}
            {...props}
        />
        {error && <span className="text-xs text-red-500 mt-1 ml-1">{error}</span>}
    </div>
);

const Card = ({ children, className, ...props }) => (
    <div className={cn("bg-white rounded-2xl shadow-sm border border-gray-100 p-5", className)} {...props}>
        {children}
    </div>
);

// --- MAIN APPLICATION ---

export default function RoomExpenseApp() {
    // --- STATE ---
    const [user, setUser] = useState(null);
    const [roomId, setRoomId] = useState(() => localStorage.getItem("fairshare_room_id") || "");
    const [roomData, setRoomData] = useState({ participants: [], expenses: [] });
    const [activeTab, setActiveTab] = useState("expenses"); // expenses | balances | settings
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showAIModal, setShowAIModal] = useState(false);
    const [aiResult, setAiResult] = useState(null);

    // Form States
    const [newExpense, setNewExpense] = useState({ description: "", amount: "", paidBy: "", date: new Date().toISOString().split('T')[0] });
    const [participantsInput, setParticipantsInput] = useState("");
    const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
    const [joinInput, setJoinInput] = useState("");

    const fileInputRef = useRef(null);

    // --- AUTH & SYNC ---
    useEffect(() => {
        if (!auth) return;
        const unsub = onAuthStateChanged(auth, (u) => {
            if (u) setUser(u);
            else signInAnonymously(auth).catch((e) => setError("Auth failed: " + e.message));
        });
        return unsub;
    }, []);

    useEffect(() => {
        if (!roomId || !db) return;
        setLoading(true);
        const roomRef = doc(db, COLLECTION_PATH, roomId);

        const unsub = onSnapshot(roomRef, (docSnap) => {
            setLoading(false);
            if (docSnap.exists()) {
                setRoomData(docSnap.data());
                localStorage.setItem("fairshare_room_id", roomId);
            } else {
                // Room doesn't exist yet, we just wait or handle creation
                setLoading(false);
            }
        }, (err) => {
            console.error(err);
            setError("Failed to sync room data");
            setLoading(false);
        });

        return () => unsub();
    }, [roomId]);

    // --- ACTIONS ---

    const handleCreateRoom = async () => {
        if (!db) return alert("Database not initialized");
        const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
        try {
            setLoading(true);
            await setDoc(doc(db, COLLECTION_PATH, newId), {
                participants: [],
                expenses: [],
                createdAt: new Date().toISOString()
            });
            setRoomId(newId);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleJoinRoom = () => {
        if (!joinInput || joinInput.length < 3) return;
        setRoomId(joinInput.toUpperCase());
    };

    const addParticipant = async (e) => {
        e.preventDefault();
        if (!participantsInput.trim()) return;
        const name = participantsInput.trim();
        if (roomData.participants.includes(name)) return alert("Name exists!");

        try {
            await updateDoc(doc(db, COLLECTION_PATH, roomId), {
                participants: arrayUnion(name)
            });
            setParticipantsInput("");
        } catch (e) {
            alert("Error adding member: " + e.message);
        }
    };

    const addExpense = async (e) => {
        e.preventDefault();
        if (!newExpense.description || !newExpense.amount || !newExpense.paidBy) return;

        try {
            const exp = {
                id: Date.now().toString(),
                description: newExpense.description,
                amount: parseFloat(newExpense.amount),
                paidBy: newExpense.paidBy,
                date: newExpense.date,
                createdAt: new Date().toISOString()
            };

            await updateDoc(doc(db, COLLECTION_PATH, roomId), {
                expenses: arrayUnion(exp)
            });
            setNewExpense({ description: "", amount: "", paidBy: "", date: new Date().toISOString().split('T')[0] });
        } catch (e) {
            alert("Error saving expense");
        }
    };

    const deleteExpense = async (exp) => {
        if (!confirm("Delete this expense?")) return;
        try {
            await updateDoc(doc(db, COLLECTION_PATH, roomId), {
                expenses: arrayRemove(exp)
            });
        } catch (e) {
            alert(e.message);
        }
    };

    // --- AI FEATURES ---

    const scanReceipt = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!geminiKey) return alert("Please set Gemini API Key in Settings first!");

        setLoading(true);
        try {
            // Convert to Base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onloadend = async () => {
                const base64Data = reader.result.split(',')[1];

                // Call Gemini
                const prompt = `Analyze this receipt image. Extract: merchant name (as "description"), total amount (number only, as "amount"), and date (YYYY-MM-DD format, as "date"). Return ONLY valid JSON: { "description": string, "amount": number, "date": string }.`;

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview:generateContent?key=${geminiKey}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { inline_data: { mime_type: file.type, data: base64Data } }
                            ]
                        }]
                    })
                });

                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

                if (text) {
                    // Clean code blocks if returned
                    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(jsonStr);
                    setNewExpense(prev => ({
                        ...prev,
                        description: parsed.description || prev.description,
                        amount: parsed.amount || prev.amount,
                        date: parsed.date || prev.date
                    }));
                }
                setLoading(false);
            };
        } catch (e) {
            console.error(e);
            alert("AI Scan failed. Check API Key or try again.");
            setLoading(false);
        }
    };

    const generateInsights = async () => {
        if (!geminiKey) return alert("Please set Gemini API Key in Settings first!");
        setLoading(true);
        try {
            const expenseSummary = roomData.expenses.map(e => `${e.date}: ${e.paidBy} spent ${e.amount} on ${e.description}`).join('\n');
            const prompt = `You are a funny accountant. Analyze these shared expenses:\n${expenseSummary}\n\nTell us: 1. Who is the big spender? 2. What is the "Vibe" of the group? 3. Any funny observation. Keep it short (max 100 words).`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview:generateContent?key=${geminiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();
            setAiResult(data.candidates?.[0]?.content?.parts?.[0]?.text || "Could not generate insights.");
            setShowAIModal(true);
        } catch (e) {
            alert("Insight generation failed.");
        } finally {
            setLoading(false);
        }
    };

    // --- SETTLEMENT LOGIC ---

    const settlement = useMemo(() => {
        const { participants, expenses } = roomData;
        if (!participants.length) return { balances: [], debts: [], total: 0 };

        const total = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        const sharePerPerson = total / participants.length;

        // Calculate Net Balances
        const nets = {};
        participants.forEach(p => nets[p] = -sharePerPerson); // Everyone owes the share initially

        expenses.forEach(e => {
            if (nets[e.paidBy] !== undefined) {
                nets[e.paidBy] += parseFloat(e.amount); // Add back what they paid
            }
        });

        // Penny Fixing: Check if sum is exactly 0
        let sum = Object.values(nets).reduce((a, b) => a + b, 0);
        // Floating point correction
        if (Math.abs(sum) > 0.001) {
            // Find person with max debt or credit and adjust
            const key = Object.keys(nets)[0];
            nets[key] -= sum; // Force balance
        }

        // Generate Debts (Greedy Algorithm)
        const debtors = [];
        const creditors = [];

        Object.entries(nets).forEach(([name, amount]) => {
            if (amount < -0.01) debtors.push({ name, amount }); // Negative means they owe money
            if (amount > 0.01) creditors.push({ name, amount }); // Positive means they receive money
        });

        debtors.sort((a, b) => a.amount - b.amount); // Ascending (most negative first)
        creditors.sort((a, b) => b.amount - a.amount); // Descending (most positive first)

        const debts = [];
        let i = 0, j = 0;

        while (i < debtors.length && j < creditors.length) {
            let debtor = debtors[i];
            let creditor = creditors[j];

            let amount = Math.min(Math.abs(debtor.amount), creditor.amount);

            if (amount > 0.01) {
                debts.push({ from: debtor.name, to: creditor.name, amount });
            }

            debtor.amount += amount;
            creditor.amount -= amount;

            if (Math.abs(debtor.amount) < 0.01) i++;
            if (creditor.amount < 0.01) j++;
        }

        return {
            total,
            sharePerPerson,
            debts,
            userTotals: participants.map(p => ({
                name: p,
                total: expenses.filter(e => e.paidBy === p).reduce((s, e) => s + e.amount, 0)
            }))
        };
    }, [roomData]);

    // --- VIEWS ---

    if (!roomId) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-emerald-500 to-teal-700 flex flex-col items-center justify-center p-6 text-white">
                <div className="w-full max-w-md bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 shadow-xl space-y-8">
                    <div className="text-center space-y-2">
                        <div className="inline-flex p-3 rounded-2xl bg-emerald-400/20 mb-2">
                            <Sparkles className="w-8 h-8 text-emerald-200" />
                        </div>
                        <h1 className="text-3xl font-bold font-serif tracking-tight">FairShare</h1>
                        <p className="text-emerald-100">Split bills, not friendships.</p>
                    </div>

                    <div className="space-y-4">
                        <Button onClick={handleCreateRoom} loading={loading} className="w-full shadow-lg h-14 text-lg">
                            Create New Room
                        </Button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/20"></div></div>
                            <div className="relative flex justify-center text-sm"><span className="px-2 bg-transparent text-emerald-100">or join existing</span></div>
                        </div>

                        <div className="flex gap-2">
                            <Input
                                placeholder="Enter Room ID"
                                value={joinInput}
                                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                                className="bg-white/20 border-white/10 text-white placeholder:text-emerald-100 focus:bg-white/30 focus:border-white/40 h-14"
                            />
                            <Button variant="secondary" onClick={handleJoinRoom} className="h-14 w-14 p-0 shrink-0">
                                <ArrowRight className="w-6 h-6" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col safe-area-inset max-w-lg mx-auto shadow-2xl overflow-hidden relative">
            {/* Header */}
            <header className="bg-white border-b sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
                <div className="flex flex-col">
                    <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Room: {roomId}
                    </h1>
                    <span className="text-xs text-gray-500">
                        {roomData.participants.length} members • {roomData.expenses.length} expenses
                    </span>
                </div>
                <div className="flex gap-2">
                    <Button size="icon" variant="ghost" className="text-emerald-600" onClick={() => {
                        navigator.clipboard.writeText(roomId);
                        alert("Room ID copied!");
                    }}>
                        <Share2 className="w-5 h-5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setRoomId("")}>
                        <LogOut className="w-5 h-5" />
                    </Button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-4 pb-24 space-y-6 scrollbar-hide">

                {/* EXPENSES TAB */}
                {activeTab === 'expenses' && (
                    <div className="space-y-6">
                        {/* Quick Summary Card */}
                        <Card className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white border-none relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 -mr-4 -mt-4 bg-white/10 rounded-full blur-2xl w-32 h-32"></div>
                            <div className="relative z-10 flex justify-between items-end">
                                <div>
                                    <p className="text-emerald-100 text-sm mb-1">Total Spending</p>
                                    <p className="text-3xl font-bold">{formatINR(settlement.total)}</p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-emerald-100 hover:bg-white/10 hover:text-white"
                                    onClick={generateInsights}
                                    disabled={loading}
                                >
                                    <Sparkles className="w-4 h-4 mr-1" />
                                    Insights
                                </Button>
                            </div>
                        </Card>

                        {/* Add Expense Form */}
                        <Card className="space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-semibold text-gray-700">Add Expense</h3>
                                <Button
                                    size="sm" variant="outline" className="h-8 gap-1"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <ScanLine className="w-3 h-3" /> Smart Scan
                                </Button>
                                <input
                                    type="file" ref={fileInputRef} className="hidden"
                                    accept="image/*" onChange={scanReceipt}
                                />
                            </div>

                            <Input
                                placeholder="What for? (e.g. Pizza)"
                                value={newExpense.description}
                                onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                            />

                            <div className="flex gap-2">
                                <Input
                                    type="number" placeholder="0.00"
                                    value={newExpense.amount}
                                    onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })}
                                />
                                <Input
                                    type="date"
                                    value={newExpense.date}
                                    onChange={e => setNewExpense({ ...newExpense, date: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {roomData.participants.map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setNewExpense({ ...newExpense, paidBy: p })}
                                        className={cn(
                                            "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                                            newExpense.paidBy === p
                                                ? "bg-emerald-600 text-white shadow-md transform scale-105"
                                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                        )}
                                    >
                                        {p}
                                    </button>
                                ))}
                                {roomData.participants.length === 0 && (
                                    <span className="text-xs text-red-400 py-2">Add members in Settings first!</span>
                                )}
                            </div>

                            <Button onClick={addExpense} className="w-full" disabled={!newExpense.paidBy || !newExpense.amount}>
                                Save Expense
                            </Button>
                        </Card>

                        {/* Recents List */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Recent Activity</h3>
                            {[...roomData.expenses].reverse().map(exp => (
                                <div key={exp.id} className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-lg font-bold">
                                            {exp.paidBy[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-800">{exp.description}</p>
                                            <p className="text-xs text-gray-400">{exp.date} • Paid by {exp.paidBy}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="font-bold text-gray-900">{formatINR(exp.amount)}</span>
                                        <button onClick={() => deleteExpense(exp)} className="text-gray-300 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {roomData.expenses.length === 0 && (
                                <div className="text-center py-10 text-gray-400">No expenses yet. Time to spend! 💸</div>
                            )}
                        </div>
                    </div>
                )}

                {/* BALANCES TAB */}
                {activeTab === 'balances' && (
                    <div className="space-y-6">
                        <Card className="bg-emerald-50 border-emerald-100">
                            <h3 className="flex items-center gap-2 font-semibold text-emerald-800 mb-4">
                                <Wallet className="w-5 h-5" /> How to Settle Up
                            </h3>
                            {settlement.debts.length === 0 ? (
                                <div className="text-center py-4 text-emerald-600">All settled up! 🎉</div>
                            ) : (
                                <div className="space-y-3">
                                    {settlement.debts.map((debt, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
                                            <span className="font-medium text-gray-700 flex items-center gap-2">
                                                <span className="text-red-500">{debt.from}</span>
                                                <ArrowRight className="w-4 h-4 text-gray-300" />
                                                <span className="text-green-600">{debt.to}</span>
                                            </span>
                                            <span className="font-bold text-gray-800">{formatINR(debt.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        <div className="grid grid-cols-2 gap-4">
                            {settlement.userTotals.map(u => (
                                <Card key={u.name} className="flex flex-col gap-1">
                                    <span className="text-xs text-gray-500">Total contribution</span>
                                    <span className="font-bold text-lg">{u.name}</span>
                                    <span className="text-emerald-600 font-mono">{formatINR(u.total)}</span>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* SETTINGS TAB */}
                {activeTab === 'settings' && (
                    <div className="space-y-6">
                        <Card>
                            <h3 className="font-semibold mb-4 text-gray-800 flex items-center gap-2"><Users className="w-5 h-5 text-emerald-500" /> Room Members</h3>
                            <div className="flex gap-2 mb-4">
                                <Input
                                    placeholder="Add Name (e.g. Siva)"
                                    value={participantsInput}
                                    onChange={(e) => setParticipantsInput(e.target.value)}
                                />
                                <Button onClick={addParticipant} disabled={!participantsInput}>Add</Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {roomData.participants.map(p => (
                                    <div key={p} className="bg-gray-100 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 flex items-center gap-2">
                                        {p}
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card>
                            <h3 className="font-semibold mb-4 text-gray-800 flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-gray-500" /> Config</h3>
                            <label className="text-xs text-gray-500 mb-1 block">Gemini API Key (for AI features)</label>
                            <Input
                                type="password"
                                placeholder="Enter Google Gemini API Key"
                                value={geminiKey}
                                onChange={(e) => {
                                    setGeminiKey(e.target.value);
                                    localStorage.setItem("gemini_api_key", e.target.value);
                                }}
                            />
                            <p className="text-xs text-gray-400 mt-2">Key is stored locally in your browser.</p>
                        </Card>

                        <div className="text-center text-xs text-gray-300 pt-10">
                            FairShare v1.0 • Room: {roomId}
                        </div>
                    </div>
                )}
            </main>

            {/* Navigation Bar */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-2 flex justify-between items-center pb-safe max-w-lg mx-auto">
                <NavButton
                    active={activeTab === 'expenses'}
                    onClick={() => setActiveTab('expenses')}
                    icon={CreditCard}
                    label="Expenses"
                />
                <NavButton
                    active={activeTab === 'balances'}
                    onClick={() => setActiveTab('balances')}
                    icon={Banknote}
                    label="Balances"
                />
                <NavButton
                    active={activeTab === 'settings'}
                    onClick={() => setActiveTab('settings')}
                    icon={SettingsIcon}
                    label="Settings"
                />
            </nav>

            {/* AI Modal Overlay */}
            {showAIModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-500 fill-purple-200" /> AI Insights
                            </h3>
                            <button onClick={() => setShowAIModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-xl text-purple-900 leading-relaxed text-sm whitespace-pre-wrap">
                            {aiResult}
                        </div>
                        <Button className="w-full mt-4 bg-purple-600 hover:bg-purple-700 shadow-purple-200" onClick={() => setShowAIModal(false)}>
                            Cool!
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

const NavButton = ({ active, onClick, icon: Icon, label }) => (
    <button
        onClick={onClick}
        className={cn(
            "flex flex-col items-center gap-1 p-2 rounded-xl w-20 transition-all duration-200",
            active ? "text-emerald-600 bg-emerald-50" : "text-gray-400 hover:text-gray-600"
        )}
    >
        <Icon className={cn("w-6 h-6", active && "fill-emerald-200")} />
        <span className="text-[10px] font-medium">{label}</span>
    </button>
);
