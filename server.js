// ==================================================
// BANTUIN BACKEND - FINAL V2 - ALUR BENAR
// Top Up -> Masuk BantuinPay Customer (Ngendap)
// Klik Selesai -> Baru Potong & Bagi Otomatis
// Tukang: 90% + Tips -> DANA Tukang
// Bantuin: 10% -> DANA Bisnis 081286421235
// ==================================================
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY || "ISI_SECRET_KEY_XENDIT_KAMU_DI_SINI";
const XENDIT_BASE = "https://api.xendit.co";
const DANA_BISNIS = "081286421235";

// ==================================================
// DOMPET BANTUINPAY - SIMPAN DI SINI
// Untuk LIVE beneran, ini harusnya di Database (Supabase / MongoDB)
// Untuk sekarang pakai memori dulu biar gampang tes
// ==================================================
// Format: { "0812xxxx": { saldo: 200000, nama: "Dwi" } }
let dompetCustomer = {
  // Contoh awal - Customer Dwi
  "DWI": { saldo: 150000, nama: "Dwi - Pengguna Bantuin", hp: "081286421235" }
};
let semuaOrder = [];
let totalKomisiBantuin = 0;
let totalKeTukang = 0;

function authXendit() {
  return 'Basic ' + Buffer.from(XENDIT_SECRET_KEY + ':').toString('base64');
}

