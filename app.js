"use strict";

/* ---------- storage keys ---------- */
const KEY_LOGIN = "pokladna_login";
const KEY_DATA = "pokladna_data";

/* ---------- app state ---------- */
let state = {
  products: [],
  sales: [],
  shoppingList: []
};

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const saveData = () => {
  localStorage.setItem(KEY_DATA, JSON.stringify({ products: state.products, sales: state.sales }));
};

const loadData = () => {
  const raw = localStorage.getItem(KEY_DATA);
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    state.products = d.products || [];
    state.sales = d.sales || [];
  } catch (e) {
    console.error("Failed to parse data", e);
  }
};

const saveLogin = (username, password) => {
  const payload = { username: btoa(username), password: btoa(password) };
  localStorage.setItem(KEY_LOGIN, JSON.stringify(payload));
};

const loadLogin = () => {
  const raw = localStorage.getItem(KEY_LOGIN);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return { username: atob(d.username), password: atob(d.password) };
  } catch (e) {
    return null;
  }
};

const encodeJSONFile = (content, filename) => {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
};

const downloadTextFile = (text, filename) => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
};

/* ---------- UI references ---------- */
const authScreen = $("#auth-screen");
const mainScreen = $("#main-screen");
const setupNote = $("#setup-note");
const authUsername = $("#auth-username");
const authPassword = $("#auth-password");
const authLoginBtn = $("#auth-login");
const authSetupBtn = $("#auth-setup");
const authMsg = $("#auth-msg");

const productsList = $("#products-list");
const addProductBtn = $("#btn-add-product");
const exportProductsBtn = $("#btn-export-products");
const importProductsBtn = $("#btn-import-products");
const importProductsFile = $("#import-products-file");

const cartTableBody = $("#cart-table tbody");
const totalText = $("#total-text");
const removeSelectedBtn = $("#btn-remove-selected");
const completeBtn = $("#btn-complete");

const salesHistoryEl = $("#sales-history");
const clearSalesBtn = $("#btn-clear-sales");
const logoutBtn = $("#btn-logout");

/* ---------- renderers ---------- */
function renderProducts() {
  productsList.innerHTML = "";
  if (state.products.length === 0) {
    productsList.innerHTML = `<div class="muted">Žádné produkty. Přidej nový produkt.</div>`;
    return;
  }
  state.products.forEach(p => {
    const tpl = document.getElementById("product-button-tpl");
    const node = tpl.content.cloneNode(true);
    const btn = node.querySelector(".product-btn");
    btn.textContent = `${p.name} (${p.price.toFixed(2)} Kč)`;
    btn.addEventListener("click", () => addToCart(p));
    productsList.appendChild(node);
  });
}

function renderCart() {
  cartTableBody.innerHTML = "";
  let total = 0;
  state.shoppingList.forEach((it, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = idx;
    const subtotal = it.price * it.count;
    total += subtotal;
    tr.innerHTML = `<td>${escapeHtml(it.name)}</td><td>${it.count}</td><td>${subtotal.toFixed(2)}</td>`;
    tr.addEventListener("click", () => {
      cartTableBody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
      tr.classList.add("selected");
    });
    cartTableBody.appendChild(tr);
  });
  totalText.textContent = `Celkem: ${total.toFixed(2)} CZK`;
}

function renderSales() {
  salesHistoryEl.innerHTML = "";
  if (!state.sales.length) {
    salesHistoryEl.innerHTML = `<div class="muted">Žádné prodeje.</div>`;
    return;
  }
  state.sales.slice().reverse().forEach(s => {
    const el = document.createElement("div");
    el.className = "sales-item";
    el.innerHTML = `<div><strong>${escapeHtml(s.order_id)}</strong><div class="muted">${escapeHtml(s.date)} • ${escapeHtml(s.payment)}</div></div>
                    <div>${(computeTotalFromItems(s.items)*(1 - s.discount/100)).toFixed(2)} Kč</div>`;
    el.addEventListener("click", () => {
      if (confirm("Chceš stáhnout účtenku?")) {
        downloadTextFile(s.receipt, `receipt_${s.order_id}.txt`);
      }
    });
    salesHistoryEl.appendChild(el);
  });
}

/* ---------- actions ---------- */
function addToCart(product) {
  const cnt = prompt(`Kolik ks '${product.name}'?`, "1");
  if (cnt === null) return;
  const n = parseInt(cnt);
  if (!n || n <= 0) return alert("Neplatný počet.");
  state.shoppingList.push({ name: product.name, price: product.price, count: n });
  renderCart();
}

function removeSelectedItem() {
  const sel = cartTableBody.querySelector("tr.selected");
  if (!sel) return;
  const idx = parseInt(sel.dataset.index);
  state.shoppingList.splice(idx, 1);
  renderCart();
}

