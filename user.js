let TOKEN = localStorage.getItem("vizon_user_token") || null;
let CURRENT_USER = null;
let PRODUCTS = [];
let CATEGORIES = [];
let ACTIVE_CATEGORY = "all";
let CURRENT_PRODUCT = null;
let CART_QTY = 1;
let CART = JSON.parse(localStorage.getItem("vizon_cart") || "[]"); // [{productId,name,image,price,qty}]
let PENDING_LOCATION = null; // for registration
let ORDER_LOCATION = null; // for order screen
let CURRENT_ORDER = null;
let trackingInterval = null;
let trackingMap = null;
let trackingMarker = null;

// NOTE: apiGet() / apiPost() come from api.js (shared with owner app),
// and GAS_URL / APP_SECRET come from config.js

// ---------------- BOOT ----------------
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    document.getElementById("view-splash").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    boot();
  }, 1200);
});

function boot() {
  loadCategories();
  loadProducts();
  if (TOKEN) {
    apiGet("me", { token: TOKEN })
      .then((res) => {
        CURRENT_USER = res.user;
        onLoggedIn();
      })
      .catch(() => {
        logout();
      });
  } else {
    onLoggedOut();
  }
  showScreen("home");
  updateCartBadge();
  pollUserNotifications();
  setInterval(pollUserNotifications, 5000);
}

function onLoggedIn() {
  document.getElementById("guest-banner").classList.add("hidden");
  if (CURRENT_USER && CURRENT_USER.id) {
    setupPushForRole("user", CURRENT_USER.id);
  }
}
function onLoggedOut() {
  document.getElementById("guest-banner").classList.remove("hidden");
}

function logout() {
  TOKEN = null;
  CURRENT_USER = null;
  localStorage.removeItem("vizon_user_token");
  onLoggedOut();
  showScreen("home");
}

function requireLogin() {
  if (!CURRENT_USER) {
    alert("Please login or create an account first.");
    showScreen("login");
    return false;
  }
  return true;
}

// ---------------- NAVIGATION ----------------
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  document.getElementById("screen-" + name).classList.remove("hidden");
  if (name === "orders") loadUserOrders();
  if (name === "profile") loadProfile();
  if (name === "notifications") loadUserNotifications();
  if (name === "avpoints") loadAvPoints();
  if (name === "cart") renderCartScreen();
  window.scrollTo(0, 0);
}
function goHome(name) {
  if (!CURRENT_USER && (name === "profile" || name === "avpoints" || name === "notifications")) {
    showScreen("login");
    return;
  }
  showScreen(name);
}

// ---------------- CATEGORIES / PRODUCTS ----------------
function loadCategories() {
  apiGet("categories").then((res) => {
    CATEGORIES = res.categories;
    const el = document.getElementById("category-chips");
    el.innerHTML =
      `<button class="chip active" onclick="filterCategory('all')">All</button>` +
      CATEGORIES.map((c) => `<button class="chip" onclick="filterCategory('${c}')">${c}</button>`).join("");
  });
}

function filterCategory(cat) {
  ACTIVE_CATEGORY = cat;
  document.querySelectorAll("#category-chips .chip").forEach((c, i) => {
    c.classList.toggle("active", (cat === "all" && i === 0) || c.innerText === cat);
  });
  document.getElementById("products-heading").innerText = cat === "all" ? "All Products" : cat;
  renderProducts();
}

function loadProducts() {
  apiGet("products").then((res) => {
    PRODUCTS = res.products;
    renderProducts();
  });
}

function renderProducts() {
  const search = (document.getElementById("search-input").value || "").toLowerCase();
  let list = PRODUCTS;
  if (ACTIVE_CATEGORY !== "all") list = list.filter((p) => p.category === ACTIVE_CATEGORY);
  if (search) list = list.filter((p) => p.name.toLowerCase().includes(search));

  const grid = document.getElementById("products-grid");
  if (!list.length) {
    grid.innerHTML = `<p class="hint">No products found.</p>`;
    return;
  }
  grid.innerHTML = list
    .map(
      (p) => `
    <div class="product-card" onclick="openProduct(${p.id})">
      <img src="${p.image}" />
      <div class="pc-body">
        <h4>${p.name}</h4>
        <p class="desc">${p.description || ""}</p>
        <div class="price">₹${p.price}</div>
        <button class="order-now-btn" onclick="event.stopPropagation(); quickAddToCart(${p.id})">Add to Cart</button>
      </div>
    </div>`
    )
    .join("");
}

