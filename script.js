/* =========================================================
   LANUVA — script.js (ใช้ร่วมกันทุกหน้า)
   - product.html : แสดงสินค้า + กรองตาม mood
   - order.html   : เติมข้อมูลจาก URL + ส่งออเดอร์ไป Apps Script
   - admin.html   : ดึงออเดอร์จาก Google Sheet (CSV) มาแสดงเป็นตาราง
   แต่ละส่วนทำงานเฉพาะเมื่อเจอ element ของหน้านั้นๆ
   ========================================================= */

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbztCdQbz9w5APo-YdXf3iVFyFp4eTyGvKMcy1w0lG02Zb9uR8zr98cPLbCG0xH92uYwrw/exec";

const ORDERS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTm3byyUHh4D0NuRQ8tiVuSKdokhDJq-juzZEg7EsBuem1tN_X-Ywfl6wAMUyVjlneVYmqGpLWJMKlX/pub?gid=0&single=true&output=csv";

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("product-list")) initProductPage();
  if (document.getElementById("orderForm")) initOrderPage();
  if (document.getElementById("ordersTable")) initAdminPage();
});

/* ---------------------------------------------------------
   1) หน้าสินค้า (product.html)
   --------------------------------------------------------- */
async function initProductPage() {
  const list = document.getElementById("product-list");
  const filterBar = document.getElementById("filter-bar");

  let products = [];
  try {
    const res = await fetch("products.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    products = await res.json();
  } catch (err) {
    console.error(err);
    list.textContent = "ไม่สามารถโหลดรายการสินค้าได้ กรุณาลองใหม่อีกครั้ง";
    return;
  }

  // สร้างปุ่มกรอง: ทั้งหมด + mood ที่มีในข้อมูล (rose, lavender)
  const moods = [...new Set(products.map((p) => p.mood))];
  const filters = [{ key: "all", label: "ทั้งหมด" }].concat(
    moods.map((m) => ({ key: m, label: capitalize(m) }))
  );

  // อ่าน ?mood=xxx ถ้าไม่ตรงกับ mood ใดๆ ให้แสดงทั้งหมด
  const paramMood = (new URLSearchParams(window.location.search).get("mood") || "")
    .trim()
    .toLowerCase();
  let current = moods.includes(paramMood) ? paramMood : "all";

  function renderFilters() {
    if (!filterBar) return;
    filterBar.innerHTML = "";
    filters.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn" + (f.key === current ? " btn--solid" : "");
      btn.textContent = f.label;
      btn.setAttribute("aria-pressed", String(f.key === current));
      btn.addEventListener("click", () => {
        current = f.key;
        renderFilters();
        renderProducts();
        // อัปเดต URL ให้แชร์ลิงก์ที่กรองแล้วได้ โดยไม่โหลดหน้าใหม่
        const url = new URL(window.location.href);
        if (current === "all") url.searchParams.delete("mood");
        else url.searchParams.set("mood", current);
        history.replaceState(null, "", url);
      });
      filterBar.appendChild(btn);
    });
  }

  function renderProducts() {
    list.innerHTML = "";
    const shown = products.filter((p) => current === "all" || p.mood === current);

    if (shown.length === 0) {
      list.textContent = "ยังไม่มีสินค้าในหมวดนี้";
      return;
    }
    shown.forEach((p) => list.appendChild(createProductCard(p)));
  }

  renderFilters();
  renderProducts();
}

