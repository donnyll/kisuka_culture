/* ====== CONFIG: Supabase ====== */
const SUPABASE_URL = "https://wzkkaiajzjiswdupkgna.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2thaWFqemppc3dkdXBrZ25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMDI5MDUsImV4cCI6MjA3NTY3ODkwNX0.U1PxAxHJd6sAdQkHXZiTWYN0lbb33xJPRDK2ALjzO-Q";
const STORAGE_BUCKET = "kisuka_culture";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ====== Settings ====== */
const WHATSAPP_NUMBER = '60123456789'; // Gantikan dengan nombor WhatsApp sebenar anda

/* ====== Helpers ====== */
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const money = n => "RM" + (Number(n)||0).toFixed(2);
const uid = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const iconify = ()=> { try{ lucide.createIcons(); }catch(e){} };
const firstImageOf = (p) => { const arr = normalizeImages(p?.image_urls); return (arr && arr.length) ? arr[0] : "https://placehold.co/600x600?text=Produk"; };
const normalizeImages = (val) => { if (Array.isArray(val)) return val; if (typeof val === "string") { try { const arr = JSON.parse(val); return Array.isArray(arr) ? arr : []; } catch { return []; } } return []; };

function showToast(msg, type='success'){
  const c = $("#toast-container"); if (!c) return;
  const el = document.createElement('div');
  el.className = `toast-notification ${type==='success'?'bg-gray-800 text-white':'bg-red-600 text-white'} text-sm font-semibold py-2 px-4 rounded-full shadow-lg`;
  el.textContent = msg;
  c.innerHTML = ""; c.appendChild(el);
}

/* ====== State ====== */
const KEYS = { CART:'unmeki_cart', WISHLIST:'unmeki_wishlist', THEME:'unmeki_theme' };
let cart = JSON.parse(localStorage.getItem(KEYS.CART) || "[]");
let wishlist = JSON.parse(localStorage.getItem(KEYS.WISHLIST) || "[]");
let ALL_PRODUCTS = [];
let ALL_CATEGORIES = [];
let TOTAL_PRODUCTS = 0;
let CURRENT_FILTER = { category:'Semua', term:'', sort:'popular' };
let currentPage = 1;
const pageSize = 8;

/* ====== THEME ====== */
function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  localStorage.setItem(KEYS.THEME, theme);
}
function initTheme() {
    const savedTheme = localStorage.getItem(KEYS.THEME);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(savedTheme || (systemPrefersDark ? 'dark' : 'light'));
}

/* ====== AUTH & ROUTING ====== */
async function handleAdminAccess(){
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = !!user && user.user_metadata?.role === "admin";
  const adminPanel = $("#admin-panel");
  
  if(isAdmin){
      adminPanel.classList.remove('hidden');
      renderAdmin();
  } else {
      adminPanel.classList.add('hidden');
  }
  renderAuthArea(user, isAdmin);
}
function renderAuthArea(user, isAdmin){
  const area = $("#auth-area"); if (!area) return;
  if(isAdmin){
      area.innerHTML = ''; // Hide login form if logged in
  } else {
    area.innerHTML = `
      <div class="max-w-md mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg border dark:border-gray-700">
        <h2 class="text-xl font-bold text-center text-gray-900 dark:text-white mb-4">Log Masuk Admin</h2>
        <form id="login-form" class="space-y-4">
            <input type="email" id="login-email" placeholder="admin@email.com" class="form-input" required>
            <input type="password" id="login-pass" placeholder="kata laluan" class="form-input" required>
            <button class="btn-primary w-full">Log Masuk</button>
        </form>
      </div>`;
    $("#login-form")?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const { error } = await supabase.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-pass").value });
      if (error) return showToast(error.message, 'error');
      showToast("Berjaya log masuk");
      handleAdminAccess();
    });
  }
}
function handleHashChange() {
    if (window.location.hash === '#admin') {
        switchView('admin');
    } else if ($('#admin-view')?.classList.contains('active')) {
        switchView('home');
    }
}

