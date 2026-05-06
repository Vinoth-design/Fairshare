import { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, Share2, Download, Trash2, Calendar, PieChart, 
  ReceiptIndianRupee, Users, Plus, X, ArrowRightCircle, 
  History, Receipt, Trash, ArrowRight, ChevronDown, Home
} from 'lucide-react';
import { db } from './firebaseConfig';
import { doc, collection, onSnapshot, setDoc, addDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

export default function App() {
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [isSpendingExpanded, setIsSpendingExpanded] = useState(false); // Mobile collapsible
  const [currentTab, setCurrentTab] = useState('home'); // Tabs: 'home', 'members', 'history'

  // Load from Firebase
  useEffect(() => {
    const unsubMeta = onSnapshot(doc(db, "fairshare", "meta"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().members) {
        setMembers(docSnap.data().members);
      }
    });

    const unsubExp = onSnapshot(collection(db, "fairshare", "expenses", "list"), (snapshot) => {
      const expList = snapshot.docs.map(doc => ({
         firebaseId: doc.id,
         ...doc.data()
      }));
      setExpenses(expList);
    });

    return () => {
      unsubMeta();
      unsubExp();
    };
  }, []);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const prevDate = new Date();
  prevDate.setMonth(prevDate.getMonth() - 1);
  const currentMonth = `${monthNames[prevDate.getMonth()]} ${prevDate.getFullYear()}`;

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const addMember = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('memberName').trim();
    if (name && !members.includes(name)) {
      await setDoc(doc(db, "fairshare", "meta"), { members: arrayUnion(name) }, { merge: true });
      e.target.reset();
    } else if (members.includes(name)) {
      alert('Member already exists!');
    }
  };

  const removeMember = async (name) => {
    if (window.confirm(`Remove ${name}? Their expenses will remain but calculations might be affected.`)) {
      await setDoc(doc(db, "fairshare", "meta"), { members: arrayRemove(name) }, { merge: true });
    }
  };

  const addExpense = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const desc = formData.get('expenseDesc').trim();
    const amount = parseFloat(formData.get('expenseAmount'));
    const paidBy = formData.get('expensePayer');

    if (desc && amount > 0 && paidBy) {
      const date = new Date().toISOString().split('T')[0];
      await addDoc(collection(db, 'fairshare', 'expenses', 'list'), {
        id: Date.now(),
        date,
        desc,
        amount,
        paidBy
      });
      e.target.reset();
    }
  };

  const deleteExpense = async (firebaseId) => {
    if (window.confirm('Delete this expense?')) {
      await deleteDoc(doc(db, 'fairshare', 'expenses', 'list', firebaseId));
    }
  };

  const resetAll = async () => {
    if (window.confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
      await setDoc(doc(db, "fairshare", "meta"), { members: [] });
      expenses.forEach(e => {
         deleteDoc(doc(db, 'fairshare', 'expenses', 'list', e.firebaseId));
      });
    }
  };

  const shareImage = () => {
    let dashboardHtml = '';
    const dashboardEl = document.getElementById('dashboard-summary');
    if (dashboardEl) {
      const clone = dashboardEl.cloneNode(true);
      const wrapper = clone.querySelector('#spending-list-wrapper');
      if (wrapper) {
        wrapper.classList.remove('hidden');
        wrapper.classList.add('block');
      }
      const chevronBtn = clone.querySelector('button');
      if (chevronBtn) {
        chevronBtn.remove();
      }
      dashboardHtml = clone.outerHTML;
    }

    const settlementHtml = document.getElementById('settlement-plan-container')?.outerHTML || '';

    const newTab = window.open();
    newTab.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>FairShare Summary View</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  brand: {
                    50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 900: '#064e3b'
                  }
                }
              }
            }
          }
        </script>
        <script src="https://unpkg.com/lucide@latest"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; background-color: #f9fafb; padding: 2rem; display: flex; justify-content: center; }
          .container { max-width: 800px; width: 100%; display: flex; flex-direction: column; gap: 2rem; }
        </style>
      </head>
      <body>
        <div class="container">
          ${dashboardHtml}
          ${settlementHtml}
        </div>
        <script>lucide.createIcons();</script>
      </body>
      </html>
    `);
    newTab.document.close();
  };

  const exportExcel = () => {
    if (expenses.length === 0) {
      alert('No expenses to export!');
      return;
    }

    let csvContent = "\uFEFFTYPE,DATE,DESCRIPTION,WHO,AMOUNT\n";

    expenses.forEach(e => {
      const safeDesc = `"${e.desc.replace(/"/g, '""')}"`;
      csvContent += `Expense,${e.date},${safeDesc},${e.paidBy},${e.amount}\n`;
    });

    csvContent += "\n";

    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const memberCount = members.length;
    const sharePerPerson = memberCount > 0 ? totalSpent / memberCount : 0;

    csvContent += "SUMMARY,Total Spent,,," + totalSpent + "\n";
    csvContent += "SUMMARY,Share Per Person,,," + sharePerPerson.toFixed(2) + "\n\n";

    csvContent += "SETTLEMENT PLAN,From,To,Amount\n";

    if (memberCount > 0) {
      const balances = {};
      members.forEach(m => balances[m] = 0);

      expenses.forEach(e => {
        if (balances[e.paidBy] !== undefined) balances[e.paidBy] += e.amount;
      });

      members.forEach(m => {
        balances[m] -= sharePerPerson;
      });

      const debtors = [];
      const creditors = [];

      Object.entries(balances).forEach(([name, amount]) => {
        if (amount < -0.01) debtors.push({ name, amount });
        if (amount > 0.01) creditors.push({ name, amount });
      });

      debtors.sort((a, b) => a.amount - b.amount);
      creditors.sort((a, b) => b.amount - a.amount);

      let i = 0;
      let j = 0;

      while (i < debtors.length && j < creditors.length) {
        let debtor = debtors[i];
        let creditor = creditors[j];
        let amount = Math.min(Math.abs(debtor.amount), creditor.amount);

        if (amount > 0.5) {
          csvContent += `Pay,${debtor.name},${creditor.name},${amount.toFixed(2)}\n`;
        }
        debtor.amount += amount;
        creditor.amount -= amount;
        if (Math.abs(debtor.amount) < 0.01) i++;
        if (creditor.amount < 0.01) j++;
      }
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "fairshare_export.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const dashboardData = useMemo(() => {
    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const memberCount = members.length;
    const sharePerPerson = memberCount > 0 ? totalSpent / memberCount : 0;

    const balances = {};
    const spending = {};
    members.forEach(m => {
      balances[m] = 0;
      spending[m] = 0;
    });

    expenses.forEach(e => {
      if (balances[e.paidBy] !== undefined) {
        balances[e.paidBy] += e.amount;
        spending[e.paidBy] += e.amount;
      }
    });

    members.forEach(m => {
      balances[m] -= sharePerPerson;
    });

    const debtors = [];
    const creditors = [];

    Object.entries(balances).forEach(([name, amount]) => {
      if (amount < -0.01) debtors.push({ name, amount });
      if (amount > 0.01) creditors.push({ name, amount });
    });

    debtors.sort((a, b) => a.amount - b.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlementPlan = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      let debtor = debtors[i];
      let creditor = creditors[j];
      let amount = Math.min(Math.abs(debtor.amount), creditor.amount);
      if (amount > 0.5) {
        settlementPlan.push({ from: debtor.name, to: creditor.name, amount });
      }
      debtor.amount += amount;
      creditor.amount -= amount;
      if (Math.abs(debtor.amount) < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    return { totalSpent, spending, settlementPlan };
  }, [members, expenses]);

  return (
    <>
      <header className="bg-brand-600 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-7 w-7 sm:h-8 sm:w-8 text-brand-100" />
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">FairShare <span className="font-light opacity-80">Lite</span></h1>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={shareImage} className="text-xs bg-white text-brand-600 hover:bg-brand-50 p-2 sm:px-3 sm:py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm border border-brand-200 sm:border-b-2">
              <Share2 className="h-4 w-4 sm:h-3 sm:w-3" /> <span className="hidden sm:inline font-semibold">Share</span>
            </button>
            <button onClick={exportExcel} className="text-xs bg-brand-500 hover:bg-brand-400 text-white p-2 sm:px-3 sm:py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm border border-brand-400">
              <Download className="h-4 w-4 sm:h-3 sm:w-3" /> <span className="hidden sm:inline font-semibold">Export</span>
            </button>
            <button onClick={resetAll} className="text-xs bg-brand-700 hover:bg-brand-900 p-2 sm:px-3 sm:py-1.5 rounded-lg transition-colors flex items-center gap-1">
              <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" /> <span className="hidden sm:inline font-semibold">Clear</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <section id="dashboard-summary" className={`${currentTab === 'home' ? 'block' : 'hidden'} lg:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative group hover:border-brand-200 transition-all`}>
          <div className="absolute right-0 top-0 p-4 -mr-4 -mt-4 bg-brand-50 w-32 h-32 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
          
          <div className="absolute right-4 top-4 sm:right-6 sm:top-6 z-10">
            <span className="text-xs font-semibold text-brand-700 bg-brand-100 px-3 py-1.5 rounded-full border border-brand-200 shadow-sm flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" /> <span>{currentMonth}</span>
            </span>
          </div>

          <div className="p-6 sm:px-8 sm:py-6 border-b border-gray-100 relative z-0">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Total Spent</p>
              <p className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight">{formatMoney(dashboardData.totalSpent)}</p>
            </div>
          </div>

          <div className="p-6 sm:px-8 bg-gray-50/30">
            <div 
              className="flex justify-between items-center cursor-pointer sm:cursor-auto" 
              onClick={() => setIsSpendingExpanded(!isSpendingExpanded)}
            >
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <PieChart className="h-5 w-5 text-brand-500 shrink-0" />
                <span>Individual Spending</span>
              </h2>
              <button className="sm:hidden p-1 -mr-1 text-gray-400 hover:text-brand-600 transition-colors focus:outline-none">
                <ChevronDown className={`h-6 w-6 transition-transform ${isSpendingExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>
            
            <div id="spending-list-wrapper" className={`${isSpendingExpanded ? 'block' : 'hidden'} sm:block mt-5`}>
              {members.length > 0 ? (
                <div id="spending-list" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(dashboardData.spending)
                    .sort(([, a], [, b]) => b - a)
                    .map(([name, spent]) => (
                      <div key={name} className="flex items-center justify-between p-3 rounded-xl border bg-gray-50 border-gray-100">
                        <div className="flex items-center gap-2 overflow-hidden pr-2">
                          <div className="h-8 w-8 rounded-full bg-brand-100 flex-shrink-0 flex items-center justify-center text-brand-700 font-bold text-xs">
                            {name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-gray-800 truncate" title={name}>{name}</p>
                            <p className="text-xs text-gray-500">spent</p>
                          </div>
                        </div>
                        <span className="font-bold text-brand-600 font-mono flex-shrink-0">{formatMoney(spent)}</span>
                      </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-4">Add members to see spending.</div>
              )}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className={`${currentTab === 'home' ? 'block' : 'hidden'} lg:block bg-white p-6 rounded-2xl shadow-sm border border-gray-100`}>
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ReceiptIndianRupee className="h-5 w-5 text-brand-500" /> Add Expense
              </h2>

              <form onSubmit={addExpense} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 ml-1">Paid By</label>
                  <select name="expensePayer" required defaultValue="" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all">
                    <option value="" disabled>Select member</option>
                    {members.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 ml-1">For What?</label>
                  <input type="text" name="expenseDesc" placeholder="e.g. Pizza, Wifi" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 ml-1">Amount (₹)</label>
                  <input type="number" name="expenseAmount" placeholder="0.00" min="1" step="0.01" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-mono" />
                </div>

                <button type="submit" className="w-full bg-brand-600 hover:bg-brand-700 text-white py-3 rounded-xl font-medium shadow-lg shadow-brand-200 transition-all active:scale-95 flex justify-center items-center gap-2">
                  Add Expense
                </button>
              </form>
            </div>

            <div className={`${currentTab === 'members' ? 'block' : 'hidden'} lg:block bg-white p-6 rounded-2xl shadow-sm border border-gray-100`}>
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-brand-500" /> Members
              </h2>

              <form onSubmit={addMember} className="flex gap-2 mb-4">
                <input type="text" name="memberName" placeholder="Name (e.g. Siva)" className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all" />
                <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white p-2 rounded-xl transition-colors">
                  <Plus className="h-5 w-5" />
                </button>
              </form>

              <div id="members-list" className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                {members.length > 0 ? members.map(m => (
                  <div key={m} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-lg group">
                    <span className="font-medium text-gray-700">{m}</span>
                    <button onClick={() => removeMember(m)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )) : (
                  <div className="text-sm text-gray-400 text-center py-2">No members yet.</div>
                )}
              </div>
            </div>
          </div>

          <div className={`${currentTab === 'history' ? 'block' : 'hidden'} lg:block lg:col-span-2 space-y-8`}>
            {dashboardData.settlementPlan.length > 0 && (
              <div id="settlement-plan-container" className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-brand-50/50 px-6 py-4 border-b border-gray-100">
                  <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <ArrowRightCircle className="h-5 w-5 text-brand-500 shrink-0" />
                    <span>How to Settle Up</span>
                  </h2>
                </div>
                <div id="settlement-plan-list" className="divide-y divide-gray-100">
                  {dashboardData.settlementPlan.map((plan, idx) => (
                    <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                          <span className="font-bold text-gray-800 truncate max-w-[80px] sm:max-w-none" title={plan.from}>{plan.from}</span>
                          <span className="text-xs text-gray-400">pays</span>
                        </div>
                        <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-brand-400 shrink-0" />
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-gray-800 truncate max-w-[80px] sm:max-w-none" title={plan.to}>{plan.to}</span>
                        </div>
                      </div>
                      <span className="font-bold text-brand-600 font-mono text-base sm:text-lg flex-shrink-0 pl-2">{formatMoney(plan.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <History className="h-5 w-5 text-brand-500" /> History
                </h2>
                <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border">Recent 50</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">For</th>
                      <th className="px-6 py-3 font-medium">Who Paid</th>
                      <th className="px-6 py-3 font-medium text-right">Amount</th>
                      <th className="px-6 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenses.length > 0 ? expenses.map(exp => (
                      <tr key={exp.id} className="bg-white hover:bg-gray-50 transition-colors group">
                        <td className="px-4 sm:px-6 py-4 text-gray-500 text-xs sm:text-sm">{exp.date}</td>
                        <td className="px-4 sm:px-6 py-4 font-medium text-gray-900">{exp.desc}</td>
                        <td className="px-4 sm:px-6 py-4">
                          <span className="bg-brand-50 text-brand-700 px-2 py-1 rounded-md text-[10px] sm:text-xs font-semibold">{exp.paidBy}</span>
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-right font-mono font-bold text-gray-800">{formatMoney(exp.amount)}</td>
                        <td className="px-4 sm:px-6 py-4 text-center">
                          <button onClick={() => deleteExpense(exp.firebaseId)} className="text-gray-300 hover:text-red-500 transition-colors p-2">
                            <Trash className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )) : null}
                  </tbody>
                </table>
                {expenses.length === 0 && (
                  <div className="text-center py-10 flex flex-col items-center justify-center text-gray-400">
                    <Receipt className="h-12 w-12 mb-3 text-gray-300" />
                    <p>No expenses recorded yet.</p>
                    <p className="text-xs mt-1">Add members and start logging.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Navigation Menu (Mobile) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 px-6 py-2 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <button 
            onClick={() => setCurrentTab('home')} 
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentTab === 'home' ? 'text-brand-600' : 'text-gray-400 hover:text-brand-500'}`}
          >
            <Home className="h-6 w-6" />
            <span className="text-[10px] font-semibold">Home</span>
          </button>
          
          <button 
            onClick={() => setCurrentTab('members')} 
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentTab === 'members' ? 'text-brand-600' : 'text-gray-400 hover:text-brand-500'}`}
          >
            <Users className="h-6 w-6" />
            <span className="text-[10px] font-semibold">Members</span>
          </button>
          
          <button 
            onClick={() => setCurrentTab('history')} 
            className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentTab === 'history' ? 'text-brand-600' : 'text-gray-400 hover:text-brand-500'}`}
          >
            <History className="h-6 w-6" />
            <span className="text-[10px] font-semibold">History</span>
          </button>
        </div>
      </nav>
    </>
  );
}