function openProduct(id, goToOrder) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return;
  CURRENT_PRODUCT = p;
  CART_QTY = 1;
  document.getElementById("product-detail").innerHTML = `
    <div class="card">
      <img src="${p.image}" style="width:100%;border-radius:10px;max-height:260px;object-fit:cover" />
      <h2>${p.name}</h2>
      <p class="hint">${p.category}</p>
      <p>${p.description || ""}</p>
      <div class="price" style="font-size:20px">₹${p.price}</div>
      <div class="qty-control">
        <button onclick="changeQty(-1)">−</button>
        <span id="qty-display">1</span>
        <button onclick="changeQty(1)">+</button>
      </div>
      <div class="row gap">
        <button class="btn" style="flex:1" onclick="addToCart(${p.id})">Add to Cart</button>
        <button class="btn primary" style="flex:1;margin-top:0" onclick="buyNow(${p.id})">Buy Now</button>
      </div>
    </div>
  `;
  showScreen("product");
  if (goToOrder) buyNow(id);
}

function changeQty(delta) {
  CART_QTY = Math.max(1, CART_QTY + delta);
  document.getElementById("qty-display").innerText = CART_QTY;
}

// ---------------- CART ----------------
function saveCart() {
  localStorage.setItem("vizon_cart", JSON.stringify(CART));
  updateCartBadge();
}

