(function attachAuthLayer(windowObject) {
  "use strict";

  const app = (windowObject.MasarifyApp = windowObject.MasarifyApp || {});
  const config = app.config || {};
  const db = app.db || {};

  const SESSION_CACHE_KEY = "masarify.session";
  const PAGE_PATHS = {
    guest: "index.html",
    dashboard: "dashboard.html"
  };
  let lastAuthTrigger = null;

  function getClient() {
    return app.getSupabase();
  }

  function getPageType() {
    return document.body?.dataset?.page || "";
  }

  function redirectTo(path) {
    const isCurrentPage = windowObject.location.pathname.endsWith(path);

    if (!isCurrentPage) {
      windowObject.location.href = path;
    }
  }

  // نخزن معلومات آمنة فقط للعرض السريع في الواجهة دون حفظ أسرار الجلسة.
  function saveSessionCache(session) {
    const user = session?.user;

    if (!user) {
      localStorage.removeItem(SESSION_CACHE_KEY);
      return;
    }

    localStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({
        id: user.id,
        email: user.email || "",
        fullName: user.user_metadata?.full_name || "",
        lastSignInAt: user.last_sign_in_at || session.expires_at || ""
      })
    );
  }

  function getSessionCache() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_CACHE_KEY) || "null");
    } catch (error) {
      localStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
  }

  function getFriendlyAuthError(error) {
    const message = String(error?.message || "");

    if (message.includes("Invalid login credentials")) {
      return "بيانات الدخول غير صحيحة. تحقق من البريد الإلكتروني وكلمة المرور.";
    }

    if (message.includes("Email not confirmed")) {
      return "يجب تأكيد البريد الإلكتروني أولاً ثم إعادة المحاولة.";
    }

    if (message.includes("User already registered")) {
      return "هذا البريد مستخدم بالفعل. جرّب تسجيل الدخول بدلاً من إنشاء حساب جديد.";
    }

    return message || "حدث خطأ غير متوقع أثناء المصادقة.";
  }

  function setAuthMessage(message, type) {
    const container = document.getElementById("authMessage");

    if (!container) {
      return;
    }

    if (!message) {
      container.className = "hidden rounded-2xl border px-4 py-3 text-sm font-semibold";
      container.textContent = "";
      return;
    }

    const typeClasses = {
      success: "border-emerald-200 bg-emerald-50 text-emerald-700",
      error: "border-rose-200 bg-rose-50 text-rose-700",
      info: "border-blue-200 bg-blue-50 text-blue-700"
    };

    container.className = `block rounded-2xl border px-4 py-3 text-sm font-semibold ${
      typeClasses[type] || typeClasses.info
    }`;
    container.textContent = message;
  }

  async function getCurrentSession() {
    if (!config.isConfigured) {
      return null;
    }

    const { data, error } = await getClient().auth.getSession();

    if (error) {
      throw new Error("تعذر التحقق من الجلسة الحالية.");
    }

    return data.session || null;
  }

  async function handleGuestGuard() {
    const session = await getCurrentSession();

    if (session?.user) {
      saveSessionCache(session);
      redirectTo(PAGE_PATHS.dashboard);
    }
  }

  async function handleProtectedGuard() {
    const session = await getCurrentSession();

    if (!session?.user) {
      saveSessionCache(null);
      redirectTo(PAGE_PATHS.guest);
      return null;
    }

    saveSessionCache(session);
    return session;
  }

  async function signUp(payload) {
    const fullName = String(payload?.fullName || "").trim();
    const email = String(payload?.email || "").trim().toLowerCase();
    const password = String(payload?.password || "");

    if (!fullName) {
      throw new Error("يرجى إدخال الاسم الكامل.");
    }

    if (!email) {
      throw new Error("يرجى إدخال البريد الإلكتروني.");
    }

    if (password.length < 6) {
      throw new Error("كلمة المرور يجب ألا تقل عن 6 أحرف.");
    }

    const { data, error } = await getClient().auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    if (error) {
      throw new Error(getFriendlyAuthError(error));
    }

    if (data.session) {
      saveSessionCache(data.session);
      redirectTo(PAGE_PATHS.dashboard);
      return;
    }

    setAuthMessage("تم إنشاء الحساب. افحص بريدك الإلكتروني إذا كان التأكيد مطلوباً.", "success");
  }

  async function signIn(payload) {
    const email = String(payload?.email || "").trim().toLowerCase();
    const password = String(payload?.password || "");

    if (!email || !password) {
      throw new Error("أدخل البريد الإلكتروني وكلمة المرور أولاً.");
    }

    const { data, error } = await getClient().auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw new Error(getFriendlyAuthError(error));
    }

    if (data.user) {
      await db.ensureProfileRecord(data.user);
    }

    saveSessionCache(data.session || null);
    redirectTo(PAGE_PATHS.dashboard);
  }

  async function signOut() {
    if (!config.isConfigured) {
      redirectTo(PAGE_PATHS.guest);
      return;
    }

    const { error } = await getClient().auth.signOut();

    saveSessionCache(null);

    if (error) {
      throw new Error("تعذر تسجيل الخروج حالياً. أعد المحاولة.");
    }

    redirectTo(PAGE_PATHS.guest);
  }

  function openAuthModal(targetTab) {
    const modal = document.getElementById("authModal");

    if (!modal) {
      return;
    }

    lastAuthTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    modal.setAttribute("aria-hidden", "false");
    setAuthTab(targetTab || "login");
  }

  function closeAuthModal() {
    const modal = document.getElementById("authModal");
    const focusTarget = lastAuthTrigger instanceof HTMLElement ? lastAuthTrigger : null;

    if (!modal) {
      return;
    }

    if (focusTarget) {
      focusTarget.focus();
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    windowObject.requestAnimationFrame(function hideModalAfterFocusShift() {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
      modal.setAttribute("aria-hidden", "true");
    });
  }

  function setAuthTab(tabName) {
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const loginButton = document.getElementById("loginTabButton");
    const signupButton = document.getElementById("signupTabButton");

    if (!loginForm || !signupForm || !loginButton || !signupButton) {
      return;
    }

    const showLogin = tabName !== "signup";

    loginForm.classList.toggle("hidden", !showLogin);
    signupForm.classList.toggle("hidden", showLogin);
    loginButton.classList.toggle("is-active", showLogin);
    signupButton.classList.toggle("is-active", !showLogin);
    loginButton.classList.toggle("text-slate-500", !showLogin);
    signupButton.classList.toggle("text-slate-500", showLogin);
    setAuthMessage("", "info");
  }

  function bindGuestPage() {
    const modal = document.getElementById("authModal");
    const openButtons = document.querySelectorAll("[data-open-auth]");
    const closeButton = document.getElementById("closeAuthModal");
    const tabButtons = document.querySelectorAll("[data-tab-button]");
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");

    openButtons.forEach(function registerOpenButton(button) {
      button.addEventListener("click", function open() {
        openAuthModal(button.dataset.targetTab || "login");
      });
    });

    closeButton?.addEventListener("click", closeAuthModal);

    modal?.addEventListener("click", function closeOnOverlay(event) {
      if (event.target === modal) {
        closeAuthModal();
      }
    });

    tabButtons.forEach(function registerTab(button) {
      button.addEventListener("click", function switchTab() {
        setAuthTab(button.dataset.tabButton);
      });
    });

    loginForm?.addEventListener("submit", async function handleLoginSubmit(event) {
      event.preventDefault();

      if (!config.isConfigured) {
        setAuthMessage(config.getMissingConfigMessage(), "error");
        return;
      }

      const formData = new FormData(loginForm);
      setAuthMessage("جاري تسجيل الدخول...", "info");

      try {
        await signIn({
          email: formData.get("email"),
          password: formData.get("password")
        });
      } catch (error) {
        setAuthMessage(getFriendlyAuthError(error), "error");
      }
    });

    signupForm?.addEventListener("submit", async function handleSignupSubmit(event) {
      event.preventDefault();

      if (!config.isConfigured) {
        setAuthMessage(config.getMissingConfigMessage(), "error");
        return;
      }

      const formData = new FormData(signupForm);
      setAuthMessage("جاري إنشاء الحساب...", "info");

      try {
        await signUp({
          fullName: formData.get("fullName"),
          email: formData.get("email"),
          password: formData.get("password")
        });
      } catch (error) {
        setAuthMessage(getFriendlyAuthError(error), "error");
      }
    });

    if (!config.isConfigured) {
      setAuthMessage(config.getMissingConfigMessage(), "error");
    }
  }

  async function bootSessionGuard() {
    const pageType = getPageType();

    if (!pageType) {
      return;
    }

    if (!config.isConfigured) {
      if (pageType === "guest") {
        bindGuestPage();
      }
      return;
    }

    try {
      if (pageType === "guest") {
        bindGuestPage();
        await handleGuestGuard();
      }

      if (pageType === "dashboard") {
        await handleProtectedGuard();
      }
    } catch (error) {
      if (pageType === "guest") {
        bindGuestPage();
        setAuthMessage(getFriendlyAuthError(error), "error");
      } else {
        redirectTo(PAGE_PATHS.guest);
      }
    }
  }

  if (config.isConfigured) {
    getClient().auth.onAuthStateChange(function onAuthStateChange(_event, session) {
      saveSessionCache(session || null);
    });
  }

  app.auth = {
    bootSessionGuard,
    getCurrentSession,
    getSessionCache,
    signIn,
    signOut,
    signUp
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootSessionGuard);
  } else {
    bootSessionGuard();
  }
})(window);
