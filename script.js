/* ====== CONFIG: Supabase ====== */
const SUPABASE_URL = "https://wzkkaiajzjiswdupkgna.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2thaWFqemppc3dkdXBrZ25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMDI5MDUsImV4cCI6MjA3NTY3ODkwNX0.U1PxAxHJd6sAdQkHXZiTWYN0lbb33xJPRDK2ALjzO-Q";
const STORAGE_BUCKET = "kisuka_culture";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ====== Settings ====== */
const WHATSAPP_NUMBER = '60178450771'; // Replace with your actual WhatsApp number
const BANK_DETAILS = {
    name: "Bank Islam",
    account: "03148020137354",
    holder: "Fadhli Zufairi"
};

/* ====== Helpers ====== */
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const money = n => "RM" + (Number(n)||0).toFixed(2);
const uid = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const iconify = ()=> { try{ lucide.createIcons(); }catch(e){} };
const firstImageOf = (p) => { const arr = normalizeImages(p?.image_urls); return (arr && arr.length) ? arr[0] : "https://placehold.co/600x600?text=Product"; };
const normalizeImages = (val) => { if (Array.isArray(val)) return val; if (typeof val === "string") { try { const arr = JSON.parse(val); return Array.isArray(arr) ? arr : []; } catch { return []; } } return []; };
// New helper to calculate discounted price
const calculateDiscountedPrice = (price, discount) => {
    if (!discount || discount <= 0) return price;
    return price * (1 - discount / 100);
}

function showToast(msg, type='success'){
  const c = $("#toast-container"); if (!c) return;
  const el = document.createElement('div');
  el.className = `toast-notification ${type==='success'?'bg-gray-800 text-white':'bg-red-600 text-white'} text-sm font-semibold py-2 px-4 rounded-full shadow-lg`;
  el.textContent = msg;
  c.innerHTML = ""; c.appendChild(el);
}