function updateCartBadge() {
  const count = CART.reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById("cart-badge");
  if (!badge) return;
  if (count > 0) {
    badge.innerText = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function addItemToCart(p, qty) {
  const existing = CART.find((i) => i.productId === p.id);
  if (existing) existing.qty += qty;
  else CART.push({ productId: p.id, name: p.name, image: p.image, price: p.price, qty });
  saveCart();
}

function addToCart(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return;
  addItemToCart(p, CART_QTY);
  alert(p.name + " added to cart!");
}

function quickAddToCart(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return;
  addItemToCart(p, 1);
}

function buyNow(id) {
  const p = PRODUCTS.find((x) => x.id === id) || CURRENT_PRODUCT;
  if (!requireLogin()) return;
  // Buy Now checks out just this item (doesn't touch the persistent cart)
  goToOrderSummary([{ productId: p.id, name: p.name, image: p.image, price: p.price, qty: CART_QTY }]);
}

function renderCartScreen() {
  const body = document.getElementById("cart-body");
  if (!CART.length) {
    body.innerHTML = `<p class="hint">Your cart is empty. Browse products and add items to your cart.</p>
      <button class="btn primary" onclick="showScreen('home')">Browse Products</button>`;
    return;
  }
  const total = CART.reduce((s, i) => s + i.price * i.qty, 0);
  body.innerHTML =
    CART.map(
      (i, idx) => `
    <div class="card" style="display:flex;gap:12px;align-items:center">
      <img src="${i.image}" style="width:60px;height:60px;border-radius:8px;object-fit:cover" />
      <div style="flex:1">
        <b>${i.name}</b>
        <p class="hint">₹${i.price} each</p>
        <div class="qty-control" style="margin:6px 0">
          <button onclick="changeCartQty(${idx}, -1)">−</button>
          <span>${i.qty}</span>
          <button onclick="changeCartQty(${idx}, 1)">+</button>
        </div>
      </div>
      <div style="text-align:right">
        <b>₹${i.price * i.qty}</b><br/>
        <button class="btn small" style="color:#dc2626" onclick="removeCartItem(${idx})">Remove</button>
      </div>
    </div>`
    ).join("") +
    `<div class="card row-between"><b>Total</b><b>₹${total}</b></div>
     <button class="btn primary" onclick="checkoutCart()">Proceed to Checkout</button>`;
}

function changeCartQty(idx, delta) {
  CART[idx].qty = Math.max(1, CART[idx].qty + delta);
  saveCart();
  renderCartScreen();
}

function removeCartItem(idx) {
  CART.splice(idx, 1);
  saveCart();
  renderCartScreen();
}

function checkoutCart() {
  if (!requireLogin()) return;
  if (!CART.length) return;
  goToOrderSummary(CART);
}

let CHECKOUT_ITEMS = [];

function goToOrderSummary(items) {
  if (!requireLogin()) return;
  CHECKOUT_ITEMS = items;
  const total = CHECKOUT_ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
  const freeDelivery = total >= 100;
  document.getElementById("order-summary-body").innerHTML =
    CHECKOUT_ITEMS.map(
      (i) => `
    <div class="row-between" style="margin-bottom:8px">
      <div>
        <h3 style="margin:0">${i.name}</h3>
        <p class="hint" style="margin:2px 0">Qty: ${i.qty} × ₹${i.price}</p>
      </div>
      <img src="${i.image}" style="width:50px;height:50px;border-radius:8px;object-fit:cover" />
    </div>`
    ).join("") +
    `<hr/>
    <div class="row-between"><b>Total</b><b>₹${total}</b></div>
    <p class="hint">${freeDelivery ? "✅ Free Delivery applied (order ≥ ₹100)" : "Delivery charges (if any) will be added by the shop, payable in cash."}</p>`;

  document.getElementById("order-address").value = CURRENT_USER.address || "";
  ORDER_LOCATION = CURRENT_USER.location || null;
  document.getElementById("order-location-status").innerText = ORDER_LOCATION
    ? "Using your saved location."
    : "Location not set — tap 'Use Live Location'.";

  apiGet("avpoints", { token: TOKEN }).then((res) => {
    const el = document.getElementById("pay-avpoints-balance");
    el.innerText = `(Balance: ${bal} pts)`;
    const avRadio = document.querySelector('input[name="pay-method"][value="avpoints"]');
    if (bal < total) {
      avRadio.disabled = true;
      el.innerText = `(Balance: ${bal} pts — not enough for this order)`;
    } else {
      avRadio.disabled = false;
    }
  });

  showScreen("order");
}

function requestOrderLocation() {
  if (!navigator.geolocation) return alert("Geolocation not supported");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      ORDER_LOCATION = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      document.getElementById("order-location-status").innerText = "Live location captured ✓";
    },
    () => {
      document.getElementById("order-location-status").innerText = "Permission denied.";
    }
  );
}

function confirmOrder() {
  const address = document.getElementById("order-address").value.trim();
  const paymentMethod = document.querySelector('input[name="pay-method"]:checked').value;
  const errEl = document.getElementById("order-error");
  errEl.innerText = "";
  if (!address) {
    errEl.innerText = "Please enter delivery address";
    return;
  }
  if (!CHECKOUT_ITEMS.length) {
    errEl.innerText = "Your cart is empty";
    return;
  }
  const body = {
    token: TOKEN,
    items: CHECKOUT_ITEMS.map((i) => ({ productId: i.productId, qty: i.qty })),
    address,
    paymentMethod
  };
  if (ORDER_LOCATION) {
    body.lat = ORDER_LOCATION.lat;
    body.lng = ORDER_LOCATION.lng;
  }
  apiPost("placeOrder", body)
    .then((res) => {
      CURRENT_ORDER = res.order;
      // If this checkout came from the persistent cart, clear only the items that were ordered
      CHECKOUT_ITEMS.forEach((item) => {
        const idx = CART.findIndex((c) => c.productId === item.productId);
        if (idx !== -1) CART.splice(idx, 1);
      });
      saveCart();
      CHECKOUT_ITEMS = [];
      alert("Order placed! The shop will confirm shortly.");
      showScreen("orders");
    })
    .catch((e) => {
      errEl.innerText = e.message || "Failed to place order";
    });
}

