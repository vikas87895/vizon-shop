let TOKEN = localStorage.getItem("vizon_owner_token") || null;
let CATEGORIES = [];
let ALL_ORDERS = [];
let currentOrderFilter = "all";
let locationSharing = false;
let locationInterval = null;

// NOTE: apiGet() / apiPost() come from ../api.js, GAS_URL/APP_SECRET from ../config.js

// ---------------- AUTH ----------------
function ownerLogin() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  apiPost("ownerLogin", { username, password })
    .then((res) => {
      TOKEN = res.token;
      localStorage.setItem("vizon_owner_token", TOKEN);
      boot();
    })
    .catch((e) => {
      document.getElementById("login-error").innerText = e.message || "Login failed";
    });
}

function ownerLogout() {
  TOKEN = null;
  localStorage.removeItem("vizon_owner_token");
  clearInterval(locationInterval);
  document.getElementById("app").classList.add("hidden");
  document.getElementById("view-login").classList.remove("hidden");
}

function boot() {
  document.getElementById("view-login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  setupPushForRole("owner");
  loadCategories();
  switchTab("dashboard");
  pollNotifications();
  setInterval(pollNotifications, 5000);
}

// ---------------- TABS ----------------
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-view").forEach((v) => v.classList.add("hidden"));
  document.getElementById("tab-" + tab).classList.remove("hidden");
  if (tab === "dashboard") loadDashboard();
  if (tab === "products") loadProducts();
  if (tab === "orders") loadOrders();
  if (tab === "notifications") loadOwnerNotifications();
  if (tab === "avpoints") loadRechargeRequests();
}

// ---------------- DASHBOARD ----------------
function loadDashboard() {
  apiGet("dashboard", { token: TOKEN }).then((res) => {
    const s = res.stats;
    document.getElementById("dashboard-cards").innerHTML = `
      <div class="stat-card"><h3>${s.todaysOrders}</h3><p>Today's Orders</p></div>
      <div class="stat-card"><h3>${s.pending}</h3><p>Pending Orders</p></div>
      <div class="stat-card"><h3>${s.completed}</h3><p>Completed Orders</p></div>
      <div class="stat-card"><h3>₹${s.revenue}</h3><p>Revenue (Delivered)</p></div>
      <div class="stat-card"><h3>${s.totalUsers}</h3><p>Total Users</p></div>
      <div class="stat-card"><h3>${s.totalProducts}</h3><p>Total Products</p></div>
    `;
  });
}

// ---------------- CATEGORIES ----------------
function loadCategories() {
  apiGet("categories").then((res) => {
    CATEGORIES = res.categories;
    const sel = document.getElementById("product-category");
    sel.innerHTML = CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("");
  });
}

// ---------------- PRODUCTS ----------------
function openProductForm(product) {
  document.getElementById("product-form").classList.remove("hidden");
  document.getElementById("product-form-error").innerText = "";
  if (product) {
    document.getElementById("product-form-title").innerText = "Edit Product";
    document.getElementById("product-id").value = product.id;
    document.getElementById("product-name").value = product.name;
    document.getElementById("product-desc").value = product.description;
    document.getElementById("product-category").value = product.category;
    document.getElementById("product-price").value = product.price;
  } else {
    document.getElementById("product-form-title").innerText = "Add Product";
    document.getElementById("product-id").value = "";
    document.getElementById("product-name").value = "";
    document.getElementById("product-desc").value = "";
    document.getElementById("product-price").value = "";
    document.getElementById("product-image").value = "";
  }
}
function closeProductForm() {
  document.getElementById("product-form").classList.add("hidden");
}