/* ====== State ====== */
const KEYS = { CART:'unmeki_cart', WISHLIST:'unmeki_wishlist', THEME:'unmeki_theme' };
// FIX: ensure cart items have all necessary properties, including discount and stock
let cart = JSON.parse(localStorage.getItem(KEYS.CART) || "[]").map(item => ({
    id: String(item.id),
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    image_url: item.image_url,
    stock: item.stock || Infinity, // Set stock to Infinity if missing (to prevent Qty 9 limit issue)
    discount_percent: item.discount_percent || 0 // New discount property
}));
let wishlist = JSON.parse(localStorage.getItem(KEYS.WISHLIST) || "[]");
let ALL_PRODUCTS = [];
let ALL_CATEGORIES = [];
let TOTAL_PRODUCTS = 0;
let CURRENT_FILTER = { category:'All', term:'', sort:'popular' };
let currentPage = 1;
const pageSize = 8;
let CHAT_TEMPLATES = {}; // State to store WhatsApp chat templates

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
        <h2 class="text-xl font-bold text-center text-gray-900 dark:text-white mb-4">Admin Login</h2>
        <form id="login-form" class="space-y-4">
            <input type="email" id="login-email" placeholder="admin@email.com" class="form-input" required>
            <input type="password" id="login-pass" placeholder="password" class="form-input" required>
            <button class="btn-primary w-full">Log In</button>
        </form>
      </div>`;
    $("#login-form")?.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const { error } = await supabase.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-pass").value });
      if (error) return showToast(error.message, 'error');
      showToast("Login successful");
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
    
    const heroVideo = $('#hero-video');
    const heroImg = $('#hero-img');
    const heroPreviewContainer = $('#hero-preview-container');

    heroVideo.classList.add('hidden');
    heroImg.classList.add('hidden');

    const cacheBuster = `?t=${new Date().getTime()}`;

    if (settings.hero_video_url) {
        heroVideo.src = `${settings.hero_video_url}${cacheBuster}`;
        heroVideo.classList.remove('hidden');
        heroPreviewContainer.innerHTML = `<video src="${settings.hero_video_url}${cacheBuster}" muted playsinline class="w-full h-full object-cover"></video>`;
    } else if (settings.hero_image_url) {
        heroImg.src = `${settings.hero_image_url}${cacheBuster}`;
        heroImg.classList.remove('hidden');
        heroPreviewContainer.innerHTML = `<img src="${settings.hero_image_url}${cacheBuster}" class="w-full h-full object-cover">`;
    } else {
        heroImg.classList.remove('hidden');
        heroImg.src = 'https://placehold.co/1920x1080/000000/FFFFFF?text=kisuka_culture';
        heroPreviewContainer.innerHTML = `<span class="text-xs text-gray-500">Preview</span>`;
    }
}
async function fetchProductsServer({ page=1, term="", category="All", sort="popular", ids=null, includeSoldOut=false, limit=pageSize }={}){ // Menggunakan 'limit' sebagai nama baru untuk had.
  let query = supabase.from('products').select('*', { count: 'exact' });
  
  if (ids) { 
      query = query.in('id', ids); 
      limit = null; // Ignore limit when fetching by IDs
  } 
  else {
    if (term.trim()) query = query.ilike('name', `%${term}%`);
    if (category && category !== 'All') query = query.eq('category', category);
    
    // Updated filter: Only exclude if stock is 0 AND not marked for admin view (includeSoldOut)
    if (!includeSoldOut) {
        // NOTE: Supabase doesn't support complex OR filters easily on non-existing columns. 
        // We filter out explicitly sold out products AND products with 0 stock.
        query = query.neq('is_sold_out', true); 
        query = query.gt('stock', 0); 
    }
    
    if (sort==='price-asc') query = query.order('price', { ascending:true });
    else if (sort==='price-desc') query = query.order('price', { ascending:false });
    else if (sort==='newest') query = query.order('created_at', { ascending:false });
    
    // FIX: Only apply range/limit if 'limit' is a number > 0. If limit is null (used for admin), skip it.
    if (limit && typeof limit === 'number' && limit > 0) {
      query = query.range((page-1)*limit, page*limit - 1);
    }
  }
  const { data, count, error } = await query;
  if (error){ showToast("Failed to load products", 'error'); return { rows:[], count:0 }; }
  return { rows: data||[], count: count||0 };
}
async function fetchCategories() {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) { showToast("Failed to load categories", "error"); return []; }
    ALL_CATEGORIES = data || [];
    return ALL_CATEGORIES;
}
async function fetchChatTemplates() {
    const { data, error } = await supabase.from('whatsapp_chat_templates').select('*');
    if (error) { console.error("Error fetching chat templates:", error); return {}; }
    CHAT_TEMPLATES = data.reduce((acc, t) => {
        acc[t.category] = t.template;
        return acc;
    }, {});
    return CHAT_TEMPLATES;
}
async function updateChatTemplate(category, template) {
    const { error } = await supabase.from('whatsapp_chat_templates').upsert({ category, template }, { onConflict: 'category' });
    if (error) throw error;
}
async function deleteProduct(id){
  const { error } = await supabase.from('products').delete().eq('id', id); if (error) throw error;
}
async function createOrUpdateProduct(record, files){
    let existingImages = JSON.parse(record.image_urls || "[]");
    const newImageUrls = [];
    if (files && files.length > 0) {
        const uploadPromises = [...files].map(file => {
            const path = `${(record.category||'general').toLowerCase()}/${uid()}.${file.name.split('.').pop()}`;
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
        name: record.name, 
        description: record.description, 
        price: Number(record.price),
        category: record.category, 
        stock: Number(record.stock), 
        image_urls: finalImageUrls,
        // NEW FIELDS
        discount_percent: Number(record.discount_percent) || 0,
        is_sold_out: record.is_sold_out === 'true',
    };
    
    // Validation for discount
    if (payload.discount_percent < 0 || payload.discount_percent > 100) {
        throw new Error("Discount percentage must be between 0 and 100.");
    }

    const { error } = record.id
        ? await supabase.from('products').update(payload).eq('id', record.id)
        : await supabase.from('products').insert(payload);
    if (error) throw error;
}
async function createOrder(order) {
    const { error } = await supabase.from('orders').insert(order);
    if (error) throw error;
}
async function uploadCustomImage(file) {
    const path = `custom_orders/${uid()}-${file.name.split('.').pop()}`;
    const { error: uploadError, data: uploadData } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file);
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(uploadData.path);
    return publicUrl;
}

/* ====== RENDER FUNCTIONS ====== */
const productBadge = p => {
    // Check stock or is_sold_out status
    const isSoldOut = p.stock === 0 || p.is_sold_out;
    if (isSoldOut) return '<span class="badge-stock badge-stock-out">Sold Out</span>';
    if (p.discount_percent && p.discount_percent > 0) return `<span class="badge-stock badge-discount">-${p.discount_percent}%</span>`;
    return '';
};
const productCard = p => {
  const isWishlisted = wishlist.includes(String(p.id));
  const isSoldOut = p.stock === 0 || p.is_sold_out;
  const discountedPrice = calculateDiscountedPrice(p.price, p.discount_percent);

  const priceHTML = p.discount_percent > 0
    ? `<div class="flex items-baseline gap-2"><p class="text-base font-extrabold text-red-600 dark:text-red-400">${money(discountedPrice)}</p><p class="text-xs line-through text-gray-500 dark:text-gray-400">${money(p.price)}</p></div>`
    : `<p class="text-base font-extrabold text-gray-900 dark:text-white">${money(p.price)}</p>`;

  return `
  <div class="product-card bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden group relative flex flex-col">
    <div data-action="view-detail" data-id="${p.id}" class="cursor-pointer">
      <div class="absolute top-2 right-2 z-10">
        <button data-action="toggle-wishlist" data-id="${p.id}" class="bg-white/80 dark:bg-gray-900/80 rounded-full p-2 shadow-md hover:bg-white transition-transform hover:scale-110">
          <i data-lucide="heart" class="w-4 h-4 transition-all ${isWishlisted ? 'text-red-500 fill-red-500' : 'text-gray-600 dark:text-gray-300'} pointer-events-none"></i>
        </button>
      </div>
      <div class="product-image-container group-hover:scale-105 transition-transform duration-300">
        <img src="${firstImageOf(p)}" alt="${p.name}">
        ${isSoldOut ? '<div class="absolute inset-0 bg-black/50 flex items-center justify-center"><span class="text-white font-bold text-sm">SOLD OUT</span></div>':''}
      </div>
    </div>
    <div class="p-4 flex flex-col flex-grow">
      <div data-action="view-detail" data-id="${p.id}" class="cursor-pointer">
        <div class="flex items-center justify-between gap-2 mb-1">
          <h4 class="font-bold text-sm text-gray-800 dark:text-gray-100 truncate flex-grow">${p.name}</h4>
          ${productBadge(p)}
        </div>
        ${priceHTML}
      </div>
      <div class="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700">
        <button ${isSoldOut?'disabled':''} data-action="add-to-cart" data-id="${p.id}" class="w-full bg-cyan-500 text-white text-xs font-bold py-2.5 rounded-lg hover:bg-cyan-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">Add to Cart</button>
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
  const cats = ['All', ...new Set(ALL_CATEGORIES.map(c=>c.name).filter(Boolean).sort())];
  wrap.innerHTML = cats.map(c=> `<button data-category="${c}" class="${CURRENT_FILTER.category===c?'bg-cyan-600 text-white':'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'} px-4 py-2 rounded-full text-sm font-semibold transition-colors hover:bg-cyan-50 hover:border-cyan-200 dark:hover:bg-gray-600">${c}</button>`).join('');
  
  // Populate Custom Category Select
  const customCatSelect = $("#custom-category-select");
  if (customCatSelect) {
      customCatSelect.innerHTML = '<option value="">-- Pilih Kategori --</option>' + ALL_CATEGORIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  }
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
    view.innerHTML = `<div class="p-8 text-center text-gray-700 dark:text-gray-300">Loading...</div>`;

    const { data: p, error } = await supabase.from('products').select('*').eq('id', id).single();
    if (error || !p) {
        view.innerHTML = '<p class="p-8 text-center">Product not found.</p>';
        return;
    }

    const isWishlisted = wishlist.includes(String(p.id));
    const isSoldOut = p.stock === 0 || p.is_sold_out;
    const allImages = normalizeImages(p.image_urls);
    const mainImage = allImages.length > 0 ? allImages[0] : 'https://placehold.co/800x800?text=Image';
    const discountedPrice = calculateDiscountedPrice(p.price, p.discount_percent);
    
    const priceHTML = p.discount_percent > 0
        ? `<div class="flex items-baseline gap-3"><p class="text-3xl font-bold text-red-600 dark:text-red-400">${money(discountedPrice)}</p><p class="text-xl line-through text-gray-500 dark:text-gray-400">${money(p.price)}</p><span class="text-base font-semibold text-red-600 dark:text-red-400">(${p.discount_percent}% OFF)</span></div>`
        : `<p class="text-3xl font-bold text-gray-900 dark:text-white my-4">${money(p.price)}</p>`;


    view.innerHTML = `
    <section class="max-w-5xl mx-auto p-4">
      <a href="#" data-view="all-products" class="nav-link text-sm text-cyan-600 mb-6 inline-flex items-center hover:underline"><i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i> Back</a>
      
      <div>
        <img id="main-product-image" src="${mainImage}" alt="${p.name}" class="w-full rounded-lg shadow-lg mb-4 object-cover h-80">
        <div id="product-thumbnails" class="flex gap-2 overflow-x-auto pb-2">
          ${allImages.map((img, index) => `
            <img src="${img}" alt="Thumbnail ${index + 1}" data-img-src="${img}" class="thumbnail-img w-20 h-20 object-cover rounded-md cursor-pointer border-2 ${index === 0 ? 'border-cyan-500' : 'border-transparent'}">
          `).join('')}
        </div>
      </div>

      <div class="text-gray-800 dark:text-gray-200 mt-4">
        <p class="text-gray-500 dark:text-gray-400 text-sm">Category: ${p.category}</p>
        <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white mt-1">${p.name}</h2>
        ${priceHTML}
        ${isSoldOut ? `<p class="text-red-600 font-bold text-lg mt-4">SOLD OUT</p>`:''}
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Available Stock: ${p.stock}</p>
        <p class="text-gray-600 dark:text-gray-300 leading-relaxed mt-4">${p.description || 'No description available.'}</p>
        <div class="flex gap-3 mt-6">
          <button ${isSoldOut?'disabled':''} data-action="add-to-cart" data-id="${p.id}" class="flex-1 bg-cyan-600 text-white font-semibold py-3 rounded-lg hover:bg-cyan-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors">Add to Cart</button>
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
    grid.innerHTML = '<p class="col-span-full text-center text-gray-500 dark:text-gray-400 py-12">Your wishlist is empty.</p>';
    return;
  }
  renderSkeletonGrid(grid);
  // Fetch products, ensuring we get the latest stock/price/discount data
  const { rows } = await fetchProductsServer({ ids: wishlist, includeSoldOut: true, limit: null }); 
  renderGrid(rows, grid, 'Your wishlist is empty.');
}

/* ====== CART & PAYMENT LOGIC ====== */
const cartTotal = () => cart.reduce((s,i)=> {
    const finalPrice = calculateDiscountedPrice(i.price, i.discount_percent);
    return s + finalPrice * i.quantity;
}, 0);

function renderCart(){
  const box = $("#cart-items");
  if (box){
    if (cart.length===0) box.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-center"><i data-lucide="shopping-basket" class="w-16 h-16 text-gray-300 dark:text-gray-600"></i><p class="text-gray-500 dark:text-gray-400 mt-4">Your cart is empty.</p></div>`;
    else {
      box.innerHTML = cart.map(it=>{
        const discountedPrice = calculateDiscountedPrice(it.price, it.discount_percent);
        const priceHTML = it.discount_percent > 0 
            ? `<div class="flex flex-col"><p class="text-sm font-bold text-red-500">${money(discountedPrice * it.quantity)}</p><p class="text-xs line-through text-gray-500">${money(it.price * it.quantity)}</p></div>`
            : `<p class="text-sm font-bold my-1">${money(it.price * it.quantity)}</p>`;

        return `
        <div class="flex items-start gap-4 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <img src="${it.image_url || 'https://placehold.co/80x80'}" alt="${it.name}" class="w-20 h-20 object-cover rounded-md border">
          <div class="flex-grow text-gray-800 dark:text-gray-200">
            <p class="text-sm font-semibold">${it.name} ${it.discount_percent > 0 ? `(${it.discount_percent}% OFF)` : ''}</p>
            ${priceHTML}
            <div class="flex items-center gap-3 my-1">
              <button data-action="decrement" data-id="${it.id}" class="p-1 w-7 h-7 flex items-center justify-center border rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">-</button>
              <span class="font-bold text-sm">${it.quantity}</span>
              <button data-action="increment" data-id="${it.id}" class="p-1 w-7 h-7 flex items-center justify-center border rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">+</button>
            </div>
          </div>
          <button data-action="remove-from-cart" data-id="${it.id}" class="p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/50"><i data-lucide="trash-2" class="w-4 h-4 text-red-500 pointer-events-none"></i></button>
        </div>`}).join('');
    }
  }
  const cartItems = cart.reduce((s,i)=>s+i.quantity,0);
  $("#cart-count").textContent = cartItems;
  $("#mobile-cart-count").textContent = cartItems;
  $("#wishlist-count").textContent = wishlist.length;
  $("#cart-total").textContent = money(cartTotal());
  localStorage.setItem(KEYS.CART, JSON.stringify(cart));
  iconify();
}
async function addToCart(p){
  // Fix: The original logic failed to retrieve the full product object when adding from ALL_PRODUCTS.
  // We need to fetch the latest product data before adding to cart to fix the duplication and stock issues.
  let fullProduct;
  if (p.id) {
    const { data } = await supabase.from('products').select('*').eq('id', p.id).single();
    fullProduct = data;
  }
  if (!fullProduct) {
    return showToast("Gagal memuatkan maklumat produk.", 'error');
  }

  const it = cart.find(x=>String(x.id)===String(fullProduct.id));
  const isSoldOut = fullProduct.stock === 0 || fullProduct.is_sold_out;
  
  if (isSoldOut) {
    return showToast(`${fullProduct.name} telah habis stok!`, 'error');
  }
  
  if (it){
    // FIX: Check against the latest stock and allow quantity greater than 9
    if (it.quantity < fullProduct.stock){ 
        it.quantity++; 
        showToast(`${fullProduct.name} ditambahkan ke cart!`); 
    }
    else return showToast(`Stok tidak mencukupi untuk ${fullProduct.name}!`, 'error');
  } else {
    // FIX: Ensure all new properties (discount, stock) are saved in cart
    if (fullProduct.stock > 0) {
      cart.push({ 
          id: String(fullProduct.id), 
          name: fullProduct.name, 
          price: fullProduct.price, 
          image_url: firstImageOf(fullProduct), 
          stock: fullProduct.stock, 
          discount_percent: fullProduct.discount_percent || 0,
          quantity: 1 
      });
      showToast(`${fullProduct.name} ditambahkan ke cart!`);
    } else return showToast(`${fullProduct.name} telah habis stok!`, 'error');
  }
  
  // FIX: Remove duplicates caused by previous bug
  const uniqueCart = [];
  const ids = new Set();
  for (const item of cart) {
    if (!ids.has(item.id)) {
      uniqueCart.push(item);
      ids.add(item.id);
    } else {
      // If duplicate found, merge quantities
      const existing = uniqueCart.find(i => i.id === item.id);
      if (existing) {
          const newQty = existing.quantity + item.quantity;
          if (newQty <= existing.stock) {
             existing.quantity = newQty;
          } else {
             existing.quantity = existing.stock;
             showToast(`Quantity adjusted to maximum stock for ${item.name}.`, 'error');
          }
      }
    }
  }
  cart = uniqueCart;
  renderCart();
  const cartBtn = $("#cart-btn");
  if (cartBtn) { cartBtn.classList.add('cart-shake'); setTimeout(()=> cartBtn.classList.remove('cart-shake'), 800); }
}
const removeFromCart = id => { cart = cart.filter(i=>String(i.id)!==String(id)); renderCart(); };
async function updateQuantity(id, d){
  const it = cart.find(i=>String(i.id)===String(id)); if (!it) return;
  const q = it.quantity + d; 
  if (q<=0) return removeFromCart(id);
  
  // Get latest product data (for stock check and to fix missing stock issue)
  let fullProduct;
  const productInAll = ALL_PRODUCTS.find(x => String(x.id) === String(id));
  if (productInAll) {
    fullProduct = productInAll;
  } else {
    const { data } = await supabase.from('products').select('stock, name').eq('id', id).single();
    fullProduct = data;
  }
  
  // FIX: Use the stock from the fetched product or from cart item (as fallback)
  const stockLimit = fullProduct?.stock !== undefined ? fullProduct.stock : it.stock;

  if (q > stockLimit) return showToast(`Stok maksimum untuk ${it.name} adalah ${stockLimit}!`, 'error');
  
  it.quantity=q; 
  // FIX: Update the stock property in the cart item as well if we fetched a fresh one
  if (fullProduct?.stock !== undefined) it.stock = fullProduct.stock;

  renderCart();
}
function goToPayment() {
    if (cart.length === 0) {
        showToast('Your cart is empty!', 'error');
        return;
    }
    $("#bank-name").textContent = BANK_DETAILS.name;
    $("#bank-account").textContent = BANK_DETAILS.account;
    $("#bank-holder").textContent = BANK_DETAILS.holder;
    $("#payment-total").textContent = money(cartTotal());
    switchView('payment');
    closeAllPanels();
}
async function handleOrderSubmit(e) {
    e.preventDefault();
    const btn = $('#submit-payment-btn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    const formData = new FormData(e.target);
    const customer_details = Object.fromEntries(formData.entries());
    const receiptFile = customer_details.receipt;
    delete customer_details.receipt;

    try {
        if (!receiptFile || receiptFile.size === 0) throw new Error("Sila muat naik resit pembayaran.");
        
        const receiptPath = `receipts/${uid()}-${receiptFile.name}`;
        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(receiptPath, receiptFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl: receipt_url } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(receiptPath);

        const order = {
            id: uid().toUpperCase(),
            customer_details,
            // FIX: Save discounted price to items list for historical record
            items: cart.map(i => ({ 
                id: i.id, 
                name: i.name, 
                original_price: i.price, 
                price: calculateDiscountedPrice(i.price, i.discount_percent), 
                quantity: i.quantity,
                discount_percent: i.discount_percent || 0 
            })),
            total: cartTotal(),
            status: 'Pending',
            receipt_url
        };
        
        await createOrder(order);

        // Update stock only for items that still exist in the database and are not marked as sold out
        const stockUpdates = cart.map(item =>
            supabase.from('products').update({ stock: item.stock - item.quantity }).eq('id', item.id)
        );
        await Promise.all(stockUpdates);

        cart = [];
        localStorage.removeItem(KEYS.CART);
        renderCart();
        showToast('Pesanan anda telah dihantar dengan jayanya!');
        switchView('home');

    } catch (err) {
        showToast(err.message || 'Gagal menghantar pesanan.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm & Submit';
    }
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
  $('#bottom-nav').style.display = ['admin', 'payment'].includes(view) ? 'none' : 'flex';
  
  if (!['admin', 'payment'].includes(view)) {
      window.scrollTo({ top:0, behavior:'smooth' });
      $$('.nav-bottom').forEach(b => b.classList.remove('active'));
      $(`.nav-bottom[data-view="${view}"]`)?.classList.add('active');
  }

  if (view === 'admin') await handleAdminAccess();
  if (['home', 'all-products'].includes(view)) await loadPage();
  if (view === 'wishlist') await renderWishlist();
  if (view === 'custom') { await fetchCategories(); await updateCustomFormSoldOutProducts(); } // New logic for custom view
}


/* ====== ADMIN LOGIC ====== */
async function renderAdminDashboard() {
    const [{ count: productCount }, { data: orders, error }] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('total')
    ]);

    if (error) {
        console.error("Error fetching orders for dashboard:", error);
    }

    $('#admin-total-products').textContent = productCount || 0;
    $('#admin-total-orders').textContent = orders?.length || 0;
    const totalSales = orders?.reduce((sum, order) => sum + (order.total || 0), 0) || 0;
    $('#admin-total-sales').textContent = money(totalSales);
    iconify();
}
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
    `).join('') || '<p class="p-4 text-center text-gray-500">No categories.</p>';
    iconify();
}
async function renderAdminOrders() {
    const list = $("#admin-order-list");
    if (!list) return;
    list.innerHTML = `<p class="p-4 text-center text-gray-500">Loading orders...</p>`;
    
    const { data: orders, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });

    if (error) {
        list.innerHTML = `<p class="p-4 text-center text-red-500">Failed to load orders.</p>`;
        return;
    }
    
    if (orders.length === 0) {
        list.innerHTML = `<p class="p-4 text-center text-gray-500">No orders yet.</p>`;
        return;
    }

    list.innerHTML = `<div class="space-y-3">` + orders.map(o => {
        const isCustomOrder = o.items.length === 0; // Simple heuristic for custom order
        const totalAmount = money(o.total);
        return `
        <div class="order-card">
            <div>
                <p class="font-bold text-gray-900 dark:text-white">${o.customer_details.name}</p>
                <p class="text-xs text-gray-500">#${o.id.slice(-6)} • ${new Date(o.created_at).toLocaleString()}</p>
            </div>
            <div class="text-right">
                <p class="font-semibold text-gray-800 dark:text-gray-200">${totalAmount}</p>
                <p class="text-xs font-medium ${o.status === 'Shipped' ? 'text-green-500' : 'text-yellow-500'}">${o.status}</p>
            </div>
            <button data-action="view-order" data-id="${o.id}" class="btn-light !py-1 !px-3 text-xs">View</button>
        </div>
    `}).join('') + `</div>`;
}
async function renderAdminChatTemplates() {
    await fetchChatTemplates(); // Ensure CHAT_TEMPLATES is updated
    await fetchCategories();
    const list = $("#chat-templates-list");
    if (!list) return;

    list.innerHTML = ALL_CATEGORIES.map(cat => {
        const template = CHAT_TEMPLATES[cat.name] || 'Hi, saya berminat untuk membuat pesanan custom untuk produk $CATEGORY. Jenis customization: $TYPE. Butiran: $DETAILS. $PRODUCT_NAME $IMAGE_URL. Terima kasih.';
        return `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                <h4 class="font-bold text-gray-900 dark:text-white mb-2">${cat.name}</h4>
                <textarea data-category="${cat.name}" class="chat-template-input form-input" rows="4">${template}</textarea>
                <button data-action="save-chat-template" data-category="${cat.name}" class="btn-primary mt-2 text-sm px-3 py-1.5">Save Template</button>
            </div>
        `;
    }).join('') || '<p class="p-4 text-center text-gray-500">No categories to set templates for.</p>';
}
async function showOrderDetailModal(id) {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).single();
    if (error || !order) return showToast('Failed to get order details.', 'error');

    const content = $('#order-detail-content');
    
    // Detailed items list in modal
    const itemsListHtml = order.items.map(item => {
        const finalPrice = calculateDiscountedPrice(item.original_price || item.price, item.discount_percent);
        const priceDisplay = item.discount_percent > 0 
            ? `<span class="text-red-500">${money(finalPrice)}</span> <span class="line-through text-gray-400 text-xs">${money(item.original_price || item.price)}</span>`
            : money(item.price);

        return `<li>${item.quantity}x ${item.name} - ${priceDisplay}</li>`;
    }).join('');

    content.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">Order #${order.id.slice(-6)}</h3>
                <p class="text-sm text-gray-500">${new Date(order.created_at).toLocaleString()}</p>
            </div>
            <button data-action="close-modal" class="btn-icon"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="mt-4 border-t dark:border-gray-700 pt-4 space-y-3">
            <div>
                <h4 class="font-semibold text-gray-800 dark:text-gray-200 mb-1">Customer Details</h4>
                <div class="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                    <p><strong>Name:</strong> ${order.customer_details.name}</p>
                    <p><strong>Email:</strong> ${order.customer_details.email}</p>
                    <p><strong>Phone:</strong> ${order.customer_details.phone}</p>
                    <p><strong>Address:</strong> ${order.customer_details.address}</p>
                    ${order.customer_details.note ? `<p><strong>Note:</strong> ${order.customer_details.note}</p>` : ''}
                </div>
            </div>
            <div>
                <h4 class="font-semibold text-gray-800 dark:text-gray-200 mb-1">Items Ordered</h4>
                <ul class="text-sm text-gray-600 dark:text-gray-300 list-disc pl-5 space-y-1">
                    ${itemsListHtml}
                </ul>
                <p class="font-bold text-right mt-2 text-gray-800 dark:text-gray-200">Total: ${money(order.total)}</p>
            </div>
            <div>
                <h4 class="font-semibold text-gray-800 dark:text-gray-200 mb-2">Payment Receipt</h4>
                <a href="${order.receipt_url}" target="_blank">
                    <img src="${order.receipt_url}" class="w-full max-w-xs mx-auto rounded-md border dark:border-gray-600 cursor-pointer hover:opacity-80 transition-opacity">
                </a>
            </div>
            <div class="flex items-center gap-2 pt-4 border-t dark:border-gray-700">
                <label class="text-sm font-medium">Status:</label>
                <select id="order-status-select" data-id="${order.id}" class="form-input flex-grow">
                    ${['Pending', 'Processing', 'Shipped', 'Completed', 'Cancelled'].map(s => `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
        </div>
    `;
    iconify();
    togglePanel('order-detail-modal', true);
}
async function updateOrderStatus(id, status) {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) {
        showToast('Failed to update status.', 'error');
    } else {
        showToast('Order status updated!');
        renderAdminOrders();
    }
}
async function renderAdmin(){
  await renderAdminDashboard();
  
  const pList = $("#admin-product-list");
  if(pList) {
    // FIX: Set limit to null (within the fetchProductsServer function call) 
    // to ensure ALL products are loaded without pagination limits for the admin view.
    const {rows: adminProducts} = await fetchProductsServer({ page: 1, limit: null, includeSoldOut: true, sort: 'newest' });
    pList.innerHTML = `<div class="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 divide-y dark:divide-gray-700">
      ${adminProducts.map(p => {
          const isSoldOut = p.stock === 0 || p.is_sold_out;
          const discountedPrice = calculateDiscountedPrice(p.price, p.discount_percent);
          const priceDisplay = p.discount_percent > 0 
              ? `<span class="text-red-500">${money(discountedPrice)}</span> <span class="line-through text-gray-500 text-xs">${money(p.price)}</span>`
              : money(p.price);

          const statusBadge = isSoldOut 
              ? `<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400">SOLD OUT</span>`
              : p.stock < 5 
              ? `<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400">LOW STOCK (${p.stock})</span>`
              : `<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">IN STOCK (${p.stock})</span>`;

          const discountBadge = p.discount_percent > 0
              ? `<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400">-${p.discount_percent}%</span>`
              : '';

          return `<div class="p-3 flex items-center justify-between gap-3">
              <div class="flex-grow">
                  <p class="font-semibold text-gray-800 dark:text-gray-100">${p.name} ${discountBadge}</p>
                  <p class="text-xs text-gray-500">${p.category} • ${priceDisplay} • ${statusBadge}</p>
              </div>
              <div class="flex-shrink-0">
                  <button data-action="edit-product" data-id="${p.id}" class="text-blue-600 hover:underline mr-3 text-sm font-medium">Edit</button>
                  <button data-action="delete-product" data-id="${p.id}" class="text-red-600 hover:underline text-sm font-medium">Delete</button>
              </div>
          </div>`}).join('') || '<p class="p-4 text-center text-gray-500">No products.</p>'}
    </div>`;
  }
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
    categoryInput.innerHTML = `<option value="">Select Category</option>` + ALL_CATEGORIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    let p = null;
    if (id) {
        const { data } = await supabase.from('products').select('*').eq('id', id).single();
        p = data;
    }
    
    // Default values for new product
    $("#product-is-sold-out-false").checked = true;
    $("#product-discount-percent").value = 0;

    if (p) {
        $("#product-form-title").textContent = 'Update Product';
        $("#product-id").value = p.id; 
        $("#product-name").value = p.name;
        $("#product-price").value = p.price; 
        $("#product-stock").value = p.stock;
        $("#product-category").value = p.category || '';
        $("#product-description").value = p.description || '';
        
        // NEW FIELD VALUES
        $("#product-discount-percent").value = p.discount_percent || 0;
        $(`#product-is-sold-out-${p.is_sold_out ? 'true' : 'false'}`).checked = true;

        const existingImages = normalizeImages(p.image_urls);
        $("#product-existing-images").value = JSON.stringify(existingImages);
        renderImagePreviews(existingImages, $("#product-images-preview"));
    } else {
        $("#product-form-title").textContent = 'Add New Product';
    }
    togglePanel('product-form-modal', true);
}