// ---------------- AUTH: LOGIN ----------------
function userLogin() {
  const uniqueId = document.getElementById("login-uid").value.trim();
  const password = document.getElementById("login-pw").value;
  apiPost("login", { uniqueId, password })
    .then((res) => {
      TOKEN = res.token;
      CURRENT_USER = res.user;
      localStorage.setItem("vizon_user_token", TOKEN);
      onLoggedIn();
      showScreen("home");
    })
    .catch((e) => {
      document.getElementById("login-error").innerText = e.message || "Login failed";
    });
}

// ---------------- AUTH: REGISTER ----------------
let REG_MOBILE = "";

function sendOtp() {
  const name = document.getElementById("reg-name").value.trim();
  const mobile = document.getElementById("reg-mobile").value.trim();
  const err = document.getElementById("reg-step1-error");
  err.innerText = "";
  if (!name) { err.innerText = "Enter your name"; return; }
  if (!/^\d{10}$/.test(mobile)) { err.innerText = "Enter a valid 10 digit mobile number"; return; }
  REG_MOBILE = mobile;
  apiPost("otpSend", { mobile })
    .then((res) => {
      document.getElementById("reg-step-1").classList.add("hidden");
      document.getElementById("reg-step-2").classList.remove("hidden");
      // Demo mode: no real SMS gateway, so OTP is shown here directly.
      document.getElementById("demo-otp-hint").innerText = "Demo mode — your OTP is: " + res.demoOtp;
    })
    .catch((e) => { err.innerText = e.message || "Failed to send OTP"; });
}

function verifyOtp() {
  const otp = document.getElementById("reg-otp").value.trim();
  const err = document.getElementById("reg-step2-error");
  err.innerText = "";
  apiPost("otpVerify", { mobile: REG_MOBILE, otp })
    .then(() => {
      document.getElementById("reg-step2-success").innerText = "OTP Verified Successfully";
      setTimeout(() => {
        document.getElementById("reg-step-2").classList.add("hidden");
        document.getElementById("reg-step-3").classList.remove("hidden");
      }, 700);
    })
    .catch((e) => { err.innerText = e.message || "Invalid OTP"; });
}

function goStep4() {
  const dob = document.getElementById("reg-dob").value;
  if (!dob) return alert("Please select your date of birth");
  document.getElementById("reg-step-3").classList.add("hidden");
  document.getElementById("reg-step-4").classList.remove("hidden");
}

function requestLocation() {
  const status = document.getElementById("reg-location-status");
  if (!navigator.geolocation) { status.innerText = "Geolocation not supported"; return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      PENDING_LOCATION = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      status.innerText = "Location captured ✓";
      setTimeout(() => {
        document.getElementById("reg-step-4").classList.add("hidden");
        document.getElementById("reg-step-5").classList.remove("hidden");
      }, 500);
    },
    () => { status.innerText = "Permission denied. You can still continue and add address manually."; }
  );
}

function toggleShowPw() {
  const input = document.getElementById("reg-password");
  input.type = input.type === "password" ? "text" : "password";
  event.target.innerText = input.type === "password" ? "Show" : "Hide";
}

function submitRegistration() {
  const name = document.getElementById("reg-name").value.trim();
  const dob = document.getElementById("reg-dob").value;
  const password = document.getElementById("reg-password").value;
  const address = document.getElementById("reg-address").value.trim();
  const err = document.getElementById("reg-step5-error");
  err.innerText = "";
  if (!password || password.length < 4) {
    err.innerText = "Password must be at least 4 characters";
    return;
  }
  const body = { name, mobile: REG_MOBILE, dob, password, address };
  if (PENDING_LOCATION) {
    body.lat = PENDING_LOCATION.lat;
    body.lng = PENDING_LOCATION.lng;
  }
  apiPost("register", body)
    .then((res) => {
      document.getElementById("reg-step-5").classList.add("hidden");
      document.getElementById("reg-step-done").classList.remove("hidden");
      document.getElementById("new-uid").innerText = res.uniqueId;
      // Auto login
      return apiPost("login", { uniqueId: res.uniqueId, password });
    })
    .then((res) => {
      TOKEN = res.token;
      CURRENT_USER = res.user;
      localStorage.setItem("vizon_user_token", TOKEN);
      onLoggedIn();
    })
    .catch((e) => {
      err.innerText = e.message || "Registration failed";
    });
}