function saveProduct() {
  const id = document.getElementById("product-id").value;
  const name = document.getElementById("product-name").value.trim();
  const description = document.getElementById("product-desc").value.trim();
  const category = document.getElementById("product-category").value;
  const price = document.getElementById("product-price").value;
  const imageFile = document.getElementById("product-image").files[0];

  if (!name || !category || !price || (!imageFile && !id)) {
    document.getElementById("product-form-error").innerText =
      "Product Photo, Name, Category and Price are mandatory";
    return;
  }

  const finish = (imageBase64, mimeType, fileName) => {
    const body = { token: TOKEN, name, description, category, price };
    if (imageBase64) {
      body.imageBase64 = imageBase64;
      body.mimeType = mimeType;
      body.fileName = fileName;
    }
    const req = id ? apiPost("updateProduct", Object.assign({ id }, body)) : apiPost("addProduct", body);
    req
      .then(() => {
        closeProductForm();
        loadProducts();
      })
      .catch((e) => {
        document.getElementById("product-form-error").innerText = e.message || "Failed to save product";
      });
  };

  if (imageFile) {
    document.getElementById("product-form-error").innerText = "Uploading photo to Google Drive...";
    fileToBase64(imageFile).then((base64) => finish(base64, imageFile.type, imageFile.name));
  } else {
    finish(null);
  }
}

function deleteProduct(id) {
  if (!confirm("Delete this product?")) return;
  apiPost("deleteProduct", { token: TOKEN, id }).then(loadProducts);
}

function loadProducts() {
  apiGet("products").then((res) => {
    const list = document.getElementById("products-list");
    if (!res.products.length) {
      list.innerHTML = `<p class="hint">No products yet. Click "Add Product" to create your first one.</p>`;
      return;
    }
    list.innerHTML = res.products
      .map(
        (p) => `
      <div class="product-card">
        <img src="${p.image}" />
        <div class="pc-body">
          <span class="cat">${p.category}</span>
          <h4>${p.name}</h4>
          <p class="hint">${p.description || ""}</p>
          <div class="price">₹${p.price}</div>
          <div class="actions">
            <button class="btn small" onclick='openProductForm(${JSON.stringify(p).replace(/'/g, "&apos;")})'>Edit</button>
            <button class="btn small danger" onclick="deleteProduct(${p.id})">Delete</button>
          </div>
        </div>
      </div>`
      )
      .join("");
  });
}

// ---------------- ORDERS ----------------
function filterOrders(status) {
  currentOrderFilter = status;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.status === status));
  renderOrders();
}

function loadOrders() {
  apiGet("ownerOrders", { token: TOKEN }).then((res) => {
    ALL_ORDERS = res.orders;
    renderOrders();
  });
}

function renderOrders() {
  const list = document.getElementById("orders-list");
  let orders = ALL_ORDERS;
  if (currentOrderFilter !== "all") orders = orders.filter((o) => o.status === currentOrderFilter);
  if (!orders.length) {
    list.innerHTML = `<p class="hint">No orders in this category.</p>`;
    return;
  }
  list.innerHTML = orders
    .map(
      (o) => `
    <div class="order-row" onclick="openOrderModal(${o.id})">
      <div>
        <b>Order #${o.id}</b> — ${o.userName} (${o.userMobile})<br/>
        <span class="hint">${o.items.map((i) => i.name + " x" + i.qty).join(", ")} • ₹${o.total} • ${new Date(o.createdAt).toLocaleString()}</span>
      </div>
      <span class="status-pill status-${o.status}">${o.status.replace(/_/g, " ")}</span>
    </div>`
    )
    .join("");
}