/* ====== DATA FETCHING & MUTATION ====== */
async function fetchSettings() {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) { console.error("Error fetching settings:", error); return {}; }
    const settings = data.reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {});
    
    if (settings.hero_image_url) {
        $("#hero-img")?.setAttribute('src', settings.hero_image_url);
        $("#hero-preview")?.setAttribute('src', settings.hero_image_url);
    }
}
async function fetchProductsServer({ page=1, term="", category="Semua", sort="popular", ids=null }={}){
  let query = supabase.from('products').select('*', { count: 'exact' });
  if (ids) { query = query.in('id', ids); } 
  else {
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
async function fetchCategories() {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) { showToast("Gagal memuat kategori", "error"); return []; }
    ALL_CATEGORIES = data || [];
    return ALL_CATEGORIES;
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
  return `
  <div class="product-card bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden group relative flex flex-col">
    <div data-action="view-detail" data-id="${p.id}" class="cursor-pointer">
      <div class="absolute top-2 right-2 z-10">
        <button data-action="toggle-wishlist" data-id="${p.id}" class="bg-white/80 dark:bg-gray-900/80 rounded-full p-2 shadow-md hover:bg-white transition-transform hover:scale-110">
          <i data-lucide="heart" class="w-4 h-4 transition-all ${isWishlisted ? 'text-red-500 fill-red-500' : 'text-gray-600 dark:text-gray-300'} pointer-events-none"></i>
        </button>
      </div>
      <div class="relative"><img src="${firstImageOf(p)}" alt="${p.name}" class="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300">
        ${p.stock===0 ? '<div class="absolute inset-0 bg-black/50 flex items-center justify-center"><span class="text-white font-bold text-sm">HABIS DIJUAL</span></div>':''}
      </div>
    </div>
    <div class="p-4 flex flex-col flex-grow">
      <div data-action="view-detail" data-id="${p.id}" class="cursor-pointer">
        <div class="flex items-center justify-between gap-2 mb-1">
          <h4 class="font-bold text-sm text-gray-800 dark:text-gray-100 truncate flex-grow">${p.name}</h4>
          ${productBadge(p)}
        </div>
        <p class="text-base font-extrabold text-gray-900 dark:text-white">${money(p.price)}</p>
      </div>
      <div class="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
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
  const cats = ['Semua', ...new Set(ALL_CATEGORIES.map(c=>c.name).filter(Boolean).sort())];
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

async function renderProductDetail(id) {
    const view = $("#product-detail-view");
    if (!view) return;
    view.innerHTML = `<div class="p-8 text-center text-gray-700 dark:text-gray-300">Memuat...</div>`;

    const { data: p, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error || !p) {
        view.innerHTML = '<p class="p-8 text-center">Produk tidak ditemui.</p>';
        return;
    }

    const isWishlisted = wishlist.includes(String(p.id));
    const allImages = normalizeImages(p.image_urls);
    const mainImage = allImages.length > 0 ? allImages[0] : 'https://placehold.co/800x800?text=Gambar';

    view.innerHTML = `
    <section class="max-w-5xl mx-auto p-4">
      <a href="#" data-view="all-products" class="nav-link text-sm text-cyan-600 mb-6 inline-flex items-center hover:underline"><i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i> Kembali</a>
      
      <div>
        <img id="main-product-image" src="${mainImage}" alt="${p.name}" class="w-full rounded-lg shadow-lg mb-4 object-cover h-80">
        <div id="product-thumbnails" class="flex gap-2 overflow-x-auto pb-2">
          ${allImages.map((img, index) => `
            <img src="${img}" alt="Thumbnail ${index + 1}" data-img-src="${img}" class="thumbnail-img w-20 h-20 object-cover rounded-md cursor-pointer border-2 ${index === 0 ? 'border-cyan-500' : 'border-transparent'}">
          `).join('')}
        </div>
      </div>

      <div class="text-gray-800 dark:text-gray-200 mt-4">
        <p class="text-gray-500 dark:text-gray-400 text-sm">Kategori: ${p.category}</p>
        <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white mt-1">${p.name}</h2>
        <p class="text-3xl font-bold text-gray-900 dark:text-white my-4">${money(p.price)}</p>
        <p class="text-gray-600 dark:text-gray-300 leading-relaxed">${p.description || 'Tiada penerangan.'}</p>
        ${p.stock > 0 && p.stock < 10 ? `<p class="text-red-600 font-semibold text-sm mt-4">${p.stock} unit sahaja lagi!</p>`:''}
        ${p.stock === 0 ? `<p class="text-red-600 font-bold text-lg mt-4">HABIS DIJUAL</p>`:''}
        <div class="flex gap-3 mt-6">
          <button ${p.stock===0?'disabled':''} data-action="add-to-cart" data-id="${p.id}" class="flex-1 bg-cyan-600 text-white font-semibold py-3 rounded-lg hover:bg-cyan-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors">Tambah ke Troli</button>
          <button data-action="toggle-wishlist" data-id="${p.id}" class="px-4 rounded-lg border border-gray-300 dark:border-gray-600 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800">
            <i data-lucide="heart" class="w-5 h-5 ${isWishlisted ?'text-red-500 fill-red-500':'text-gray-600 dark:text-gray-300'}"></i>
          </button>
        </div>
      </div>
    </section>`;
    iconify();

    view.querySelector('#product-thumbnails')?.addEventListener('click', (e) => {
        const target = e.target.closest('.thumbnail-img');
        if (target) {
            $('#main-product-image').src = target.dataset.imgSrc;
            $$('.thumbnail-img').forEach(img => img.classList.remove('border-cyan-500'));
            target.classList.add('border-cyan-500');
        }
    });
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
function renderCart(){
  const box = $("#cart-items");
  if (box){
    if (cart.length===0) box.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-center"><i data-lucide="shopping-basket" class="w-16 h-16 text-gray-300 dark:text-gray-600"></i><p class="text-gray-500 dark:text-gray-400 mt-4">Troli anda kosong.</p></div>';
    else {
      box.innerHTML = cart.map(it=>`
        <div class="flex items-start gap-4 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <img src="${it.image_url || 'https://placehold.co/80x80'}" alt="${it.name}" class="w-20 h-20 object-cover rounded-md border">
          <div class="flex-grow text-gray-800 dark:text-gray-200">
            <p class="text-sm font-semibold">${it.name}</p>
            <p class="text-sm font-bold my-1">${money(it.price*it.quantity)}</p>
            <div class="flex items-center gap-3 my-1">
              <button data-action="decrement" data-id="${it.id}" class="p-1 w-7 h-7 flex items-center justify-center border rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">-</button>
              <span class="font-bold text-sm">${it.quantity}</span>
              <button data-action="increment" data-id="${it.id}" class="p-1 w-7 h-7 flex items-center justify-center border rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">+</button>
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
  localStorage.setItem(KEYS.CART, JSON.stringify(cart));
  iconify();
}
function addToCart(p){
  const it = cart.find(x=>String(x.id)===String(p.id));
  if (it){
    if (it.quantity < p.stock){ it.quantity++; showToast(`${p.name} ditambah!`); }
    else return showToast(`Stok ${p.name} tidak mencukupi!`,'error');
  } else {
    if (p.stock > 0) {
      cart.push({ id:String(p.id), name:p.name, price:p.price, image_url:firstImageOf(p), stock:p.stock, quantity:1 });
      showToast(`${p.name} ditambah!`);
    } else return showToast(`Stok ${p.name} habis!`, 'error');
  }
  renderCart();
  const cartBtn = $("#cart-btn");
  if (cartBtn) { cartBtn.classList.add('cart-shake'); setTimeout(()=> cartBtn.classList.remove('cart-shake'), 800); }
}
const removeFromCart = id => { cart = cart.filter(i=>String(i.id)!==String(id)); renderCart(); };
async function updateQuantity(id, d){
  const it = cart.find(i=>String(i.id)===String(id)); if (!it) return;
  const q = it.quantity + d; if (q<=0) return removeFromCart(id);
  const p = ALL_PRODUCTS.find(x => String(x.id) === String(id)) || it;
  if (q > p.stock) return showToast(`Stok ${p.name} tidak mencukupi!`,'error');
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
    document.body.style.overflow = 'hidden';
    if(el.classList.contains('modal')) el.classList.add('show');
    else el.style.transform = (el.id === 'search-modal') ? 'translateY(0)' : 'translateX(0)';
  } else {
    document.body.style.overflow = '';
    closeAllPanels();
  }
}
function closeAllPanels(){
  document.body.style.overflow = '';
  $("#overlay").classList.add('hidden');
  $("#cart-panel").style.transform='translateX(100%)';
  $("#search-modal").style.transform='translateY(-100%)';
  $$(".modal").forEach(m => m.classList.remove('show'));
}
async function switchView(view){
  $$('.view').forEach(v=>v.classList.remove('active'));
  $(`#${view}-view`)?.classList.add('active');
  $('#bottom-nav').style.display = view === 'admin' ? 'none' : 'flex';
  
  if (view !== 'admin') {
      window.scrollTo({ top:0, behavior:'smooth' });
      $$('.nav-bottom').forEach(b => b.classList.remove('active'));
      $(`.nav-bottom[data-view="${view}"]`)?.classList.add('active');
  }

  if (view === 'admin') await handleAdminAccess();
  if (['home', 'all-products'].includes(view)) await loadPage();
  if (view === 'wishlist') await renderWishlist();
}


