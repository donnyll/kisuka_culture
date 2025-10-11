/* ====== CONFIG: Supabase ====== */
const SUPABASE_URL = "https://wzkkaiajzjiswdupkgna.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2thaWFqemppc3dkdXBrZ25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMDI5MDUsImV4cCI6MjA3NTY3ODkwNX0.U1PxAxHJd6sAdQkHXZiTWYN0lbb33xJPRDK2ALjzO-Q";
const STORAGE_BUCKET = "kisuka_culture";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ====== Bank Settings ====== */
const BANK = { name: 'Maybank', account: '123456789012', accountName: 'Kisuka Culture', whatsapp: '60123456789' };

/* ====== Helpers ====== */
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const money = n => "RM" + (Number(n)||0).toFixed(2);
const uid = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const iconify = ()=> { try{ lucide.createIcons(); }catch(e){} };
function getImages(p){
  try{
    if (Array.isArray(p.image_urls)) return p.image_urls.filter(Boolean);
    if (typeof p.image_urls === 'string' && p.image_urls.trim().startsWith('[')) {
      return JSON.parse(p.image_urls).filter(Boolean);
    }
  }catch(e){}
  return [];
}


function showToast(msg, type='success'){
  const c = $("#toast-container"); if (!c) return;
  const el = document.createElement('div');
  el.className = `toast-notification ${type==='success'?'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900':'bg-red-600 text-white'} text-sm font-semibold py-2 px-4 rounded-full shadow-lg`;
  el.textContent = msg;
  c.innerHTML = ""; c.appendChild(el);
}

/* ====== State ====== */
const KEYS = { CART:'unmeki_cart', WISHLIST:'unmeki_wishlist', COUPON:'unmeki_coupon', SHIPPING:'unmeki_shipping', THEME:'unmeki_theme' };
let cart = JSON.parse(localStorage.getItem(KEYS.CART) || "[]");
let wishlist = JSON.parse(localStorage.getItem(KEYS.WISHLIST) || "[]");
let coupon = JSON.parse(localStorage.getItem(KEYS.COUPON) || "null");
let shipping = localStorage.getItem(KEYS.SHIPPING) || "standard";
let ALL_PRODUCTS = [];
let TOTAL_PRODUCTS = 0;
let CURRENT_FILTER = { category:'Semua', term:'', sort:'popular' };
let currentPage = 1;
const pageSize = 8;

/* ====== THEME ====== */
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem(KEYS.THEME, theme);
}
function initTheme() {
    const savedTheme = localStorage.getItem(KEYS.THEME);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    applyTheme(theme);
}

/* ====== AUTH ====== */
async function applyAuthGate(){
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = !!user && user.user_metadata?.role === "admin";
  $$('[data-view="admin"]').forEach(a => a.style.display = isAdmin ? "" : "none");
  const adminView = $("#admin-view");
  if (!isAdmin && adminView?.classList.contains("active")){
    switchView("home");
    showToast("Anda perlu login sebagai admin untuk akses panel ini", "error");
  }
  return isAdmin;
}
async function renderAuthArea(){
  const { data: { user } } = await supabase.auth.getUser();
  const area = $("#auth-area"); if (!area) return;
  if (user && user.user_metadata?.role === "admin"){
    area.innerHTML = `<span class="text-sm text-gray-600 dark:text-gray-300 hidden md:inline">Log masuk sebagai <strong>${user.email}</strong></span><button id="logout-btn" class="btn-light !py-2 !px-3">Log Keluar</button>`;
    $("#logout-btn")?.addEventListener("click", async ()=>{
      await supabase.auth.signOut(); await applyAuthGate(); showToast("Log keluar"); switchView("home");
    });
  } else {
    area.innerHTML = `<form id="login-form" class="flex gap-2"><input type="email" id="login-email" placeholder="admin@email.com" class="form-input" required><input type="password" id="login-pass" placeholder="kata laluan" class="form-input" required><button class="btn-primary !py-2 !px-3"><i data-lucide="log-in" class="w-4 h-4 mr-1"></i>Log Masuk</button></form>`;
    iconify();
    $("#login-form")?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const { error } = await supabase.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-pass").value });
      if (error) return showToast(error.message, 'error');
      showToast("Berjaya log masuk");
      await applyAuthGate(); renderAuthArea(); await renderAdmin();
    });
  }
}