function createProductCard(p) {
  const card = document.createElement("article");
  card.className = "product-card";
  card.dataset.mood = p.mood;

  // รูป
  const media = document.createElement("div");
  media.className = "product-card__media";
  const img = document.createElement("img");
  img.src = p.image;
  img.alt = p.name;
  img.loading = "lazy";
  media.appendChild(img);

  // เนื้อหา
  const body = document.createElement("div");
  body.className = "product-card__body";

  const title = document.createElement("h3");
  title.className = "product-card__title";
  const dot = document.createElement("span");
  dot.className = "mood-dot";
  dot.setAttribute("aria-hidden", "true");
  title.append(dot, document.createTextNode(p.name));

  const meta = document.createElement("p");
  meta.className = "product-card__meta";
  meta.textContent = "ขนาด " + p.size;

  body.append(title, meta);

  // ราคา + ปุ่มสั่งซื้อ
  const footer = document.createElement("div");
  footer.className = "product-card__footer";

  const price = document.createElement("span");
  price.className = "price";
  price.textContent = Number(p.price).toLocaleString("th-TH") + " บาท";

  const orderBtn = document.createElement("a");
  orderBtn.className = "btn";
  orderBtn.textContent = "สั่งซื้อ";
  const itemName = p.name + " " + p.size;
  orderBtn.href =
    "order.html?item=" + encodeURIComponent(itemName) + "&price=" + encodeURIComponent(p.price);

  footer.append(price, orderBtn);

  card.append(media, body, footer);
  return card;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ---------------------------------------------------------
   2) หน้าสั่งซื้อ (order.html)
   --------------------------------------------------------- */
function initOrderPage() {
  const form = document.getElementById("orderForm");
  const params = new URLSearchParams(window.location.search);

  // เติมข้อมูลจาก URL ทันทีที่โหลดหน้า — ทั้งช่อง items และ total
  const itemsInput = document.getElementById("items");
  const totalInput = document.getElementById("total");
  const item = params.get("item");
  const price = params.get("price");

  if (itemsInput && item !== null) itemsInput.value = item;
  if (totalInput && price !== null) totalInput.value = price;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const payload = {
      customerName: document.getElementById("customerName").value.trim(),
      contact: document.getElementById("contact").value.trim(),
      items: document.getElementById("items").value.trim(),
      total: document.getElementById("total").value.trim(),
      note: document.getElementById("note").value.trim(),
    };

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    })
      .then(() => {
        window.location.href = "thankyou.html";
      })
      .catch((error) => {
        console.error(error);
        alert("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        if (submitBtn) submitBtn.disabled = false;
      });
  });
}

/* ---------------------------------------------------------
   3) หน้าแอดมิน (admin.html)
   --------------------------------------------------------- */
async function initAdminPage() {
  const tbody = document.querySelector("#ordersTable tbody");
  if (!tbody) return;

  const COLUMNS = 6; // วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ

  function showMessage(text) {
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = COLUMNS;
    td.textContent = text;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  showMessage("กำลังโหลดข้อมูล...");

  let rows;
  try {
    const res = await fetch(ORDERS_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    rows = parseCSV(await res.text());
  } catch (err) {
    console.error(err);
    showMessage("ไม่สามารถโหลดข้อมูลออเดอร์ได้ กรุณาลองใหม่อีกครั้ง");
    return;
  }

  // ตัดแถวหัวตารางออก และแถวว่าง
  const orders = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ""));

  if (orders.length === 0) {
    showMessage("ยังไม่มีออเดอร์");
    return;
  }

  // Google Sheet เพิ่มแถวใหม่ต่อท้ายเสมอ → กลับลำดับให้รายการล่าสุดขึ้นก่อน
  // (ไม่ต้อง parse วันที่ ซึ่งรูปแบบอาจต่างกันตาม locale ของชีต)
  orders.reverse();

  tbody.innerHTML = "";
  orders.forEach((row) => {
    const tr = document.createElement("tr");
    for (let i = 0; i < COLUMNS; i++) {
      const td = document.createElement("td");
      let value = (row[i] || "").trim();
      if (i === 4 && value !== "" && !isNaN(Number(value))) {
        value = Number(value).toLocaleString("th-TH");
      }
      td.textContent = value; // textContent กัน HTML injection จากข้อมูลลูกค้า
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
}

/* ---------------------------------------------------------
   CSV parser (เขียนเอง ไม่ใช้ library)
   รองรับ: ข้อความใน "..." , คอมมา/ขึ้นบรรทัดใหม่ในเครื่องหมายคำพูด,
   "" แทนเครื่องหมายคำพูด, ตัวจบบรรทัดแบบ \n และ \r\n
   คืนค่าเป็น array ของแถว (แต่ละแถวเป็น array ของเซลล์)
   --------------------------------------------------------- */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // ตัด BOM

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'; // "" → "
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++; // \r\n
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  // เก็บแถวสุดท้ายที่ไม่มี newline ปิดท้าย
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