function copyUid() {
  const uid = document.getElementById("new-uid").innerText;
  navigator.clipboard.writeText(uid).then(() => alert("Unique ID copied!"));
}

// ---------------- ORDERS / TRACKING ----------------
function loadUserOrders() {
  if (!requireLogin()) return;
  apiGet("myOrders", { token: TOKEN }).then((res) => {
    const list = document.getElementById("orders-list-user");
    if (!res.orders.length) {
      list.innerHTML = `<p class="hint">You have no orders yet.</p>`;
      return;
    }
    list.innerHTML = res.orders
      .map(
        (o) => `
      <div class="order-row" onclick="openOrderScreen(${o.id})">
        <div class="row-between">
          <b>Order #${o.id}</b>
          <span class="status-pill status-${o.status}">${o.status.replace(/_/g, " ")}</span>
        </div>
        <p class="hint">${o.items.map((i) => i.name + " x" + i.qty).join(", ")} • ₹${o.total}</p>
        <p class="hint">${new Date(o.createdAt).toLocaleString()}</p>
      </div>`
      )
      .join("");
  });
}

function openOrderScreen(id) {
  apiGet("order", { id }).then((res) => {
    CURRENT_ORDER = res.order;
    const o = res.order;
    if (o.status === "awaiting_payment") {
      renderPaymentScreen(o);
      showScreen("payment");
    } else {
      renderTrackingScreen(o);
      showScreen("tracking");
    }
  });
}

function renderPaymentScreen(o) {
  document.getElementById("payment-amount").innerText = "₹" + (o.total + (o.deliveryCharges || 0));
  apiGet("qrcode").then((res) => {
    if (res.qrCodeImage) {
      document.getElementById("payment-qr").src = res.qrCodeImage;
      document.getElementById("payment-qr").classList.remove("hidden");
      document.getElementById("payment-qr-missing").classList.add("hidden");
    } else {
      document.getElementById("payment-qr").classList.add("hidden");
      document.getElementById("payment-qr-missing").classList.remove("hidden");
    }
  });
  document.getElementById("payment-status").innerText = "";
}

function markPaid() {
  apiPost("payNow", { token: TOKEN, orderId: CURRENT_ORDER.id }).then(() => {
    document.getElementById("payment-status").innerText =
      "Payment claim sent. Waiting for shop to verify...";
    setTimeout(() => showScreen("orders"), 1500);
  });
}

