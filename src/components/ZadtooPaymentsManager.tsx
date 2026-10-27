import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  ExternalLink,
  Copy,
  Coins,
  Smartphone,
  Building,
  CheckCircle2,
  Clock,
  AlertCircle,
  QrCode,
  Image as ImageIcon,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  CheckCheck,
  XCircle,
  FileText,
  Eye,
  Send
} from 'lucide-react';
import type { PaymentMethodConfig, PaymentTransactionRecord, SubscriptionPlan } from '../types/platformConfig';
import { INITIAL_PAYMENT_METHODS } from '../types/platformConfig';
import type { VipSubscriber } from '../App';

interface ZadtooPaymentsManagerProps {
  subscribers?: VipSubscriber[];
  onSubscribersUpdated?: (updated: VipSubscriber[]) => void;
  plans?: SubscriptionPlan[];
  isAdmin?: boolean;
}

export const ZadtooPaymentsManager: React.FC<ZadtooPaymentsManagerProps> = ({
  subscribers = [],
  onSubscribersUpdated,
  plans = [],
  isAdmin = true
}) => {
  const [activeTab, setActiveTab] = useState<'methods' | 'transactions' | 'submit_test'>('methods');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>(INITIAL_PAYMENT_METHODS);
  const [transactions, setTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters for transactions
  const [txFilter, setTxFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('all');
  const [txSearch, setTxSearch] = useState('');

  // Modal states
  const [editingMethod, setEditingMethod] = useState<{
    isOpen: boolean;
    isNew: boolean;
    data: PaymentMethodConfig;
  } | null>(null);

  const [methodToDelete, setMethodToDelete] = useState<PaymentMethodConfig | null>(null);
  const [previewReceiptImage, setPreviewReceiptImage] = useState<string | null>(null);
  const [rejectingTx, setRejectingTx] = useState<PaymentTransactionRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('لم يصل التحويل للحساب / الإيصال غير مطابق');

  // Submit payment form state (Manual / Test submit)
  const [submitForm, setSubmitForm] = useState({
    subscriberName: '',
    subscriberEmail: '',
    subscriberPhone: '',
    planId: plans[0]?.id || 'gold_99',
    paymentMethodId: INITIAL_PAYMENT_METHODS[0].id,
    amount: 99,
    currency: 'USD',
    transactionReference: '',
    receiptImageUrl: ''
  });
  const [isSubmittingTx, setIsSubmittingTx] = useState(false);

  useEffect(() => {
    fetchPaymentsConfig();
  }, []);

  const fetchPaymentsConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/payments/config');
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.paymentMethods) && data.paymentMethods.length > 0) {
          setPaymentMethods(data.paymentMethods);
        }
        if (Array.isArray(data.paymentTransactions)) {
          setTransactions(data.paymentTransactions);
        }
      }
    } catch (_e) {
      // Keep initial
    } finally {
      setIsLoading(false);
    }
  };

  const showNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleCopy = (text: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(keyId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Toggle method active status
  const handleToggleMethodActive = async (methodId: string) => {
    const updated = paymentMethods.map(m =>
      m.id === methodId ? { ...m, isActive: !m.isActive } : m
    );
    setPaymentMethods(updated);
    try {
      const res = await fetch('/api/payments/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethods: updated })
      });
      const data = await res.json();
      if (data.ok) {
        showNotice('تم تحديث حالة وسيلة الدفع بنجاح');
      }
    } catch (_e) {
      showNotice('حدث خطأ في حفظ التغيير', 'error');
    }
  };

  // Save Add/Edit Method
  const handleSaveMethod = async () => {
    if (!editingMethod) return;
    const { data, isNew } = editingMethod;
    if (!data.name.trim() || !data.accountNumber.trim()) {
      showNotice('يرجى كتابة اسم الوسيلة ورقم الحساب/المحفظة', 'error');
      return;
    }

    let updatedList: PaymentMethodConfig[];
    if (isNew) {
      const newId = `method_${Date.now()}`;
      updatedList = [...paymentMethods, { ...data, id: newId }];
    } else {
      updatedList = paymentMethods.map(m => (m.id === data.id ? data : m));
    }

    setPaymentMethods(updatedList);
    setEditingMethod(null);

    try {
      const res = await fetch('/api/payments/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethods: updatedList })
      });
      const resData = await res.json();
      if (resData.ok) {
        showNotice(isNew ? 'تمت إضافة وسيلة الدفع بنجاح' : 'تم تعديل وسيلة الدفع بنجاح');
      }
    } catch (_e) {
      showNotice('حدث خطأ أثناء حفظ وسيلة الدفع', 'error');
    }
  };

  // Delete Method
  const handleDeleteMethodConfirm = async () => {
    if (!methodToDelete) return;
    const updated = paymentMethods.filter(m => m.id !== methodToDelete.id);
    setPaymentMethods(updated);
    setMethodToDelete(null);

    try {
      const res = await fetch('/api/payments/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethods: updated })
      });
      const data = await res.json();
      if (data.ok) {
        showNotice('تم حذف وسيلة الدفع بنجاح');
      }
    } catch (_e) {
      showNotice('حدث خطأ أثناء حذف وسيلة الدفع', 'error');
    }
  };

  // Approve Transaction
  const handleApproveTransaction = async (txId: string) => {
    try {
      const res = await fetch('/api/payments/review-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: txId,
          action: 'APPROVE',
          notes: 'تمت مراجعة التحويل واعتماد الدفع وتفعيل الاشتراك بنجاح'
        })
      });
      const data = await res.json();
      if (data.ok) {
        setTransactions(prev =>
          prev.map(t => (t.id === txId ? { ...t, status: 'APPROVED', reviewedAt: new Date().toISOString() } : t))
        );
        if (data.subscribers && onSubscribersUpdated) {
          onSubscribersUpdated(data.subscribers);
        }
        showNotice('✅ تم اعتماد التحويل وتفعيل اشتراك العضو والروبوت بنجاح!');
      } else {
        showNotice(data.error || 'تعذر اعتماد التحويل', 'error');
      }
    } catch (_e) {
      showNotice('حدث خطأ في الاتصال بالخادم', 'error');
    }
  };

  // Reject Transaction
  const handleRejectTransactionConfirm = async () => {
    if (!rejectingTx) return;
    try {
      const res = await fetch('/api/payments/review-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: rejectingTx.id,
          action: 'REJECT',
          notes: rejectReason || 'لم يتم تأكيد وصول المبلغ للحساب'
        })
      });
      const data = await res.json();
      if (data.ok) {
        setTransactions(prev =>
          prev.map(t => (t.id === rejectingTx.id ? { ...t, status: 'REJECTED', adminNotes: rejectReason, reviewedAt: new Date().toISOString() } : t))
        );
        setRejectingTx(null);
        showNotice('تم رفض المعاملة وتحديث حالتها');
      }
    } catch (_e) {
      showNotice('حدث خطأ في الاتصال بالخادم', 'error');
    }
  };

  // Handle Receipt Image Upload
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showNotice('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 2 ميجابايت', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSubmitForm(p => ({ ...p, receiptImageUrl: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  // Submit Manual / Test Payment
  const handleSubmitPaymentReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitForm.subscriberName.trim()) {
      showNotice('يرجى كتابة اسم العضو', 'error');
      return;
    }
    setIsSubmittingTx(true);
    try {
      const selectedMethodObj = paymentMethods.find(m => m.id === submitForm.paymentMethodId);
      const selectedPlanObj = plans.find(p => p.id === submitForm.planId);

      const res = await fetch('/api/payments/submit-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...submitForm,
          paymentMethodName: selectedMethodObj?.name || 'وسيلة دفع',
          planName: selectedPlanObj?.name || 'خطة VIP'
        })
      });
      const data = await res.json();
      if (data.ok && data.transaction) {
        setTransactions(prev => [data.transaction, ...prev]);
        showNotice('✅ تم تسجيل وتوثيق طلب الدفع بنجاح وهو الآن قيد المراجعة');
        setSubmitForm({
          subscriberName: '',
          subscriberEmail: '',
          subscriberPhone: '',
          planId: plans[0]?.id || 'gold_99',
          paymentMethodId: paymentMethods[0]?.id || 'usdt_trc20',
          amount: 99,
          currency: 'USD',
          transactionReference: '',
          receiptImageUrl: ''
        });
        setActiveTab('transactions');
      } else {
        showNotice(data.error || 'فشل إرسال طلب الدفع', 'error');
      }
    } catch (_e) {
      showNotice('حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
      setIsSubmittingTx(false);
    }
  };

  // Category Helpers
  const getCategoryIcon = (category: PaymentMethodConfig['category']) => {
    switch (category) {
      case 'crypto':
        return <Coins className="w-5 h-5 text-amber-500" />;
      case 'electronic_wallet':
        return <Smartphone className="w-5 h-5 text-emerald-500" />;
      case 'bank_transfer':
        return <Building className="w-5 h-5 text-sky-500" />;
      case 'credit_card':
        return <CreditCard className="w-5 h-5 text-purple-500" />;
      default:
        return <DollarSign className="w-5 h-5 text-slate-500" />;
    }
  };

  const getCategoryLabel = (category: PaymentMethodConfig['category']) => {
    switch (category) {
      case 'crypto':
        return 'عملات رقمية مشفرة (Crypto)';
      case 'electronic_wallet':
        return 'محافظ ذكية وكاش';
      case 'bank_transfer':
        return 'تحويل بنكي / إنستاباي';
      case 'credit_card':
        return 'بطاقة بنكية / فيزا';
      default:
        return 'وسيلة أخرى';
    }
  };

  // Summary Metrics
  const pendingCount = transactions.filter(t => t.status === 'PENDING').length;
  const approvedCount = transactions.filter(t => t.status === 'APPROVED').length;
  const totalApprovedUsd = transactions
    .filter(t => t.status === 'APPROVED')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // Filtered transactions
  const filteredTxs = transactions.filter(t => {
    if (txFilter !== 'all' && t.status !== txFilter) return false;
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      const matchName = (t.subscriberName || '').toLowerCase().includes(q);
      const matchRef = (t.transactionReference || '').toLowerCase().includes(q);
      const matchMethod = (t.paymentMethodName || '').toLowerCase().includes(q);
      if (!matchName && !matchRef && !matchMethod) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 text-slate-800">
      {/* Toast Feedback */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-rose-50 border-rose-300 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header and Quick Stats */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                إدارة المدفوعات ووسائل الدفع (Payments & Financial Methods)
              </h2>
              <p className="text-xs text-slate-500">
                تخصيص المحافظ والحسابات البنكية المعتمدة، ومراجعة إيصالات المشتركين واعتماد الاشتراكات تلقائياً
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchPaymentsConfig}
              disabled={isLoading}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingMethod({
                  isOpen: true,
                  isNew: true,
                  data: {
                    id: '',
                    name: '',
                    category: 'electronic_wallet',
                    accountNumber: '',
                    accountHolderName: '',
                    networkOrBank: '',
                    instructions: 'يرجى إرسال إيصال التحويل ورقم المعاملة لتفعيل الحساب.',
                    minAmountUsd: 10,
                    isActive: true,
                    supportedCurrencies: ['USD', 'EGP']
                  }
                });
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة وسيلة دفع جديدة</span>
            </button>
          </div>
        </div>

        {/* 3 Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
            <span className="text-[11px] font-bold text-slate-500">وسائل الدفع المفعلة</span>
            <div className="text-xl font-black text-slate-900 font-mono-num flex items-center justify-between">
              <span>{paymentMethods.filter(m => m.isActive).length} / {paymentMethods.length}</span>
              <Coins className="w-4 h-4 text-emerald-600" />
            </div>
          </div>

          <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/80 space-y-1">
            <span className="text-[11px] font-bold text-amber-800">طلبات دفع قيد المراجعة</span>
            <div className="text-xl font-black text-amber-900 font-mono-num flex items-center justify-between">
              <span>{pendingCount}</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
          </div>

          <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200/80 space-y-1">
            <span className="text-[11px] font-bold text-emerald-800">إجمالي المدفوعات المعتمدة</span>
            <div className="text-xl font-black text-emerald-900 font-mono-num flex items-center justify-between">
              <span>${totalApprovedUsd.toLocaleString('en-US')}</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab('methods')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'methods'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>وسائل الدفع المعتمدة ({paymentMethods.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'transactions'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>سجل المعاملات والإيصالات</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-mono-num font-black animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('submit_test')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'submit_test'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>تسجيل إيصال دفع جديد</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Payment Methods Grid */}
      {activeTab === 'methods' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paymentMethods.map(method => {
              const isCopied = copiedId === method.id;
              return (
                <div
                  key={method.id}
                  className={`bg-white rounded-2xl p-4 border transition-all space-y-3 relative ${
                    method.isActive
                      ? 'border-slate-200/90 shadow-2xs hover:border-slate-300'
                      : 'border-slate-200 bg-slate-50/70 opacity-70'
                  }`}
                >
                  {/* Top Bar: Icon + Category + Active Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                        {getCategoryIcon(method.category)}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">
                          {getCategoryLabel(method.category)}
                        </span>
                        <h3 className="text-xs font-black text-slate-900 line-clamp-1">
                          {method.name}
                        </h3>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleMethodActive(method.id)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                        method.isActive
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-200 border-slate-300 text-slate-600'
                      }`}
                    >
                      {method.isActive ? 'مفعلة ✅' : 'معطلة ⏸️'}
                    </button>
                  </div>

                  {/* Account Number / Wallet Address Box */}
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
                      <span>رقم الحساب / العنوان:</span>
                      <span>الشبكة: {method.networkOrBank || 'عام'}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-num font-bold text-xs text-slate-800 break-all select-all">
                        {method.accountNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(method.accountNumber, method.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-white transition-colors cursor-pointer shrink-0"
                        title="نسخ الحساب"
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {method.accountHolderName && (
                      <div className="text-[10px] text-slate-500 pt-0.5 border-t border-slate-200/60 font-medium">
                        الاسم: {method.accountHolderName}
                      </div>
                    )}
                  </div>

                  {/* Instructions */}
                  {method.instructions && (
                    <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                      {method.instructions}
                    </p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <div className="text-[10px] text-slate-400">
                      الحد الأدنى: ${method.minAmountUsd || 10}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMethod({
                            isOpen: true,
                            isNew: false,
                            data: { ...method }
                          });
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3 text-slate-500" />
                        <span>تعديل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMethodToDelete(method)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="حذف وسيلة الدفع"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Transactions & Receipts Table */}
      {activeTab === 'transactions' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setTxFilter('all')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  txFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                الكل ({transactions.length})
              </button>
              <button
                type="button"
                onClick={() => setTxFilter('PENDING')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  txFilter === 'PENDING'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                قيد المراجعة ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setTxFilter('APPROVED')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  txFilter === 'APPROVED'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                المقبولة ({approvedCount})
              </button>
              <button
                type="button"
                onClick={() => setTxFilter('REJECTED')}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  txFilter === 'REJECTED'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                المرفوضة
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
                placeholder="ابحث بالاسم أو رقم الحوالة..."
                className="pr-8 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 w-full sm:w-56"
              />
            </div>
          </div>

          {/* Transactions List */}
          {filteredTxs.length === 0 ? (
            <div className="text-center py-10 space-y-2 text-slate-400">
              <FileText className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-bold">لا توجد عمليات مسجلة في هذا القسم</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-bold">
                    <th className="py-2.5 px-3">العضو / المشترك</th>
                    <th className="py-2.5 px-3">الباقة / القيمة</th>
                    <th className="py-2.5 px-3">وسيلة الدفع</th>
                    <th className="py-2.5 px-3">رقم العملية (TxID / المرجع)</th>
                    <th className="py-2.5 px-3">الإيصال</th>
                    <th className="py-2.5 px-3">الحالة</th>
                    <th className="py-2.5 px-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTxs.map(tx => {
                    const isPending = tx.status === 'PENDING';
                    const isApproved = tx.status === 'APPROVED';
                    const isRejected = tx.status === 'REJECTED';

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{tx.subscriberName}</div>
                          <div className="text-[10px] text-slate-400 font-mono-num">
                            {tx.subscriberPhone || tx.subscriberEmail || 'بدون اتصال'}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-800">{tx.planName || 'خطة VIP'}</div>
                          <div className="font-mono-num font-extrabold text-emerald-600 text-xs">
                            ${tx.amount} {tx.currency || 'USD'}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-slate-700 font-medium">
                          {tx.paymentMethodName}
                        </td>

                        <td className="py-3 px-3 font-mono-num text-[11px] text-slate-800 select-all max-w-[140px] truncate">
                          {tx.transactionReference || 'غير محدد'}
                        </td>

                        <td className="py-3 px-3">
                          {tx.receiptImageUrl ? (
                            <button
                              type="button"
                              onClick={() => setPreviewReceiptImage(tx.receiptImageUrl || null)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3 h-3 text-sky-600" />
                              <span>عرض الإيصال</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">لا يوجد مرفق</span>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          {isPending && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                              قيد المراجعة ⏳
                            </span>
                          )}
                          {isApproved && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                              معتمدة ومفعلة ✅
                            </span>
                          )}
                          {isRejected && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-200">
                              مرفوضة ❌
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center">
                          {isPending ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleApproveTransaction(tx.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                title="قبول الدفع وتفعيل حساب العضو"
                              >
                                <CheckCheck className="w-3 h-3" />
                                <span>اعتماد</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setRejectingTx(tx)}
                                className="px-2 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg font-bold text-[11px] cursor-pointer transition-colors"
                                title="رفض المعاملة"
                              >
                                <X className="w-3 h-3" />
                                <span>رفض</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono-num">
                              {tx.reviewedAt ? new Date(tx.reviewedAt).toLocaleDateString('ar-EG') : 'مكتملة'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Submit Manual / Test Payment Receipt */}
      {activeTab === 'submit_test' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs max-w-2xl mx-auto space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-900">
              تسجيل إيصال دفع جديد (Manual Receipt Registration)
            </h3>
            <p className="text-xs text-slate-500">
              يمكن للإدارة أو ممثل الدعم تسجيل إيصال تحويل استلمه عبر تليجرام أو واتساب لمراجعته وتفعيله فوراً
            </p>
          </div>

          <form onSubmit={handleSubmitPaymentReceipt} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">اسم العضو / المشترك *</label>
                <input
                  type="text"
                  required
                  value={submitForm.subscriberName}
                  onChange={e => setSubmitForm(p => ({ ...p, subscriberName: e.target.value }))}
                  placeholder="مثال: أحمد عبد الله"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">رقم الموبايل / واتساب</label>
                <input
                  type="text"
                  value={submitForm.subscriberPhone}
                  onChange={e => setSubmitForm(p => ({ ...p, subscriberPhone: e.target.value }))}
                  placeholder="+20 10xxxxxxxx"
                  dir="ltr"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 font-mono-num"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">الباقة المختارة</label>
                <select
                  value={submitForm.planId}
                  onChange={e => {
                    const selPlan = plans.find(p => p.id === e.target.value);
                    setSubmitForm(p => ({
                      ...p,
                      planId: e.target.value,
                      amount: selPlan?.priceUsd || p.amount
                    }));
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 font-bold cursor-pointer"
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.priceUsd === 0 ? 'مجاناً' : `$${p.priceUsd}`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">وسيلة الدفع المستخدمة</label>
                <select
                  value={submitForm.paymentMethodId}
                  onChange={e => setSubmitForm(p => ({ ...p, paymentMethodId: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 font-bold cursor-pointer"
                >
                  {paymentMethods.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.networkOrBank || 'عام'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">المبلغ المحول ($)</label>
                <input
                  type="number"
                  value={submitForm.amount}
                  onChange={e => setSubmitForm(p => ({ ...p, amount: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 font-mono-num font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">رقم الحوالة / العملية (TxID / Ref) *</label>
                <input
                  type="text"
                  required
                  value={submitForm.transactionReference}
                  onChange={e => setSubmitForm(p => ({ ...p, transactionReference: e.target.value }))}
                  placeholder="أدخل رقم العملية أو الحوالة"
                  dir="ltr"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 font-mono-num"
                />
              </div>
            </div>

            {/* Receipt Image Upload */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">صورة إيصال التحويل (اختياري)</label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
                {submitForm.receiptImageUrl && (
                  <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تم تجهيز الصورة</span>
                  </span>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmittingTx}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-2 mt-2"
            >
              {isSubmittingTx ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>إرسال وتوثيق إيصال الدفع</span>
            </button>
          </form>
        </div>
      )}

      {/* MODAL 1: Add/Edit Payment Method Modal */}
      {editingMethod?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 text-slate-800 text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">
                {editingMethod.isNew ? 'إضافة وسيلة دفع جديدة' : 'تعديل بيانات وسيلة الدفع'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingMethod(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">اسم وسيلة الدفع *</label>
                <input
                  type="text"
                  value={editingMethod.data.name}
                  onChange={e =>
                    setEditingMethod(p => p && { ...p, data: { ...p.data, name: e.target.value } })
                  }
                  placeholder="مثال: فودافون كاش أو USDT TRC20"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">التصنيف</label>
                  <select
                    value={editingMethod.data.category}
                    onChange={e =>
                      setEditingMethod(p =>
                        p && {
                          ...p,
                          data: { ...p.data, category: e.target.value as PaymentMethodConfig['category'] }
                        }
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="crypto">عملات مشفرة (Crypto)</option>
                    <option value="electronic_wallet">محافظ ذكية (كاش)</option>
                    <option value="bank_transfer">تحويل بنكي / إنستاباي</option>
                    <option value="credit_card">بطاقات بنكية (Visa/Master)</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">الشبكة أو البنك</label>
                  <input
                    type="text"
                    value={editingMethod.data.networkOrBank}
                    onChange={e =>
                      setEditingMethod(p => p && { ...p, data: { ...p.data, networkOrBank: e.target.value } })
                    }
                    placeholder="مثال: TRC-20 أو CIB"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  رقم الحساب أو عنوان المحفظة *
                </label>
                <input
                  type="text"
                  value={editingMethod.data.accountNumber}
                  onChange={e =>
                    setEditingMethod(p => p && { ...p, data: { ...p.data, accountNumber: e.target.value } })
                  }
                  placeholder="عنوان المحفظة أو رقم الموبايل أو الآيبان IBAN"
                  dir="ltr"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono-num font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">اسم صاحب الحساب</label>
                  <input
                    type="text"
                    value={editingMethod.data.accountHolderName}
                    onChange={e =>
                      setEditingMethod(p =>
                        p && { ...p, data: { ...p.data, accountHolderName: e.target.value } }
                      )
                    }
                    placeholder="اسم المستلم الرسمي"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">الحد الأدنى ($)</label>
                  <input
                    type="number"
                    value={editingMethod.data.minAmountUsd || 10}
                    onChange={e =>
                      setEditingMethod(p =>
                        p && { ...p, data: { ...p.data, minAmountUsd: Number(e.target.value) } }
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono-num focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">تعليمات التحويل للعميل</label>
                <textarea
                  rows={2}
                  value={editingMethod.data.instructions}
                  onChange={e =>
                    setEditingMethod(p => p && { ...p, data: { ...p.data, instructions: e.target.value } })
                  }
                  placeholder="اكتب توجيهات التحويل وإرفاق الإيصال..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="methodIsActive"
                  checked={editingMethod.data.isActive}
                  onChange={e =>
                    setEditingMethod(p => p && { ...p, data: { ...p.data, isActive: e.target.checked } })
                  }
                  className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="methodIsActive" className="text-slate-700 font-bold cursor-pointer">
                  تفعيل هذه الوسيلة وإتاحتها للزوار والمشتركين
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingMethod(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleSaveMethod}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer shadow-xs"
              >
                حفظ وسيلة الدفع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Delete Method Confirmation */}
      {methodToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl border border-slate-200 text-slate-800 text-xs">
            <div className="flex items-center gap-2.5 text-rose-600">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-black text-sm">تأكيد حذف وسيلة الدفع</h3>
            </div>
            <p className="text-slate-600 leading-relaxed">
              هل أنت متأكد من حذف وسيلة الدفع <strong>{methodToDelete.name}</strong>؟ لن تظهر للزوار بعد ذلك.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMethodToDelete(null)}
                className="px-3.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteMethodConfirm}
                className="px-3.5 py-1.5 bg-rose-600 text-white rounded-lg font-bold cursor-pointer"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Preview Receipt Image */}
      {previewReceiptImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-4 space-y-3 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800">إيصال التحويل المرفق</span>
              <button
                type="button"
                onClick={() => setPreviewReceiptImage(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-slate-50 rounded-xl p-2">
              <img
                src={previewReceiptImage}
                alt="Receipt"
                className="max-h-[65vh] w-auto object-contain rounded-lg shadow-sm"
              />
            </div>
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setPreviewReceiptImage(null)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Reject Transaction with Reason */}
      {rejectingTx && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200 text-slate-800 text-xs">
            <div className="flex items-center gap-2 text-rose-600">
              <XCircle className="w-5 h-5" />
              <h3 className="font-black text-sm">رفض معاملة التحويل</h3>
            </div>
            <p className="text-slate-600">
              يرجى تحديد سبب الرفض لمعاملة المشترك <strong>{rejectingTx.subscriberName}</strong>:
            </p>
            <textarea
              rows={2}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-rose-500"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingTx(null)}
                className="px-3.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleRejectTransactionConfirm}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold cursor-pointer"
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
