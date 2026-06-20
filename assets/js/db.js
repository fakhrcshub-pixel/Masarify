(function attachDatabaseLayer(windowObject) {
  "use strict";

  const app = (windowObject.MasarifyApp = windowObject.MasarifyApp || {});
  const utils = app.utils || {};

  const CATEGORY_MAP = {
    food: { label: "طعام", icon: "restaurant" },
    transport: { label: "مواصلات", icon: "directions_car" },
    bills: { label: "فواتير", icon: "receipt_long" },
    entertainment: { label: "ترفيه", icon: "movie" },
    other: { label: "أخرى", icon: "category" }
  };

  function getClient() {
    return app.getSupabase();
  }

  async function getCurrentUser() {
    const { data, error } = await getClient().auth.getUser();

    if (error) {
      throw new Error("تعذر التحقق من المستخدم الحالي.");
    }

    if (!data.user) {
      throw new Error("انتهت الجلسة الحالية. يرجى تسجيل الدخول من جديد.");
    }

    return data.user;
  }

  // نعيد أول وآخر يوم في الشهر الحالي حتى يظل التطبيق متوافقاً تلقائياً مع بداية أي شهر جديد.
  function getCurrentMonthRange(referenceDate) {
    const reference = referenceDate instanceof Date ? referenceDate : new Date();
    const startDate = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const endDate = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);

    return {
      startDate: utils.toISODate(startDate),
      endDate: utils.toISODate(endDate)
    };
  }

  function sanitizeText(value, fieldLabel, maxLength) {
    const normalized = String(value ?? "").trim().replace(/\s+/g, " ");

    if (!normalized) {
      throw new Error(`يرجى إدخال ${fieldLabel}.`);
    }

    if (normalized.length > maxLength) {
      throw new Error(`${fieldLabel} يجب ألا يتجاوز ${maxLength} حرفاً.`);
    }

    return normalized;
  }

  function sanitizeAmount(value) {
    const normalized = Number.parseFloat(String(value ?? "").replace(",", "."));

    if (!Number.isFinite(normalized) || normalized <= 0) {
      throw new Error("المبلغ يجب أن يكون رقماً موجباً أكبر من صفر.");
    }

    return Number(normalized.toFixed(2));
  }

  function sanitizeBudget(value) {
    const normalized = Number.parseFloat(String(value ?? "").replace(",", "."));

    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new Error("الميزانية يجب أن تكون رقماً صحيحاً أو عشرياً غير سالب.");
    }

    return Number(normalized.toFixed(2));
  }

  function sanitizeCategory(value) {
    if (!CATEGORY_MAP[value]) {
      throw new Error("يرجى اختيار تصنيف صحيح للمصروف.");
    }

    return value;
  }

  function sanitizeDate(value) {
    const normalized = utils.toISODate(value);

    if (!normalized) {
      throw new Error("يرجى اختيار تاريخ صحيح.");
    }

    return normalized;
  }

  function isDateInCurrentMonth(dateString) {
    const { startDate, endDate } = getCurrentMonthRange();
    return dateString >= startDate && dateString <= endDate;
  }

  function isDateInCurrentWeek(dateString) {
    const currentDate = new Date();
    const currentDay = currentDate.getDay();
    const sundayBasedOffset = currentDay === 0 ? 6 : currentDay - 1;
    const startOfWeek = new Date(currentDate);
    const endOfWeek = new Date(currentDate);

    startOfWeek.setDate(currentDate.getDate() - sundayBasedOffset);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const start = utils.toISODate(startOfWeek);
    const end = utils.toISODate(endOfWeek);

    return dateString >= start && dateString <= end;
  }

  function formatExpenseDate(dateString) {
    const today = utils.toISODate(new Date());

    if (dateString === today) {
      return "اليوم";
    }

    return dateString;
  }

  function getCategoryMeta(category) {
    return CATEGORY_MAP[category] || CATEGORY_MAP.other;
  }

  // نحسب المجاميع في دالة نقية حتى تبقى قابلة لإعادة الاستخدام والاختبار.
  function calculateTotals(expenses, budgetValue) {
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const budget = Number(budgetValue) || 0;

    const totalExpenses = safeExpenses.reduce(function sum(accumulator, expense) {
      return accumulator + (Number(expense.amount) || 0);
    }, 0);

    const remaining = Number((budget - totalExpenses).toFixed(2));
    const usagePercentage = budget > 0 ? Math.min((totalExpenses / budget) * 100, 100) : 0;

    return {
      budget,
      totalExpenses: Number(totalExpenses.toFixed(2)),
      remaining,
      usagePercentage: Number(usagePercentage.toFixed(1)),
      isExceeded: remaining < 0
    };
  }

  async function ensureProfileRecord(user) {
    const currentUser = user || (await getCurrentUser());
    const payload = {
      id: currentUser.id,
      budget: 0
    };

    const { error } = await getClient()
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      throw new Error("تعذر تجهيز ملف المستخدم المالي.");
    }
  }

  async function fetchProfile() {
    const user = await getCurrentUser();

    const { data, error } = await getClient()
      .from("profiles")
      .select("id, budget, updated_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error("تعذر تحميل بيانات الميزانية.");
    }

    if (!data) {
      await ensureProfileRecord(user);
      return {
        id: user.id,
        budget: 0,
        updated_at: null
      };
    }

    return data;
  }

  async function updateBudget(budgetValue) {
    const user = await getCurrentUser();
    const sanitizedBudget = sanitizeBudget(budgetValue);

    const { data, error } = await getClient()
      .from("profiles")
      .upsert(
        {
          id: user.id,
          budget: sanitizedBudget,
          updated_at: new Date().toISOString()
        },
        { onConflict: "id" }
      )
      .select("id, budget, updated_at")
      .single();

    if (error) {
      throw new Error("تعذر حفظ الميزانية الجديدة.");
    }

    return data;
  }

  async function fetchCurrentMonthExpenses() {
    const user = await getCurrentUser();
    const range = getCurrentMonthRange();

    const { data, error } = await getClient()
      .from("expenses")
      .select("id, user_id, title, amount, category, date, created_at")
      .eq("user_id", user.id)
      .gte("date", range.startDate)
      .lte("date", range.endDate)
      .order("date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      throw new Error("تعذر تحميل مصروفات الشهر الحالي.");
    }

    return data || [];
  }

  async function addNewExpense(title, amount, category, date) {
    const user = await getCurrentUser();
    const payload = {
      user_id: user.id,
      title: sanitizeText(title, "عنوان المصروف", 120),
      amount: sanitizeAmount(amount),
      category: sanitizeCategory(category),
      date: sanitizeDate(date)
    };

    const { data, error } = await getClient()
      .from("expenses")
      .insert(payload)
      .select("id, user_id, title, amount, category, date, created_at")
      .single();

    if (error) {
      throw new Error("تعذر حفظ المصروف في قاعدة البيانات.");
    }

    return data;
  }

  async function deleteExpenseById(expenseId) {
    const normalizedId = Number(expenseId);

    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      throw new Error("معرف المصروف غير صالح.");
    }

    const user = await getCurrentUser();
    const { error } = await getClient()
      .from("expenses")
      .delete()
      .eq("id", normalizedId)
      .eq("user_id", user.id);

    if (error) {
      throw new Error("تعذر حذف المصروف.");
    }
  }

  app.db = {
    addNewExpense,
    calculateTotals,
    deleteExpenseById,
    ensureProfileRecord,
    fetchCurrentMonthExpenses,
    fetchProfile,
    formatExpenseDate,
    getCategoryMeta,
    getCurrentMonthRange,
    getCurrentUser,
    isDateInCurrentMonth,
    isDateInCurrentWeek,
    sanitizeAmount,
    sanitizeBudget,
    updateBudget
  };
})(window);