function openOrderModal(id) {
  apiGet("order", { id }).then((res) => {
    const o = res.order;
    const body = document.getElementById("order-modal-body");
    body.innerHTML = `
      <h3>Order #${o.id} <span class="status-pill status-${o.status}">${o.status.replace(/_/g, " ")}</span></h3>
      <div class="detail-row"><b>Customer</b><span>${o.userName}</span></div>
      <div class="detail-row"><b>Mobile</b><span>${o.userMobile}</span></div>
      <div class="detail-row"><b>Unique ID</b><span>${o.userId}</span></div>
      <div class="detail-row"><b>DOB</b><span>${o.userDob}</span></div>
      <div class="detail-row"><b>Address</b><span>${o.address || "-"}</span></div>
      <div class="detail-row"><b>Location</b><span>${o.location ? o.location.lat.toFixed(4) + ", " + o.location.lng.toFixed(4) : "-"}</span></div>
      <div class="detail-row"><b>Items</b><span>${o.items.map((i) => i.name + " x" + i.qty + " (₹" + i.price + ")").join("<br/>")}</span></div>
      <div class="detail-row"><b>Total</b><span>₹${o.total}${o.freeDelivery ? " (Free Delivery eligible)" : ""}</span></div>
      <div class="detail-row"><b>Payment Method</b><span>${o.paymentMethod === "cod" ? "Cash on Delivery" : "Online Payment"}</span></div>
      <div class="detail-row"><b>Payment Verified</b><span>${o.paymentVerified ? "Yes" : "No"}</span></div>
      <div class="detail-row"><b>Order Time</b><span>${new Date(o.createdAt).toLocaleString()}</span></div>
      ${o.estimatedDeliveryTime ? `<div class="detail-row"><b>Estimated Time</b><span>${o.estimatedDeliveryTime}</span></div>` : ""}
      ${o.deliveryCharges !== null ? `<div class="detail-row"><b>Delivery Charges</b><span>₹${o.deliveryCharges}</span></div>` : ""}
      <div id="order-actions" style="margin-top:16px; display:flex; flex-direction:column; gap:10px;"></div>
    `;
    renderOrderActions(o);
    document.getElementById("order-modal").classList.remove("hidden");
  });
}

function renderOrderActions(o) {
  const el = document.getElementById("order-actions");
  let html = "";

  if (o.status === "new") {
    html += `
      <label>Estimated Delivery Time</label>
      <input type="text" id="est-time" placeholder="e.g. 30 Minutes" />
      <label>Delivery Charges (₹)</label>
      <input type="number" id="del-charge" placeholder="e.g. 20" ${o.freeDelivery ? "disabled value='0'" : ""} />
      ${o.freeDelivery ? '<p class="hint">Order total ≥ ₹100 — Free Delivery applies automatically.</p>' : ""}
      <button class="btn primary" onclick="processOrder(${o.id})">Order Placed</button>
      <button class="btn danger" onclick="cancelOrder(${o.id})">Cancel Order</button>
    `;
  } else if (o.status === "awaiting_payment") {
    html += `<p class="hint">Waiting for customer to pay online and click "Pay Now".</p>
      <button class="btn danger" onclick="cancelOrder(${o.id})">Cancel Order</button>`;
  } else if (o.status === "payment_pending_verification") {
    html += `<p class="hint">Customer claims payment done. Check your FamPay app, then verify.</p>
      <button class="btn primary" onclick="verifyPayment(${o.id})">Verify Payment</button>`;
  } else if (o.status === "paid" || o.status === "confirmed") {
    html += `<button class="btn primary" onclick="dispatchOrder(${o.id})">Dispatch Order (Start Tracking)</button>
      <button class="btn danger" onclick="cancelOrder(${o.id})">Cancel Order</button>`;
  } else if (o.status === "dispatched") {
    html += `<button class="btn primary" onclick="deliverOrder(${o.id})">Mark as Delivered</button>`;
  } else if (o.status === "delivered") {
    html += `<p class="success">Order Completed ✓</p>`;
  } else if (o.status === "cancelled") {
    html += `<p class="hint">This order was cancelled.</p>`;
  }
  el.innerHTML = html;
}