// Helper: Kirim uang via Xendit ke DANA
async function kirimKeDANA(nominal, noDANA, nama, keterangan) {
  if (!XENDIT_SECRET_KEY || XENDIT_SECRET_KEY.includes("ISI_SECRET")) {
    console.log(`⚠️ [SIMULASI] Kirim ${nominal} ke DANA ${noDANA} (${nama}) - ${keterangan} - Secret Key belum diisi, dicatat manual`);
    return { success: false, mode: "SIMULASI - Secret Key Belum Diisi", id: "SIM-" + Date.now() };
  }
  try {
    const res = await fetch(`${XENDIT_BASE}/v2/disbursements`, {
      method: 'POST',
      headers: { 'Authorization': authXendit(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference_id: `BANTUIN-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        amount: nominal,
        channel_code: 'ID_DANA',
        account_number: String(noDANA).replace(/\D/g, ""),
        account_holder_name: nama || "Penerima Bantuin",
        description: keterangan
      })
    });
    const hasil = await res.json();
    console.log("Hasil Xendit:", hasil);
    if (!hasil.id) return { success: false, mode: "GAGAL XENDIT", detail: hasil };
    return { success: true, mode: "AUTO-XENDIT", id: hasil.id, status: hasil.status, reference: hasil.reference_id };
  } catch (e) {
    console.error(e);
    return { success: false, mode: "ERROR", detail: String(e) };
  }
}

app.get('/', (req, res) => {
  res.json({
    status: "Backend Bantuin Aktif ✅ - Alur Benar V2",
    alur: "Top Up -> BantuinPay Customer (Ngendap) -> Klik Selesai -> Potong Otomatis -> 90% ke Tukang, 10% ke DANA Bisnis",
    totalOrder: semuaOrder.length,
    totalKeTukang,
    totalKomisiBantuin,
    danaBisnis: DANA_BISNIS,
    dompetCustomer
  });
});

// ==================================================
// 1. TOP UP - MASUK KE BANTUINPAY CUSTOMER
// Dipanggil saat customer klik "Saya Sudah Bayar"
// ==================================================
app.post('/api/topup', (req, res) => {
  const { customerId, nama, nominal, caraBayar } = req.body;
  const id = customerId || "DWI";
  const nom = parseInt(nominal) || 0;
  if (nom < 10000) return res.json({ success: false, message: "Minimal Top Up Rp 10.000" });

  if (!dompetCustomer[id]) dompetCustomer[id] = { saldo: 0, nama: nama || id, hp: id };
  dompetCustomer[id].saldo += nom;

  console.log(`💰 TOP UP: ${id} +${nom} via ${caraBayar} -> Saldo sekarang ${dompetCustomer[id].saldo} (MASIH DI BANTUINPAY, BELUM KE TUKANG / KE BANTUIN)`);
  return res.json({
    success: true,
    message: `Top Up berhasil! +Rp ${nom.toLocaleString("id-ID")} masuk ke BantuinPay kamu.`,
    saldoBaru: dompetCustomer[id].saldo,
    keterangan: "Saldo ngendap di BantuinPay, baru kepotong saat kamu klik Selesai Pesanan."
  });
});

// Cek Saldo BantuinPay Customer
app.get('/api/saldo/:customerId', (req, res) => {
  const id = req.params.customerId || "DWI";
  const dompet = dompetCustomer[id] || { saldo: 0, nama: id };
  res.json({ customerId: id, saldo: dompet.saldo, nama: dompet.nama });
});

// ==================================================
// 2. SELESAI PESANAN - BARU KE POTONG OTOMATIS
// Dipanggil saat customer klik SELESAI
// ==================================================
app.post('/api/selesaikan-pesanan', async (req, res) => {
  const { orderId, customerId, tukangNama, tukangDana, jasa, biaya, tips } = req.body;
  const id = customerId || "DWI";
  const biayaNum = parseInt(biaya) || 0;
  const tipsNum = parseInt(tips) || 0;
  const totalPotong = biayaNum + tipsNum;
  const komisi = Math.round(biayaNum * 10 / 100); // 10% dari biaya, tips TIDAK dipotong
  const keTukang = (biayaNum - komisi) + tipsNum; // 90% + 100% Tips

  console.log("========================================");
  console.log(`[SELESAI ${orderId}] ${jasa} - Customer: ${id}`);
  console.log(`Saldo BantuinPay Sebelum: ${dompetCustomer[id] ? dompetCustomer[id].saldo : 0}`);
  console.log(`Akan Potong: ${totalPotong} (Biaya ${biayaNum} + Tips ${tipsNum})`);
  console.log(`Bagi: Tukang ${keTukang} (90%+Tips) -> DANA ${tukangDana}`);
  console.log(`Bagi: Bantuin ${komisi} (10%) -> DANA Bisnis ${DANA_BISNIS}`);
  console.log("========================================");

  // 1. CEK SALDO BANTUINPAY CUKUP ATAU TIDAK
  if (!dompetCustomer[id]) dompetCustomer[id] = { saldo: 0, nama: id };
  if (dompetCustomer[id].saldo < totalPotong) {
    return res.json({
      success: false,
      message: `Saldo BantuinPay kurang! Saldo kamu Rp ${dompetCustomer[id].saldo.toLocaleString("id-ID")}, butuh Rp ${totalPotong.toLocaleString("id-ID")}. Top Up dulu.`,
      saldo: dompetCustomer[id].saldo,
      kurang: totalPotong - dompetCustomer[id].saldo
    });
  }

  // 2. POTONG BANTUINPAY CUSTOMER - DI SINI BARU KE POTONG!
  dompetCustomer[id].saldo -= totalPotong;
  console.log(`✅ BantuinPay ${id} Terpotong ${totalPotong}, Sisa ${dompetCustomer[id].saldo}`);

  // 3. KIRIM 90% + Tips KE DANA TUKANG / GURU
  const hasilTukang = await kirimKeDANA(keTukang, tukangDana, tukangNama, `${jasa} - Bantuin Order ${orderId} - Tukang Terima 90% + Tips`);

  // 4. KIRIM 10% KE DANA BISNIS KAMU
  const hasilBantuin = await kirimKeDANA(komisi, DANA_BISNIS, "Bantuin, Service", `Komisi 10% - ${jasa} - Order ${orderId}`);

  totalKeTukang += keTukang;
  totalKomisiBantuin += komisi;

  const order = {
    orderId, customerId: id, tukangNama, tukangDana, jasa, biaya: biayaNum, tips: tipsNum,
    totalPotong, keTukang, komisi,
    saldoCustomerSesudah: dompetCustomer[id].saldo,
    transferTukang: hasilTukang,
    transferBantuin: hasilBantuin,
    waktu: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
    status: "SELESAI - Sudah Dibagi Otomatis"
  };
  semuaOrder.unshift(order);

  return res.json({
    success: true,
    message: `✅ Selesai! BantuinPay kamu kepotong Rp ${totalPotong.toLocaleString("id-ID")}. Tukang terima Rp ${keTukang.toLocaleString("id-ID")} ke DANA ${tukangDana}, Bantuin terima Rp ${komisi.toLocaleString("id-ID")} ke DANA Bisnis ${DANA_BISNIS}.`,
    saldoBaru: dompetCustomer[id].saldo,
    keTukang, komisi, totalPotong,
    transferTukang: hasilTukang,
    transferBantuin: hasilBantuin
  });
});

app.get('/api/orders', (req, res) => {
  res.json({ total: semuaOrder.length, orders: semuaOrder, totalKeTukang, totalKomisiBantuin });
});

app.post('/api/webhook-xendit', (req, res) => {
  console.log("📩 Webhook Xendit:", JSON.stringify(req.body));
  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend Bantuin V2 Jalan di Port ${PORT} - Alur Benar: Top Up -> BantuinPay -> Selesai -> Bagi Otomatis`));