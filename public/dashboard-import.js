/* Imported BI snapshots for the Operations Workspace data board. */
(() => {
  const data = {
    marketing: [
      ['2609220002','未命名作品-5',7598,7598,39],['2609220002','玩转APP V5.6.0',7598,7598,39],['2609220001','第22期模拟大赛规则',6970,6970,43],['2603020002','伊以专题',6838,6047,24],['2407090001','717',6260,6260,33],['2407090001','国泰君安期货717期货节',6260,6260,33],['2512260003','贵金属年度最专题-微信',5172,4419,43],['2606300001','2026年年报一览',4707,4707,25],['2608310002','原油0831能化',4690,4443,19],['2510170003','热门品种-0915-1014-掌上期货',4368,4368,51],['2609100002','原油专题页0910',4030,3853,31],['2608310003','未命名作品-5',3922,3690,41],['2608310003','非农数据前瞻0831',3922,3690,41],['2608100003','财报有色专题-君弘',3362,3362,62],['2607080001','原油专题0708',3168,3010,24],['2607080001','黄金走势梳理-副本1',3168,3010,24],['2601090004','热门品种-0109-股指-君弘',3111,3111,12],['2603190001','原油黄金对比专题',3107,3107,29],['2510310001','生猪鸡蛋行情专题-超体',2939,2930,62],['2510310001','生猪鸡蛋行情专题-君弘',2939,2930,62]
    ].map(([workId,title,views,visitors,duration]) => ({ workId,title,views,visitors,duration })),
    analysis: [
      ['M国铜指数大幅拉升，负反馈能否会再度击垮“逆转”？','3f0f6f676ff02c5e5958ca3b04fc147',1793],['【沪铜】高位下，有色的故事还在继续么？','50ed3dac68a36b10e8891227af7587b9',531],['玻璃持续下挫，四季度会有反弹驱动吗？','84b5a843dd5879aec4467625d5d2cc78',521],['收盘观点：焦煤高位偏空 生猪加速下跌','abbb8b87bee56c4b7d277ce56b31b3',403],['时隔一年，黄金再次向下破位','b43cc047ac79a7a993eb9e37650b751c',395],['两天被抹去100点的螺纹，弱在哪里？','83af94d5e5ec67526ccf13ccb0266d69',381],['低位的PVC，韧性从哪来，能持续多久？','d77654d3d43a3d1980b71876d4e425',326],['收盘观点：市场维持反击 注意波动风险','133e945354b2fd8fab08e9d4002b2901',322],['机构预计母猪产能在未来2个季度继续显著去化','50ed0a3282ae80fd594ebd31d371716d',306],['突破110美元大关！中东战火点燃油市','c6ece203a5c07bb749fcc5af8f6aa49a4',232],['现货金价跌破4000美元关口，避险市场资金为何抛售黄金？','c92ce5d5f43e7fc7572c3a70f2fe28525',133],['需求旺季虽暂告收尾，黄金仍显韧性','e995dea0aaa669a56dcf2cc6f64692d4',128],['10月21日，国际夜核快报：谈判官员称有关伊朗与美国谈判','7c7b23c5faa8a17b9e246483dbae79b2',125],['从期决大选到交易员消息：美元测试市场对推CPI期货','75a805febbbb9b6416bbdcbf88e77804',123],['持续暗杀可能对伊朗为一次小规模“空袭”行动','a47cdbdf679873061b38aa99164a8ba2',118],['全球央行正悄然以逾常态风格的速度增持黄金','d1ae4b1f6db8951eb00fa300308757d3',117],['周末要闻汇总：上证指数，科创综指期起有新变化','7e019f40fb9368ed86a93753a7eb3f58',113],['鹏都和前高和金属大类现阶段的交易最重要','6b5b1c015831784e6e48a0414025dcfb',107],['今日油脂油料要闻，截至10月18日当周，美国大豆收割率','8665f223775f8431182476b1dfe75c7',107],['今日橡与贵费要闻，中国纸浆主流港样本库存量','50612e39dd04c5961ef6dbe5e1aba031',106]
    ].map(([title,id,views]) => ({ title,id,views })),
    push: [
      ['黄金再次向下破位！','lucy_content-sqts_b43cc047ac79a7a',192013,310,316,'0.16%'],['烧碱再延下跌趋势','lucy_content-sqts_83af94d5e5ec675',191689,280,285,'0.15%'],['玻璃能否低位反弹？','lucy_content-sqts_84b5a843dd5879a',191911,303,309,'0.16%'],['PVC反弹，韧性何来？','lucy_content-sqts_d77654d3d43a3d',191227,179,189,'0.09%'],['焦煤走出四连阴','lucy_content-sqts_a6a67f1906e8133',187591,256,264,'0.14%'],['第22期模拟赛首周战报来啦！','lucy_xxzt-sqts_5a254bacc602f424e',187414,130,138,'0.07%'],['沪锡盘中跌破37万关口','lucy_content-sqts_076deca17d2995f',189914,216,224,'0.11%'],['白银创近3个月新低','lucy_content-sqts_06006dc3c6a3116',190176,269,276,'0.14%'],['今夜公布！CPI接力沃什讲话','lucy_xxzt-sqts_6a01b2b91fe4403b',188435,280,288,'0.15%'],['全球最大黄金买家之一宣布减持','lucy_content-sqts_cc48de8d1ac5a65',187509,317,329,'0.17%'],['碳酸锂跌超8%！失守11万关口','lucy_content-sqts_56d0c4b4864b9fd',186541,235,241,'0.13%'],['马棕产量、库存创历史记录','lucy_content-sqts_8fda6afdda0a4b3',186856,284,294,'0.15%'],['俄乌和平新希望？特朗普宣告双方同意','lucy_content-sqts_1d142b7c925950b',186150,278,281,'0.15%'],['恭喜您，获奖啦','lucy_cl-sqts_2109541036478541826',166,7,7,'4.22%'],['节后归来，乙二醇为何掉队？','lucy_content-sqts_74e7a2a08e505ef',190837,250,257,'0.13%'],['燃料油日内涨超16%！','lucy_content-sqts_20e3feabe7b5f5a9',190134,159,161,'0.08%'],['节后首日贵金属集体承压','lucy_content-sqts_e8c141f43568639',190429,261,267,'0.14%']
    ].map(([title,id,recipients,clickUsers,clicks,reachRate]) => ({ title,id,recipients,pushes:recipients,successUsers:recipients,successCount:recipients,clickUsers,clicks,successRate:'100.00%',reachRate,active:0 }))
  };

  const config = {
    marketing: { title:'营销页面数据', note:'作品累计浏览量、累计浏览人数与人均时长。', columns:[['workId','作品 ID'],['title','作品名'],['views','累计浏览量'],['visitors','累计浏览人数'],['duration','人均时长(秒)']] },
    analysis: { title:'基本面分析数据', note:'内容引擎生产的基本面分析内容，按近 7 日浏览量排序。', columns:[['title','内容标题'],['id','内容 ID'],['views','近7日浏览量']] },
    push: { title:'Push 数据', note:'Push 发送、点击和触达指标；可横向滚动查看全部字段。', columns:[['title','标题'],['id','event_id'],['recipients','推送人数'],['pushes','推送次数'],['successUsers','发送成功人数'],['successCount','发送成功次数'],['clickUsers','点击人数'],['clicks','点击次数'],['successRate','发送成功率'],['reachRate','触达率'],['active','发送消息后1h激活生卡券人数']] }
  };
  const state = { page:{marketing:1,analysis:1,push:1}, query:'', sort:{marketing:{key:'views',dir:-1},analysis:{key:'views',dir:-1},push:{key:'recipients',dir:-1}} };
  const format = value => typeof value === 'number' ? Number(value).toLocaleString('zh-CN') : value;
  const short = value => String(value).length > 26 ? `${String(value).slice(0,26)}…` : value;
  const style = document.createElement('style');
  style.textContent = '.imported-dashboard{padding-bottom:18px}.imported-head{padding-bottom:12px}.imported-table-wrap{margin:0 20px;overflow:auto;border:1px solid #e5ebf3;border-radius:10px}.imported-table{width:100%;min-width:760px;border-collapse:collapse}.imported-table th{background:#315ce8;color:#fff;text-align:left;padding:11px 12px;font-size:12px;white-space:nowrap}.imported-table td{padding:10px 12px;border-bottom:1px solid #eef2f6;color:#334f6a;font-size:13px;white-space:nowrap}.imported-table tbody tr:nth-child(even) td{background:#f8fafc}.imported-table tbody tr{cursor:pointer}.imported-table tbody tr:hover td{background:#edf5ff}.imported-table tbody tr:last-child td{border-bottom:0}.data-sort{border:0;background:transparent;color:inherit;padding:0;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap}.data-sort span{margin-left:6px;opacity:.65}.data-sort.active span{opacity:1}.dash-cell-title{max-width:390px;overflow:hidden;text-overflow:ellipsis;font-weight:650;color:#1f4269!important}.dash-cell-id{font-family:Consolas,monospace;font-size:11px!important;color:#486b90!important}.dash-sequence{color:#1769e0!important;font-weight:750}.dashboard-pagination{margin:14px 20px 0;display:flex;align-items:center;justify-content:space-between;color:#7c8fa2;font-size:12px}.dashboard-pagination>div{display:flex;align-items:center;gap:5px}.dashboard-pagination button{min-width:27px;height:27px;border:1px solid #d9e3ef;border-radius:6px;background:#fff;color:#52708d}.dashboard-pagination button:disabled{opacity:.42}.dashboard-pagination select{border:1px solid #d9e3ef;border-radius:6px;background:#fff;color:#52708d;padding:5px 7px;font-size:12px}@media(max-width:900px){.imported-table-wrap{margin:0 12px}.dashboard-pagination{margin-left:12px;margin-right:12px}.imported-table{min-width:680px}}';
  document.head.append(style);

  function table(kind) {
    const settings = config[kind], query = state.query.trim().toLowerCase(), order = state.sort[kind];
    const all = data[kind].filter(row => !query || Object.values(row).join(' ').toLowerCase().includes(query)).sort((a,b) => {
      const av=a[order.key], bv=b[order.key];
      return typeof av === 'number' ? (av-bv)*order.dir : String(av).localeCompare(String(bv),'zh-CN')*order.dir;
    });
    const size=10, pages=Math.max(1,Math.ceil(all.length/size));
    state.page[kind]=Math.min(state.page[kind],pages);
    const page=state.page[kind], visible=all.slice((page-1)*size,page*size);
    const head=settings.columns.map(([key,label]) => `<th><button class="data-sort ${order.key===key?'active':''}" data-sort-key="${key}">${label}<span>${order.key===key?(order.dir===-1?'↓':'↑'):'↕'}</span></button></th>`).join('');
    const cols=settings.columns.length+(kind==='analysis'?1:0);
    const rows=visible.length ? visible.map((row,index) => `<tr data-imported-row="${(page-1)*size+index}">${kind==='analysis'?`<td class="dash-sequence">${(page-1)*size+index+1}</td>`:''}${settings.columns.map(([key]) => `<td class="dash-cell-${key}">${key==='id'?`<span title="${escapeHtml(row[key])}">${escapeHtml(short(row[key]))}</span>`:escapeHtml(format(row[key]))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols}"><div class="rank-empty">没有找到匹配的数据</div></td></tr>`;
    return `<section class="imported-dashboard"><div class="rank-head imported-head"><div><h2>${settings.title}</h2><p>${settings.note}</p></div><span class="rank-source">● BI 数据 · 截图导入</span></div><label class="rank-search"><span>⌕</span><input id="importedSearch" value="${escapeHtml(state.query)}" placeholder="搜索标题、作品 ID 或 event_id"></label><div class="imported-table-wrap"><table class="imported-table"><thead><tr>${kind==='analysis'?'<th>序号</th>':''}${head}</tr></thead><tbody>${rows}</tbody></table></div><div class="dashboard-pagination"><span>共 ${all.length} 条</span><div><button data-page-action="first" ${page===1?'disabled':''}>‹‹</button><button data-page-action="prev" ${page===1?'disabled':''}>‹</button><span>${page} / ${pages}</span><button data-page-action="next" ${page===pages?'disabled':''}>›</button><button data-page-action="last" ${page===pages?'disabled':''}>››</button></div><select><option>10条/页</option></select></div></section>`;
  }

  function openRow(kind, row) {
    const settings=config[kind];
    let modal=document.getElementById('importedDataModal');
    if(!modal){modal=document.createElement('dialog');modal.id='importedDataModal';modal.className='sql-modal';document.body.append(modal)}
    modal.innerHTML=`<div class="modal-head"><div><h3>${escapeHtml(row.title||row.workId)}</h3><small>${settings.title} · 完整指标</small></div><button class="modal-close" id="closeImportedDataModal" type="button">×</button></div><div class="modal-body"><div class="rank-metric-grid">${settings.columns.filter(([key])=>key!=='title').map(([key,label])=>`<div class="rank-metric"><small>${label}</small><b>${escapeHtml(format(row[key]))}</b></div>`).join('')}</div></div>`;
    document.getElementById('closeImportedDataModal').onclick=()=>modal.close();
    modal.showModal();
  }

  const originalRender = renderRankBoard;
  renderRankBoard = function renderImportedDashboard() {
    const kind=activeRank;
    if(!['marketing','analysis','push'].includes(kind)) { originalRender(); return; }
    const labels={news:'资讯热度排行榜',analysis:'基本面分析',push:'Push',marketing:'营销页面'};
    dashboardPane.innerHTML=`<div class="dashboard-topline"><h1 class="dashboard-page-title">数据看板</h1><div class="platform-scope"><span class="platform-logo">超</span><span><b>当前监测平台：超体 APP</b><small>国泰君安期货 APP · 其他平台后续接入</small></span></div></div><section class="rank-board"><div class="rank-tabs">${rankTabOrder.map(key=>`<button class="rank-tab ${key===kind?'active':''}" data-rank-tab="${key}">${labels[key]}</button>`).join('')}</div>${table(kind)}</section>`;
    dashboardPane.querySelectorAll('[data-rank-tab]').forEach(button=>button.onclick=()=>{activeRank=button.dataset.rankTab;state.query='';renderRankBoard()});
    const input=dashboardPane.querySelector('#importedSearch');
    input.oninput=event=>{state.query=event.target.value;state.page[kind]=1;renderRankBoard();const next=dashboardPane.querySelector('#importedSearch');next.focus();next.setSelectionRange(state.query.length,state.query.length)};
    dashboardPane.querySelectorAll('[data-sort-key]').forEach(button=>button.onclick=()=>{const sort=state.sort[kind],key=button.dataset.sortKey;if(sort.key===key)sort.dir*=-1;else{sort.key=key;sort.dir=-1}state.page[kind]=1;renderRankBoard()});
    dashboardPane.querySelectorAll('[data-page-action]').forEach(button=>button.onclick=()=>{const all=data[kind].filter(row=>!state.query.trim()||Object.values(row).join(' ').toLowerCase().includes(state.query.trim().toLowerCase())),pages=Math.max(1,Math.ceil(all.length/10));if(button.dataset.pageAction==='first')state.page[kind]=1;if(button.dataset.pageAction==='prev')state.page[kind]--;if(button.dataset.pageAction==='next')state.page[kind]++;if(button.dataset.pageAction==='last')state.page[kind]=pages;renderRankBoard()});
    dashboardPane.querySelectorAll('[data-imported-row]').forEach(element=>element.onclick=()=>{const order=state.sort[kind],all=data[kind].filter(row=>!state.query.trim()||Object.values(row).join(' ').toLowerCase().includes(state.query.trim().toLowerCase())).sort((a,b)=>{const av=a[order.key],bv=b[order.key];return typeof av==='number'?(av-bv)*order.dir:String(av).localeCompare(String(bv),'zh-CN')*order.dir});openRow(kind,all[Number(element.dataset.importedRow)])});
  };
  renderRankBoard();
})();
