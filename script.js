/* ====== CONFIG: Supabase ====== */
const SUPABASE_URL = "https://wzkkaiajzjiswdupkgna.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2thaWFqemppc3dkdXBrZ25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMDI5MDUsImV4cCI6MjA3NTY3ODkwNX0.U1PxAxHJd6sAdQkHXZiTWYN0lbb33xJPRDK2ALjzO-Q";
const STORAGE_BUCKET = "kisuka_culture";

/* ====== BOOT ====== */
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ====== Utilities ====== */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const money = n => "RM" + (Number(n)||0).toFixed(2);
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,8);

function showToast(msg, type='success'){
  const c = $("#toast-container");
  const dv = document.createElement('div');
  const bg = type==='success' ? 'bg-gray-800' : 'bg-red-600';
  dv.className = `toast-notification ${bg} text-white text-sm font-semibold py-2 px-4 rounded-full shadow-lg`;
  dv.textContent = msg;
  c.innerHTML = '';
  c.appendChild(dv);
}
function iconify(){ try{ lucide.createIcons(); } catch(e){} }

/* ====== Local State (cart, wishlist) ====== */
const KEYS = {
  CART: 'unmeki_cart',
  WISHLIST: 'unmeki_wishlist',
  COUPON: 'unmeki_coupon',
  SHIPPING: 'unmeki_shipping'
};
let cart = JSON.parse(localStorage.getItem(KEYS.CART) || "[]");
let wishlist = JSON.parse(localStorage.getItem(KEYS.WISHLIST) || "[]");
let coupon = JSON.parse(localStorage.getItem(KEYS.COUPON) || "null");
let shipping = localStorage.getItem(KEYS.SHIPPING) || "standard";

/* ====== Auth UI ====== */
async function renderAuthArea(){
  const { data: { user } } = await supabase.auth.getUser();
  const area = $("#auth-area");
  if (user) {
    area.innerHTML = `
      <span class="text-sm text-gray-600 hidden md:inline">Log masuk sebagai <strong>${user.email}</strong></span>
      <button id="logout-btn" class="btn-light">Log Keluar</button>
    `;
    $("#logout-btn").onclick = async ()=>{ await supabase.auth.signOut(); showToast("Log keluar"); renderAuthArea(); };
  } else {
    area.innerHTML = `
      <form id="login-form" class="flex gap-2">
        <input type="email" id="login-email" placeholder="admin@email.com" class="border rounded p-2 text-sm" required>
        <input type="password" id="login-pass" placeholder="kata laluan" class="border rounded p-2 text-sm" required>
        <button class="btn-primary"><i data-lucide="log-in" class="w-4 h-4 mr-1"></i>Log Masuk</button>
      </form>
    `;
    iconify();
    $("#login-form").onsubmit = async (e)=>{
      e.preventDefault();
      const email = $("#login-email").value.trim();
      const password = $("#login-pass").value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return showToast(error.message, 'error');
      showToast("Berjaya log masuk");
      renderAuthArea();
      loadAndRenderAll();
    };
  }
}

/* ====== Data: Products & Orders ====== */
async function fetchProducts(){
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  if (error){ showToast("Gagal memuat produk", 'error'); return []; }
  return data || [];
}
async function fetchOrders(){
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return []; // orders visible only to admin
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('date', { ascending: false });
  if (error){ showToast("Gagal memuat pesanan", 'error'); return []; }
  return data || [];
}

