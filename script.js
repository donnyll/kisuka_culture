/* ====== CONFIG: Supabase ====== */
const SUPABASE_URL = "https://wzkkaiajzjiswdupkgna.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2thaWFqemppc3dkdXBrZ25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMDI5MDUsImV4cCI6MjA3NTY3ODkwNX0.U1PxAxHJd6sAdQkHXZiTWYN0lbb33xJPRDK2ALjzO-Q";
const STORAGE_BUCKET = "kisuka_culture";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ====== Helpers ====== */
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const money = n => "RM" + (Number(n)||0).toFixed(2);
const uid = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const iconify = ()=> { try{ lucide.createIcons(); }catch(e){} };
function showToast(msg, type='success'){
  const c = $("#toast-container");
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast-notification ${type==='success'?'bg-gray-800':'bg-red-600'} text-white text-sm font-semibold py-2 px-4 rounded-full shadow-lg`;
  el.textContent = msg;
  c.innerHTML = ""; c.appendChild(el);
}

/* ====== State ====== */
const KEYS = { CART:'unmeki_cart', WISHLIST:'unmeki_wishlist', COUPON:'unmeki_coupon', SHIPPING:'unmeki_shipping' };
let cart = JSON.parse(localStorage.getItem(KEYS.CART) || "[]");
let wishlist = JSON.parse(localStorage.getItem(KEYS.WISHLIST) || "[]");
let coupon = JSON.parse(localStorage.getItem(KEYS.COUPON) || "null");
let shipping = localStorage.getItem(KEYS.SHIPPING) || "standard";

// UI state
let ALL_PRODUCTS = [];                 // current page content
let TOTAL_PRODUCTS = 0;                // count from server
let CURRENT_FILTER = { category:'Semua', term:'', sort:'popular' };
let currentPage = 1;
const pageSize = 8;                    // 8 item/halaman

/* ====== AUTH GATE ====== */
// Sembunyikan/tonjolkan pautan Admin ikut status login+role
async function applyAuthGate(){
  const { data: { user } } = await supabase.auth.getUser();
  const links = $$('[data-view="admin"]'); // top nav + mobile nav + drawer
  const isAdmin = !!user && user.user_metadata?.role === "admin";

  links.forEach(a => a.style.display = isAdmin ? "" : "none");

  // Jika sedang berada di admin-view tapi bukan admin → pulangkan ke Home
  const adminView = $("#admin-view");
  const isOnAdmin = adminView && adminView.classList.contains("active");
  if (!isAdmin && isOnAdmin){
    switchView("home");
    showToast("Anda perlu login sebagai admin untuk akses panel ini", "error");
  }
  return isAdmin;
}

// Render UI login/logout di sudut kanan Panel Admin
async function renderAuthArea(){
  const { data: { user } } = await supabase.auth.getUser();
  const area = $("#auth-area");
  if (!area) return;

  if (user && user.user_metadata?.role === "admin"){
    area.innerHTML = `
      <span class="text-sm text-gray-600 hidden md:inline">Log masuk sebagai <strong>${user.email}</strong></span>
      <button id="logout-btn" class="btn-light">Log Keluar</button>
    `;
    $("#logout-btn")?.addEventListener("click", async ()=>{
      await supabase.auth.signOut();
      await applyAuthGate();
      showToast("Log keluar");
      switchView("home");
    });
  } else {
    area.innerHTML = `
      <form id="login-form" class="flex gap-2">
        <input type="email" id="login-email" placeholder="admin@email.com" class="border rounded p-2 text-sm" required>
        <input type="password" id="login-pass" placeholder="kata laluan" class="border rounded p-2 text-sm" required>
        <button class="btn-primary"><i data-lucide="log-in" class="w-4 h-4 mr-1"></i>Log Masuk</button>
      </form>
    `;
    iconify();
    $("#login-form")?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const email = $("#login-email").value.trim();
      const password = $("#login-pass").value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return showToast(error.message, 'error');
      showToast("Berjaya log masuk");
      await applyAuthGate();
      renderAuthArea();
      await renderAdmin(); // segarkan papan pemuka
    });
  }
}

/* ====== SERVER DATA: Products & Orders ====== */
async function fetchProductsServer({ page=1, term="", category="Semua", sort="popular" }={}){
  const from = (page-1)*pageSize;
  const to = from + pageSize - 1;
  let query = supabase.from('products').select('*', { count: 'exact' });

  if (term.trim()) query = query.ilike('name', `%${term}%`);
  if (category && category !== 'Semua') query = query.eq('category', category);

  // Sorting
  if (sort==='price-asc')        query = query.order('price', { ascending:true });
  else if (sort==='price-desc')  query = query.order('price', { ascending:false });
  else if (sort==='newest')      query = query.order('created_at', { ascending:false });
  else                           query = query.order('created_at', { ascending:false }); // default/popular

  // Pagination
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error){ showToast("Gagal memuat produk", 'error'); return { rows:[], count:0 }; }
  return { rows: data||[], count: count||0 };
}

async function fetchOrders(){
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role!=='admin') return [];
  const { data, error } = await supabase.from('orders').select('*').order('date', { ascending:false });
  if (error){ showToast("Gagal memuat pesanan", 'error'); return []; }
  return data || [];
}

async function createOrUpdateProduct(record, file){
  let image_url = record.image_url?.trim() || "";
  if (file){
    const ext = (file.name.split('.').pop()||'jpg').toLowerCase();
    const path = `${(record.category||'umum').toLowerCase()}/${uid()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert:false });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    image_url = pub.publicUrl;
  }
  const payload = {
    name: record.name, description: record.description, price: Number(record.price),
    category: record.category, stock: Number(record.stock), image_url
  };
  if (record.id){
    const { error } = await supabase.from('products').update(payload).eq('id', record.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('products').insert(payload);
    if (error) throw error;
  }
}

