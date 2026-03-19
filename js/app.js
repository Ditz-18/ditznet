/* ─── DITZ NET — app.js ─── */

// ─── STORAGE HELPERS ───
const DB = {
  get: (k, fallback = null) => {
    try { const v = localStorage.getItem('ditznet_' + k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set: (k, v) => { try { localStorage.setItem('ditznet_' + k, JSON.stringify(v)); } catch { toast('Storage penuh!', 'error'); } },
  remove: (k) => localStorage.removeItem('ditznet_' + k)
};

// ─── STATE ───
let vouchers    = DB.get('vouchers', []);
let profiles    = DB.get('profiles', []);
let categories  = DB.get('categories', []);
let types       = DB.get('types', ['Reguler', 'VIP', 'VVIP']);
let template    = DB.get('template', null);
let imgTemplate = DB.get('imgTemplate', null);
let templateMode = 'code';
let filteredVouchers = [];
let csvPreviewData = [];
let selectedVouchers = new Set();
let currentPage = 'dashboard';
let imgFields = [];
let editingImgField = null;
let dragState = null;
let autoBackupTimer = null;

// ─── NAVIGATION ───
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bnav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));
  currentPage = page;
  const titles = {
    dashboard: ['Dashboard', 'Ringkasan sistem voucher'],
    vouchers:  ['Voucher', 'Kelola semua data voucher'],
    profiles:  ['Profil', 'Manajemen profil hotspot'],
    categories:['Kategori', 'Manajemen kategori voucher'],
    import:    ['Import CSV', 'Import data dari Mikhmon'],
    template:  ['Template', 'Pengaturan template cetak'],
    print:     ['Cetak Voucher', 'Print & export PDF'],
    backup:    ['Backup & Restore', 'Manajemen data sistem'],
    about:     ['Tentang', 'Informasi aplikasi DITZ NET'],
  };
  const [t, s] = titles[page] || ['DITZ NET', ''];
  document.getElementById('pageTitle').textContent = t;
  document.getElementById('pageSubtitle').textContent = s;
  // Re-render relevant pages
  if (page === 'dashboard') renderDashboard();
  if (page === 'vouchers') renderVouchers();
  if (page === 'profiles') renderProfiles();
  if (page === 'categories') renderCategories();
  if (page === 'print') { populatePrintFilters(); updatePrintPreview(); }
  if (page === 'backup') renderBackupHistory();
  if (page === 'template') loadTemplateEditor();
}

function toggleMobileMenu() {
  const m = document.getElementById('mobileMoreMenu');
  m.style.display = m.style.display === 'none' ? 'flex' : 'none';
}

// ─── CLOCK ───
function startClock() {
  const el = document.getElementById('datetimeClock');
  const update = () => {
    const now = new Date();
    el.textContent = now.toLocaleString('id-ID', { weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  };
  update();
  setInterval(update, 1000);
}

// ─── TOAST ───
function toast(msg, type = 'info', duration = 3000) {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type]}"></i> ${msg}`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ─── MODAL ───
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// ─── SAVE HELPERS ───
function saveAll() {
  DB.set('vouchers', vouchers);
  DB.set('profiles', profiles);
  DB.set('categories', categories);
  DB.set('types', types);
}

// ─── DASHBOARD ───
function renderDashboard() {
  const total = vouchers.length;
  const printed = vouchers.filter(v => v.status === 'printed' || v.printedAt).length;
  const active  = vouchers.filter(v => v.status === 'active').length;
  const revenue = vouchers.reduce((sum, v) => sum + (parseFloat(v.price) || 0), 0);

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-printed').textContent = printed;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-revenue').textContent = 'Rp ' + revenue.toLocaleString('id-ID');

  // Category bars
  const catEl = document.getElementById('categoryBars');
  const catMap = {};
  vouchers.forEach(v => { catMap[v.category] = (catMap[v.category] || 0) + 1; });
  const catEntries = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
  const colors = ['var(--accent-cyan)','var(--accent-purple)','var(--accent-orange)','var(--accent-green)','var(--accent-pink)','var(--accent-yellow)'];
  if (catEntries.length === 0) {
    catEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Belum ada data</p></div>';
  } else {
    catEl.innerHTML = catEntries.map(([cat, cnt], i) => `
      <div class="cat-bar-item">
        <div class="cat-bar-top"><span>${cat || 'Tidak dikategorikan'}</span><span style="color:var(--text-muted)">${cnt} voucher</span></div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${Math.round(cnt/total*100)}%;background:${colors[i%colors.length]}"></div></div>
      </div>`).join('');
  }

  // Type pills
  const typeEl = document.getElementById('typePills');
  const typeMap = {};
  vouchers.forEach(v => { typeMap[v.type] = (typeMap[v.type] || 0) + 1; });
  const typeEntries = Object.entries(typeMap);
  const typeIcons = { 'Reguler':'fa-user', 'VIP':'fa-star', 'VVIP':'fa-crown' };
  if (typeEntries.length === 0) {
    typeEl.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Belum ada data</p></div>';
  } else {
    typeEl.innerHTML = typeEntries.map(([t, cnt], i) => `
      <div class="type-pill">
        <div class="type-pill-left">
          <i class="fa-solid ${typeIcons[t] || 'fa-tag'}" style="color:${colors[i%colors.length]}"></i>
          <span>${t || '-'}</span>
        </div>
        <span class="type-pill-count">${cnt}</span>
      </div>`).join('');
  }

  // Recent vouchers (last 10)
  const tbody = document.getElementById('recentBody');
  const recent = [...vouchers].reverse().slice(0, 10);
  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fa-solid fa-inbox"></i><p>Belum ada voucher</p></td></tr>';
  } else {
    tbody.innerHTML = recent.map(v => `
      <tr>
        <td><span style="font-family:var(--font-mono);font-size:.82rem">${v.username}</span></td>
        <td>${v.profile || '-'}</td>
        <td>${v.category || '-'}</td>
        <td>${v.type || '-'}</td>
        <td style="font-family:var(--font-mono)">Rp ${(parseFloat(v.price)||0).toLocaleString('id-ID')}</td>
        <td><span class="badge badge-${v.status || 'active'}">${statusLabel(v.status)}</span></td>
      </tr>`).join('');
  }
}