/* ====== ADMIN LOGIC ====== */
async function renderAdminCategories() {
    await fetchCategories();
    const list = $("#category-list");
    if (!list) return;
    list.innerHTML = ALL_CATEGORIES.map(cat => `
        <div class="flex items-center justify-between p-3 dark:border-gray-700">
            <span class="text-sm text-gray-800 dark:text-gray-200">${cat.name}</span>
            <button data-action="delete-category" data-id="${cat.id}" class="btn-icon text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50">
                <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
            </button>
        </div>
    `).join('') || '<p class="p-4 text-center text-gray-500">Tiada kategori.</p>';
    iconify();
}
async function renderAdmin(){
  const {rows: adminProducts} = await fetchProductsServer({ page: 1, pageSize: 100 });
  const pList = $("#admin-product-list");
  if(pList) pList.innerHTML = `<div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 divide-y dark:divide-gray-700">
    ${adminProducts.map(p => `<div class="p-3 flex items-center justify-between gap-3">
        <div class="flex-grow"><p class="font-semibold text-gray-800 dark:text-gray-100">${p.name}</p><p class="text-xs text-gray-500">${p.category} • ${money(p.price)} • Stok: ${p.stock}</p></div>
        <div class="flex-shrink-0"><button data-action="edit-product" data-id="${p.id}" class="text-blue-600 hover:underline mr-3 text-sm font-medium">Edit</button><button data-action="delete-product" data-id="${p.id}" class="text-red-600 hover:underline text-sm font-medium">Padam</button></div>
    </div>`).join('') || '<p class="p-4 text-center text-gray-500">Tiada produk.</p>'}
  </div>`;
  await renderAdminCategories();
}
function renderImagePreviews(images, container) {
    container.innerHTML = images.map((url) => `
        <div class="relative group w-20 h-20">
            <img src="${url}" class="w-full h-full object-cover rounded-md border border-gray-300 dark:border-gray-600">
            <button type="button" data-url="${url}" class="absolute top-0 right-0 m-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Remove image">
                <i data-lucide="x" class="w-3 h-3 pointer-events-none"></i>
            </button>
        </div>
    `).join('');
    iconify();
}
async function openProductForm(id = null) {
    const form = $("#product-form"); if (!form) return;
    form.reset();
    $("#product-id").value = "";
    $("#product-existing-images").value = "[]";
    $("#product-images-preview").innerHTML = '';
    
    await fetchCategories();
    const categoryInput = $("#product-category");
    categoryInput.innerHTML = `<option value="">Pilih Kategori</option>` + ALL_CATEGORIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    let p = null;
    if (id) {
        const { data } = await supabase.from('products').select('*').eq('id', id).single();
        p = data;
    }
    
    if (p) {
        $("#product-form-title").textContent = 'Kemas Kini Produk';
        $("#product-id").value = p.id; $("#product-name").value = p.name;
        $("#product-price").value = p.price; $("#product-stock").value = p.stock;
        $("#product-category").value = p.category || '';
        $("#product-description").value = p.description || '';
        const existingImages = normalizeImages(p.image_urls);
        $("#product-existing-images").value = JSON.stringify(existingImages);
        renderImagePreviews(existingImages, $("#product-images-preview"));
    } else {
        $("#product-form-title").textContent = 'Tambah Produk Baharu';
    }
    togglePanel('product-form-modal', true);
}


