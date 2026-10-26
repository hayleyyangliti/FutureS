/* Release supplement: accurate visible counts and per-user production learning. */
(() => {
  const learningKey = 'futures-content-engine:skill-learning:v1';
  const readLearning = () => { try { return JSON.parse(localStorage.getItem(learningKey) || '{"titles":[],"formats":[],"feedback":[]}'); } catch (_) { return { titles: [], formats: [], feedback: [] }; } };
  const saveLearning = value => localStorage.setItem(learningKey, JSON.stringify(value));
  const short = value => Array.from(String(value || '').trim()).slice(0, 80).join('');
  function profile() {
    const value = readLearning(), titles = value.titles.slice(0, 8).join('；'), formats = value.formats.slice(0, 5).join('、');
    return `用户已保存 ${value.feedback.length} 次生产结果。偏好内容形式：${formats || '未形成'}。近期保留主题：${titles || '未形成'}。保持专业、精炼、事实优先；仅将其作为表达偏好，不替代事实核验。`;
  }
  function learn() {
    const title = short(document.getElementById('draftTitle')?.innerText), type = short(document.getElementById('draftType')?.textContent);
    if (!title) return;
    const value = readLearning();
    value.titles = [title, ...value.titles.filter(x => x !== title)].slice(0, 12);
    if (type) value.formats = [type, ...value.formats.filter(x => x !== type)].slice(0, 8);
    value.feedback = [{ at: new Date().toISOString(), title, type }, ...value.feedback].slice(0, 40);
    saveLearning(value);
    renderSkillLearning();
  }
  function updateCount(items) {
    const count = Array.isArray(items) ? items.length : document.querySelectorAll('#feedList .feed-card').length;
    document.querySelectorAll('.nav-item[data-page="market-hotspots"] .nav-badge').forEach(node => node.textContent = String(count));
    const feedCount = document.getElementById('feedCount');
    if (feedCount && !document.getElementById('hotspotSearch')?.value) feedCount.textContent = `综合 Top ${count}`;
  }
  function renderSkillLearning() {
    const pane = document.getElementById('admin-skills'); if (!pane || pane.querySelector('.skill-learning-live')) return;
    const value = readLearning(), note = document.createElement('div'); note.className = 'skill-learning-note skill-learning-live';
    note.innerHTML = `<span>↗</span><div><b>基于使用结果的个人优化已启用</b><p>已记录 ${value.feedback.length} 次确认生产结果。下一次生成会将近期保留主题和内容形式作为表达偏好输入给研究、总编辑、写作和审查 Agent；不会覆盖事实核验或合规规则。</p></div>`;
    pane.prepend(note);
  }
  const originalRender = typeof renderHotspotItems === 'function' ? renderHotspotItems : null;
  if (originalRender) {
    renderHotspotItems = function renderHotspotItemsWithCount(items) { originalRender(items); updateCount(items); };
  }
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/api/ai/generate') && init?.body) {
      try { const body = JSON.parse(init.body); body.learningProfile = profile(); init = { ...init, body: JSON.stringify(body) }; } catch (_) {}
    }
    const response = await nativeFetch(input, init);
    if (url.includes('/api/ai/generate') && response.ok) {
      response.clone().json().then(payload => {
        if (!Array.isArray(payload.agentRun)) return;
        const flow = document.getElementById('agentWorkflow');
        if (flow) flow.title = `本次已真实完成：${payload.agentRun.map(x => x.name).join(' → ')}`;
      }).catch(() => {});
    }
    return response;
  };
  ['saveBtn', 'pushSaveBtn', 'copyBtn', 'copyPushContent'].forEach(id => document.getElementById(id)?.addEventListener('click', () => setTimeout(learn, 0)));
  const removeTop5 = () => document.querySelectorAll('*').forEach(node => { if (node.children.length === 0 && node.textContent.trim() === '市场热点中心Top5') node.remove(); });
  removeTop5(); new MutationObserver(removeTop5).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', renderSkillLearning); setTimeout(renderSkillLearning, 1200);
})();