async function createOrUpdateProduct(record, file){
  // If file provided → upload to Storage (path: "{category}/{uuid}.{ext}")
  let image_url = record.image_url?.trim() || "";
  if (file){
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = `${(record.category||'umum').toLowerCase()}/${uid()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    image_url = pub.publicUrl;
  }

  const payload = {
    name: record.name,
    description: record.description,
    price: Number(record.price),
    category: record.category,
    stock: Number(record.stock),
    image_url
  };

  if (record.id){ // update
    const { error } = await supabase.from('products').update(payload).eq('id', record.id);
    if (error) throw error;
  } else { // insert
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

/* ====== Rendering: Product Cards, Detail, Lists ====== */
let ALL_PRODUCTS = [];
let CURRENT_FILTER = { category: 'Semua', term: '', sort: 'popular' };

function productBadges(p){
  const badges=[];
  if (p.stock===0) badges.push('<span class="text-[11px] bg-gray-800 text-white px-2 py-0.5 rounded">HABIS</span>');
  if (p.stock>0 && p.stock<5) badges.push('<span class="text-[11px] bg-red-600 text-white px-2 py-0.5 rounded">LOW</span>');
  return badges.join(' ');
}

function renderProductCard(p){
  return `
  <div class="product-card bg-white rounded-lg shadow-md overflow-hidden group" data-id="${p.id}">
    <div class="relative">
      <img src="${p.image_url || 'https://placehold.co/600x600?text=Gambar'}" alt="${p.name}" class="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300">
      ${p.stock===0?'<div class="absolute inset-0 bg-black/50 flex items-center justify-center"><span class="text-white font-bold">HABIS DIJUAL</span></div>':''}
      <button data-action="toggle-wishlist" data-id="${p.id}" class="absolute top-2 right-2 bg-white/90 rounded-full p-2 shadow">
        <i data-lucide="${wishlist.includes(p.id)?'heart-off':'heart'}" class="w-4 h-4 text-pink-600"></i>
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

function renderAllProductsGrid(){
  // categories row
  const cats = ['Semua', ...new Set(ALL_PRODUCTS.map(p=>p.category))];
  $("#category-filters").innerHTML = cats.map(cat=>`
    <button data-category="${cat}" class="${CURRENT_FILTER.category===cat?'bg-cyan-500 text-white':'bg-gray-200 text-gray-700'} px-4 py-2 rounded-full text-sm font-semibold">${cat}</button>
  `).join('');

  // filter+sort
  let list = ALL_PRODUCTS.slice();
  if (CURRENT_FILTER.category!=='Semua') list = list.filter(p=>p.category===CURRENT_FILTER.category);
  if (CURRENT_FILTER.term.trim()) list = list.filter(p=>p.name.toLowerCase().includes(CURRENT_FILTER.term.toLowerCase()));

  const s = CURRENT_FILTER.sort;
  if (s==='price-asc')   list.sort((a,b)=>a.price - b.price);
  if (s==='price-desc')  list.sort((a,b)=>b.price - a.price);
  if (s==='newest')      list.sort((a,b)=> (new Date(b.created_at) - new Date(a.created_at)));
  if (s==='popular')     list.sort((a,b)=> (b.sold||0) - (a.sold||0));

  $("#all-product-grid").innerHTML = list.length ? list.map(renderProductCard).join('')
    : '<p class="col-span-full text-center text-gray-500">Tiada produk ditemui.</p>';

  // featured for home
  $("#featured-product-grid").innerHTML = ALL_PRODUCTS.slice(0,4).map(renderProductCard).join('');
  iconify();
}

function renderProductDetail(id){
  const p = ALL_PRODUCTS.find(x=>x.id===id);
  const view = $("#product-detail-view");
  if (!p){ view.innerHTML='<p class="p-8 text-center">Produk tidak ditemui.</p>'; return; }
  view.innerHTML = `
    <section class="max-w-5xl mx-auto p-4 md:p-8">
      <a href="#" data-view="all-products" class="nav-link text-sm text-cyan-600 mb-4 inline-flex items-center">
        <i data-lucide="arrow-left" class="w-4 h-4 mr-1"></i> Kembali
      </a>
      <div class="grid md:grid-cols-2 gap-8">
        <div>
          <img src="${p.image_url || 'https://placehold.co/800x800?text=Gambar'}" alt="${p.name}" class="w-full rounded-lg shadow-lg">
        </div>
        <div>
          <h2 class="text-3xl font-extrabold">${p.name}</h2>
          <p class="text-2xl font-bold text-gray-800 my-4">${money(p.price)}</p>
          <p class="text-gray-600">${p.description || ''}</p>
          ${p.stock>0 && p.stock<10 ? `<p class="text-red-600 text-sm mt-2">${p.stock} unit sahaja lagi!</p>`:''}
          <div class="flex gap-2 mt-4">
            <button ${p.stock===0?'disabled':''} data-action="add-to-cart" data-id="${p.id}" class="flex-1 bg-cyan-600 text-white font-semibold py-3 rounded-lg hover:bg-cyan-700 disabled:bg-gray-400">Tambah ke Troli</button>
            <button data-action="toggle-wishlist" data-id="${p.id}" class="px-4 rounded-lg border"><i data-lucide="${wishlist.includes(p.id)?'heart-off':'heart'}" class="w-4 h-4 inline mr-1"></i>Wishlist</button>
          </div>
        </div>
      </div>
    </section>
  `;
  iconify();
}

/* ====== Cart & Checkout ====== */
function cartSubtotal(){ return cart.reduce((s,i)=> s + i.price*i.quantity, 0); }
function shippingFee(){
  if (coupon?.type==='freeship') return 0;
  return shipping==='express'? 15 : 8;
}
function discountAmount(subtotal){
  if (!coupon) return 0;
  if (coupon.type==='percent') return subtotal*(coupon.amount/100);
  return 0;
}
function cartTotal(){ const sub=cartSubtotal(); return Math.max(0, sub-discountAmount(sub)) + shippingFee(); }

function renderCart(){
  const box = $("#cart-items");
  if (cart.length===0){ box.innerHTML = '<p class="text-gray-500 text-center mt-8">Troli anda kosong.</p>'; }
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
        <button data-action="remove-from-cart" data-id="${it.id}" class="p-1 rounded-full self-start" aria-label="Buang item">
          <i data-lucide="trash-2" class="w-4 h-4 text-red-500 pointer-events-none"></i>
        </button>
      </div>
    `).join('');
  }
  const items = cart.reduce((s,i)=>s+i.quantity,0);
  ["#cart-count", "#mobile-cart-count"].forEach(sel=>{ const el=$(sel); if (el) el.textContent = items; });
  $("#cart-subtotal").textContent = money(cartSubtotal());
  $("#cart-total").textContent = money(cartTotal());
  localStorage.setItem(KEYS.CART, JSON.stringify(cart));
  iconify();
}
function addToCart(product){
  const it = cart.find(x=>x.id===product.id);
  if (it){
    if (it.quantity < product.stock){ it.quantity++; showToast(`${product.name} ditambah!`); }
    else return showToast(`Stok ${product.name} tidak mencukupi!`, 'error');
  } else {
    if (product.stock>0) cart.push({ id: product.id, name: product.name, price: product.price, image_url: product.image_url, stock: product.stock, quantity: 1 });
  }
  renderCart();
}
function removeFromCart(id){ cart = cart.filter(i=>i.id!==id); renderCart(); }
function updateQuantity(id, delta){
  const it = cart.find(i=>i.id===id); if (!it) return;
  const q = it.quantity + delta;
  if (q<=0) return removeFromCart(id);
  const p = ALL_PRODUCTS.find(x=>x.id===id);
  if (q > (p?.stock||0)) return showToast(`Stok ${p?.name} tidak mencukupi!`, 'error');
  it.quantity = q; renderCart();
}

/* ====== Panels & Navigation ====== */
function togglePanel(id, forceOpen=null){
  const el = document.getElementById(id);
  const overlay = $("#overlay");
  const willOpen = forceOpen!==null ? forceOpen :
    (el.classList.contains('hidden') || el.style.transform);

  if (willOpen){
    if (id!=='checkout-modal' && id!=='product-form-modal'){ overlay.classList.remove('hidden'); }
    else { overlay.classList.add('hidden'); }
    if (id==='checkout-modal' || id==='product-form-modal'){
      el.classList.add('show'); el.classList.remove('hidden');
    } else if (id==='search-modal'){ el.style.transform = 'translateY(0)'; }
    else if (id==='mobile-menu'){ el.style.transform = 'translateX(0)'; }
    else { el.style.transform = 'translateX(0)'; }
  } else {
    closeAllPanels();
  }
}
function closeAllPanels(){
  $("#overlay").classList.add('hidden');
  const mm = $("#mobile-menu"); if (mm) mm.style.transform = 'translateX(-100%)';
  const cp = $("#cart-panel");  if (cp) cp.style.transform = 'translateX(100%)';
  const sm = $("#search-modal");if (sm) sm.style.transform = 'translateY(-100%)';
  // modals
  ["#product-form-modal","#checkout-modal","#receipt-modal"].forEach(sel=>{
    const el=$(sel); if (!el) return;
    el.classList.remove('show'); el.classList.add('hidden');
    if (sel==="#receipt-modal") el.remove();
  });
}

/* ====== Admin: Render Lists ====== */
async function renderAdmin(){
  // Stats
  $("#admin-total-products").textContent = ALL_PRODUCTS.length;
  const orders = await fetchOrders();
  $("#admin-total-orders").textContent = orders.length;
  const totalSales = orders.reduce((s,o)=> s + Number(o.total||0), 0);
  $("#admin-total-sales").textContent = money(totalSales);

  // Product table
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
  $("#admin-product-list").innerHTML = html;

  // Orders list
  if (orders.length===0){ $("#admin-order-list").innerHTML = '<p>Tiada pesanan lagi.</p>'; }
  else {
    $("#admin-order-list").innerHTML = orders.map(o=>`
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

  iconify();
}

/* ====== Load & Render All ====== */
async function loadAndRenderAll(){
  ALL_PRODUCTS = await fetchProducts();
  renderAllProductsGrid();
  renderCart();
  renderAdmin();
}

/* ====== Events ====== */
document.addEventListener('DOMContentLoaded', async ()=>{
  // Initial icons
  iconify();

  // Auth area
  await renderAuthArea();

  // Navigation clicks
  document.body.addEventListener('click', async (e)=>{
    const nav = e.target.closest('.nav-link');
    if (nav && nav.dataset.view){
      e.preventDefault();
      $$('.view').forEach(v => v.classList.remove('active'));
      document.querySelector(`#${nav.dataset.view}-view`)?.classList.add('active');
      if (nav.dataset.view==='admin') { await renderAuthArea(); await renderAdmin(); }
      if (['home','all-products'].includes(nav.dataset.view)) { renderAllProductsGrid(); }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      closeAllPanels();
    }

    if (e.target.closest('#menu-btn')) togglePanel('mobile-menu');
    if (e.target.closest('#cart-btn') || e.target.closest('#mobile-cart-btn')) togglePanel('cart-panel');
    if (e.target.closest('#search-btn')){ togglePanel('search-modal'); $("#search-input").focus(); }
    if (e.target.closest('#close-cart-btn') || e.target.closest('#close-search-btn') || e.target.closest('#overlay')) closeAllPanels();

    // Product card interactions
    const card = e.target.closest('.product-card');
    if (card && !e.target.closest('button[data-action]')){
      // open detail
      $$('.view').forEach(v => v.classList.remove('active'));
      $("#product-detail-view").classList.add('active');
      renderProductDetail(card.dataset.id);
    }

    // Buttons with data-action
    const btn = e.target.closest('button[data-action]');
    if (btn){
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action==='view-detail'){
        $$('.view').forEach(v => v.classList.remove('active'));
        $("#product-detail-view").classList.add('active');
        renderProductDetail(id);
      }
      if (action==='toggle-wishlist'){
        const pid = Number(id);
        if (wishlist.includes(pid)) wishlist = wishlist.filter(x=>x!==pid);
        else wishlist.push(pid);
        localStorage.setItem(KEYS.WISHLIST, JSON.stringify(wishlist));
        $("#wishlist-count").textContent = wishlist.length;
        renderAllProductsGrid();
        showToast('Wishlist dikemaskini');
      }
      if (action==='add-to-cart'){
        const p = ALL_PRODUCTS.find(x=>x.id===id);
        if (p) addToCart(p);
      }
      if (action==='remove-from-cart') removeFromCart(id);
      if (action==='increment') updateQuantity(id, +1);
      if (action==='decrement') updateQuantity(id, -1);
      if (action==='edit-product') openProductForm(id);
      if (action==='delete-product'){
        if (!confirm("Padam produk ini?")) return;
        try { await deleteProduct(id); showToast('Produk dipadam'); await loadAndRenderAll(); }
        catch(err){ showToast(err.message||'Gagal padam', 'error'); }
      }
    }

    // Admin tabs
    const tabBtn = e.target.closest('.admin-tab');
    if (tabBtn){
      $$('.admin-tab-content').forEach(el=>el.classList.remove('active'));
      $$('.admin-tab').forEach(el=>el.classList.remove('active'));
      tabBtn.classList.add('active');
      const tab = tabBtn.dataset.tab;
      document.querySelector(`#admin-${tab}-content`)?.classList.add('active');
    }
  });

  // Search, Sort, Category
  $("#search-input").addEventListener('keyup', e=>{
    CURRENT_FILTER.term = e.target.value; CURRENT_FILTER.category = 'Semua';
    $$('.view').forEach(v => v.classList.remove('active'));
    $("#all-products-view").classList.add('active');
    renderAllProductsGrid();
  });
  $("#category-filters").addEventListener('click', e=>{
    if (e.target.tagName==='BUTTON'){
      CURRENT_FILTER.category = e.target.dataset.category; CURRENT_FILTER.term = '';
      renderAllProductsGrid();
    }
  });
  $("#sort-select").addEventListener('change', e=>{
    CURRENT_FILTER.sort = e.target.value; renderAllProductsGrid();
  });

  // Cart actions
  $("#checkout-btn").addEventListener('click', ()=> {
    if (cart.length===0) return showToast('Troli anda kosong!', 'error');
    togglePanel('checkout-modal', true);
  });
  $("#close-checkout-modal-btn").addEventListener('click', ()=> togglePanel('checkout-modal', false));
  $("#apply-coupon-btn").addEventListener('click', ()=>{
    const code = $("#coupon-input").value.trim().toUpperCase();
    let applied = null;
    if (code==='SAVE10')  applied = { code, type:'percent', amount:10 };
    if (code==='FREESHIP'){
      if (cartSubtotal()>=80) applied = { code, type:'freeship', amount:0 };
      else return showToast('FREESHIP perlukan min RM80','error');
    }
    if (!applied) return showToast('Kupon tidak sah','error');
    coupon = applied; localStorage.setItem(KEYS.COUPON, JSON.stringify(coupon)); renderCart(); showToast(`Kupon ${code} digunakan`);
  });
  $("#shipping-method").addEventListener('change', e=>{ shipping = e.target.value; localStorage.setItem(KEYS.SHIPPING, shipping); renderCart(); });

  // Checkout submit
  $("#checkout-form").addEventListener('submit', async (e)=>{
    e.preventDefault();
    // stock check
    for (const it of cart){
      const p = ALL_PRODUCTS.find(x=>x.id===it.id);
      if (!p || it.quantity > p.stock) return showToast(`Stok ${p?.name||''} tidak mencukupi!`,'error');
    }

    const form = {
      name: $("#co-name").value.trim(),
      phone: $("#co-phone").value.trim(),
      address: $("#co-address").value.trim(),
      payment: $("#co-payment").value,
      note: $("#co-note").value.trim()
    };
    const order = {
      id: uid().toUpperCase(),
      date: new Date().toISOString(),
      items: cart.map(i=>({ id:i.id, name:i.name, price:i.price, qty:i.quantity })),
      subtotal: cartSubtotal(),
      shipping,
      shippingFee: shippingFee(),
      total: cartTotal(),
      status: 'Pending',
      address: form
    };

    try{
      // reduce stock locally (optimistic)
      for (const it of cart){
        const p = ALL_PRODUCTS.find(x=>x.id===it.id);
        await supabase.from('products').update({ stock: (p.stock - it.quantity) }).eq('id', it.id);
      }
      await createOrder(order);
      cart = []; localStorage.setItem(KEYS.CART, JSON.stringify(cart));
      coupon = null; localStorage.removeItem(KEYS.COUPON);
      renderCart();
      togglePanel('checkout-modal', false);
      closeAllPanels();
      showReceipt(order);
      showToast('Pesanan disahkan!');
      await loadAndRenderAll();
    } catch(err){
      showToast(err.message||'Ralat semasa membuat pesanan','error');
    }
  });

  // Product form (open/close/save)
  $("#add-product-btn")?.addEventListener('click', ()=> openProductForm());
  $("#cancel-product-form-btn")?.addEventListener('click', ()=> togglePanel('product-form-modal', false));
  $("#product-form")?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return showToast("Log masuk sebagai admin untuk simpan.", 'error');

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

    try{
      await createOrUpdateProduct(rec, file);
      togglePanel('product-form-modal', false);
      showToast('Produk disimpan!');
      await loadAndRenderAll();
    }catch(err){
      showToast(err.message||'Gagal simpan', 'error');
    }
  });

  // Import/Export
  $("#import-json")?.addEventListener('change', async (e)=>{
    const file = e.target.files[0]; if (!file) return;
    try{
      const text = await file.text();
      const list = JSON.parse(text);
      if (!Array.isArray(list)) throw new Error("Format JSON tidak sah");
      // Insert in bulk
      const payload = list.map(p=>({
        name: p.name, description: p.description||'', price: Number(p.price||0),
        category: p.category||'Umum', stock: Number(p.stock||0), image_url: p.image_url||null
      }));
      const { error } = await supabase.from('products').insert(payload);
      if (error) throw error;
      showToast('Produk diimport!');
      await loadAndRenderAll();
    }catch(err){
      showToast(err.message||'Import gagal','error');
    }
    e.target.value='';
  });
  $("#export-json")?.addEventListener('click', ()=>{
    const data = JSON.stringify(ALL_PRODUCTS, null, 2);
    const blob = new Blob([data], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download='products.json'; a.click();
    URL.revokeObjectURL(url);
  });

  // Order status change
  document.body.addEventListener('change', async (e)=>{
    if (e.target.classList.contains('order-status')){
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { showToast('Hanya admin boleh ubah status', 'error'); return; }
      const id = e.target.getAttribute('data-order');
      const { error } = await supabase.from('orders').update({ status: e.target.value }).eq('id', id);
      if (error) return showToast('Gagal kemaskini', 'error');
      showToast('Status pesanan dikemaskini');
    }
  });

  // Start
  await loadAndRenderAll();
});

/* ====== Helpers: Product Form & Receipt ====== */
function openProductForm(id=null){
  const form = $("#product-form");
  form.reset();
  $("#product-id").value = "";
  $("#product-image-file").value = "";

  if (id){
    const p = ALL_PRODUCTS.find(x=>x.id===id);
    if (!p) return;
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
  $("#receipt-close").addEventListener('click', ()=> $("#receipt-modal").remove());
}