/* ====== PAGE LOAD & INIT ====== */
async function loadPage(){
  const grid = $("#all-product-grid");
  renderSkeletonGrid(grid);
  await fetchCategories();
  const { rows, count } = await fetchProductsServer({ page: currentPage, term: CURRENT_FILTER.term, category: CURRENT_FILTER.category, sort: CURRENT_FILTER.sort });
  ALL_PRODUCTS = rows;
  TOTAL_PRODUCTS = count;
  renderCategories();
  renderGrid(ALL_PRODUCTS, grid, 'Tiada produk ditemui.');
  renderGrid(ALL_PRODUCTS.slice(0, 4), $("#featured-product-grid"), 'Tiada produk pilihan.');
  renderPagination();
}
document.addEventListener('DOMContentLoaded', async ()=>{
  initTheme();
  await Promise.all([fetchSettings(), loadPage()]);
  renderCart();
  handleHashChange();
  window.addEventListener('hashchange', handleHashChange);
  iconify();
  
  /* ====== GLOBAL CLICK HANDLER ====== */
  document.body.addEventListener('click', async (e)=>{
    const nav = e.target.closest('.nav-link');
    const actionBtn = e.target.closest('[data-action]');

    if (e.target.closest('[data-view]')) { e.preventDefault(); }
    if (nav?.dataset.view){ switchView(nav.dataset.view); closeAllPanels(); }
    if (actionBtn?.dataset.action === 'view-detail') { 
        switchView('product-detail'); 
        renderProductDetail(actionBtn.dataset.id); 
    }

    if (actionBtn){
      const { action, id } = actionBtn.dataset;
      let p;
      if (id) {
          p = ALL_PRODUCTS.find(x => String(x.id) === String(id));
          if (!p) {
              const { data } = await supabase.from('products').select('stock, name').eq('id', id).single();
              p = data;
          }
      }

      if (action==='add-to-cart' && p) addToCart(p);
      if (action==='remove-from-cart') removeFromCart(id);
      if (action==='increment') updateQuantity(id,+1);
      if (action==='decrement') updateQuantity(id,-1);
      if (action==='toggle-wishlist'){
        if (wishlist.includes(id)) wishlist = wishlist.filter(x=>x!==id); else wishlist.push(id);
        localStorage.setItem(KEYS.WISHLIST, JSON.stringify(wishlist));
        showToast('Wishlist dikemaskini'); renderCart();
        actionBtn.querySelector('i').classList.toggle('text-red-500', wishlist.includes(id));
        actionBtn.querySelector('i').classList.toggle('fill-red-500', wishlist.includes(id));
        if ($("#wishlist-view")?.classList.contains('active')) await renderWishlist();
      }
      if (action==='edit-product') openProductForm(id);
      if (action==='delete-product'){
        if (!confirm("Padam produk ini?")) return;
        try { await deleteProduct(id); showToast('Produk dipadam'); await renderAdmin(); await loadPage(); }
        catch(err) { showToast(err.message||'Gagal padam','error'); }
      }
      if (action==='delete-category') {
          if (!confirm("Padam kategori ini?")) return;
          try {
              const { error } = await supabase.from('categories').delete().eq('id', id);
              if (error) throw error;
              showToast('Kategori dipadam'); await renderAdminCategories();
          } catch(err) { showToast(err.message || 'Gagal padam', 'error'); }
      }
    }

    if (e.target.closest('#cart-btn') || e.target.closest('#mobile-cart-btn')) togglePanel('cart-panel', true);
    if (e.target.closest('#search-btn')){ togglePanel('search-modal', true); $("#search-input")?.focus(); }
    if (e.target.id === 'overlay' || e.target.closest('#close-search-btn') || e.target.closest('#close-cart-btn') || e.target.closest('#cancel-product-form-btn')) closeAllPanels();
    if (e.target.closest('#theme-btn')) applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
    if (e.target.closest('#whatsapp-btn')) {
        if (cart.length === 0) return showToast('Troli anda kosong!', 'error');
        const itemsList = cart.map(item => `• ${item.quantity}x ${item.name} (${money(item.price * item.quantity)})`).join('\n');
        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const message = `Assalamualaikum, saya berminat untuk menempah barang berikut:\n\n${itemsList}\n\n*Jumlah: ${money(total)}*\n\nBoleh sahkan ketersediaan stok? Terima kasih.`;
        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
        closeAllPanels();
    }
  });

  /* ====== INPUT & CHANGE HANDLERS ====== */
  $("#search-input")?.addEventListener('input', async e => { CURRENT_FILTER.term = e.target.value; currentPage = 1; await loadPage(); });
  $("#category-filters")?.addEventListener('click', async e => { if (e.target.tagName==='BUTTON'){ currentPage = 1; CURRENT_FILTER.category = e.target.dataset.category; await loadPage(); } });
  $("#sort-select")?.addEventListener('change', async e => { currentPage = 1; CURRENT_FILTER.sort = e.target.value; await loadPage(); });
  $("#pagination")?.addEventListener('click', async e => { const b = e.target.closest('button[data-page]'); if (b) { currentPage = Number(b.dataset.page)||1; await loadPage(); } });

  /* ====== ADMIN HANDLERS ====== */
  $("#logout-btn")?.addEventListener("click", async ()=>{
      await supabase.auth.signOut(); 
      showToast("Log keluar"); 
      handleAdminAccess();
  });
  $("#admin-tabs")?.addEventListener('click', e => {
    const btn = e.target.closest('.admin-tab'); if (!btn) return;
    $$('#admin-tabs .admin-tab').forEach(t => t.classList.remove('active')); btn.classList.add('active');
    $$('.admin-tab-content').forEach(c => c.classList.add('hidden')); $(`#admin-${btn.dataset.tab}-content`)?.classList.remove('hidden');
  });
  $("#add-product-btn")?.addEventListener("click", () => openProductForm());
  $("#add-category-btn")?.addEventListener('click', async () => {
      const name = $("#new-category-name").value.trim();
      if (!name) return showToast('Nama kategori diperlukan', 'error');
      const { error } = await supabase.from('categories').insert({ name });
      if (error) return showToast(error.message, 'error');
      showToast('Kategori ditambah'); $("#new-category-name").value = '';
      await renderAdminCategories();
  });
  $("#save-hero-btn")?.addEventListener('click', async () => {
      const file = $("#hero-file")?.files?.[0];
      if (!file) return showToast('Sila pilih fail gambar', 'error');
      try {
          const path = `settings/hero-banner.${file.name.split('.').pop()}`;
          const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
          const { error: dbError } = await supabase.from('settings').upsert({ key: 'hero_image_url', value: publicUrl }, { onConflict: 'key' });
          if (dbError) throw dbError;
          showToast('Gambar hero disimpan');
          await fetchSettings();
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
  $("#product-form")?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const record = {
          id: $("#product-id").value, name: $("#product-name").value, price: $("#product-price").value,
          stock: $("#product-stock").value, category: $("#product-category").value, description: $("#product-description").value,
          image_urls: $("#product-existing-images").value
      };
      const files = $("#product-images-input").files;
      try {
          await createOrUpdateProduct(record, files);
          showToast(`Produk ${record.id ? 'dikemaskini' : 'ditambah'}`);
          closeAllPanels(); await renderAdmin(); await loadPage();
      } catch (err) { showToast(err.message, 'error'); }
  });
});