function renderTrackingScreen(o) {
  const steps = ["new", "confirmed", "paid", "dispatched", "delivered"];
  const labels = {
    new: "Order Placed",
    confirmed: "Preparing",
    paid: "Payment Confirmed",
    dispatched: "Out for Delivery",
    delivered: "Delivered"
  };
  let effectiveStatus = o.status;
  if (["awaiting_payment", "payment_pending_verification"].includes(o.status)) effectiveStatus = "confirmed";

  document.getElementById("tracking-body").innerHTML = `
    <div class="row-between">
      <h3>Order #${o.id}</h3>
      <span class="status-pill status-${o.status}">${o.status.replace(/_/g, " ")}</span>
    </div>
    <p class="hint">${o.items.map((i) => i.name + " x" + i.qty).join(", ")} — Total ₹${o.total + (o.deliveryCharges || 0)}</p>
    ${o.estimatedDeliveryTime ? `<p>⏱ Estimated Delivery: <b>${o.estimatedDeliveryTime}</b></p>` : ""}
    ${o.deliveryCharges !== null ? `<p>🚚 Delivery Charges: <b>₹${o.deliveryCharges}</b>${o.freeDelivery ? " (Free Delivery)" : ""}</p>` : ""}
    <ul class="timeline">
      ${steps
        .map((s, i) => {
          const doneIdx = steps.indexOf(effectiveStatus === "cancelled" ? "new" : effectiveStatus);
          return `<li class="${i <= doneIdx ? "done" : ""}">${labels[s]}</li>`;
        })
        .join("")}
    </ul>
  `;

  clearInterval(trackingInterval);
  const mapDiv = document.getElementById("tracking-map");
  if (o.status === "dispatched") {
    mapDiv.classList.remove("hidden");
    if (!trackingMap) {
      trackingMap = L.map("tracking-map").setView([20.5937, 78.9629], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(trackingMap);
    }
    const updateLoc = () => {
      apiGet("orderOwnerLocation", { token: TOKEN, orderId: o.id }).then((res) => {
        if (res.tracking && res.location) {
          const { lat, lng } = res.location;
          trackingMap.setView([lat, lng], 15);
          if (trackingMarker) trackingMarker.setLatLng([lat, lng]);
          else trackingMarker = L.marker([lat, lng]).addTo(trackingMap).bindPopup("Delivery Boy").openPopup();
        }
      });
    };
    updateLoc();
    trackingInterval = setInterval(updateLoc, 6000);
  } else {
    mapDiv.classList.add("hidden");
  }
}

// ---------------- AV POINTS ----------------
function loadAvPoints() {
  if (!requireLogin()) return;
  apiGet("avpoints", { token: TOKEN }).then((res) => {
    document.getElementById("av-balance-display").innerText = res.avPoints;
  });

  apiGet("qrcode").then((res) => {
    const img = document.getElementById("av-qr-image");
    const missing = document.getElementById("av-qr-missing");
    if (res.qrCodeImage) {
      img.src = res.qrCodeImage;
      img.classList.remove("hidden");
      missing.classList.add("hidden");
    } else {
      img.classList.add("hidden");
      missing.classList.remove("hidden");
    }
  });

  document.getElementById("av-recharge-error").innerText = "";
  document.getElementById("av-recharge-success").innerText = "";

  loadTransactionHistory();
}

function submitRechargeRequest() {
  const amount = document.getElementById("av-recharge-amount").value;
  const file = document.getElementById("av-recharge-screenshot").files[0];
  const errEl = document.getElementById("av-recharge-error");
  const okEl = document.getElementById("av-recharge-success");
  errEl.innerText = "";
  okEl.innerText = "";
  if (!amount || Number(amount) <= 0) {
    errEl.innerText = "Enter the amount you paid";
    return;
  }
  if (!file) {
    errEl.innerText = "Please upload a screenshot of your payment";
    return;
  }
  okEl.innerText = "Uploading...";
  fileToBase64(file)
    .then((base64) =>
      apiPost("rechargeRequest", {
        token: TOKEN,
        amount,
        imageBase64: base64,
        mimeType: file.type,
        fileName: file.name
      })
    )
    .then(() => {
      okEl.innerText = "Submitted! The shop will verify your payment and add points shortly.";
      document.getElementById("av-recharge-amount").value = "";
      document.getElementById("av-recharge-screenshot").value = "";
      loadTransactionHistory();
    })
    .catch((e) => {
      okEl.innerText = "";
      errEl.innerText = e.message || "Failed to submit";
    });
}

function loadTransactionHistory() {
  apiGet("avpointsHistory", { token: TOKEN }).then((res) => {
    const el = document.getElementById("av-transaction-history");
    const items = [];

    res.pendingRequests.forEach((r) => {
      items.push({
        date: r.createdAt,
        label: `Recharge request of ₹${r.amount}`,
        sub: "Waiting for shop to verify",
        amountText: "Pending",
        cls: ""
      });
    });

    res.transactions.forEach((t) => {
      if (t.type === "recharge_request" || t.type === "manual") {
        if (t.status === "rejected") {
          items.push({
            date: t.createdAt,
            label: `Recharge of ₹${t.amount} rejected`,
            sub: "Payment could not be verified",
            amountText: "—",
            cls: ""
          });
        } else {
          items.push({
            date: t.createdAt,
            label: `Recharge Verified (₹${t.amount})`,
            sub: `${t.basePoints} Points + ${t.bonus} Bonus`,
            amountText: "+" + t.totalPoints,
            cls: "credit"
          });
        }
      } else if (t.type === "order_payment") {
        items.push({
          date: t.createdAt,
          label: `Paid for Order #${t.relatedOrderId}`,
          sub: "AV Points used for payment",
          amountText: "−" + t.points,
          cls: "debit"
        });
      } else if (t.type === "order_refund") {
        items.push({
          date: t.createdAt,
          label: `Refund for Order #${t.relatedOrderId}`,
          sub: "Order was cancelled",
          amountText: "+" + t.points,
          cls: "credit"
        });
      }
    });

    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!items.length) {
      el.innerHTML = `<p class="hint">No transactions yet.</p>`;
      return;
    }
    el.innerHTML = items
      .map(
        (i) => `
      <div class="txn-row">
        <div>
          <b>${i.label}</b>
          <p class="hint" style="margin:2px 0">${i.sub}</p>
          <p class="hint" style="margin:0">${new Date(i.date).toLocaleString()}</p>
        </div>
        <div class="txn-amount ${i.cls}">${i.amountText}</div>
      </div>`
      )
      .join("");
  });
}

