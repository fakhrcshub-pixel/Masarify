(function attachUiLayer(windowObject) {
  "use strict";

  const app = (windowObject.MasarifyApp = windowObject.MasarifyApp || {});
  const auth = app.auth || {};
  const db = app.db || {};
  const utils = app.utils || {};
  const config = app.config || {};

  const state = {
    activeFilter: "all",
    expenses: [],
    profile: { budget: 0 },
    session: null,
    searchTerm: ""
  };

  const dom = {};

  function cacheDom() {
    dom.toastContainer = document.getElementById("toastContainer");
    dom.currentMonthLabel = document.getElementById("currentMonthLabel");
    dom.monthRangeText = document.getElementById("monthRangeText");
    dom.userAvatar = document.getElementById("userAvatar");
    dom.userName = document.getElementById("userName");
    dom.userEmail = document.getElementById("userEmail");
    dom.logoutButton = document.getElementById("logoutButton");
    dom.budgetAmount = document.getElementById("budgetAmount");
    dom.totalExpensesAmount = document.getElementById("totalExpensesAmount");
    dom.remainingAmount = document.getElementById("remainingAmount");
    dom.budgetUsageLabel = document.getElementById("budgetUsageLabel");
    dom.budgetProgressBar = document.getElementById("budgetProgressBar");
    dom.budgetHint = document.getElementById("budgetHint");
    dom.dashboardMessage = document.getElementById("dashboardMessage");
    dom.expenseForm = document.getElementById("expenseForm");
    dom.expenseTitle = document.getElementById("expenseTitle");
    dom.expenseAmount = document.getElementById("expenseAmount");
    dom.expenseCategory = document.getElementById("expenseCategory");
    dom.expenseDate = document.getElementById("expenseDate");
    dom.submitExpenseButton = document.getElementById("submitExpenseButton");
    dom.expenseSearch = document.getElementById("expenseSearch");
    dom.filterButtons = document.querySelectorAll("[data-filter-button]");
    dom.expenseList = document.getElementById("expenseList");
    dom.emptyState = document.getElementById("emptyState");
    dom.budgetModal = document.getElementById("budgetModal");
    dom.openBudgetModalButton = document.getElementById("openBudgetModalButton");
    dom.closeBudgetModalButton = document.getElementById("closeBudgetModalButton");
    dom.budgetForm = document.getElementById("budgetForm");
    dom.budgetInput = document.getElementById("budgetInput");
  }

  function setDashboardMessage(message, type) {
    if (!dom.dashboardMessage) {
      return;
    }

    if (!message) {
      dom.dashboardMessage.className = "mt-4 hidden rounded-2xl border px-4 py-3 text-sm font-semibold";
      dom.dashboardMessage.textContent = "";
      return;
    }

    const typeClasses = {
      success: "border-emerald-200 bg-emerald-50 text-emerald-700",
      error: "border-rose-200 bg-rose-50 text-rose-700",
      info: "border-blue-200 bg-blue-50 text-blue-700"
    };

    dom.dashboardMessage.className = `mt-4 block rounded-2xl border px-4 py-3 text-sm font-semibold ${
      typeClasses[type] || typeClasses.info
    }`;
    dom.dashboardMessage.textContent = message;
  }

  function showToast(message, type) {
    if (!dom.toastContainer || !message) {
      return;
    }

    const palette = {
      success: "border-emerald-200 bg-white text-emerald-700",
      error: "border-rose-200 bg-white text-rose-700",
      info: "border-blue-200 bg-white text-blue-700"
    };

    const toast = document.createElement("div");
    toast.className = `toast-enter pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-bold shadow-soft ${
      palette[type] || palette.info
    }`;
    toast.textContent = message;

    dom.toastContainer.appendChild(toast);

    windowObject.setTimeout(function removeToast() {
      toast.remove();
    }, 3200);
  }

  function getDisplayName() {
    const cached = auth.getSessionCache?.();
    const user = state.session?.user;
    const fullName = user?.user_metadata?.full_name || cached?.fullName;

    if (fullName) {
      return fullName;
    }

    if (user?.email) {
      return user.email.split("@")[0];
    }

    if (cached?.email) {
      return cached.email.split("@")[0];
    }

    return "مستخدم مصاريفي";
  }

  function updateUserHeader() {
    const displayName = getDisplayName();
    const email = state.session?.user?.email || auth.getSessionCache?.()?.email || "";
    const firstLetter = displayName.trim().charAt(0) || "م";

    if (dom.userName) {
      dom.userName.textContent = displayName;
    }

    if (dom.userEmail) {
      dom.userEmail.textContent = email;
    }

    if (dom.userAvatar) {
      dom.userAvatar.textContent = firstLetter;
    }
  }

  function updateMonthLabels() {
    const range = db.getCurrentMonthRange();

    if (dom.currentMonthLabel) {
      dom.currentMonthLabel.textContent = `الفترة النشطة: ${range.startDate} إلى ${range.endDate}`;
    }

    if (dom.monthRangeText) {
      dom.monthRangeText.textContent = `${range.startDate} - ${range.endDate}`;
    }
  }

  function openBudgetModal() {
    dom.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dom.budgetModal?.classList.remove("hidden");
    dom.budgetModal?.classList.add("flex");
    dom.budgetModal?.setAttribute("aria-hidden", "false");

    if (dom.budgetInput) {
      dom.budgetInput.value = Number(state.profile?.budget || 0).toFixed(2);
    }
  }

  function closeBudgetModal() {
    const focusTarget = dom.lastFocusedElement instanceof HTMLElement ? dom.lastFocusedElement : null;

    if (focusTarget) {
      focusTarget.focus();
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    windowObject.requestAnimationFrame(function hideBudgetModalAfterFocusShift() {
      dom.budgetModal?.classList.add("hidden");
      dom.budgetModal?.classList.remove("flex");
      dom.budgetModal?.setAttribute("aria-hidden", "true");
    });
  }

  function getFilteredExpenses() {
    return state.expenses.filter(function applyFilters(expense) {
      const matchesSearch =
        !state.searchTerm ||
        expense.title.toLowerCase().includes(state.searchTerm) ||
        db.getCategoryMeta(expense.category).label.toLowerCase().includes(state.searchTerm);

      if (!matchesSearch) {
        return false;
      }

      if (state.activeFilter === "week") {
        return db.isDateInCurrentWeek(expense.date);
      }

      if (state.activeFilter === "month") {
        return db.isDateInCurrentMonth(expense.date);
      }

      return true;
    });
  }

  // نبني بطاقة المصروف من البيانات فقط ثم نحقنها في الحاوية المخصصة.
  function buildExpenseMarkup(expense) {
    const category = db.getCategoryMeta(expense.category);

    return `
      <article class="expense-card flex items-center justify-between gap-4 rounded-[1.5rem] bg-slate-50 px-4 py-4">
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-500 shadow-sm">
            <span class="material-symbols-outlined">${category.icon}</span>
          </div>
          <div class="min-w-0">
            <h3 class="truncate text-base font-extrabold text-slate-900">${utils.escapeHtml(
              expense.title
            )}</h3>
            <p class="mt-1 text-sm text-slate-500">
              ${utils.escapeHtml(category.label)} • ${utils.escapeHtml(db.formatExpenseDate(expense.date))}
            </p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-3">
          <p class="text-sm font-extrabold text-rose-600">${utils.formatCurrency(expense.amount)}</p>
          <button
            type="button"
            data-delete-expense="${expense.id}"
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
            aria-label="حذف المصروف"
          >
            <span class="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      </article>
    `;
  }

  function renderExpensesList() {
    const filteredExpenses = getFilteredExpenses();

    if (!dom.expenseList || !dom.emptyState) {
      return;
    }

    if (!filteredExpenses.length) {
      dom.expenseList.innerHTML = "";
      dom.emptyState.classList.remove("hidden");
      return;
    }

    dom.emptyState.classList.add("hidden");
    dom.expenseList.innerHTML = filteredExpenses.map(buildExpenseMarkup).join("");
  }

  function renderSummary() {
    const totals = db.calculateTotals(state.expenses, state.profile?.budget || 0);
    const progressBarClasses = ["bg-emerald-300", "bg-amber-300", "bg-rose-300"];
    let progressClass = "bg-emerald-300";
    let hint = "ميزانيتك تحت السيطرة حتى الآن.";

    if (totals.isExceeded) {
      progressClass = "bg-rose-300";
      hint = "تم تجاوز الميزانية الحالية. راجع الإنفاق أو حدّث الميزانية.";
    } else if (totals.usagePercentage >= 75) {
      progressClass = "bg-amber-300";
      hint = "أنت قريب من الحد الشهري. راقب المصروفات المتبقية.";
    } else if (!totals.budget) {
      hint = "أضف ميزانيتك الشهرية لتبدأ مقارنة الإنفاق تلقائياً.";
    }

    if (dom.budgetAmount) {
      dom.budgetAmount.textContent = utils.formatCurrency(totals.budget);
    }

    if (dom.totalExpensesAmount) {
      dom.totalExpensesAmount.textContent = utils.formatCurrency(totals.totalExpenses);
    }

    if (dom.remainingAmount) {
      dom.remainingAmount.textContent = utils.formatCurrency(totals.remaining);
      dom.remainingAmount.classList.toggle("text-rose-100", totals.isExceeded);
    }

    if (dom.budgetUsageLabel) {
      dom.budgetUsageLabel.textContent = `${totals.usagePercentage}%`;
    }

    if (dom.budgetProgressBar) {
      dom.budgetProgressBar.style.width = `${totals.usagePercentage}%`;
      progressBarClasses.forEach(function removeClass(className) {
        dom.budgetProgressBar.classList.remove(className);
      });
      dom.budgetProgressBar.classList.add(progressClass);
    }

    if (dom.budgetHint) {
      dom.budgetHint.textContent = hint;
    }
  }

  function renderAll() {
    updateUserHeader();
    updateMonthLabels();
    renderSummary();
    renderExpensesList();
  }

  function sortExpensesDescending(expenses) {
    return expenses.slice().sort(function sortByDate(a, b) {
      const aKey = `${a.date}-${String(a.id).padStart(12, "0")}`;
      const bKey = `${b.date}-${String(b.id).padStart(12, "0")}`;
      return aKey < bKey ? 1 : -1;
    });
  }

  async function loadDashboardData() {
    setDashboardMessage("جاري تحميل البيانات...", "info");

    const [profile, expenses] = await Promise.all([db.fetchProfile(), db.fetchCurrentMonthExpenses()]);

    state.profile = profile;
    state.expenses = sortExpensesDescending(expenses);
    renderAll();
    setDashboardMessage("", "info");
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault();
    setDashboardMessage("", "info");

    if (!dom.expenseForm) {
      return;
    }

    const formData = new FormData(dom.expenseForm);

    try {
      dom.submitExpenseButton?.setAttribute("disabled", "disabled");

      const expense = await db.addNewExpense(
        formData.get("title"),
        formData.get("amount"),
        formData.get("category"),
        formData.get("date")
      );

      if (db.isDateInCurrentMonth(expense.date)) {
        state.expenses = sortExpensesDescending([expense].concat(state.expenses));
      }

      renderAll();
      dom.expenseForm.reset();
      dom.expenseDate.value = utils.toISODate(new Date());

      if (db.isDateInCurrentMonth(expense.date)) {
        showToast("تمت إضافة المصروف بنجاح.", "success");
      } else {
        showToast("تم حفظ المصروف في الأرشيف لأنه خارج الشهر الحالي.", "info");
      }
    } catch (error) {
      setDashboardMessage(error.message || "تعذر إضافة المصروف.", "error");
    } finally {
      dom.submitExpenseButton?.removeAttribute("disabled");
    }
  }

  async function handleBudgetSubmit(event) {
    event.preventDefault();

    try {
      const updatedProfile = await db.updateBudget(dom.budgetInput?.value);
      state.profile = updatedProfile;
      renderSummary();
      closeBudgetModal();
      showToast("تم تحديث الميزانية بنجاح.", "success");
    } catch (error) {
      setDashboardMessage(error.message || "تعذر تحديث الميزانية.", "error");
    }
  }

  async function handleDeleteClick(event) {
    const button = event.target.closest("[data-delete-expense]");

    if (!button) {
      return;
    }

    const expenseId = button.getAttribute("data-delete-expense");

    try {
      await db.deleteExpenseById(expenseId);
      state.expenses = state.expenses.filter(function filterExpense(expense) {
        return String(expense.id) !== String(expenseId);
      });
      renderAll();
      showToast("تم حذف المصروف.", "success");
    } catch (error) {
      setDashboardMessage(error.message || "تعذر حذف المصروف.", "error");
    }
  }

  function bindEvents() {
    dom.logoutButton?.addEventListener("click", async function handleLogout() {
      try {
        await auth.signOut();
      } catch (error) {
        setDashboardMessage(error.message || "تعذر تسجيل الخروج.", "error");
      }
    });

    dom.expenseForm?.addEventListener("submit", handleExpenseSubmit);
    dom.budgetForm?.addEventListener("submit", handleBudgetSubmit);
    dom.expenseList?.addEventListener("click", handleDeleteClick);

    dom.expenseSearch?.addEventListener("input", function handleSearch() {
      state.searchTerm = String(dom.expenseSearch.value || "").trim().toLowerCase();
      renderExpensesList();
    });

    dom.filterButtons?.forEach(function registerFilter(button) {
      button.addEventListener("click", function applyFilter() {
        state.activeFilter = button.getAttribute("data-filter-button") || "all";

        dom.filterButtons.forEach(function syncClass(otherButton) {
          otherButton.classList.toggle("is-active", otherButton === button);
        });

        renderExpensesList();
      });
    });

    dom.openBudgetModalButton?.addEventListener("click", openBudgetModal);
    dom.closeBudgetModalButton?.addEventListener("click", closeBudgetModal);
    dom.budgetModal?.addEventListener("click", function closeOnOverlay(event) {
      if (event.target === dom.budgetModal) {
        closeBudgetModal();
      }
    });
  }

  async function initializeDashboard() {
    if (document.body?.dataset?.page !== "dashboard") {
      return;
    }

    cacheDom();
    updateMonthLabels();

    if (dom.expenseDate) {
      dom.expenseDate.value = utils.toISODate(new Date());
    }

    if (!config.isConfigured) {
      setDashboardMessage(config.getMissingConfigMessage(), "error");
      return;
    }

    try {
      state.session = await auth.getCurrentSession();

      if (!state.session?.user) {
        windowObject.location.href = "index.html";
        return;
      }

      bindEvents();
      await loadDashboardData();
    } catch (error) {
      setDashboardMessage(error.message || "تعذر تهيئة لوحة التحكم.", "error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeDashboard);
  } else {
    initializeDashboard();
  }
})(window);
