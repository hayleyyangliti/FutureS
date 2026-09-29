/* Server-backed authentication for the release package. */
(() => {
  const tokenKey = 'futures-content-engine:access-token';
  const loginButton = document.getElementById('confirmLogin');
  const loginError = document.getElementById('loginError');
  const employeeInput = document.getElementById('loginId');
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
    } catch (_) {
      localStorage.removeItem(tokenKey);
      currentAccount = null;
      updateLoginUi();
    }
  }

  loginButton.onclick = async () => {
    const employeeNo = employeeInput.value.replace(/\s/g, '');
    const password = passwordInput.value;
    loginError.textContent = '';
    if (!/^\d+$/.test(employeeNo) || !password) {
      loginError.textContent = '请输入工号和密码。';
      return;
    }
    loginButton.disabled = true;
    loginButton.textContent = '登录中…';
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeNo, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'INVALID_CREDENTIALS');
      localStorage.setItem(tokenKey, data.accessToken);
      currentAccount = asAccount(data.profile);
      loginModal.close();
      passwordInput.value = '';
      updateLoginUi();
      toast(`欢迎登录，${currentAccount.name}`);
    } catch (_) {
      loginError.textContent = '工号或密码错误，或系统暂未完成配置。';
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = '登录';
    }
  };

  restoreSession();
})();