function statusLabel(s) {
  return { active:'Aktif', printed:'Tercetak', used:'Digunakan' }[s] || 'Aktif';
}

// ─── VOUCHERS ───
function renderVouchers() {
  populateVoucherFilters();
  filterVouchers();
}

function populateVoucherFilters() {
  const cats = [...new Set(vouchers.map(v => v.category).filter(Boolean))];
  const typs = [...new Set(vouchers.map(v => v.type).filter(Boolean))];
  const catSel = document.getElementById('filterCategory');
  const typSel = document.getElementById('filterType');
  catSel.innerHTML = '<option value="">Semua Kategori</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
  typSel.innerHTML = '<option value="">Semua Jenis</option>' + typs.map(t => `<option value="${t}">${t}</option>`).join('');
}

function filterVouchers() {
  const q     = document.getElementById('voucherSearch').value.toLowerCase();
  const cat   = document.getElementById('filterCategory').value;
  const type  = document.getElementById('filterType').value;
  const stat  = document.getElementById('filterStatus').value;
  filteredVouchers = vouchers.filter(v => {
    const matchQ   = !q || v.username.toLowerCase().includes(q) || (v.password||'').toLowerCase().includes(q) || (v.comment||'').toLowerCase().includes(q);
    const matchCat = !cat  || v.category === cat;
    const matchTyp = !type || v.type === type;
    const matchStat = !stat || (v.status || 'active') === stat;
    return matchQ && matchCat && matchTyp && matchStat;
  });
  const tbody = document.getElementById('voucherBody');
  document.getElementById('voucherCount').textContent = `${filteredVouchers.length} voucher`;
  if (filteredVouchers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><i class="fa-solid fa-inbox"></i><p>Tidak ada voucher ditemukan</p></td></tr>';
    return;
  }
  tbody.innerHTML = filteredVouchers.map(v => `
    <tr>
      <td><input type="checkbox" class="v-check" value="${v.id}" onchange="handleCheck(this)"/></td>
      <td><span style="font-family:var(--font-mono);font-size:.82rem;color:var(--accent-cyan)">${v.username}</span></td>
      <td><span style="font-family:var(--font-mono);font-size:.82rem">${v.password || '-'}</span></td>
      <td>${v.profile || '-'}</td>
      <td>${v.category || '-'}</td>
      <td><span style="color:${typeColor(v.type)}">${v.type || '-'}</span></td>
      <td style="font-family:var(--font-mono)">Rp ${(parseFloat(v.price)||0).toLocaleString('id-ID')}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${v['time-limit'] || '-'}</td>
      <td><span class="badge badge-${v.status||'active'}">${statusLabel(v.status)}</span></td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn-icon" onclick="editVoucher('${v.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon" onclick="singlePrint('${v.id}')" title="Cetak"><i class="fa-solid fa-print"></i></button>
          <button class="btn-icon danger" onclick="deleteVoucher('${v.id}')" title="Hapus"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

function typeColor(t) {
  const map = { 'Reguler':'var(--text-primary)', 'VIP':'var(--accent-yellow)', 'VVIP':'var(--accent-purple)' };
  return map[t] || 'var(--text-muted)';
}

function handleCheck(cb) {
  if (cb.checked) selectedVouchers.add(cb.value);
  else selectedVouchers.delete(cb.value);
  document.getElementById('bulkActions').style.display = selectedVouchers.size > 0 ? 'flex' : 'none';
}

function toggleCheckAll() {
  const all = document.getElementById('checkAll').checked;
  document.querySelectorAll('.v-check').forEach(cb => {
    cb.checked = all;
    if (all) selectedVouchers.add(cb.value);
    else selectedVouchers.delete(cb.value);
  });
  document.getElementById('bulkActions').style.display = selectedVouchers.size > 0 ? 'flex' : 'none';
}

function openAddVoucher() {
  populateVoucherDropdowns('');
  openModal('modalAddVoucher');
}

function populateVoucherDropdowns(prefix) {
  const p = document.getElementById(prefix + 'v_profile');
  const c = document.getElementById(prefix + 'v_category');
  const t = document.getElementById(prefix + 'v_type');
  if (p) p.innerHTML = '<option value="">-- Pilih Profil --</option>' + profiles.map(pr => `<option value="${pr.name}">${pr.name}</option>`).join('');
  if (c) c.innerHTML = '<option value="">-- Pilih Kategori --</option>' + categories.map(ca => `<option value="${ca.name}">${ca.name}</option>`).join('');
  if (t) t.innerHTML = '<option value="">-- Pilih Jenis --</option>' + types.map(ty => `<option value="${ty}">${ty}</option>`).join('');
}

function saveVoucher() {
  const username = document.getElementById('v_username').value.trim();
  const password = document.getElementById('v_password').value.trim();
  const profile  = document.getElementById('v_profile').value;
  const category = document.getElementById('v_category').value;
  const type     = document.getElementById('v_type').value;
  if (!username) return toast('Username wajib diisi', 'error');
  if (!profile)  return toast('Pilih profil terlebih dahulu', 'error');
  if (!category) return toast('Pilih kategori terlebih dahulu', 'error');
  if (!type)     return toast('Pilih jenis voucher', 'error');
  const v = {
    id: Date.now().toString(),
    username,
    password,
    profile,
    category,
    type,
    price:          document.getElementById('v_price').value || '0',
    'time-limit':   document.getElementById('v_timelimit').value,
    'uptime-limit': document.getElementById('v_uptimelimit').value,
    'shared-users': document.getElementById('v_shared').value || '1',
    server:         document.getElementById('v_server').value,
    comment:        document.getElementById('v_comment').value,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  vouchers.push(v);
  DB.set('vouchers', vouchers);
  closeModal('modalAddVoucher');
  clearVoucherForm('v_');
  toast('Voucher berhasil ditambahkan', 'success');
  if (currentPage === 'vouchers') renderVouchers();
  if (currentPage === 'dashboard') renderDashboard();
}

function clearVoucherForm(prefix) {
  ['username','password','price','timelimit','uptimelimit','shared','server','comment'].forEach(f => {
    const el = document.getElementById(prefix + f);
    if (el) el.value = '';
  });
}

function editVoucher(id) {
  const v = vouchers.find(v => v.id === id);
  if (!v) return;
  document.getElementById('ev_id').value = id;
  document.getElementById('ev_username').value = v.username || '';
  document.getElementById('ev_password').value = v.password || '';
  document.getElementById('ev_price').value = v.price || '';
  document.getElementById('ev_timelimit').value = v['time-limit'] || '';
  document.getElementById('ev_uptimelimit').value = v['uptime-limit'] || '';
  document.getElementById('ev_shared').value = v['shared-users'] || '1';
  document.getElementById('ev_server').value = v.server || '';
  document.getElementById('ev_comment').value = v.comment || '';
  document.getElementById('ev_status').value = v.status || 'active';
  populateVoucherDropdowns('e');
  document.getElementById('ev_profile').value = v.profile || '';
  document.getElementById('ev_category').value = v.category || '';
  document.getElementById('ev_type').value = v.type || '';
  openModal('modalEditVoucher');
}

function updateVoucher() {
  const id = document.getElementById('ev_id').value;
  const idx = vouchers.findIndex(v => v.id === id);
  if (idx === -1) return;
  vouchers[idx] = {
    ...vouchers[idx],
    username: document.getElementById('ev_username').value.trim(),
    password: document.getElementById('ev_password').value.trim(),
    profile:  document.getElementById('ev_profile').value,
    category: document.getElementById('ev_category').value,
    type:     document.getElementById('ev_type').value,
    price:    document.getElementById('ev_price').value,
    'time-limit': document.getElementById('ev_timelimit').value,
    'uptime-limit': document.getElementById('ev_uptimelimit').value,
    'shared-users': document.getElementById('ev_shared').value,
    server:   document.getElementById('ev_server').value,
    comment:  document.getElementById('ev_comment').value,
    status:   document.getElementById('ev_status').value,
    updatedAt: new Date().toISOString()
  };
  DB.set('vouchers', vouchers);
  closeModal('modalEditVoucher');
  toast('Voucher diperbarui', 'success');
  renderVouchers();
}

function deleteVoucher(id) {
  if (!confirm('Hapus voucher ini?')) return;
  vouchers = vouchers.filter(v => v.id !== id);
  DB.set('vouchers', vouchers);
  toast('Voucher dihapus', 'info');
  renderVouchers();
  if (currentPage === 'dashboard') renderDashboard();
}

function bulkDelete() {
  if (!selectedVouchers.size) return;
  if (!confirm(`Hapus ${selectedVouchers.size} voucher terpilih?`)) return;
  vouchers = vouchers.filter(v => !selectedVouchers.has(v.id));
  selectedVouchers.clear();
  DB.set('vouchers', vouchers);
  toast('Voucher dihapus', 'info');
  renderVouchers();
}

function bulkPrint() {
  const ids = [...selectedVouchers];
  const toPrint = vouchers.filter(v => ids.includes(v.id));
  doPrint(toPrint);
}

function singlePrint(id) {
  const v = vouchers.find(v => v.id === id);
  if (v) doPrint([v]);
}

// ─── PROFILES ───
function saveProfile() {
  const name = document.getElementById('p_name').value.trim();
  if (!name) return toast('Nama profil wajib diisi', 'error');
  if (profiles.find(p => p.name === name)) return toast('Nama profil sudah ada', 'error');
  profiles.push({
    id: Date.now().toString(),
    name,
    desc: document.getElementById('p_desc').value,
    upload: document.getElementById('p_upload').value,
    download: document.getElementById('p_download').value,
    color: document.getElementById('p_color').value,
    createdAt: new Date().toISOString()
  });
  DB.set('profiles', profiles);
  closeModal('modalAddProfile');
  toast('Profil ditambahkan', 'success');
  renderProfiles();
}

function renderProfiles() {
  const grid = document.getElementById('profileGrid');
  if (profiles.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-layer-group"></i><p>Belum ada profil. Tambahkan profil pertama Anda.</p></div>';
    return;
  }
  grid.innerHTML = profiles.map(p => `
    <div class="profile-card">
      <div class="card-color-bar" style="background:${p.color}"></div>
      <div class="card-head">
        <div>
          <div class="card-title">${p.name}</div>
          <div class="card-desc">${p.desc || 'Tidak ada deskripsi'}</div>
        </div>
        <div class="card-actions">
          <button class="btn-icon danger" onclick="deleteProfile('${p.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="card-meta">
        ${p.upload ? `<span class="meta-chip"><i class="fa-solid fa-arrow-up"></i> ${p.upload}</span>` : ''}
        ${p.download ? `<span class="meta-chip"><i class="fa-solid fa-arrow-down"></i> ${p.download}</span>` : ''}
        <span class="meta-chip">${vouchers.filter(v=>v.profile===p.name).length} voucher</span>
      </div>
    </div>`).join('');
}

function deleteProfile(id) {
  const p = profiles.find(pr => pr.id === id);
  if (p && vouchers.some(v => v.profile === p.name)) {
    if (!confirm(`Profil "${p.name}" digunakan oleh voucher. Tetap hapus?`)) return;
  } else if (!confirm('Hapus profil ini?')) return;
  profiles = profiles.filter(pr => pr.id !== id);
  DB.set('profiles', profiles);
  toast('Profil dihapus', 'info');
  renderProfiles();
}

// ─── CATEGORIES ───
function saveCategory() {
  const name = document.getElementById('c_name').value.trim();
  if (!name) return toast('Nama kategori wajib diisi', 'error');
  if (categories.find(c => c.name === name)) return toast('Nama kategori sudah ada', 'error');
  categories.push({
    id: Date.now().toString(),
    name,
    desc: document.getElementById('c_desc').value,
    icon: document.getElementById('c_icon').value || 'fa-tag',
    color: document.getElementById('c_color').value,
    createdAt: new Date().toISOString()
  });
  DB.set('categories', categories);
  closeModal('modalAddCategory');
  toast('Kategori ditambahkan', 'success');
  renderCategories();
}

function renderCategories() {
  const grid = document.getElementById('categoryGrid');
  if (categories.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-tags"></i><p>Belum ada kategori. Tambahkan kategori terlebih dahulu.</p></div>';
    return;
  }
  grid.innerHTML = categories.map(c => `
    <div class="category-card">
      <div class="card-color-bar" style="background:${c.color}"></div>
      <div class="card-head">
        <div style="display:flex;align-items:center;gap:10px">
          <i class="fa-solid ${c.icon}" style="color:${c.color};font-size:1.2rem"></i>
          <div>
            <div class="card-title">${c.name}</div>
            <div class="card-desc">${c.desc || ''}</div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-icon danger" onclick="deleteCategory('${c.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="card-meta">
        <span class="meta-chip">${vouchers.filter(v=>v.category===c.name).length} voucher</span>
      </div>
    </div>`).join('');
}

function deleteCategory(id) {
  if (!confirm('Hapus kategori ini?')) return;
  categories = categories.filter(c => c.id !== id);
  DB.set('categories', categories);
  toast('Kategori dihapus', 'info');
  renderCategories();
}

// ─── CSV IMPORT ───
function handleCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;
    parseCSV(text);
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return toast('File CSV tidak valid atau kosong', 'error');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  csvPreviewData = lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return obj;
  }).filter(row => row['name'] || row['username']);

  // Render preview
  const head = document.getElementById('csvHead');
  const body = document.getElementById('csvBody');
  const showCols = ['name','password','profile','comment','time-limit','uptime-limit','shared-users','server','local-address','bytes-out','bytes-in','limit-uptime'];
  const avail = headers.filter(h => showCols.includes(h) || showCols.map(s=>s).includes(h));
  const displayCols = avail.length ? avail : headers.slice(0,8);
  head.innerHTML = '<tr>' + displayCols.map(h => `<th>${h}</th>`).join('') + '</tr>';
  body.innerHTML = csvPreviewData.slice(0,50).map(row =>
    '<tr>' + displayCols.map(h => `<td style="white-space:nowrap">${row[h] || '-'}</td>`).join('') + '</tr>'
  ).join('');
  document.getElementById('csvPreviewPanel').style.display = 'block';
  toast(`${csvPreviewData.length} baris data ditemukan`, 'info');
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

function importCSVData() {
  if (csvPreviewData.length === 0) return toast('Tidak ada data untuk diimpor', 'error');
  let added = 0, skipped = 0;
  csvPreviewData.forEach(row => {
    const username = row['name'] || row['username'] || '';
    if (!username) { skipped++; return; }
    if (vouchers.find(v => v.username === username)) { skipped++; return; }
    // Auto-add profile if not exists
    const profileName = row['profile'] || 'Default';
    if (profileName && !profiles.find(p => p.name === profileName)) {
      profiles.push({ id: Date.now().toString() + Math.random(), name: profileName, desc: 'Import dari CSV', color: '#00f5ff', createdAt: new Date().toISOString() });
    }
    vouchers.push({
      id: Date.now().toString() + Math.random(),
      username,
      password: row['password'] || '',
      profile:  row['profile'] || 'Default',
      comment:  row['comment'] || '',
      'time-limit':   row['time-limit'] || '',
      'uptime-limit': row['uptime-limit'] || row['limit-uptime'] || '',
      'bytes-out':    row['bytes-out'] || '',
      'bytes-in':     row['bytes-in'] || '',
      'shared-users': row['shared-users'] || '1',
      server:         row['server'] || '',
      'local-address':row['local-address'] || '',
      category: '', type: 'Reguler', price: '0',
      status: 'active', createdAt: new Date().toISOString(), source: 'csv'
    });
    added++;
  });
  DB.set('vouchers', vouchers);
  DB.set('profiles', profiles);
  toast(`${added} voucher berhasil diimpor, ${skipped} dilewati`, 'success');
  cancelCSV();
}

function cancelCSV() {
  csvPreviewData = [];
  document.getElementById('csvPreviewPanel').style.display = 'none';
  document.getElementById('csvFile').value = '';
}

// ─── TEMPLATE ───
const DEFAULT_TEMPLATE = `<div style="font-family:Arial,sans-serif;border:2px solid #333;padding:12px;width:180px;border-radius:8px;background:#fff;color:#000">
  <div style="text-align:center;font-weight:bold;font-size:14px;border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:8px">
    {ssid}
  </div>
  <div style="font-size:11px;margin-bottom:4px"><b>User:</b> {username}</div>
  <div style="font-size:11px;margin-bottom:4px"><b>Pass:</b> {password}</div>
  <div style="font-size:11px;margin-bottom:4px"><b>Profil:</b> {profile}</div>
  <div style="font-size:11px;margin-bottom:4px"><b>Durasi:</b> {time-limit}</div>
  <div style="font-size:11px;margin-bottom:8px"><b>Harga:</b> Rp {price}</div>
  <div style="text-align:center;font-size:9px;color:#666;border-top:1px dashed #ccc;padding-top:6px">{date}</div>
</div>`;

function loadTemplateEditor() {
  const saved = DB.get('template', null);
  document.getElementById('templateCode').value = saved ? saved.code : DEFAULT_TEMPLATE;
  const paperSz = DB.get('paperSettings', { size:'A4', cols:2, ssid:'DITZ NET' });
  document.getElementById('paperSize').value = paperSz.size || 'A4';
  document.getElementById('voucherCols').value = paperSz.cols || 2;
  document.getElementById('ssidName').value = paperSz.ssid || 'DITZ NET';
}

function insertVar(v) {
  const ta = document.getElementById('templateCode');
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0,s) + v + ta.value.slice(e);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + v.length;
}

function saveTemplate() {
  DB.set('template', { code: document.getElementById('templateCode').value, mode: 'code' });
  DB.set('paperSettings', {
    size: document.getElementById('paperSize').value,
    cols: parseInt(document.getElementById('voucherCols').value) || 2,
    ssid: document.getElementById('ssidName').value || 'DITZ NET'
  });
  toast('Template disimpan', 'success');
}

function resetTemplate() {
  document.getElementById('templateCode').value = DEFAULT_TEMPLATE;
  toast('Template direset ke default', 'info');
}

function previewTemplate() {
  const sampleVoucher = { username:'user001', password:'pass001', profile:'1Mbps', 'time-limit':'1d', price:'5000', category:'Reguler', type:'VIP', date: new Date().toLocaleDateString('id-ID'), ssid: document.getElementById('ssidName').value || 'DITZ NET', comment:'Preview', server:'hs1' };
  const html = renderVoucherHtml(document.getElementById('templateCode').value, sampleVoucher);
  document.getElementById('templatePreviewContent').innerHTML = '<div style="padding:20px;display:flex;justify-content:center">' + html + '</div>';
  openModal('modalTemplatePreview');
}

function updatePaperSize() {
  const v = document.getElementById('paperSize').value;
  const cd = document.getElementById('customSize');
  cd.style.display = v === 'custom' ? 'flex' : 'none';
}

function switchTemplateTab(tab) {
  templateMode = tab;
  document.getElementById('templateCodeMode').style.display = tab === 'code' ? 'block' : 'none';
  document.getElementById('templateImgMode').style.display  = tab === 'img'  ? 'block' : 'none';
  document.getElementById('tabCodeBtn').classList.toggle('active', tab === 'code');
  document.getElementById('tabImgBtn').classList.toggle('active', tab === 'img');
}

// ─── IMAGE TEMPLATE EDITOR ───
function handleBgUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = document.getElementById('editorBg');
    img.src = ev.target.result;
    document.getElementById('bgUploadZone').style.display = 'none';
    document.getElementById('editorCanvasWrap').style.display = 'block';
    imgFields = DB.get('imgFields', []);
    renderImgFields();
  };
  reader.readAsDataURL(file);
}

function addTextField() {
  const sel = document.getElementById('fieldVarSelect').value;
  const color = document.getElementById('fieldColor').value;
  const size  = parseInt(document.getElementById('fieldFontSize').value) || 14;
  const label = sel === 'custom' ? 'Teks Bebas' : sel;
  imgFields.push({ id: Date.now().toString(), var: sel, label, color, size, x: 20, y: 20 });
  renderImgFields();
}

function renderImgFields() {
  const layer = document.getElementById('fieldsLayer');
  layer.innerHTML = '';
  imgFields.forEach(f => {
    const el = document.createElement('div');
    el.className = 'draggable-field';
    el.id = 'field_' + f.id;
    el.textContent = f.var === 'custom' ? f.label : f.var;
    el.style.left  = f.x + 'px';
    el.style.top   = f.y + 'px';
    el.style.color = f.color;
    el.style.fontSize = f.size + 'px';
    el.addEventListener('mousedown', startDrag);
    layer.appendChild(el);
  });
}

function startDrag(e) {
  const el = e.currentTarget;
  const id = el.id.replace('field_','');
  const field = imgFields.find(f => f.id === id);
  if (!field) return;
  const canvas = document.getElementById('editorCanvas');
  const rect = canvas.getBoundingClientRect();
  const offX = e.clientX - rect.left - field.x;
  const offY = e.clientY - rect.top  - field.y;
  const onMove = (e2) => {
    field.x = Math.max(0, e2.clientX - rect.left - offX);
    field.y = Math.max(0, e2.clientY - rect.top  - offY);
    el.style.left = field.x + 'px';
    el.style.top  = field.y + 'px';
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function saveImgTemplate() {
  DB.set('imgFields', imgFields);
  DB.set('imgTemplateBg', document.getElementById('editorBg').src);
  toast('Template gambar disimpan', 'success');
}

// ─── PRINT ───
function populatePrintFilters() {
  const cats = [...new Set(vouchers.map(v => v.category).filter(Boolean))];
  const typs = [...new Set(vouchers.map(v => v.type).filter(Boolean))];
  const catSel = document.getElementById('printFilterCat');
  const typSel = document.getElementById('printFilterType');
  catSel.innerHTML = '<option value="">Semua Kategori</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
  typSel.innerHTML = '<option value="">Semua Jenis</option>' + typs.map(t => `<option value="${t}">${t}</option>`).join('');
}

function getPrintVouchers() {
  const cat  = document.getElementById('printFilterCat').value;
  const type = document.getElementById('printFilterType').value;
  const stat = document.getElementById('printFilterStatus').value;
  return vouchers.filter(v => {
    const matchCat  = !cat  || v.category === cat;
    const matchType = !type || v.type === type;
    const matchStat = !stat || (v.status || 'active') === stat;
    return matchCat && matchType && matchStat;
  });
}

function updatePrintPreview() {
  const vl = getPrintVouchers();
  const settings = DB.get('paperSettings', { size:'A4', cols:2, ssid:'DITZ NET' });
  const tpl = DB.get('template', null);
  const code = tpl ? tpl.code : DEFAULT_TEMPLATE;
  const cols = settings.cols || 2;
  const area = document.getElementById('printPreviewArea');
  if (vl.length === 0) { area.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Tidak ada voucher yang sesuai filter</p></div>'; return; }
  const grid = `<div style="display:grid;grid-template-columns:repeat(${cols},auto);gap:12px;padding:16px">` +
    vl.map(v => renderVoucherHtml(code, voucherVars(v, settings.ssid))).join('') + '</div>';
  area.innerHTML = `<div style="background:#fff;padding:16px;border-radius:8px">${grid}</div>`;
}

function voucherVars(v, ssid) {
  return {
    ...v,
    ssid: ssid || 'DITZ NET',
    date: new Date().toLocaleDateString('id-ID'),
    price: (parseFloat(v.price)||0).toLocaleString('id-ID')
  };
}

function renderVoucherHtml(tplCode, vars) {
  return tplCode.replace(/\{(\S+?)\}/g, (_, key) => vars[key] !== undefined ? vars[key] : `{${key}}`);
}

function printVouchers() {
  const vl = getPrintVouchers();
  if (vl.length === 0) return toast('Tidak ada voucher untuk dicetak', 'error');
  const settings = DB.get('paperSettings', { size:'A4', cols:2, ssid:'DITZ NET' });
  const tpl = DB.get('template', null);
  const code = tpl ? tpl.code : DEFAULT_TEMPLATE;
  const cols = settings.cols || 2;
  const paperSizes = { A4:'210mm,297mm', A5:'148mm,210mm', A6:'105mm,148mm', custom: (settings.customW||210)+'mm,'+(settings.customH||297)+'mm' };
  const [pw, ph] = (paperSizes[settings.size] || paperSizes.A4).split(',');
  const html = `<!DOCTYPE html><html><head><title>Cetak Voucher DITZ NET</title><style>
    @page{size:${pw} ${ph};margin:10mm}body{margin:0;font-family:Arial,sans-serif}
    .grid{display:grid;grid-template-columns:repeat(${cols},auto);gap:10px;padding:5mm}
  </style></head><body><div class="grid">` +
    vl.map(v => renderVoucherHtml(code, voucherVars(v, settings.ssid))).join('') +
    `</div></body></html>`;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
  if (document.getElementById('markPrinted').checked) {
    vl.forEach(v => { const idx = vouchers.findIndex(x => x.id === v.id); if (idx !== -1) { vouchers[idx].status = 'printed'; vouchers[idx].printedAt = new Date().toISOString(); } });
    DB.set('vouchers', vouchers);
    toast(`${vl.length} voucher ditandai tercetak`, 'info');
  }
}

function doPrint(list) {
  const settings = DB.get('paperSettings', { size:'A4', cols:2, ssid:'DITZ NET' });
  const tpl = DB.get('template', null);
  const code = tpl ? tpl.code : DEFAULT_TEMPLATE;
  const cols = settings.cols || 2;
  const html = `<!DOCTYPE html><html><head><title>Print Voucher</title><style>@page{margin:10mm}body{margin:0;font-family:Arial}.grid{display:grid;grid-template-columns:repeat(${cols},auto);gap:10px;padding:5mm}</style></head><body><div class="grid">` +
    list.map(v => renderVoucherHtml(code, voucherVars(v, settings.ssid))).join('') +
    '</div></body></html>';
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

function exportPDF() {
  toast('Membuka dialog cetak untuk export PDF — pilih "Save as PDF"', 'info');
  setTimeout(() => printVouchers(), 800);
}

// ─── BACKUP ───
function exportBackup() {
  const data = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    vouchers, profiles, categories, types,
    template: DB.get('template'),
    paperSettings: DB.get('paperSettings'),
    imgFields: DB.get('imgFields'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ditznet-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  // Save to backup history
  const history = DB.get('backupHistory', []);
  history.unshift({ date: new Date().toISOString(), count: vouchers.length });
  DB.set('backupHistory', history.slice(0, 10));
  toast('Backup berhasil diunduh', 'success');
  renderBackupHistory();
}

function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.vouchers) return toast('File backup tidak valid', 'error');
      if (!confirm(`Restore backup dari ${new Date(data.exportedAt).toLocaleDateString('id-ID')}?\nIni akan MENGGANTI semua data saat ini.`)) return;
      vouchers   = data.vouchers   || [];
      profiles   = data.profiles   || [];
      categories = data.categories || [];
      types      = data.types      || ['Reguler','VIP','VVIP'];
      if (data.template) DB.set('template', data.template);
      if (data.paperSettings) DB.set('paperSettings', data.paperSettings);
      saveAll();
      toast('Data berhasil dipulihkan', 'success');
      renderDashboard();
    } catch { toast('File backup rusak atau tidak valid', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function renderBackupHistory() {
  const history = DB.get('backupHistory', []);
  const el = document.getElementById('backupHistory');
  if (!history.length) { el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Belum ada riwayat backup</p></div>'; return; }
  el.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px">' + history.map(h => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-panel);border:1px solid var(--border);border-radius:9px;font-size:.83rem">
      <div style="display:flex;align-items:center;gap:10px">
        <i class="fa-solid fa-file-code" style="color:var(--accent-cyan)"></i>
        <span>${new Date(h.date).toLocaleString('id-ID')}</span>
      </div>
      <span style="color:var(--text-muted)">${h.count} voucher</span>
    </div>`).join('') + '</div>';
}

function confirmReset() {
  if (!confirm('PERINGATAN: Semua data akan dihapus permanen!\nPastikan sudah backup terlebih dahulu.\n\nLanjutkan reset?')) return;
  if (!confirm('Konfirmasi sekali lagi — yakin ingin menghapus SEMUA data?')) return;
  vouchers = []; profiles = []; categories = []; types = ['Reguler','VIP','VVIP'];
  DB.remove('vouchers'); DB.remove('profiles'); DB.remove('categories');
  DB.remove('template'); DB.remove('paperSettings'); DB.remove('imgFields'); DB.remove('backupHistory');
  DB.set('types', types);
  toast('Semua data berhasil direset', 'info');
  renderDashboard();
}

// ─── DRAG ZONE (import page) ───
function setupDropZone() {
  const zone = document.getElementById('importZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--accent-cyan)'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = ev => parseCSV(ev.target.result);
      reader.readAsText(file);
    } else { toast('Hanya file CSV yang diterima', 'error'); }
  });
}

// ─── INIT ───
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  renderDashboard();
  setupDropZone();

  // Populate dropdowns on voucher modal open
  document.querySelector('[onclick="openModal(\'modalAddVoucher\')"]')?.addEventListener('click', () => {
    populateVoucherDropdowns('');
  });

  // Auto-save types if empty
  if (!DB.get('types')) DB.set('types', types);
});