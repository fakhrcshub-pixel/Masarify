(function attachAuthLayer(windowObject) {
  "use strict";

  const app = (windowObject.MasarifyApp = windowObject.MasarifyApp || {});
  const config = app.config || {};
  const db = app.db || {};

  const SESSION_CACHE_KEY = "masarify.session";
  const AUTH_MODE_KEY = "masarify.auth.mode";
  const AUTH_VIEWS = {
    login: "login",
    signup: "signup",
    resetRequest: "reset-request",
    resetPassword: "reset-password"
  };
  const PAGE_PATHS = {
    guest: "index.html",
    dashboard: "dashboard.html"
  };
  const MODAL_FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let activeAuthView = AUTH_VIEWS.login;
  let guestBindingsInitialized = false;
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

  function wait(milliseconds) {
    return new Promise(function pause(resolve) {
      windowObject.setTimeout(resolve, milliseconds);
    });
  }

  function getAuthModalElements() {
    return {
      modal: document.getElementById("authModal"),
      panel: document.getElementById("authModalPanel"),
      title: document.getElementById("authModalTitle"),
      description: document.getElementById("authModalDescription"),
      tabs: document.getElementById("authTabs"),
      loginButton: document.getElementById("loginTabButton"),
      signupButton: document.getElementById("signupTabButton"),
      loginForm: document.getElementById("loginForm"),
      signupForm: document.getElementById("signupForm"),
      resetRequestForm: document.getElementById("resetRequestForm"),
      resetPasswordForm: document.getElementById("resetPasswordForm"),
      resetPasswordUsername: document.getElementById("resetPasswordUsername")
    };
  }

  function getUrlAuthParams() {
    const params = new URLSearchParams(windowObject.location.search);
    const rawHash = String(windowObject.location.hash || "").replace(/^#/, "");
    const hashParams = new URLSearchParams(rawHash);

    hashParams.forEach(function mergeHashValue(value, key) {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });

    return params;
  }

  function setPendingAuthMode(mode) {
    if (!mode) {
      sessionStorage.removeItem(AUTH_MODE_KEY);
      return;
    }

    sessionStorage.setItem(AUTH_MODE_KEY, mode);
  }

  function getPendingAuthMode() {
    return sessionStorage.getItem(AUTH_MODE_KEY) || "";
  }

  function isPasswordRecoveryFlow() {
    const params = getUrlAuthParams();

    return getPendingAuthMode() === "recovery" || params.get("type") === "recovery";
  }

  function clearAuthUrlArtifacts() {
    const cleanUrl = new URL(windowObject.location.href);
    cleanUrl.searchParams.delete("type");
    cleanUrl.searchParams.delete("code");
    cleanUrl.searchParams.delete("error");
    cleanUrl.searchParams.delete("error_code");
    cleanUrl.searchParams.delete("error_description");
    cleanUrl.hash = "";
    windowObject.history.replaceState({}, document.title, cleanUrl.toString());
  }

  function getGuestRedirectUrl() {
    return new URL(PAGE_PATHS.guest, windowObject.location.href).toString();
  }

  function getFocusableElements(container) {
    if (!(container instanceof HTMLElement)) {
      return [];
    }

    return Array.from(container.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)).filter(function isFocusable(
      element
    ) {
      return !element.hasAttribute("hidden") && !element.closest("[hidden]");
    });
  }

  function setBackgroundInert(isInert) {
    document.querySelectorAll("body > header, body > main").forEach(function syncBackground(node) {
      if (!(node instanceof HTMLElement)) {
        return;
      }

      if (isInert) {
        node.setAttribute("inert", "");
      } else {
        node.removeAttribute("inert");
      }
    });
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
      return "تم تجهيز الحساب لكن جلسة الدخول لم تكتمل بعد. أعد المحاولة بعد لحظات.";
    }

    if (message.includes("User already registered")) {
      return "هذا البريد مستخدم بالفعل. جرّب تسجيل الدخول بدلاً من إنشاء حساب جديد.";
    }

    if (message.toLowerCase().includes("rate limit")) {
      return "تم تجاوز الحد المؤقت لرسائل البريد من Supabase. انتظر قليلاً ثم أعد المحاولة.";
    }

    if (message.includes("Password should be at least")) {
      return "كلمة المرور يجب ألا تقل عن 6 أحرف.";
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

  function getViewMeta(viewName) {
    if (viewName === AUTH_VIEWS.signup) {
      return {
        title: "إنشاء حساب جديد",
        description: "أدخل بياناتك وسنجهز حسابك وجلسة العمل مباشرة دون خطوات إضافية."
      };
    }

    if (viewName === AUTH_VIEWS.resetRequest) {
      return {
        title: "استعادة كلمة المرور",
        description: "سنرسل رابطاً آمناً إلى بريدك الإلكتروني لإعادة تعيين كلمة المرور."
      };
    }

    if (viewName === AUTH_VIEWS.resetPassword) {
      return {
        title: "تعيين كلمة مرور جديدة",
        description: "أدخل كلمة مرور جديدة لإكمال استعادة الوصول إلى حسابك."
      };
    }

    return {
      title: "الدخول أو إنشاء حساب",
      description: "سجّل الدخول أو أنشئ حساباً جديداً لبدء إدارة مصروفاتك الشهرية."
    };
  }

  function syncAuthView(viewName) {
    const elements = getAuthModalElements();
    const meta = getViewMeta(viewName);
    const isLoginView = viewName === AUTH_VIEWS.login;
    const isSignupView = viewName === AUTH_VIEWS.signup;
    const isResetRequestView = viewName === AUTH_VIEWS.resetRequest;
    const isResetPasswordView = viewName === AUTH_VIEWS.resetPassword;

    activeAuthView = viewName;

    if (elements.title) {
      elements.title.textContent = meta.title;
    }

    if (elements.description) {
      elements.description.textContent = meta.description;
    }

    if (elements.tabs) {
      elements.tabs.classList.toggle("hidden", isResetRequestView || isResetPasswordView);
      elements.tabs.toggleAttribute("hidden", isResetRequestView || isResetPasswordView);
    }

    if (elements.loginForm) {
      elements.loginForm.classList.toggle("hidden", !isLoginView);
      elements.loginForm.toggleAttribute("hidden", !isLoginView);
    }

    if (elements.signupForm) {
      elements.signupForm.classList.toggle("hidden", !isSignupView);
      elements.signupForm.toggleAttribute("hidden", !isSignupView);
    }

    if (elements.resetRequestForm) {
      elements.resetRequestForm.classList.toggle("hidden", !isResetRequestView);
      elements.resetRequestForm.toggleAttribute("hidden", !isResetRequestView);
    }

    if (elements.resetPasswordForm) {
      elements.resetPasswordForm.classList.toggle("hidden", !isResetPasswordView);
      elements.resetPasswordForm.toggleAttribute("hidden", !isResetPasswordView);
    }

    if (elements.resetPasswordUsername) {
      elements.resetPasswordUsername.value =
        getSessionCache()?.email || elements.resetPasswordUsername.value || "";
    }

    elements.loginButton?.classList.toggle("is-active", isLoginView);
    elements.signupButton?.classList.toggle("is-active", isSignupView);
    elements.loginButton?.classList.toggle("text-slate-500", !isLoginView);
    elements.signupButton?.classList.toggle("text-slate-500", !isSignupView);
  }

  function getPreferredFocusSelector(viewName) {
    if (viewName === AUTH_VIEWS.signup) {
      return "#signupFullName";
    }

    if (viewName === AUTH_VIEWS.resetRequest) {
      return "#resetRequestEmail";
    }

    if (viewName === AUTH_VIEWS.resetPassword) {
      return "#resetPassword";
    }

    return "#loginEmail";
  }

  function focusActiveAuthElement() {
    const elements = getAuthModalElements();
    const preferredSelector = getPreferredFocusSelector(activeAuthView);
    const preferredElement = elements.panel?.querySelector(preferredSelector);
    const focusableElements = getFocusableElements(elements.panel);
    const target = preferredElement || focusableElements[0] || elements.panel;

    if (target instanceof HTMLElement) {
      target.focus();
    }
  }

  function openAuthModal(targetView) {
    const elements = getAuthModalElements();

    if (!elements.modal) {
      return;
    }

    lastAuthTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    syncAuthView(targetView || AUTH_VIEWS.login);
    setAuthMessage("", "info");
    elements.modal.hidden = false;
    elements.modal.inert = false;
    elements.modal.classList.remove("hidden");
    elements.modal.classList.add("flex");
    elements.modal.setAttribute("aria-hidden", "false");
    setBackgroundInert(true);
    document.body.classList.add("overflow-hidden");
    windowObject.requestAnimationFrame(focusActiveAuthElement);
  }

  function closeAuthModal() {
    const elements = getAuthModalElements();
    const focusTarget = lastAuthTrigger instanceof HTMLElement ? lastAuthTrigger : null;

    if (!elements.modal) {
      return;
    }

    setBackgroundInert(false);
    document.body.classList.remove("overflow-hidden");
    elements.modal.classList.add("hidden");
    elements.modal.classList.remove("flex");
    elements.modal.setAttribute("aria-hidden", "true");
    elements.modal.hidden = true;
    elements.modal.inert = true;

    windowObject.requestAnimationFrame(function restoreFocusAfterClose() {
      if (focusTarget) {
        focusTarget.focus();
      }
    });
  }

  function handleAuthModalKeydown(event) {
    const elements = getAuthModalElements();

    if (elements.modal?.hidden) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeAuthModal();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(elements.panel);

    if (!focusableElements.length) {
      event.preventDefault();
      elements.panel?.focus();
      return;
    }

    const currentIndex = focusableElements.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? focusableElements.length : currentIndex) - 1
      : (currentIndex + 1) % focusableElements.length;

    event.preventDefault();
    focusableElements[nextIndex]?.focus();
  }

  function setAuthView(viewName) {
    syncAuthView(viewName);
    setAuthMessage("", "info");

    if (!getAuthModalElements().modal?.hidden) {
      windowObject.requestAnimationFrame(focusActiveAuthElement);
    }
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

    if (isPasswordRecoveryFlow()) {
      openAuthModal(AUTH_VIEWS.resetPassword);
      setAuthMessage("أدخل كلمة مرور جديدة لإكمال استعادة الحساب.", "info");
      return;
    }

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

  async function signInWithCredentials(email, password) {
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

    return data;
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

    // نحاول الدخول مباشرة حتى لو أرجعت عملية التسجيل مستخدماً فقط بلا جلسة.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await wait(200 * (attempt + 1));
        const signInData = await signInWithCredentials(email, password);
        saveSessionCache(signInData.session || null);
        redirectTo(PAGE_PATHS.dashboard);
        return;
      } catch (signInError) {
        if (attempt === 2) {
          throw signInError;
        }
      }
    }
  }

  async function signIn(payload) {
    const email = String(payload?.email || "").trim().toLowerCase();
    const password = String(payload?.password || "");

    if (!email || !password) {
      throw new Error("أدخل البريد الإلكتروني وكلمة المرور أولاً.");
    }

    const data = await signInWithCredentials(email, password);
    saveSessionCache(data.session || null);
    redirectTo(PAGE_PATHS.dashboard);
  }

  async function requestPasswordReset(payload) {
    const email = String(payload?.email || "").trim().toLowerCase();

    if (!email) {
      throw new Error("يرجى إدخال البريد الإلكتروني أولاً.");
    }

    const { error } = await getClient().auth.resetPasswordForEmail(email, {
      redirectTo: getGuestRedirectUrl()
    });

    if (error) {
      throw new Error(getFriendlyAuthError(error));
    }
  }

  async function updatePassword(payload) {
    const password = String(payload?.password || "");
    const confirmPassword = String(payload?.confirmPassword || "");

    if (password.length < 6) {
      throw new Error("كلمة المرور يجب ألا تقل عن 6 أحرف.");
    }

    if (password !== confirmPassword) {
      throw new Error("تأكيد كلمة المرور غير مطابق.");
    }

    const { error } = await getClient().auth.updateUser({
      password
    });

    if (error) {
      throw new Error(getFriendlyAuthError(error));
    }

    setPendingAuthMode("");
    clearAuthUrlArtifacts();
  }

  async function signOut() {
    if (!config.isConfigured) {
      redirectTo(PAGE_PATHS.guest);
      return;
    }

    const { error } = await getClient().auth.signOut();

    saveSessionCache(null);
    setPendingAuthMode("");

    if (error) {
      throw new Error("تعذر تسجيل الخروج حالياً. أعد المحاولة.");
    }

    redirectTo(PAGE_PATHS.guest);
  }

  function bindGuestPage() {
    if (guestBindingsInitialized) {
      return;
    }

    const elements = getAuthModalElements();
    const modal = elements.modal;
    const openButtons = document.querySelectorAll("[data-open-auth]");
    const closeButton = document.getElementById("closeAuthModal");
    const tabButtons = document.querySelectorAll("[data-tab-button]");
    const viewButtons = document.querySelectorAll("[data-auth-view]");
    const loginForm = elements.loginForm;
    const signupForm = elements.signupForm;
    const resetRequestForm = elements.resetRequestForm;
    const resetPasswordForm = elements.resetPasswordForm;
    const resetRequestButton = document.getElementById("openResetRequestButton");

    guestBindingsInitialized = true;

    openButtons.forEach(function registerOpenButton(button) {
      button.addEventListener("click", function open() {
        openAuthModal(button.dataset.targetTab || AUTH_VIEWS.login);
      });
    });

    closeButton?.addEventListener("mousedown", function avoidFocusSteal(event) {
      event.preventDefault();
    });
    closeButton?.addEventListener("click", closeAuthModal);
    modal?.addEventListener("keydown", handleAuthModalKeydown);

    modal?.addEventListener("click", function closeOnOverlay(event) {
      if (event.target === modal) {
        closeAuthModal();
      }
    });

    tabButtons.forEach(function registerTab(button) {
      button.addEventListener("click", function switchTab() {
        setAuthView(button.dataset.tabButton === "signup" ? AUTH_VIEWS.signup : AUTH_VIEWS.login);
      });
    });

    viewButtons.forEach(function registerViewButton(button) {
      button.addEventListener("click", function switchView() {
        setAuthView(button.getAttribute("data-auth-view") || AUTH_VIEWS.login);
      });
    });

    resetRequestButton?.addEventListener("click", function showResetRequest() {
      setAuthView(AUTH_VIEWS.resetRequest);
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

    resetRequestForm?.addEventListener("submit", async function handleResetRequestSubmit(event) {
      event.preventDefault();

      if (!config.isConfigured) {
        setAuthMessage(config.getMissingConfigMessage(), "error");
        return;
      }

      const formData = new FormData(resetRequestForm);
      setAuthMessage("جاري تجهيز رابط الاستعادة...", "info");

      try {
        await requestPasswordReset({
          email: formData.get("email")
        });
        setAuthMessage("تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني.", "success");
      } catch (error) {
        setAuthMessage(getFriendlyAuthError(error), "error");
      }
    });

    resetPasswordForm?.addEventListener("submit", async function handleResetPasswordSubmit(event) {
      event.preventDefault();

      if (!config.isConfigured) {
        setAuthMessage(config.getMissingConfigMessage(), "error");
        return;
      }

      const formData = new FormData(resetPasswordForm);
      setAuthMessage("جاري حفظ كلمة المرور الجديدة...", "info");

      try {
        await updatePassword({
          password: formData.get("password"),
          confirmPassword: formData.get("confirmPassword")
        });
        setAuthMessage("تم تحديث كلمة المرور بنجاح. سيتم تحويلك إلى لوحة التحكم.", "success");
        await wait(900);
        redirectTo(PAGE_PATHS.dashboard);
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
    getClient().auth.onAuthStateChange(function onAuthStateChange(event, session) {
      saveSessionCache(session || null);

      if (event === "PASSWORD_RECOVERY") {
        setPendingAuthMode("recovery");

        if (getPageType() === "guest") {
          bindGuestPage();
          openAuthModal(AUTH_VIEWS.resetPassword);
          setAuthMessage("أدخل كلمة مرور جديدة لإكمال استعادة الحساب.", "info");
        }

        return;
      }

      if (event === "SIGNED_OUT") {
        setPendingAuthMode("");
        return;
      }

      if (event === "SIGNED_IN" && getPendingAuthMode() !== "recovery") {
        setPendingAuthMode("");
      }
    });
  }

  app.auth = {
    bootSessionGuard,
    getCurrentSession,
    getSessionCache,
    requestPasswordReset,
    signIn,
    signOut,
    signUp,
    updatePassword
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootSessionGuard);
  } else {
    bootSessionGuard();
  }
})(window);