// ---------------- PROFILE ----------------
function loadProfile() {
  if (!requireLogin()) return;
  apiGet("me", { token: TOKEN }).then((res) => {
    const u = res.user;
    CURRENT_USER = u;
    document.getElementById("profile-body").innerHTML = `
      <div class="detail-row-p"><b>Name:</b> ${u.name}</div>
      <div class="detail-row-p"><b>Mobile:</b> ${u.mobile}</div>
      <div class="detail-row-p"><b>Unique ID:</b> ${u.id}</div>
      <div class="detail-row-p"><b>Date of Birth:</b> ${u.dob}</div>
      <div class="detail-row-p"><b>Address:</b> ${u.address || "-"}</div>
      <div class="detail-row-p"><b>AV Points:</b> ${u.avPoints}</div>
      <button class="btn danger" style="margin-top:16px;background:#dc2626;color:#fff" onclick="logout()">Logout</button>
    `;
  });
}

// ---------------- NOTIFICATIONS ----------------
// Notification sound — plays whenever the unread count goes UP (a new notification arrived)
const NOTIF_SOUND_URL = "https://drive.google.com/uc?export=download&id=1nbITYy1lqvtNzJG-M_BJ1O-d2-Q5gcBk";
const notifSound = new Audio(NOTIF_SOUND_URL);
let lastUnreadCount = 0;
let unreadCountInitialized = false;

function playNotifSound() {
  notifSound.currentTime = 0;
  notifSound.play().catch(() => {}); // ignore if browser blocks autoplay before any user interaction
}

function pollUserNotifications() {
  if (!TOKEN) return;
  apiGet("myNotifications", { token: TOKEN }).then((res) => {
    const unread = res.notifications.filter((n) => !n.read).length;
    if (unreadCountInitialized && unread > lastUnreadCount) {
      playNotifSound();
    }
    lastUnreadCount = unread;
    unreadCountInitialized = true;
    const badge = document.getElementById("user-notif-badge");
    if (unread > 0) {
      badge.innerText = unread;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }).catch(() => {});
}

function loadUserNotifications() {
  if (!requireLogin()) return;
  apiGet("myNotifications", { token: TOKEN }).then((res) => {
    const list = document.getElementById("user-notif-list");
    if (!res.notifications.length) {
      list.innerHTML = `<p class="hint">No notifications yet.</p>`;
      return;
    }
    list.innerHTML = res.notifications
      .map(
        (n) => `
      <div class="notif-item ${n.read ? "" : "unread"}" ${n.orderId ? `onclick="openOrderScreen(${n.orderId})" style="cursor:pointer"` : ""}>
        <h4>${n.title}</h4>
        <p>${n.message}</p>
        ${n.requiresPayment ? `<button class="btn small primary" style="margin-top:6px" onclick="event.stopPropagation(); openOrderScreen(${n.orderId})">Pay Now</button>` : ""}
        <span class="notif-time">${new Date(n.createdAt).toLocaleString()}</span>
      </div>`
      )
      .join("");
  });
}

function markAllUserNotifRead() {
  apiPost("markNotifRead", { token: TOKEN }).then(() => {
    loadUserNotifications();
    pollUserNotifications();
  });
}