/* ====== DATA FETCHING & MUTATION ====== */
async function fetchProductsServer({ page=1, term="", category="Semua", sort="popular", ids=null }={}){
  let query = supabase.from('products').select('*', { count: 'exact' });
  if (ids) { query = query.in('id', ids);
  } else {
    if (term.trim()) query = query.ilike('name', `%${term}%`);
    if (category && category !== 'Semua') query = query.eq('category', category);
    if (sort==='price-asc') query = query.order('price', { ascending:true });
    else if (sort==='price-desc') query = query.order('price', { ascending:false });
    else if (sort==='newest') query = query.order('created_at', { ascending:false });
    query = query.range((page-1)*pageSize, page*pageSize - 1);
  }
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
async function createOrder(order){
  const { error } = await supabase.from('orders').insert(order); if (error) throw error;
}
async function deleteProduct(id){
  const { error } = await supabase.from('products').delete().eq('id', id); if (error) throw error;
}
async function createOrUpdateProduct(record, files){
    let existingImages = JSON.parse(record.image_urls || "[]");
    const newImageUrls = [];
    if (files && files.length > 0) {
        const uploadPromises = [...files].map(file => {
            const path = `${(record.category||'umum').toLowerCase()}/${uid()}.${file.name.split('.').pop()}`;
            return supabase.storage.from(STORAGE_BUCKET).upload(path, file);
        });
        const uploadResults = await Promise.all(uploadPromises);
        for (const result of uploadResults) {
            if (result.error) throw result.error;
            const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(result.data.path);
            newImageUrls.push(pub.publicUrl);
        }
    }
    const finalImageUrls = [...newImageUrls, ...existingImages];
    const payload = {
        name: record.name, description: record.description, price: Number(record.price),
        category: record.category, stock: Number(record.stock), image_urls: finalImageUrls
    };
    const { error } = record.id
        ? await supabase.from('products').update(payload).eq('id', record.id)
        : await supabase.from('products').insert(payload);
    if (error) throw error;
}

/* ====== RENDER FUNCTIONS ====== */
const productBadge = p => {
    if (p.stock === 0) return '<span class="badge-stock badge-stock-out">HABIS</span>';
    if (p.stock < 5) return '<span class="badge-stock badge-stock-low">STOK TERHAD</span>';
    return '';
};
const productCard = p => {
  const isWishlisted = wishlist.includes(String(p.id));
  const firstImage = (getImages(p).length > 0) ? getImages(p)[0] : 'https://placehold.co/600x600?text=Produk';
  return `
  <div class="product-card bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden group relative flex flex-col" data-id="${p.id}" data-action="view-detail">
    <div class="absolute top-2 right-2 z-10 flex flex-col gap-2">
      <button data-action="toggle-wishlist" data-id="${p.id}" class="bg-white/80 dark:bg-gray-900/80 rounded-full p-2 shadow-md hover:bg-white transition-transform hover:scale-110">
        <i data-lucide="heart" class="w-4 h-4 transition-all ${isWishlisted ? 'text-red-500 fill-red-500' : 'text-gray-600 dark:text-gray-300'}"></i>
      </button>
    </div>
    <div class="relative cursor-pointer"><img src="${firstImage}" alt="${p.name}" class="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300">
      ${p.stock===0 ? '<div class="absolute inset-0 bg-black/50 flex items-center justify-center"><span class="text-white font-bold text-sm">HABIS DIJUAL</span></div>':''}
    </div>
    <div class="p-4 flex flex-col flex-grow">
      <div class="flex items-center justify-between gap-2 cursor-pointer mb-1">
        <h4 class="font-bold text-sm text-gray-800 dark:text-gray-100 truncate flex-grow">${p.name}</h4>
        ${productBadge(p)}
      </div>
      <p class="text-base font-extrabold text-gray-900 dark:text-white cursor-pointer">${money(p.price)}</p>
      <div class="flex gap-2 mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
        <button ${p.stock===0?'disabled':''} data-action="add-to-cart" data-id="${p.id}" class="w-full bg-cyan-500 text-white text-xs font-bold py-2.5 rounded-lg hover:bg-cyan-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">Tambah ke Troli</button>
      </div>
    </div>
  </div>`;
};
const skeletonCard = () => `<div class="skeleton-card"><div class="img"></div><div class="p-4 space-y-3"><div class="text w-3/4"></div><div class="text w-1/2"></div><div class="pt-4 mt-auto"><div class="text w-full h-9"></div></div></div></div>`;
const renderSkeletonGrid = (grid) => { if(grid) grid.innerHTML = Array.from({ length: pageSize }).map(skeletonCard).join(''); };
function renderGrid(products, gridElement, emptyMsg) {
  if (gridElement) {
    gridElement.innerHTML = products.length ? products.map(productCard).join('') : `<p class="col-span-full text-center text-gray-500 dark:text-gray-400 py-12">${emptyMsg}</p>`;
    iconify();
  }
}
function renderCategories(){
  const wrap = $("#category-filters"); if (!wrap) return;
  const cats = ['Semua', ...new Set(ALL_PRODUCTS.map(p=>p.category).filter(Boolean).sort())];
  wrap.innerHTML = cats.map(c=> `<button data-category="${c}" class="${CURRENT_FILTER.category===c?'bg-cyan-600 text-white':'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'} px-4 py-2 rounded-full text-sm font-semibold transition-colors hover:bg-cyan-50 hover:border-cyan-200 dark:hover:bg-gray-600">${c}</button>`).join('');
}
function renderPagination(){
  const box = $("#pagination"); if (!box) return;
  if (TOTAL_PRODUCTS <= pageSize) { box.innerHTML = ''; return; }
  const totalPages = Math.ceil(TOTAL_PRODUCTS / pageSize);
  box.innerHTML = Array.from({ length: totalPages }, (_, i) => i + 1)
    .map(i => `<button class="px-3 py-1 rounded-md text-sm ${i===currentPage?'bg-cyan-600 text-white':'bg-white dark:bg-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}" data-page="${i}">${i}</button>`)
    .join('');
}
async function renderProductDetail(id){
  const view = $("#product-detail-view"); if (!view) return;
  view.innerHTML = `<div class="p-8 text-center text-gray-700 dark:text-gray-300">Memuat...</div>`;
  let p = ALL_PRODUCTS.find(x=>String(x.id)===String(id));
  if (!p) {
    const { data } = await supabase.from('products').select('*').eq('id', id).single();
    if (!data) { view.innerHTML='<p class="p-8 text-center">Produk tidak ditemui.</p>'; return; }
    p = data;
  }
  const isWishlisted = wishlist.includes(String(p.id));
  const firstImage = (getImages(p).length > 0) ? getImages(p)[0] : 'https://placehold.co/600x600?text=Produk';
  view.innerHTML = `
    <section class="max-w-5xl mx-auto p-4 md:p-8">
      <a href="#" data-view="all-products" class="nav-link text-sm text-cyan-600 mb-6 inline-flex items-center hover:underline"><i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i> Kembali ke Semua Produk</a>
      <div class="grid md:grid-cols-2 gap-8 md:gap-12">
        <div><img src="${firstImage}" alt="${p.name}" class="w-full rounded-lg shadow-lg"></div>
        <div class="text-gray-800 dark:text-gray-200">
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">${p.name}</h2>
          <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">Kategori: ${p.category}</p>
          <p class="text-3xl font-bold text-gray-900 dark:text-white my-4">${money(p.price)}</p>
          <p class="text-gray-600 dark:text-gray-300 leading-relaxed">${p.description || 'Tiada penerangan.'}</p>
          ${p.stock > 0 && p.stock < 10 ? `<p class="text-red-600 font-semibold text-sm mt-4">${p.stock} unit sahaja lagi!</p>`:''}
          ${p.stock === 0 ? `<p class="text-red-600 font-bold text-lg mt-4">HABIS DIJUAL</p>`:''}
          <div class="flex gap-3 mt-6">
            <button ${p.stock===0?'disabled':''} data-action="add-to-cart" data-id="${p.id}" class="flex-1 bg-cyan-600 text-white font-semibold py-3 rounded-lg hover:bg-cyan-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors">Tambah ke Troli</button>
            <button data-action="toggle-wishlist" data-id="${p.id}" class="px-4 rounded-lg border border-gray-300 dark:border-gray-600 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800">
              <i data-lucide="heart" class="w-5 h-5 ${isWishlisted ?'text-red-500 fill-red-500':'text-gray-600 dark:text-gray-300'}"></i> Wishlist
            </button>
          </div>
        </div>
      </div>
    </section>`;
  iconify();
}
async function renderWishlist() {
  const grid = $("#wishlist-grid"); if (!grid) return;
  if (wishlist.length === 0) {
    grid.innerHTML = '<p class="col-span-full text-center text-gray-500 dark:text-gray-400 py-12">Wishlist anda kosong.</p>';
    return;
  }
  renderSkeletonGrid(grid);
  const { rows } = await fetchProductsServer({ ids: wishlist });
  renderGrid(rows, grid, 'Tiada produk dalam wishlist anda.');
}

/* ====== CART LOGIC ====== */
const cartSubtotal = () => cart.reduce((s,i)=> s + i.price*i.quantity, 0);
const shippingFee = () => (coupon?.type==='freeship') ? 0 : (shipping==='express'?15:8);
const discountAmount = sub => (!coupon || coupon.type!=='percent') ? 0 : sub*(coupon.amount/100);
const cartTotal = () => Math.max(0, cartSubtotal()-discountAmount(cartSubtotal())) + shippingFee();
function renderCart(){
  const box = $("#cart-items");
  if (box){
    if (cart.length===0) box.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-center"><i data-lucide="shopping-basket" class="w-16 h-16 text-gray-300 dark:text-gray-600"></i><p class="text-gray-500 dark:text-gray-400 mt-4">Troli anda kosong.</p></div>';
    else {
      box.innerHTML = cart.map(it=>`
        <div class="flex items-start gap-4 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <img src="${it.image_url || 'https://placehold.co/80x80'}" alt="${it.name}" class="w-20 h-20 object-cover rounded-md border border-gray-200 dark:border-gray-700">
          <div class="flex-grow text-gray-800 dark:text-gray-200">
            <p class="text-sm font-semibold">${it.name}</p>
            <p class="text-sm font-bold my-1">${money(it.price*it.quantity)}</p>
            <div class="flex items-center gap-3 my-1">
              <button data-action="decrement" data-id="${it.id}" class="p-1 w-7 h-7 flex items-center justify-center border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">-</button>
              <span class="font-bold text-sm">${it.quantity}</span>
              <button data-action="increment" data-id="${it.id}" class="p-1 w-7 h-7 flex items-center justify-center border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">+</button>
            </div>
          </div>
          <button data-action="remove-from-cart" data-id="${it.id}" class="p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/50"><i data-lucide="trash-2" class="w-4 h-4 text-red-500 pointer-events-none"></i></button>
        </div>`).join('');
    }
  }
  const cartItems = cart.reduce((s,i)=>s+i.quantity,0);
  $("#cart-count").textContent = cartItems;
  $("#mobile-cart-count").textContent = cartItems;
  $("#wishlist-count").textContent = wishlist.length;
  $("#cart-subtotal").textContent = money(cartSubtotal());
  $("#cart-total").textContent = money(cartTotal());
  localStorage.setItem(KEYS.CART, JSON.stringify(cart));
  iconify();
}
function addToCart(p){
  const it = cart.find(x=>String(x.id)===String(p.id));
  const firstImage = (getImages(p).length > 0) ? getImages(p)[0] : 'https://placehold.co/600x600?text=Produk';
  if (it){
    if (it.quantity < p.stock){ it.quantity++; showToast(`${p.name} ditambah!`); }
    else return showToast(`Stok ${p.name} tidak mencukupi!`,'error');
  } else {
    if (p.stock > 0) cart.push({ id:String(p.id), name:p.name, price:p.price, image_url:firstImage, stock:p.stock, quantity:1 });
    else return showToast(`Stok ${p.name} habis!`, 'error');
  }
  renderCart();
  const cartBtn = $("#cart-btn");
  if (cartBtn) { cartBtn.classList.add('cart-shake'); setTimeout(()=> cartBtn.classList.remove('cart-shake'), 800); }
}
const removeFromCart = id => { cart = cart.filter(i=>String(i.id)!==String(id)); renderCart(); };
async function updateQuantity(id, d){
  const it = cart.find(i=>String(i.id)===String(id)); if (!it) return;
  const q = it.quantity + d; if (q<=0) return removeFromCart(id);
  const { data: p } = await supabase.from('products').select('stock, name').eq('id', id).single();
  if (!p || q > p.stock) return showToast(`Stok ${p?.name||''} tidak mencukupi!`,'error');
  it.quantity=q; renderCart();
}

/* ====== UI/PANEL/VIEW LOGIC ====== */
function togglePanel(id, forceOpen=null){
  const el = $(`#${id}`);
  const overlay = $("#overlay");
  if (!el || !overlay) return;
  const willOpen = forceOpen !== null ? forceOpen : !el.classList.contains('show');
  overlay.classList.toggle('hidden', !willOpen);
  if (willOpen) {
    if (el.classList.contains('modal')) el.classList.add('show');
    else el.style.transform = 'translate(0, 0)';
  } else {
    closeAllPanels();
  }
}
function closeAllPanels(){
  $("#overlay").classList.add('hidden');
  $("#mobile-menu").style.transform='translateX(-100%)';
  $("#cart-panel").style.transform='translateX(100%)';
  $("#search-modal").style.transform='translateY(-100%)';
  $$(".modal").forEach(m => m.classList.remove('show'));
}
async function switchView(view){
  $$('.view').forEach(v=>v.classList.remove('active'));
  const tgt = $(`#${view}-view`);
  if (tgt) {
    tgt.classList.add('active');
    window.scrollTo({ top:0, behavior:'smooth' });
    if (view === 'admin') { await applyAuthGate(); await renderAuthArea(); await renderAdmin(); }
    if (['home', 'all-products'].includes(view)) await loadPage();
    if (view === 'wishlist') await renderWishlist();
  }
}

/* ====== ADMIN LOGIC ====== */
async function renderAdmin(){
  const [orders, {rows: adminProducts, count}] = await Promise.all([ fetchOrders(), fetchProductsServer({ page: 1, pageSize: 100 }) ]);
  TOTAL_PRODUCTS = count;
  $("#admin-total-products").textContent = TOTAL_PRODUCTS;
  $("#admin-total-orders").textContent = orders.length;
  $("#admin-total-sales").textContent = money(orders.reduce((s,o)=> s + Number(o.total||0), 0));

  const pList = $("#admin-product-list");
  if(pList) pList.innerHTML = `<table class="min-w-full bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"><thead class="bg-gray-50 dark:bg-gray-700"><tr class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase"><th class="py-2 px-4">Nama</th><th class="py-2 px-4 hidden md:table-cell">Kategori</th><th class="py-2 px-4 hidden md:table-cell">Stok</th><th class="py-2 px-4">Harga</th><th class="py-2 px-4">Tindakan</th></tr></thead><tbody>
    ${adminProducts.map(p => `<tr class="text-sm text-gray-700 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700"><td class="py-2 px-4 font-semibold">${p.name}</td><td class="py-2 px-4 hidden md:table-cell">${p.category||'-'}</td><td class="py-2 px-4 hidden md:table-cell">${p.stock}</td><td class="py-2 px-4">${money(p.price)}</td><td class="py-2 px-4"><button data-action="edit-product" data-id="${p.id}" class="text-blue-600 hover:underline mr-2">Edit</button><button data-action="delete-product" data-id="${p.id}" class="text-red-600 hover:underline">Padam</button></td></tr>`).join('')}
  </tbody></table>`;

  const oList = $("#admin-order-list");
  if (oList) oList.innerHTML = orders.length === 0 ? '<p class="text-gray-600 dark:text-gray-400">Tiada pesanan lagi.</p>' : orders.map(o => `
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <div class="flex flex-wrap items-center justify-between gap-2"><h4 class="font-bold text-gray-900 dark:text-white">Pesanan #${o.id.slice(-6)}</h4><span class="text-sm text-gray-600 dark:text-gray-400">${new Date(o.date).toLocaleString()}</span></div>
      <p class="text-sm mt-1 text-gray-600 dark:text-gray-400">Kepada: ${o.address?.name||'-'}</p>
      <ul class="text-sm mt-2 list-disc pl-6 text-gray-600 dark:text-gray-400">${(o.items||[]).map(i=>`<li>${i.qty}x ${i.name} — ${money(i.price*i.qty)}</li>`).join('')}</ul>
      <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <p class="font-bold text-gray-900 dark:text-white">Jumlah: ${money(o.total)}</p>
        <div class="flex items-center gap-2"><label class="text-sm text-gray-600 dark:text-gray-400">Status:</label><select data-order="${o.id}" class="order-status form-input !text-xs !py-1 !px-2">${['Pending','Processing','Shipped','Completed','Cancelled'].map(s=>`<option ${o.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      </div>
    </div>`).join('');
}

/* ====== PAGE LOAD & INIT ====== */
async function loadPage(){
  const grid = $("#all-product-grid");
  renderSkeletonGrid(grid);
  const { rows, count } = await fetchProductsServer({ page: currentPage, term: CURRENT_FILTER.term, category: CURRENT_FILTER.category, sort: CURRENT_FILTER.sort });
  ALL_PRODUCTS = rows;
  TOTAL_PRODUCTS = count;
  renderCategories();
  renderGrid(ALL_PRODUCTS, grid, 'Tiada produk ditemui.');
  renderGrid(ALL_PRODUCTS.slice(0, 4), $("#featured-product-grid"), 'Tiada produk pilihan.');
  renderPagination();
}
document.addEventListener('DOMContentLoaded', async ()=>{
  
function updatePaymentUI(){
  const method = $("#co-payment")?.value || 'Transfer';
  const receiptWrap = $("#receipt-upload-area");
  const bankBox = $("#bank-info");
  if (method === 'Transfer'){
    if (receiptWrap) receiptWrap.style.display = '';
    if ($("#co-receipt")) $("#co-receipt").required = true;
    if (bankBox){
      bankBox.innerHTML = `<div class="mt-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
        <p class="font-semibold mb-1">Butiran Bank</p>
        <p>${BANK.name} — <strong>${BANK.account}</strong></p>
        <p>Nama Akaun: <strong>${BANK.accountName}</strong></p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Muat naik resit selepas transfer.</p>
      </div>`;
    }
  } else {
    if (receiptWrap) receiptWrap.style.display = 'none';
    if ($("#co-receipt")) $("#co-receipt").required = false;
    if (bankBox) bankBox.innerHTML = '';
  }
}

  initTheme();
  iconify();
  await applyAuthGate();
  await loadPage();
  renderCart();

  /* ====== GLOBAL CLICK HANDLER ====== */
  document.body.addEventListener('click', async (e)=>{
    const nav = e.target.closest('.nav-link');
    const actionBtn = e.target.closest('[data-action]');
    const targetId = e.target.id;

    if (nav?.dataset.view){ e.preventDefault(); switchView(nav.dataset.view); closeAllPanels(); }
    if (actionBtn?.dataset.action === 'view-detail') { switchView('product-detail'); renderProductDetail(actionBtn.dataset.id); }

    if (actionBtn){
      const { action, id } = actionBtn.dataset;
      const p = ALL_PRODUCTS.find(x=>String(x.id)===String(id));
      if (action==='add-to-cart' && p) addToCart(p);
      if (action==='remove-from-cart') removeFromCart(id);
      if (action==='increment') updateQuantity(id,+1);
      if (action==='decrement') updateQuantity(id,-1);
      if (action==='toggle-wishlist'){
        if (wishlist.includes(id)) wishlist = wishlist.filter(x=>x!==id); else wishlist.push(id);
        localStorage.setItem(KEYS.WISHLIST, JSON.stringify(wishlist));
        showToast('Wishlist dikemaskini'); renderCart();
        if ($("#all-products-view")?.classList.contains('active')) renderGrid(ALL_PRODUCTS, $('#all-product-grid'));
        if ($("#wishlist-view")?.classList.contains('active')) await renderWishlist();
        if ($("#product-detail-view")?.classList.contains('active')) await renderProductDetail(id);
      }
      if (action==='edit-product') openProductForm(id);
      if (action==='delete-product'){
        if (!confirm("Padam produk ini?")) return;
        try { await deleteProduct(id); showToast('Produk dipadam'); await loadPage(); await renderAdmin(); }
        catch(err) { showToast(err.message||'Gagal padam','error'); }
      }
    }

    if (e.target.closest('#menu-btn')) togglePanel('mobile-menu');
    if (e.target.closest('#cart-btn') || e.target.closest('#mobile-cart-btn')) togglePanel('cart-panel');
    if (e.target.closest('#search-btn')){ togglePanel('search-modal'); $("#search-input")?.focus(); }
    if (targetId === 'overlay' || e.target.closest('[id^=close-],[id^=cancel-]')) closeAllPanels();
    if (e.target.closest('#theme-btn')) applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  });

  /* ====== INPUT & CHANGE HANDLERS ====== */
  $("#search-input")?.addEventListener('input', async e => { CURRENT_FILTER.term = e.target.value; currentPage = 1; await loadPage(); });
  $("#category-filters")?.addEventListener('click', async e => { if (e.target.tagName==='BUTTON'){ currentPage = 1; CURRENT_FILTER.category = e.target.dataset.category; await loadPage(); } });
  $("#sort-select")?.addEventListener('change', async e => { currentPage = 1; CURRENT_FILTER.sort = e.target.value; await loadPage(); });
  $("#pagination")?.addEventListener('click', async e => { const b = e.target.closest('button[data-page]'); if (b) { currentPage = Number(b.dataset.page)||1; await loadPage(); } });
  $("#checkout-btn")?.addEventListener('click', ()=>{ if (cart.length===0) return showToast('Troli anda kosong!', 'error'); togglePanel('checkout-modal', true); updatePaymentUI(); });
  $("#shipping-method")?.addEventListener('change', e=>{ shipping=e.target.value; localStorage.setItem(KEYS.SHIPPING, shipping); renderCart(); });
  $("#co-payment")?.addEventListener('change', updatePaymentUI);
  $("#apply-coupon-btn")?.addEventListener('click', ()=>{
    const code = $("#coupon-input")?.value.trim().toUpperCase(); let applied=null;
    if (code==='SAVE10') applied={code,type:'percent',amount:10};
    if (code==='FREESHIP'){ if (cartSubtotal()>=80) applied={code,type:'freeship'}; else return showToast('FREESHIP perlukan min RM80','error'); }
    if (!applied) return showToast('Kupon tidak sah','error');
    coupon=applied; localStorage.setItem(KEYS.COUPON, JSON.stringify(coupon)); renderCart(); showToast(`Kupon ${code} digunakan`);
  });
  
  /* ====== ADMIN HANDLERS ====== */
  $("#admin-tabs")?.addEventListener('click', e => {
    const btn = e.target.closest('.admin-tab'); if (!btn) return;
    $$('#admin-tabs .admin-tab').forEach(t => t.classList.remove('active')); btn.classList.add('active');
    $$('.admin-tab-content').forEach(c => c.classList.add('hidden')); $(`#admin-${btn.dataset.tab}-content`)?.classList.remove('hidden');
  });
  $('#export-json')?.addEventListener('click', async () => {
    const { data } = await supabase.from('products').select('name,description,price,category,stock,image_urls');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `products_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(a.href);
  });
  $('#import-json')?.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = async (event) => {
      try { const products = JSON.parse(event.target.result); if (!Array.isArray(products)) throw new Error('JSON mesti dalam bentuk array.');
        const { error } = await supabase.from('products').upsert(products, { onConflict: 'name' }); if (error) throw error;
        showToast('Produk berjaya diimport!', 'success'); await loadPage(); await renderAdmin();
      } catch(err) { showToast(err.message || 'Gagal import JSON.', 'error'); }
    }; reader.readAsText(file);
  });
  document.body.addEventListener('change', async e => {
    if (e.target.classList.contains('order-status')){
      const id = e.target.dataset.order; const { error } = await supabase.from('orders').update({ status:e.target.value }).eq('id', id);
      if (error) return showToast('Gagal kemaskini','error'); showToast('Status pesanan dikemaskini');
    }
  });

  
  // NEW: live preview for newly selected files in product form
  $("#product-images-input")?.addEventListener('change', (e) => {
    const files = e.target.files;
    const urls = [];
    for (const f of files) { try { urls.push(URL.createObjectURL(f)); } catch(e){} }
    if (urls.length) {
      const preview = $("#product-images-preview");
      preview.innerHTML = urls.map(u => `<div class="relative group w-20 h-20"><img src="${u}" class="w-full h-full object-cover rounded-md border border-gray-300 dark:border-gray-600"></div>`).join('');
    }
  });

  /* ====== FORM SUBMISSIONS ====== */

  $("#wa-btn")?.addEventListener('click', () => {
    if (cart.length===0) return showToast('Troli anda kosong!', 'error');
    const lines = cart.map(i=>`${i.quantity}x ${i.name} — ${money(i.price*i.quantity)}`).join('%0A');
    const total = money(cartTotal());
    const msg = `Order Baru:%0A${lines}%0A%0ATotal: ${total}%0A%0ANama: ${encodeURIComponent($("#co-name")?.value||'') }%0ATelefon: ${encodeURIComponent($("#co-phone")?.value||'') }%0AAlamat: ${encodeURIComponent($("#co-address")?.value||'') }`;
    const url = `https://wa.me/${BANK.whatsapp}?text=${msg}`;
    window.open(url, '_blank');
  });

  $("#checkout-form")?.addEventListener('submit', async e => {
    e.preventDefault();
    const order = {
      id: uid().toUpperCase(), date: new Date().toISOString(),
      items: cart.map(i=>({ id:i.id, name:i.name, price:i.price, qty:i.quantity })),
      subtotal: cartSubtotal(), shipping, shippingFee: shippingFee(), total: cartTotal(), status: 'Pending',
      address: { name: $("#co-name").value, phone: $("#co-phone").value, address: $("#co-address").value },
      // FIXED: Flattened payment details to match new DB columns
      payment_method: $("#co-payment").value,
      receipt_url: ''
    };
    try {
      const receiptFile = $("#co-receipt")?.files?.[0];
      if (receiptFile) {
        const path = `receipts/${order.id}.${receiptFile.name.split('.').pop()}`;
        const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, receiptFile);
        if (upErr) throw upErr;
        order.receipt_url = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
      }
      const stockUpdates = cart.map(it => supabase.from('products').update({ stock: it.stock - it.quantity }).eq('id', it.id));
      await Promise.all([...stockUpdates, createOrder(order)]);
      cart = []; localStorage.removeItem(KEYS.CART); coupon = null; localStorage.removeItem(KEYS.COUPON);
      renderCart(); togglePanel('checkout-modal', false); showToast('Pesanan dihantar!'); showReceipt(order); await loadPage();
    } catch(err) { showToast(err.message||'Ralat semasa menghantar pesanan','error'); }
  });
});

