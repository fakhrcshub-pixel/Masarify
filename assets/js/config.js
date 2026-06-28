(function attachConfig(windowObject) {
  "use strict";

  // ننشئ مساحة مشتركة للتطبيق حتى تتعاون جميع الملفات بدون تداخل عالمي عشوائي.
  const app = (windowObject.MasarifyApp = windowObject.MasarifyApp || {});
  const env = windowObject.MASARIFY_ENV || {};

  const supabaseUrl = String(env.SUPABASE_URL || "").trim();
  const supabasePublishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const supabaseAnonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  const supabaseClientKey = supabasePublishableKey || supabaseAnonKey;
  const looksConfigured =
    Boolean(supabaseUrl) &&
    Boolean(supabaseClientKey) &&
    !supabaseUrl.includes("YOUR_SUPABASE_URL") &&
    !supabaseClientKey.includes("YOUR_SUPABASE_PUBLISHABLE_KEY") &&
    !supabaseClientKey.includes("YOUR_SUPABASE_ANON_KEY");

  // هذه الدالة تستخدم تنسيقاً ثابتاً بالريال السعودي في كامل التطبيق.
  function formatCurrency(value) {
    const safeNumber = Number(value) || 0;
    return new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(safeNumber);
  }

  // نحول التاريخ المحلي إلى YYYY-MM-DD لأن هذا التنسيق مناسب لكل من HTML وSupabase.
  function toISODate(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  // نهرب النص قبل إدخاله في innerHTML حتى لا نسمح بحقن HTML من بيانات المستخدم.
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // واجهة ثابتة لإظهار أخطاء الإعداد عند نسيان بيانات Supabase.
  function getMissingConfigMessage() {
    return "بيانات Supabase غير مكتملة. حدّث الملف assets/js/env.js ثم أعد تحميل الصفحة.";
  }

  let supabaseClient = null;

  if (looksConfigured && windowObject.supabase?.createClient) {
    supabaseClient = windowObject.supabase.createClient(supabaseUrl, supabaseClientKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  app.config = {
    supabaseUrl,
    supabasePublishableKey,
    supabaseAnonKey,
    supabaseClientKey,
    isConfigured: looksConfigured,
    getMissingConfigMessage
  };

  app.utils = {
    formatCurrency,
    toISODate,
    escapeHtml
  };

  app.getSupabase = function getSupabase() {
    if (!app.config.isConfigured || !supabaseClient) {
      throw new Error(getMissingConfigMessage());
    }

    return supabaseClient;
  };
})(window);