function processOrder(id) {
  const estimatedDeliveryTime = document.getElementById("est-time").value.trim();
  const deliveryCharges = document.getElementById("del-charge").value || 0;
  if (!estimatedDeliveryTime) return alert("Please enter estimated delivery time");
  apiPost("processOrder", {
    token: TOKEN,
    orderId: id,
    estimatedDeliveryTime,
    deliveryCharges
  }).then(() => {
    closeOrderModal();
    loadOrders();
  });
}
function verifyPayment(id) {
  apiPost("verifyPayment", { token: TOKEN, orderId: id }).then(() => {
    closeOrderModal();
    loadOrders();
  });
}
function dispatchOrder(id) {
  apiPost("dispatchOrder", { token: TOKEN, orderId: id }).then(() => {
    closeOrderModal();
    loadOrders();
    alert("Order dispatched. Don't forget to turn on Live Location Sharing in Settings!");
  });
}
function deliverOrder(id) {
  apiPost("deliverOrder", { token: TOKEN, orderId: id }).then(() => {
    closeOrderModal();
    loadOrders();
  });
}
function cancelOrder(id) {
  if (!confirm("Cancel this order?")) return;
  apiPost("cancelOrder", { token: TOKEN, orderId: id }).then(() => {
    closeOrderModal();
    loadOrders();
  });
}
function closeOrderModal() {
  document.getElementById("order-modal").classList.add("hidden");
}

// ---------------- AV POINTS ----------------
function submitAvPoints() {
  const uniqueId = document.getElementById("av-uniqueid").value.trim();
  const amount = document.getElementById("av-amount").value;
  document.getElementById("av-result").innerText = "";
  document.getElementById("av-error").innerText = "";
  if (!uniqueId || !amount) {
    document.getElementById("av-error").innerText = "Enter Unique ID and Amount";
    return;
  }
  apiPost("addAvPoints", { token: TOKEN, uniqueId, amount })
    .then((res) => {
      document.getElementById("av-result").innerText =
        `Success! ${res.added} points added. User balance: ${res.user.avPoints}`;
      document.getElementById("av-amount").value = "";
    })
    .catch((e) => {
      document.getElementById("av-error").innerText = e.message || "Failed";
    });
}

function loadRechargeRequests() {
  apiGet("rechargeRequests", { token: TOKEN }).then((res) => {
    const list = document.getElementById("recharge-requests-list");
    const pending = res.requests.filter((r) => r.status === "pending");
    const recent = res.requests.filter((r) => r.status !== "pending").slice(0, 8);

    if (!pending.length && !recent.length) {
      list.innerHTML = `<p class="hint">No recharge requests yet.</p>`;
      return;
    }

    const renderRow = (r) => `
      <div class="order-row" style="align-items:center">
        <img src="${r.screenshot}" onclick="openScreenshot('${r.screenshot}')"
             style="width:56px;height:56px;object-fit:cover;border-radius:8px;cursor:pointer;flex-shrink:0" />
        <div style="flex:1">
          <b>${r.userName}</b> <span class="hint">(ID: ${r.userId})</span><br/>
          <span class="hint">Mobile: ${r.userMobile} • Paid ₹${r.amount}</span><br/>
          <span class="hint">${new Date(r.createdAt).toLocaleString()}</span>
        </div>
        ${
          r.status === "pending"
            ? `<div class="row gap">
                <button class="btn small primary" onclick="approveRecharge(${r.id})">Approve</button>
                <button class="btn small danger" onclick="rejectRecharge(${r.id})">Reject</button>
              </div>`
            : `<span class="status-pill status-${r.status === "approved" ? "delivered" : "cancelled"}">${r.status}</span>`
        }
      </div>`;

    list.innerHTML =
      (pending.length ? pending.map(renderRow).join("") : `<p class="hint">No pending requests.</p>`) +
      (recent.length ? `<h4 style="margin-top:16px">Recent</h4>${recent.map(renderRow).join("")}` : "");
  });
}

function approveRecharge(id) {
  apiPost("approveRecharge", { token: TOKEN, requestId: id }).then(() => {
    loadRechargeRequests();
  }).catch((e) => alert(e.message || "Failed"));
}

function rejectRecharge(id) {
  if (!confirm("Reject this payment claim?")) return;
  apiPost("rejectRecharge", { token: TOKEN, requestId: id }).then(() => {
    loadRechargeRequests();
  }).catch((e) => alert(e.message || "Failed"));
}