function completeOrder() {
  if (!state.shoppingList.length) return alert("Košík je prázdný!");
  const payment = prompt("Zadejte typ platby (Hotově/Kartou):", "Hotově");
  if (payment === null) return;
  let discount = prompt("Sleva v %:", "0.0");
  if (discount === null) return;
  discount = parseFloat(discount);
  if (isNaN(discount) || discount < 0 || discount > 100) return alert("Sleva musí být číslo mezi 0 a 100.");
  const note = prompt("Poznámka k objednávce:", "") || "";
  const now = new Date();
  const nowStr = `${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const orderId = `ORD-${Math.floor(Date.now()/1000)}`;
  const total = computeTotalFromItems(state.shoppingList) * (1 - discount/100);

  let receipt = `--- ÚČTENKA ---\nObjednávka: ${orderId}\nDatum: ${nowStr}\nPlatba: ${payment}\nSleva: ${discount}%\nPoznámka: ${note}\n\n`;
  state.shoppingList.forEach(i => {
    receipt += `${i.name} x${i.count} = ${(i.price*i.count).toFixed(2)} Kč\n`;
  });
  receipt += `\nCELKEM: ${total.toFixed(2)} Kč\n---------------`;

  state.sales.push({
    order_id: orderId,
    date: nowStr,
    items: JSON.parse(JSON.stringify(state.shoppingList)),
    receipt,
    payment,
    discount,
    note
  });

  if (confirm("Účet uložen. Chceš stáhnout účtenku jako TXT?")) {
    downloadTextFile(receipt, `receipt_${orderId}.txt`);
  }

  state.shoppingList = [];
  saveData();
  renderCart();
  renderSales();
  alert("Účet uzavřen a uložen do historie.");
}

/* ---------- utils ---------- */
function pad(n){ return n.toString().padStart(2,'0'); }
function computeTotalFromItems(items){ return items.reduce((s,i)=> s + i.price*i.count, 0); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, (m)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;'}[m])); }

/* ---------- auth flow ---------- */
function showAuthScreen(setupMode=false) {
  authScreen.classList.remove("hidden");
  mainScreen.classList.add("hidden");
  setupNote.style.display = setupMode ? "block" : "none";
  authMsg.textContent = "";
  authPassword.value = "";
  authUsername.value = "";
}

function showMainScreen() {
  authScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
  loadData(); // načíst produkty a prodeje až po přihlášení
  renderProducts();
  renderCart();
  renderSales();
}

/* ---------- event wiring ---------- */
authLoginBtn.addEventListener("click", () => {
  const creds = loadLogin();
  if (!creds) { authMsg.textContent = "Neexistují uložené přihlašovací údaje. Vytvoř účet (Setup)."; return; }
  const u = authUsername.value.trim(), p = authPassword.value;
  if (u === creds.username && p === creds.password) {
    showMainScreen();
  } else {
    authMsg.textContent = "Nesprávné přihlašovací údaje!";
  }
});

authSetupBtn.addEventListener("click", () => {
  const u = authUsername.value.trim() || prompt("Zadej uživatelské jméno:");
  if (!u) return alert("Musíš zadat uživatelské jméno.");
  const p = authPassword.value || prompt("Zadej heslo:");
  if (!p) return alert("Musíš zadat heslo.");
  saveLogin(u, p);
  alert("Účet byl vytvořen. Přihlaš se.");
  showAuthScreen(false);
});

addProductBtn.addEventListener("click", () => {
  const name = prompt("Zadejte název produktu:");
  if (!name) return;
  const priceRaw = prompt("Zadejte cenu produktu (např. 49.90):");
  if (priceRaw === null) return;
  const price = parseFloat(priceRaw);
  if (isNaN(price)) return alert("Neplatná cena!");
  const found = state.products.find(p => p.name === name);
  if (found) found.price = Math.round(price*100)/100;
  else state.products.push({ name, price: Math.round(price*100)/100 });
  saveData();
  renderProducts();
});

exportProductsBtn.addEventListener("click", () => {
  const content = JSON.stringify(state.products, null, 2);
  encodeJSONFile(content, "products_export.json");
});

importProductsBtn.addEventListener("click", () => importProductsFile.click());
importProductsFile.addEventListener("change", (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const arr = JSON.parse(e.target.result);
      if (!Array.isArray(arr)) throw new Error("Neplatný formát");
      arr.forEach(it => { if (!it.name || typeof it.price !== "number") throw new Error("Neplatný item"); });
      state.products = arr;
      saveData();
      renderProducts();
      alert("Produkty naimportovány.");
    } catch (err) { alert("Import selhal: " + (err.message || err)); }
  };
  reader.readAsText(f, "utf-8");
});

removeSelectedBtn.addEventListener("click", removeSelectedItem);
completeBtn.addEventListener("click", completeOrder);
clearSalesBtn.addEventListener("click", () => {
  if (!confirm("Smazat celou historii prodejů?")) return;
  state.sales = [];
  saveData();
  renderSales();
});
logoutBtn.addEventListener("click", () => {
  if (!confirm("Opravdu se odhlásit?")) return;
  showAuthScreen(false);
});

// klávesové zkratky
window.addEventListener("keydown", (e) => {
  if (e.key === "F4") { e.preventDefault(); completeOrder(); }
  if (e.key === "Delete") { removeSelectedItem(); }
});

/* ---------- init ---------- */
function init() {
  const creds = loadLogin();
  if (!creds) showAuthScreen(true);
  else showAuthScreen(false);
}

init();
