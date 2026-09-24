/* 发布环境认证：使用 Vercel API 与 Supabase Auth，不使用页面内的演示账号。 */
(() => {
  const tokenKey = 'futures-content-engine:supabase-access-token';
  const authFetch = async (path, options = {}) => {
    const token = localStorage.getItem(tokenKey);
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };
  const setLoginError = message => { document.getElementById('loginError').textContent = message || ''; };
  const applyProfile = profile => {
    currentAccount = {
      id: profile.employeeNo || profile.id,
      chineseName: profile.displayName,
      name: profile.emailPrefix,
      role: profile.role,
      department: profile.department || ''
    };
    localStorage.setItem(sessionStoreKey, currentAccount.id);
    updateLoginUi();
  };

  const originalUpdateLoginUi = updateLoginUi;
  updateLoginUi = function () {
    originalUpdateLoginUi();
    document.querySelector('[data-user-action="password"]')?.remove();
    const canEditShared = currentAccount?.role === 'developer';
    const isPersonalLibrary = caseMain.classList.contains('personal');
    document.getElementById('addCaseBtn').hidden = !canEditShared && !isPersonalLibrary;
    document.getElementById('manageCaseBtn').hidden = !canEditShared && !isPersonalLibrary;
  };

  const originalRenderAccountAdmin = renderAccountAdmin;
  renderAccountAdmin = async function () {
    if (currentAccount?.role === 'developer' && localStorage.getItem(tokenKey)) {
      const { response, body } = await authFetch('/api/accounts');
      if (response.ok && Array.isArray(body.data)) {
        accounts = body.data.map(item => ({
          id: item.employee_no || item.email_prefix,
          chineseName: item.display_name,
          name: item.email_prefix,
          role: item.role,
          department: item.department || ''
        }));
      }
    }
    return originalRenderAccountAdmin();
  };

  const loginBrand = loginModal.querySelector('.login-brand');
  loginBrand.querySelector('p').textContent = '请输入工号及密码。账号由测试环境统一配置。';
  loginModal.querySelector('label').firstChild.textContent = '工号';
  const loginInput = document.getElementById('loginId');
  loginInput.type = 'text';
  loginInput.inputMode = 'numeric';
  loginInput.pattern = '[0-9]*';
  loginInput.placeholder = '请输入工号';

  document.getElementById('confirmLogin').onclick = async () => {
    const employeeNo = loginInput.value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!/^\d+$/.test(employeeNo) || !password) return setLoginError('请输入工号和密码。');
    const button = document.getElementById('confirmLogin');
    button.disabled = true;
    button.textContent = '登录中…';
    setLoginError('');
    try {
      const login = await authFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ employeeNo, password }) });
      if (!login.response.ok) return setLoginError(login.body.error || '登录失败，请稍后重试。');
      localStorage.setItem(tokenKey, login.body.accessToken);
      const me = await authFetch('/api/me');
      if (!me.response.ok) {
        localStorage.removeItem(tokenKey);
        return setLoginError(me.body.error || '账号尚未配置使用权限，请联系开发者。');
      }
      applyProfile(me.body.data);
      loginModal.close();
      toast(`欢迎登录，${me.body.data.emailPrefix}`);
    } catch (error) {
      setLoginError('无法连接登录服务，请检查 Vercel 环境变量。');
    } finally {
      button.disabled = false;
      button.textContent = '登录';
    }
  };

  document.addEventListener('click', event => {
    if (event.target.closest('[data-user-action="logout"]')) localStorage.removeItem(tokenKey);
    if (currentAccount?.role === 'developer' || caseMain.classList.contains('personal')) return;
    const restricted = event.target.closest('#addCaseBtn, #manageCaseBtn, [data-folder-action], [data-case-action="edit"], [data-case-action="delete"], [data-case-action="move"]');
    if (restricted) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toast('普通使用者仅可维护个人知识库内容。');
    }
  }, true);

  document.querySelectorAll('.library-tab').forEach(tab => tab.addEventListener('click', () => setTimeout(updateLoginUi, 0)));

  const restoreSession = async () => {
    const token = localStorage.getItem(tokenKey);
    localStorage.removeItem(sessionStoreKey);
    currentAccount = null;
    if (!token) return updateLoginUi();
    const me = await authFetch('/api/me');
    if (!me.response.ok) {
      localStorage.removeItem(tokenKey);
      return updateLoginUi();
    }
    applyProfile(me.body.data);
  };
  restoreSession();
})();