function openScreenshot(src) {
  document.getElementById("screenshot-modal-img").src = src;
  document.getElementById("screenshot-modal").classList.remove("hidden");
}
function closeScreenshotModal() {
  document.getElementById("screenshot-modal").classList.add("hidden");
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

function pollNotifications() {
  if (!TOKEN) return;
  apiGet("ownerNotifications", { token: TOKEN }).then((res) => {
    const unread = res.notifications.filter((n) => !n.read).length;
    if (unreadCountInitialized && unread > lastUnreadCount) {
      playNotifSound();
    }
    lastUnreadCount = unread;
    unreadCountInitialized = true;
    const badge = document.getElementById("notif-badge");
    if (unread > 0) {
      badge.innerText = unread;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }).catch(() => {});
}

function loadOwnerNotifications() {
  apiGet("ownerNotifications", { token: TOKEN }).then((res) => {
    const list = document.getElementById("owner-notif-list");
    if (!res.notifications.length) {
      list.innerHTML = `<p class="hint">No notifications yet.</p>`;
      return;
    }
    list.innerHTML = res.notifications
      .map((n) => {
        const clickable = n.orderId
          ? `onclick="openOrderModal(${n.orderId})" style="cursor:pointer"`
          : n.type === "avpoints_request"
          ? `onclick="switchTab('avpoints')" style="cursor:pointer"`
          : "";
        return `
      <div class="notif-item ${n.read ? "" : "unread"}" ${clickable}>
        <h4>${n.title}</h4>
        <p>${n.message}</p>
        <span class="notif-time">${new Date(n.createdAt).toLocaleString()}</span>
      </div>`;
      })
      .join("");
  });
}

function markAllNotifRead() {
  apiPost("markNotifRead", { token: TOKEN }).then(() => {
    loadOwnerNotifications();
    pollNotifications();
  });
}

// ---------------- SETTINGS ----------------
function changeOwnerPassword() {
  const newPassword = document.getElementById("new-owner-password").value;
  if (!newPassword) return;
  apiPost("changePassword", { token: TOKEN, newPassword }).then(() => {
    document.getElementById("settings-msg").innerText = "Password updated successfully.";
    document.getElementById("new-owner-password").value = "";
  });
}

function uploadQr() {
  const file = document.getElementById("qr-image").files[0];
  if (!file) return alert("Choose a QR image first");
  document.getElementById("qr-preview").innerHTML = `<p class="hint">Uploading to Google Drive...</p>`;
  fileToBase64(file)
    .then((base64) =>
      apiPost("setQrCode", { token: TOKEN, imageBase64: base64, mimeType: file.type, fileName: file.name })
    )
    .then((res) => {
      document.getElementById("qr-preview").innerHTML = `<img src="${res.qrCodeImage}" style="max-width:200px;margin-top:10px;border-radius:8px" />`;
    })
    .catch((e) => {
      document.getElementById("qr-preview").innerHTML = `<p class="error">${e.message || "Upload failed"}</p>`;
    });
}

function toggleLocationSharing() {
  const btn = document.getElementById("location-share-btn");
  const status = document.getElementById("location-status");
  if (!locationSharing) {
    if (!navigator.geolocation) return alert("Geolocation not supported on this device/browser");
    locationSharing = true;
    btn.innerText = "Stop Sharing Location";
    status.innerText = "Sharing live location...";
    const update = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          apiPost("ownerLocationUpdate", {
            token: TOKEN,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
          status.innerText = "Last shared: " + new Date().toLocaleTimeString();
        },
        () => { status.innerText = "Location permission denied."; }
      );
    };
    update();
    locationInterval = setInterval(update, 8000);
  } else {
    locationSharing = false;
    btn.innerText = "Start Sharing Location";
    status.innerText = "Location sharing stopped.";
    clearInterval(locationInterval);
  }
}

// ---------------- INIT ----------------
if (TOKEN) {
  boot();
}