/* ====== CUSTOM ORDER LOGIC ====== */
async function updateCustomFormSoldOutProducts() {
    const category = $("#custom-category-select").value;
    const soldOutSelect = $("#sold-out-select");
    const soldOutSection = $("#sold-out-product-section");
    const customTypeRadios = $$('input[name="custom_type"]');
    
    const selectedType = customTypeRadios.find(r => r.checked)?.value;
    
    if (!category || selectedType !== 'sold_out') {
        soldOutSection.classList.add('hidden');
        return;
    }

    soldOutSelect.innerHTML = '<option value="">Loading...</option>';

    // Query for products that are sold out (stock = 0 OR is_sold_out = true)
    const { data: soldOutProducts, error } = await supabase.from('products')
        .select('id, name')
        .eq('category', category)
        .or('stock.eq.0,is_sold_out.eq.true'); // Combine stock check and sold_out flag

    if (error) {
        soldOutSelect.innerHTML = '<option value="">-- Failed to load products --</option>';
        console.error("Error fetching sold out products:", error);
        return;
    }
    
    if (soldOutProducts && soldOutProducts.length > 0) {
        soldOutSelect.innerHTML = '<option value="">-- Pilih Produk --</option>' + soldOutProducts.map(p => 
            `<option value="${p.id}">${p.name}</option>`
        ).join('');
        soldOutSection.classList.remove('hidden');
    } else {
        soldOutSelect.innerHTML = '<option value="">-- Tiada Produk Sold Out Dalam Kategori Ini --</option>';
        soldOutSection.classList.remove('hidden'); // Show empty list
    }
}
async function handleCustomOrderSubmit(e) {
    e.preventDefault();
    
    const category = $("#custom-category-select").value;
    const customType = $('input[name="custom_type"]:checked')?.value;
    const details = $("#custom-details").value;
    const imageFile = $("#custom-image-file").files[0];
    const soldOutProductId = $("#sold-out-select").value;
    
    if (!category || !customType || !details) {
        return showToast('Sila lengkapkan semua butiran yang diperlukan.', 'error');
    }
    
    let imageUrl = '';
    let productName = '';
    
    const submitBtn = $('#custom-whatsapp-btn');
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Menyediakan mesej...';
    
    try {
        if (customType === 'new_design' && imageFile) {
            submitBtn.textContent = 'Memuat naik gambar...';
            imageUrl = await uploadCustomImage(imageFile);
        } else if (customType === 'sold_out' && soldOutProductId) {
            const { data: product } = await supabase.from('products').select('name').eq('id', soldOutProductId).single();
            productName = product?.name || 'Produk Tidak Diketahui';
        }
        
        // 1. Get the template based on category
        await fetchChatTemplates(); // ensure templates are fresh
        const template = CHAT_TEMPLATES[category] || CHAT_TEMPLATES['DEFAULT'] || 
                         "Hi, saya berminat untuk membuat pesanan custom. Kategori: $CATEGORY. Jenis: $TYPE. Butiran: $DETAILS. $IMAGE_URL. Terima kasih.";
        
        // 2. Fill the template
        let message = template
            .replace(/\$CATEGORY/g, category)
            .replace(/\$TYPE/g, customType === 'new_design' ? 'Reka Bentuk Baharu' : 'Produk Sold Out')
            .replace(/\$DETAILS/g, details);
            
        // Conditional replacements
        if (customType === 'sold_out' && productName) {
            message = message.replace(/\$PRODUCT_NAME/g, `Produk Asas: ${productName}`);
        } else {
            message = message.replace(/\$PRODUCT_NAME/g, '');
        }
        
        if (imageUrl) {
            message = message.replace(/\$IMAGE_URL/g, `Pautan Gambar Rujukan: ${imageUrl}`);
        } else {
            message = message.replace(/\$IMAGE_URL/g, 'Tiada gambar rujukan dimuat naik.');
        }

        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message.trim())}`;
        window.open(url, '_blank');
        
        // Reset form after successful submission
        e.target.reset();
        $("#sold-out-product-section").classList.add('hidden');
        $("#upload-image-section").classList.add('hidden');
        showToast('Permintaan custom dihantar ke WhatsApp!', 'success');

    } catch (err) {
        showToast(err.message || 'Gagal memproses pesanan custom.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}


/* ====== PAGE LOAD & INIT ====== */
async function loadPage(){
  const grid = $("#all-product-grid");
  renderSkeletonGrid(grid);
  await fetchCategories();
  // Changed fetchProductsServer call to only show IN STOCK items for general viewing
  const { rows, count } = await fetchProductsServer({ page: currentPage, category: CURRENT_FILTER.category, sort: CURRENT_FILTER.sort, includeSoldOut: false }); 
  ALL_PRODUCTS = rows;
  TOTAL_PRODUCTS = count;
  renderCategories();
  renderGrid(ALL_PRODUCTS, grid, 'No products found.');
  renderGrid(ALL_PRODUCTS.slice(0, 4), $("#featured-product-grid"), 'No featured products.');
  renderPagination();
}
document.addEventListener('DOMContentLoaded', async ()=>{
  initTheme();
  await Promise.all([fetchSettings(), loadPage(), fetchChatTemplates()]); // Fetch templates on load
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
    if (actionBtn?.dataset.action === 'back-to-cart') { 
        togglePanel('cart-panel', true);
    }

    if (actionBtn){
      const { action, id, category } = actionBtn.dataset;
      let p;
      if (id) {
          // Changed to fetch product from server to ensure latest data (e.g. discount)
          const { data } = await supabase.from('products').select('*').eq('id', id).single();
          p = data;
      }

      if (action==='add-to-cart' && p) addToCart(p);
      if (action==='remove-from-cart') removeFromCart(id);
      if (action==='increment') updateQuantity(id,+1);
      if (action==='decrement') updateQuantity(id,-1);
      if (action==='toggle-wishlist'){
        if (wishlist.includes(id)) wishlist = wishlist.filter(x=>x!==id); else wishlist.push(id);
        localStorage.setItem(KEYS.WISHLIST, JSON.stringify(wishlist));
        showToast('Wishlist updated'); renderCart();
        actionBtn.querySelector('i').classList.toggle('text-red-500', wishlist.includes(id));
        actionBtn.querySelector('i').classList.toggle('fill-red-500', wishlist.includes(id));
        if ($("#wishlist-view")?.classList.contains('active')) await renderWishlist();
      }
      if (action==='edit-product') openProductForm(id);
      if (action==='delete-product'){
        // Changed alert to confirm
        if (!window.confirm("Delete this product?")) return;
        try { await deleteProduct(id); showToast('Product deleted'); await renderAdmin(); await loadPage(); }
        catch(err) { showToast(err.message||'Failed to delete','error'); }
      }
      if (action==='delete-category') {
          // Changed alert to confirm
          if (!window.confirm("Delete this category?")) return;
          try {
              const { error } = await supabase.from('categories').delete().eq('id', id);
              if (error) throw error;
              showToast('Category deleted'); await renderAdminCategories();
          } catch(err) { showToast(err.message || 'Failed to delete', 'error'); }
      }
      if (action==='view-order') showOrderDetailModal(id);
      if (action==='close-modal') closeAllPanels();
      if (action==='save-chat-template') {
          const template = e.target.closest('.bg-white')?.querySelector('.chat-template-input')?.value;
          if (!template) return showToast('Template cannot be empty', 'error');
          try {
              await updateChatTemplate(category, template);
              showToast('Chat template saved!');
              await fetchChatTemplates();
          } catch(err) { showToast(err.message || 'Failed to save template', 'error'); }
      }
    }

    if (e.target.closest('#cart-btn') || e.target.closest('#mobile-cart-btn')) togglePanel('cart-panel', true);
    if (e.target.closest('#search-btn')){ togglePanel('search-modal', true); $("#search-input")?.focus(); }
    if (e.target.id === 'overlay' || e.target.closest('#close-search-btn') || e.target.closest('#close-cart-btn') || e.target.closest('#cancel-product-form-btn')) closeAllPanels();
    if (e.target.closest('#theme-btn')) applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
    if (e.target.closest('#checkout-btn')) goToPayment();
    if (e.target.closest('#whatsapp-btn')) {
        if (cart.length === 0) return showToast('Your cart is empty!', 'error');
        const itemsList = cart.map(item => {
            const finalPrice = calculateDiscountedPrice(item.price, item.discount_percent);
            const discountText = item.discount_percent > 0 ? ` (Discount: ${item.discount_percent}%)` : '';
            return `• ${item.quantity}x ${item.name} (${money(finalPrice * item.quantity)}) ${discountText}`;
        }).join('\n');

        const total = cartTotal();
        const message = `Hi, saya berminat untuk membuat pesanan item berikut:\n\n${itemsList}\n\n*Total: ${money(total)}*\n\nBoleh sahkan stok tersedia? Terima kasih.`;
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
  $("#payment-form")?.addEventListener('submit', handleOrderSubmit);
  document.body.addEventListener('change', e => {
    if (e.target.id === 'order-status-select') {
        updateOrderStatus(e.target.dataset.id, e.target.value);
    }
    // Custom Order form dynamic display logic
    if (e.target.id === 'custom-category-select') {
        updateCustomFormSoldOutProducts();
    }
    if (e.target.name === 'custom_type') {
        const type = e.target.value;
        const uploadSection = $("#upload-image-section");
        const soldOutSection = $("#sold-out-product-section");
        
        // Reset inputs and visibility
        uploadSection.classList.add('hidden');
        soldOutSection.classList.add('hidden');
        $("#custom-image-file").required = false;
        $("#sold-out-select").required = false;

        if (type === 'new_design') {
            uploadSection.classList.remove('hidden');
            $("#custom-image-file").required = true;
        } else if (type === 'sold_out') {
            updateCustomFormSoldOutProducts(); // Rerun to show the correct sold-out products
            $("#sold-out-select").required = true;
        }
    }
  });

  // Custom Order Form Submission
  $("#custom-order-form")?.addEventListener('submit', handleCustomOrderSubmit);


  /* ====== ADMIN HANDLERS ====== */
  $("#logout-btn")?.addEventListener("click", async ()=>{
      await supabase.auth.signOut(); 
      showToast("Logged out"); 
      handleAdminAccess();
  });
  $("#admin-tabs")?.addEventListener('click', e => {
    const btn = e.target.closest('.admin-tab'); if (!btn) return;
    $$('#admin-tabs .admin-tab').forEach(t => t.classList.remove('active')); btn.classList.add('active');
    $$('.admin-tab-content').forEach(c => c.classList.add('hidden')); $(`#admin-${btn.dataset.tab}-content`)?.classList.remove('hidden');
    if (btn.dataset.tab === 'dashboard') renderAdminDashboard();
    if (btn.dataset.tab === 'products') renderAdmin(); // Rerun to update list
    if (btn.dataset.tab === 'orders') renderAdminOrders();
    if (btn.dataset.tab === 'categories') renderAdminCategories();
    if (btn.dataset.tab === 'chat-templates') renderAdminChatTemplates(); // NEW
  });
  $("#add-product-btn")?.addEventListener("click", () => openProductForm());
  $("#add-category-btn")?.addEventListener('click', async () => {
      const name = $("#new-category-name").value.trim();
      if (!name) return showToast('Category name is required', 'error');
      
      try {
          // Add category
          const { error: catError } = await supabase.from('categories').insert({ name });
          if (catError) throw catError;
          
          // Add default chat template for new category
          const defaultTemplate = "Hi, saya berminat untuk membuat pesanan custom untuk produk $CATEGORY. Jenis customization: $TYPE. Butiran: $DETAILS. $PRODUCT_NAME $IMAGE_URL. Terima kasih.";
          await supabase.from('whatsapp_chat_templates').insert({ category: name, template: defaultTemplate });
          
          showToast('Category and default template added'); 
          $("#new-category-name").value = '';
          await renderAdminCategories();
      } catch(error) { 
          showToast(error.message || 'Failed to add category', 'error'); 
      }
  });
  $("#save-hero-btn")?.addEventListener('click', async () => {
      const file = $("#hero-file")?.files?.[0];
      if (!file) return showToast('Please select a file', 'error');
      
      const isVideo = file.type.startsWith('video/');
      const dbKey = isVideo ? 'hero_video_url' : 'hero_image_url';
      const otherDbKey = isVideo ? 'hero_image_url' : 'hero_video_url';

      try {
          const path = `settings/hero-banner.${file.name.split('.').pop()}`;
          const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
          
          const { error: dbError } = await supabase.from('settings').upsert({ key: dbKey, value: publicUrl }, { onConflict: 'key' });
          if (dbError) throw dbError;
          
          await supabase.from('settings').delete().eq('key', otherDbKey);

          showToast('Hero media saved');
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
          id: $("#product-id").value, 
          name: $("#product-name").value, 
          price: $("#product-price").value,
          stock: $("#product-stock").value, 
          category: $("#product-category").value, 
          description: $("#product-description").value,
          image_urls: $("#product-existing-images").value,
          // NEW FIELDS
          discount_percent: $("#product-discount-percent").value,
          is_sold_out: $('input[name="is_sold_out"]:checked').value,
      };
      const files = $("#product-images-input").files;
      try {
          await createOrUpdateProduct(record, files);
          showToast(`Product ${record.id ? 'updated' : 'added'}`);
          closeAllPanels(); await renderAdmin(); await loadPage();
      } catch (err) { showToast(err.message, 'error'); }
  });
   $('#hero-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            const previewContainer = $('#hero-preview-container');
            reader.onload = (event) => {
                if (file.type.startsWith('video/')) {
                    previewContainer.innerHTML = `<video src="${event.target.result}" muted playsinline class="w-full h-full object-cover"></video>`;
                } else {
                    previewContainer.innerHTML = `<img src="${event.target.result}" class="w-full h-full object-cover">`;
                }
            };
            reader.readAsDataURL(file);
        }
    });
});