async function deleteProduct(id){
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

async function createOrder(order){
  const { error } = await supabase.from('orders').insert(order);
  if (error) throw error;
}

/* ====== Rendering Produk & UI ====== */
function productBadges(p){
  const b=[]; if (p.stock===0) b.push('<span class="text-[11px] bg-gray-800 text-white px-2 py-0.5 rounded">HABIS</span>');
  if (p.stock>0 && p.stock<5) b.push('<span class="text-[11px] bg-red-600 text-white px-2 py-0.5 rounded">LOW</span>');
  return b.join(' ');
}
function card(p){
  const wishOn = wishlist.includes(String(p.id));
  return `
  <div class="product-card bg-white rounded-lg shadow-md overflow-hidden group" data-id="${p.id}">
    <div class="relative">
      <img src="${p.image_url || 'https://placehold.co/600x600?text=Gambar'}" alt="${p.name}" class="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300">
      ${p.stock===0?'<div class="absolute inset-0 bg-black/50 flex items-center justify-center"><span class="text-white font-bold">HABIS DIJUAL</span></div>':''}
      <button data-action="toggle-wishlist" data-id="${p.id}" class="absolute top-2 right-2 bg-white/90 rounded-full p-2 shadow">
        <i data-lucide="${wishOn?'heart-off':'heart'}" class="w-4 h-4 text-pink-600"></i>
      </button>
    </div>
    <div class="p-3 flex flex-col">
      <div class="flex items-center justify-between gap-2">
        <h4 class="font-semibold text-sm text-gray-800 truncate">${p.name}</h4>
        <div class="flex gap-1">${productBadges(p)}</div>
      </div>
      <p class="text-base font-bold text-gray-900 mt-1">${money(p.price)}</p>
      <div class="flex gap-2 mt-3">
        <button data-action="view-detail" data-id="${p.id}" class="flex-1 border rounded-lg text-xs py-2 hover:bg-gray-50">Detail</button>
        <button ${p.stock===0?'disabled':''} data-action="add-to-cart" data-id="${p.id}" class="flex-1 bg-cyan-500 text-white text-xs font-bold py-2 rounded-lg hover:bg-cyan-600 disabled:bg-gray-400">Tambah</button>
      </div>
    </div>
  </div>`;
}
function renderGrid(){
  const grid = $("#all-product-grid");
  if (!grid) return;
  grid.innerHTML = ALL_PRODUCTS.length
    ? ALL_PRODUCTS.map(card).join('')
    : '<p class="col-span-full text-center text-gray-500">Tiada produk ditemui.</p>';
  // featured (home)
  const featured = $("#featured-product-grid");
  if (featured) featured.innerHTML = ALL_PRODUCTS.slice(0,4).map(card).join('');
  iconify();
}
function renderCategories(){
  const wrap = $("#category-filters");
  if (!wrap) return;
  const cats = ['Semua', ...new Set(ALL_PRODUCTS.map(p=>p.category).filter(Boolean))];
  wrap.innerHTML = cats.map(c=> `
    <button data-category="${c}" class="${CURRENT_FILTER.category===c?'bg-cyan-500 text-white':'bg-gray-200 text-gray-700'} px-4 py-2 rounded-full text-sm font-semibold">${c}</button>
  `).join('');
}
function renderPagination(){
  const box = $("#pagination");
  if (!box) return;
  const totalPages = Math.max(1, Math.ceil(TOTAL_PRODUCTS / pageSize));
  let html = "";
  for (let i=1;i<=totalPages;i++){
    html += `<button class="px-3 py-1 rounded ${i===currentPage?'bg-cyan-600 text-white':'bg-gray-200'}" data-page="${i}">${i}</button>`;
  }
  box.innerHTML = html;
}

/* ====== Product Detail ====== */
function renderProductDetail(id){
  const p = ALL_PRODUCTS.find(x=>String(x.id)===String(id));
  const view = $("#product-detail-view");
  if (!view) return;
  if (!p){ view.innerHTML='<p class="p-8 text-center">Produk tidak ditemui.</p>'; return; }
  view.innerHTML = `
    <section class="max-w-5xl mx-auto p-4 md:p-8">
      <a href="#" data-view="all-products" class="nav-link text-sm text-cyan-600 mb-4 inline-flex items-center">
        <i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i> Kembali
      </a>
      <div class="grid md:grid-cols-2 gap-8">
        <div><img src="${p.image_url || 'https://placehold.co/800x800?text=Gambar'}" alt="${p.name}" class="w-full rounded-lg shadow-lg"></div>
        <div>
          <h2 class="text-3xl font-extrabold">${p.name}</h2>
          <p class="text-2xl font-bold text-gray-800 my-4">${money(p.price)}</p>
          <p class="text-gray-600">${p.description || ''}</p>
          ${p.stock>0 && p.stock<10 ? `<p class="text-red-600 text-sm mt-2">${p.stock} unit sahaja lagi!</p>`:''}
          <div class="flex gap-2 mt-4">
            <button ${p.stock===0?'disabled':''} data-action="add-to-cart" data-id="${p.id}" class="flex-1 bg-cyan-600 text-white font-semibold py-3 rounded-lg hover:bg-cyan-700 disabled:bg-gray-400">Tambah ke Troli</button>
            <button data-action="toggle-wishlist" data-id="${p.id}" class="px-4 rounded-lg border"><i data-lucide="${wishlist.includes(String(p.id))?'heart-off':'heart'}" class="w-4 h-4 inline mr-1"></i>Wishlist</button>
          </div>
        </div>
      </div>
    </section>
  `;
  iconify();
}

/* ====== CART ====== */
function cartSubtotal(){ return cart.reduce((s,i)=> s + i.price*i.quantity, 0); }
function shippingFee(){ if (coupon?.type==='freeship') return 0; return shipping==='express'?15:8; }
function discountAmount(sub){ if (!coupon) return 0; if (coupon.type==='percent') return sub*(coupon.amount/100); return 0; }
function cartTotal(){ const sub=cartSubtotal(); return Math.max(0, sub-discountAmount(sub)) + shippingFee(); }
function renderCart(){
  const box = $("#cart-items");
  if (box){
    if (cart.length===0) box.innerHTML = '<p class="text-gray-500 text-center mt-8">Troli anda kosong.</p>';
    else {
      box.innerHTML = cart.map(it=>`
        <div class="flex items-center gap-3 mb-4">
          <img src="${it.image_url || 'https://placehold.co/80x80'}" alt="${it.name}" class="w-16 h-16 object-cover rounded-md">
          <div class="flex-grow">
            <p class="text-sm font-semibold truncate">${it.name}</p>
            <div class="flex items-center gap-2 my-1">
              <button data-action="decrement" data-id="${it.id}" class="p-1 w-6 h-6 flex items-center justify-center border rounded-md">-</button>
              <span>${it.quantity}</span>
              <button data-action="increment" data-id="${it.id}" class="p-1 w-6 h-6 flex items-center justify-center border rounded-md">+</button>
            </div>
            <p class="text-sm font-bold">${money(it.price*it.quantity)}</p>
          </div>
          <button data-action="remove-from-cart" data-id="${it.id}" class="p-1 rounded-full self-start"><i data-lucide="trash-2" class="w-4 h-4 text-red-500 pointer-events-none"></i></button>
        </div>
      `).join('');
    }
  }
  const items = cart.reduce((s,i)=>s+i.quantity,0);
  ["#cart-count","#mobile-cart-count"].forEach(sel=>{ const el=$(sel); if (el) el.textContent = items; });
  const subEl=$("#cart-subtotal"); if (subEl) subEl.textContent = money(cartSubtotal());
  const totEl=$("#cart-total");    if (totEl) totEl.textContent = money(cartTotal());
  localStorage.setItem(KEYS.CART, JSON.stringify(cart));
  iconify();
}
function addToCart(p){
  const it = cart.find(x=>String(x.id)===String(p.id));
  if (it){ if (it.quantity<p.stock){ it.quantity++; showToast(`${p.name} ditambah!`); } else return showToast(`Stok ${p.name} tidak mencukupi!`,'error'); }
  else { if (p.stock>0) cart.push({ id:String(p.id), name:p.name, price:p.price, image_url:p.image_url, stock:p.stock, quantity:1 }); }
  renderCart();
}
const removeFromCart = id => { cart = cart.filter(i=>String(i.id)!==String(id)); renderCart(); };
function updateQuantity(id, d){
  const it = cart.find(i=>String(i.id)===String(id)); if (!it) return;
  const q = it.quantity + d; if (q<=0) return removeFromCart(id);
  const p = ALL_PRODUCTS.find(x=>String(x.id)===String(id)); if (q>(p?.stock||0)) return showToast(`Stok ${p?.name||''} tidak mencukupi!`,'error');
  it.quantity=q; renderCart();
}

/* ====== PANELS & NAV ====== */
function togglePanel(id, forceOpen=null){
  const el = document.getElementById(id);
  const overlay = $("#overlay");
  if (!el || !overlay) return;
  const willOpen = forceOpen!==null ? forceOpen : (el.classList.contains('hidden') || el.style.transform);
  if (willOpen){
    if (!id.endsWith('-modal')) overlay.classList.remove('hidden'); else overlay.classList.add('hidden');
    if (id.endsWith('-modal')){ el.classList.add('show'); el.classList.remove('hidden'); }
    else if (id==='search-modal'){ el.style.transform='translateY(0)'; }
    else if (id==='mobile-menu'){ el.style.transform='translateX(0)'; }
    else { el.style.transform='translateX(0)'; }
  } else { closeAllPanels(); }
}
function closeAllPanels(){
  const overlay = $("#overlay"); if (overlay) overlay.classList.add('hidden');
  const mm=$("#mobile-menu"); if (mm) mm.style.transform='translateX(-100%)';
  const cp=$("#cart-panel");  if (cp) cp.style.transform='translateX(100%)';
  const sm=$("#search-modal");if (sm) sm.style.transform='translateY(-100%)';
  ["#product-form-modal","#checkout-modal","#receipt-modal"].forEach(sel=>{
    const el=$(sel); if (!el) return; el.classList.remove('show'); el.classList.add('hidden'); if (sel==="#receipt-modal") el.remove();
  });
}
function switchView(view){
  $$('.view').forEach(v=>v.classList.remove('active'));
  const tgt = document.querySelector(`#${view}-view`);
  if (tgt){ tgt.classList.add('active'); window.scrollTo({ top:0, behavior:'smooth' }); }
}

/* ====== ADMIN Rendering ====== */
async function renderAdmin(){
  const orders = await fetchOrders();
  const tp = $("#admin-total-products"); if (tp) tp.textContent = TOTAL_PRODUCTS;
  const to = $("#admin-total-orders");   if (to) to.textContent = orders.length;
  const totalSales = orders.reduce((s,o)=> s + Number(o.total||0), 0);
  const ts = $("#admin-total-sales");    if (ts) ts.textContent = money(totalSales);

  const list = $("#admin-product-list");
  if (list){
    let html = `
      <table class="min-w-full bg-white rounded-lg overflow-hidden">
        <thead class="bg-gray-50">
          <tr>
            <th class="py-2 px-4 text-left">Nama</th>
            <th class="py-2 px-4 text-left hidden md:table-cell">Kategori</th>
            <th class="py-2 px-4 text-left hidden md:table-cell">Stok</th>
            <th class="py-2 px-4 text-left">Harga</th>
            <th class="py-2 px-4 text-left">Tindakan</th>
          </tr>
        </thead>
        <tbody>`;
    ALL_PRODUCTS.forEach(p=>{
      html += `
        <tr class="text-sm text-gray-700 border-t">
          <td class="py-2 px-4">${p.name}</td>
          <td class="py-2 px-4 hidden md:table-cell">${p.category||'-'}</td>
          <td class="py-2 px-4 hidden md:table-cell">${p.stock}</td>
          <td class="py-2 px-4">${money(p.price)}</td>
          <td class="py-2 px-4">
            <button data-action="edit-product" data-id="${p.id}" class="text-blue-600 mr-2">Edit</button>
            <button data-action="delete-product" data-id="${p.id}" class="text-red-600">Padam</button>
          </td>
        </tr>`;
    });
    html += `</tbody></table>`;
    list.innerHTML = html;
  }

  const orderList = $("#admin-order-list");
  if (orderList){
    if (orders.length===0) orderList.innerHTML = '<p>Tiada pesanan lagi.</p>';
    else {
      orderList.innerHTML = orders.map(o=>`
        <div class="bg-white rounded-lg border p-4 mb-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="font-bold">Pesanan #${o.id}</h4>
            <span class="text-sm text-gray-600">${new Date(o.date).toLocaleString()}</span>
          </div>
          <ul class="text-sm mt-2 list-disc pl-6">
            ${(o.items||[]).map(i=>`<li>${i.qty}x ${i.name} — ${money(i.price*i.qty)}</li>`).join('')}
          </ul>
          <div class="flex items-center justify-between mt-2">
            <p class="font-bold">Jumlah: ${money(o.total)}</p>
            <div class="flex items-center gap-2">
              <label class="text-sm">Status:</label>
              <select data-order="${o.id}" class="order-status border rounded p-1 text-sm">
                ${['Pending','Processing','Shipped','Completed','Cancelled'].map(s=>`<option ${o.status===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      `).join('');
    }
  }
  iconify();
}

/* ====== LOAD CURRENT PAGE ====== */
async function loadPage(){
  const { rows, count } = await fetchProductsServer({
    page: currentPage,
    term: CURRENT_FILTER.term,
    category: CURRENT_FILTER.category,
    sort: CURRENT_FILTER.sort
  });
  ALL_PRODUCTS = rows;
  TOTAL_PRODUCTS = count;
  renderCategories();
  renderGrid();
  renderPagination();
}

/* ====== EVENTS ====== */
document.addEventListener('DOMContentLoaded', async ()=>{
  iconify();
  await applyAuthGate();
  await renderAuthArea();
  await loadPage();
  renderCart();

  // Nav links
  document.body.addEventListener('click', async (e)=>{
    const nav = e.target.closest('.nav-link');
    if (nav && nav.dataset.view){
      e.preventDefault();
      if (nav.dataset.view==='admin'){
        const isAdmin = await applyAuthGate();
        if (!isAdmin) return;
      }
      switchView(nav.dataset.view);
      if (nav.dataset.view==='admin'){ await renderAuthArea(); await renderAdmin(); }
      if (['home','all-products'].includes(nav.dataset.view)) { await loadPage(); }
      closeAllPanels();
    }

    if (e.target.closest('#menu-btn')) togglePanel('mobile-menu');
    if (e.target.closest('#cart-btn') || e.target.closest('#mobile-cart-btn')) togglePanel('cart-panel');
    if (e.target.closest('#search-btn')){ togglePanel('search-modal'); $("#search-input")?.focus(); }
    if (e.target.closest('#close-cart-btn') || e.target.closest('#close-search-btn') || e.target.closest('#overlay')) closeAllPanels();

    // card click → detail
    const cardEl = e.target.closest('.product-card');
    if (cardEl && !e.target.closest('button[data-action]')){ switchView('product-detail'); renderProductDetail(cardEl.dataset.id); }

    // action buttons
    const btn = e.target.closest('button[data-action]');
    if (btn){
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action==='view-detail'){ switchView('product-detail'); renderProductDetail(id); }
      if (action==='toggle-wishlist'){
        const pid = String(id);
        if (wishlist.includes(pid)) wishlist = wishlist.filter(x=>x!==pid);
        else wishlist.push(pid);
        localStorage.setItem(KEYS.WISHLIST, JSON.stringify(wishlist));
        const wc = $("#wishlist-count"); if (wc) wc.textContent = wishlist.length;
        renderGrid(); showToast('Wishlist dikemaskini');
      }
      if (action==='add-to-cart'){ const p = ALL_PRODUCTS.find(x=>String(x.id)===String(id)); if (p) addToCart(p); }
      if (action==='remove-from-cart') removeFromCart(id);
      if (action==='increment') updateQuantity(id,+1);
      if (action==='decrement') updateQuantity(id,-1);
      if (action==='edit-product') openProductForm(id);
      if (action==='delete-product'){
        if (!confirm("Padam produk ini?")) return;
        try{ await deleteProduct(id); showToast('Produk dipadam'); await loadPage(); await renderAdmin(); }
        catch(err){ showToast(err.message||'Gagal padam','error'); }
      }
    }
  });

  // Search + Sort + Category
  $("#search-input")?.addEventListener('input', async (e)=>{
    CURRENT_FILTER.term = e.target.value;
    CURRENT_FILTER.category = 'Semua';
    currentPage = 1;
    switchView('all-products');
    await loadPage();
  });
  $("#category-filters")?.addEventListener('click', async (e)=>{
    if (e.target.tagName==='BUTTON'){
      CURRENT_FILTER.category = e.target.dataset.category;
      currentPage = 1;
      await loadPage();
    }
  });
  $("#sort-select")?.addEventListener('change', async (e)=>{
    CURRENT_FILTER.sort = e.target.value;
    currentPage = 1;
    await loadPage();
  });

  // Pagination
  $("#pagination")?.addEventListener('click', async (e)=>{
    const b = e.target.closest('button[data-page]');
    if (!b) return;
    currentPage = Number(b.dataset.page)||1;
    await loadPage();
  });

  // Cart controls
  $("#checkout-btn")?.addEventListener('click', ()=> { if (cart.length===0) return showToast('Troli anda kosong!', 'error'); togglePanel('checkout-modal', true); });
  $("#close-checkout-modal-btn")?.addEventListener('click', ()=> togglePanel('checkout-modal', false));
  $("#apply-coupon-btn")?.addEventListener('click', ()=>{
    const input = $("#coupon-input"); if (!input) return;
    const code = input.value.trim().toUpperCase();
    let applied=null;
    if (code==='SAVE10') applied={code,type:'percent',amount:10};
    if (code==='FREESHIP'){ if (cartSubtotal()>=80) applied={code,type:'freeship',amount:0}; else return showToast('FREESHIP perlukan min RM80','error'); }
    if (!applied) return showToast('Kupon tidak sah','error');
    coupon=applied; localStorage.setItem(KEYS.COUPON, JSON.stringify(coupon)); renderCart(); showToast(`Kupon ${code} digunakan`);
  });
  $("#shipping-method")?.addEventListener('change', e=>{
    shipping=e.target.value;
    localStorage.setItem(KEYS.SHIPPING, shipping); // ✅ fixed missing quote
    renderCart();
  });

  // Checkout submit
  $("#checkout-form")?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    for (const it of cart){
      const p = ALL_PRODUCTS.find(x=>String(x.id)===String(it.id));
      if (!p || it.quantity > p.stock) return showToast(`Stok ${p?.name||''} tidak mencukupi!`,'error');
    }
    const form = { name:$("#co-name").value.trim(), phone:$("#co-phone").value.trim(), address:$("#co-address").value.trim(), payment:$("#co-payment").value, note:$("#co-note").value.trim() };
    const order = {
      id: uid().toUpperCase(), date: new Date().toISOString(),
      items: cart.map(i=>({ id:i.id, name:i.name, price:i.price, qty:i.quantity })),
      subtotal: cartSubtotal(), shipping, shippingFee: shippingFee(), total: cartTotal(),
      status:'Pending', address: form
    };
    try{
      for (const it of cart){
        const p = ALL_PRODUCTS.find(x=>String(x.id)===String(it.id));
        if (p) await supabase.from('products').update({ stock: p.stock - it.quantity }).eq('id', p.id);
      }
      await createOrder(order);
      cart = []; localStorage.setItem(KEYS.CART, JSON.stringify(cart));
      coupon=null; localStorage.removeItem(KEYS.COUPON);
      renderCart(); togglePanel('checkout-modal', false); closeAllPanels();
      showToast('Pesanan disahkan!'); showReceipt(order);
      await loadPage();
    }catch(err){ showToast(err.message||'Ralat semasa membuat pesanan','error'); }
  });

  // Product form
  $("#add-product-btn")?.addEventListener('click', ()=> openProductForm());
  $("#cancel-product-form-btn")?.addEventListener('click', ()=> togglePanel('product-form-modal', false));
  $("#product-form")?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user || user.user_metadata?.role!=='admin') return showToast("Hanya admin boleh simpan.", 'error');
    const idVal = $("#product-id").value;
    const rec = {
      id: idVal || null,
      name: $("#product-name").value.trim(),
      price: parseFloat($("#product-price").value),
      stock: parseInt($("#product-stock").value,10),
      category: $("#product-category").value.trim(),
      image_url: $("#product-image").value.trim(),
      description: $("#product-description").value.trim()
    };
    const file = $("#product-image-file").files[0] || null;
    try{ await createOrUpdateProduct(rec, file); togglePanel('product-form-modal', false); showToast('Produk disimpan!'); await loadPage(); await renderAdmin(); }
    catch(err){ showToast(err.message||'Gagal simpan', 'error'); }
  });

  // Order status change
  document.body.addEventListener('change', async (e)=>{
    if (e.target.classList.contains('order-status')){
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user || user.user_metadata?.role!=='admin') return showToast('Hanya admin boleh ubah status','error');
      const id = e.target.getAttribute('data-order');
      const { error } = await supabase.from('orders').update({ status:e.target.value }).eq('id', id);
      if (error) return showToast('Gagal kemaskini','error');
      showToast('Status pesanan dikemaskini');
    }
  });
});

/* ====== Form helpers & receipt ====== */
function openProductForm(id=null){
  const f = $("#product-form");
  if (!f) return;
  f.reset(); $("#product-id").value=""; const fileEl = $("#product-image-file"); if (fileEl) fileEl.value="";
  if (id){
    const p = ALL_PRODUCTS.find(x=>String(x.id)===String(id)); if (!p) return;
    $("#product-form-title").textContent='Kemas Kini Produk';
    $("#product-id").value = p.id;
    $("#product-name").value = p.name;
    $("#product-price").value = p.price;
    $("#product-stock").value = p.stock;
    $("#product-category").value = p.category||'Umum';
    $("#product-image").value = p.image_url||'';
    $("#product-description").value = p.description||'';
  } else {
    $("#product-form-title").textContent='Tambah Produk Baharu';
  }
  togglePanel('product-form-modal', true);
}
function showReceipt(order){
  const lines = (order.items||[]).map(i=>`${i.qty}x ${i.name} — ${money(i.price*i.qty)}`).join('<br>');
  const couponText = coupon ? (coupon.type==='percent'? `Kupon ${coupon.code} (-${coupon.amount}%)` : `Kupon ${coupon.code} (Penghantaran Percuma)`) : 'Tiada';
  const html = `
    <div class="modal show" id="receipt-modal">
      <div class="modal-card">
        <h3 class="text-xl font-extrabold mb-2 text-center">Resit Pesanan</h3>
        <p class="text-center text-sm text-gray-500">#${order.id} • ${new Date(order.date).toLocaleString()}</p>
        <div class="border-t my-3"></div>
        <div class="text-sm">${lines}</div>
        <div class="mt-3 text-sm">
          <div class="flex justify-between"><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
          <div class="flex justify-between"><span>Kupon</span><span>${couponText}</span></div>
          <div class="flex justify-between"><span>Penghantaran (${order.shipping})</span><span>${money(order.shippingFee)}</span></div>
          <div class="flex justify-between font-bold text-lg pt-1"><span>Jumlah</span><span>${money(order.total)}</span></div>
        </div>
        <div class="border-t my-3"></div>
        <p class="text-xs text-gray-500">Alamat: ${order.address?.name}, ${order.address?.phone}. ${order.address?.address}</p>
        <div class="flex justify-end pt-4">
          <button class="px-4 py-2 rounded bg-cyan-600 text-white" id="receipt-close">Tutup</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  $("#receipt-close")?.addEventListener('click', ()=> $("#receipt-modal")?.remove());
}
