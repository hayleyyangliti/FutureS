/* Server-backed authentication for the release package. */
(() => {
  const tokenKey = 'futures-content-engine:access-token';
  const loginButton = document.getElementById('confirmLogin');
  const loginError = document.getElementById('loginError');
  const emailInput = document.getElementById('loginId');
  const passwordInput = document.getElementById('loginPassword');
  const legacyUpdate = updateLoginUi;

  function tokenHeaders() {
    const token = localStorage.getItem(tokenKey);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function asAccount(profile) {
    return {
      id: profile.employee_no,
      chineseName: profile.display_name,
      name: profile.email_prefix,
      role: profile.role || 'user',
    };
  }

  function showSavedNews() {
    // The button only reads the snapshot through our Vercel API; it never
    // starts an OmniData collection job.
    document.getElementById('refreshHotspots')?.click();
  }

  // Do not display the hard-coded demo cards while real data is loading.
  renderHotspotItems([]);
  document.getElementById('lastRefresh').textContent = '等待读取服务器资讯';

  updateLoginUi = function updateLoginUiWithServerSession() {
    legacyUpdate();
    const menu = document.querySelector('.nav-user .user-menu');
    if (currentAccount && menu) {
      menu.innerHTML = '<button data-user-action="logout">退出登录</button>';
      menu.querySelector('[data-user-action="logout"]').onclick = () => {
        localStorage.removeItem(tokenKey);
        currentAccount = null;
        updateLoginUi();
        toast('已退出登录');
      };
    }
  };

  async function restoreSession() {
    if (!localStorage.getItem(tokenKey)) return;
    try {
      const response = await fetch('/api/me', { headers: tokenHeaders() });
      if (!response.ok) throw new Error('session expired');
      const { profile } = await response.json();
      currentAccount = asAccount(profile);
      updateLoginUi();
      showSavedNews();
    } catch (_) {
      localStorage.removeItem(tokenKey);
      currentAccount = null;
      updateLoginUi();
    }
  }

  loginButton.onclick = async () => {
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    loginError.textContent = '';
    if (!/^[^\s@]+@gtht\.com$/.test(email) || !password) {
      loginError.textContent = '请输入完整的 @gtht.com 邮箱和密码。';
      return;
    }
    loginButton.disabled = true;
    loginButton.textContent = '登录中…';
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'INVALID_CREDENTIALS');
      localStorage.setItem(tokenKey, data.accessToken);
      currentAccount = asAccount(data.profile);
      loginModal.close();
      passwordInput.value = '';
      updateLoginUi();
      toast(`欢迎登录，${currentAccount.chineseName || currentAccount.name}`);
      showSavedNews();
    } catch (error) {
      loginError.textContent = error.message === 'SUPABASE_KEY_REJECTED'
        ? '登录服务暂不可用，请联系开发者。'
        : error.message === 'PROFILE_NOT_FOUND' ? '账号资料尚未配置，请联系开发者。'
        : '邮箱或密码错误，或登录服务暂不可用，请重试。';
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = '登录';
    }
  };

  restoreSession();

  const dashboardImport = document.createElement('script');
  dashboardImport.src = '/dashboard-import.js';
  dashboardImport.defer = true;
  document.head.append(dashboardImport);

  const qualityAndLearning = document.createElement('script');
  qualityAndLearning.src = '/quality-and-learning.js';
  qualityAndLearning.defer = true;
  document.head.append(qualityAndLearning);
})();