/* ====== FORM & UI HELPERS ====== */
function renderImagePreviews(images, container) {
    container.innerHTML = images.map((url, index) => `
        <div class="relative group w-20 h-20">
            <img src="${url}" class="w-full h-full object-cover rounded-md border border-gray-300 dark:border-gray-600">
            <button type="button" data-url="${url}" class="absolute top-0 right-0 m-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Remove image">
                <i data-lucide="x" class="w-3 h-3"></i>
            </button>
        </div>
    `).join('');
    iconify();
}
function openProductForm(id = null) {
    const form = $("#product-form"); if (!form) return;
    form.reset();
    $("#product-id").value = "";
    $("#product-existing-images").value = "[]";
    const previewContainer = $("#product-images-preview");
    previewContainer.innerHTML = '';
    const p = ALL_PRODUCTS.find(x => String(x.id) === String(id));
    if (p) {
        $("#product-form-title").textContent = 'Kemas Kini Produk';
        $("#product-id").value = p.id; $("#product-name").value = p.name; $("#product-price").value = p.price;
        $("#product-stock").value = p.stock; $("#product-category").value = p.category || '';
        $("#product-description").value = p.description || '';
        const existingImages = p.image_urls || [];
        $("#product-existing-images").value = JSON.stringify(existingImages);
        renderImagePreviews(existingImages, previewContainer);
    } else {
        $("#product-form-title").textContent = 'Tambah Produk Baharu';
    }
    togglePanel('product-form-modal', true);
}
$("#product-form")?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const record = {
        id: $("#product-id").value, name: $("#product-name").value, price: $("#product-price").value,
        stock: $("#product-stock").value, category: $("#product-category").value, description: $("#product-description").value,
        image_urls: $("#product-existing-images").value
    };
    const files = $("#product-images-input").files;
    try {
        await createOrUpdateProduct(record, files);
        showToast(`Produk ${record.id ? 'dikemaskini' : 'ditambah'}`);
        closeAllPanels(); await loadPage(); await renderAdmin();
    } catch (err) { showToast(err.message, 'error'); }
});
$('#product-images-preview')?.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (btn) {
        const urlToRemove = btn.dataset.url;
        const existingImagesInput = $("#product-existing-images");
        let images = JSON.parse(existingImagesInput.value);
        images = images.filter(url => url !== urlToRemove);
        existingImagesInput.value = JSON.stringify(images);
        btn.parentElement.remove();
    }
});
function showReceipt(order){
  const html = `<div class="modal show" id="receipt-modal">
      <div class="modal-card max-w-sm"><h3 class="text-xl font-extrabold mb-2 text-center text-gray-900 dark:text-white">Resit Pesanan</h3>
        <p class="text-center text-sm text-gray-500 dark:text-gray-400">#${order.id.slice(-6)} &bull; ${new Date(order.date).toLocaleString()}</p>
        <div class="border-t border-gray-200 dark:border-gray-700 my-4"></div>
        <div class="text-sm space-y-1 text-gray-700 dark:text-gray-300">${(order.items||[]).map(i=>`<div class="flex justify-between"><span>${i.qty}x ${i.name}</span><span>${money(i.price*i.qty)}</span></div>`).join('')}</div>
        <div class="border-t border-gray-200 dark:border-gray-700 my-4"></div>
        <div class="mt-3 text-sm space-y-1 text-gray-700 dark:text-gray-300"><div class="flex justify-between"><span>Subtotal</span><span>${money(order.subtotal)}</span></div><div class="flex justify-between"><span>Penghantaran</span><span>${money(order.shippingFee)}</span></div><div class="flex justify-between font-bold text-lg pt-2 mt-2 border-t border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"><span>Jumlah</span><span>${money(order.total)}</span></div></div>
        <div class="border-t border-gray-200 dark:border-gray-700 my-4"></div>
        <p class="text-xs text-gray-500 dark:text-gray-400">Alamat: ${order.address?.name||''}, ${order.address?.address||''}</p>
        ${order.receipt_url ? `<a href="${order.receipt_url}" target="_blank" class="text-xs text-cyan-600 underline">Lihat resit</a>` : ''}
        <div class="flex justify-end pt-4"><button class="btn-primary" onclick="this.closest('#receipt-modal').remove()">Tutup</button></div>
      </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}