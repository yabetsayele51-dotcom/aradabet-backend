// routes/payment.js
const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../db");
const telebirr = require("../services/telebirr");
const mpesa = require("../services/mpesa");

const router = express.Router();

function createOrder({ userId, provider, amount }) {
  const orderId = `AB-${Date.now()}-${nanoid(6)}`;
  db.prepare(`
    INSERT INTO orders (order_id, user_id, provider, amount, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(orderId, userId, provider, amount);
  return orderId;
}

function findUserByPhone(phone) {
  return db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
}

// ---------- Telebirr ----------

router.post("/telebirr/initiate", async (req, res) => {
  try {
    const { phone, amount } = req.body || {};
    const user = findUserByPhone(phone);
    if (!user) return res.status(404).json({ error: "Register the phone number first." });
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount." });

    const orderId = createOrder({ userId: user.id, provider: "telebirr", amount });
    const result = await telebirr.createPaymentOrder({ orderId, amount });

    res.json({ orderId, paymentUrl: result.toPayUrl || result.payUrl || result });
  } catch (err) {
    console.error("Telebirr initiate error:", err.message);
    res.status(500).json({ error: "Could not start Telebirr payment." });
  }
});

router.post("/telebirr/callback", express.json(), (req, res) => {
  try {
    const { sign, ...payload } = req.body;
    const stringToVerify = Object.keys(payload)
      .sort()
      .map((k) => `${k}=${payload[k]}`)
      .join("&");

    const valid = telebirr.verifySignature(stringToVerify, sign);
    if (!valid) return res.status(400).send("invalid signature");

    const { out_trade_no: orderId, trade_status: status, trade_no: providerRef } = payload;
    const newStatus = status === "Completed" || status === "SUCCESS" ? "success" : "failed";

    db.prepare(`
      UPDATE orders SET status = ?, provider_ref = ?, updated_at = datetime('now')
      WHERE order_id = ?
    `).run(newStatus, providerRef, orderId);

    res.send("success");
  } catch (err) {
    console.error("Telebirr callback error:", err.message);
    res.status(500).send("error");
  }
});

// ---------- M-Pesa ----------

router.post("/mpesa/initiate", async (req, res) => {
  try {
    const { phone, amount } = req.body || {};
    const user = findUserByPhone(phone);
    if (!user) return res.status(404).json({ error: "Register the phone number first." });
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount." });

    const orderId = createOrder({ userId: user.id, provider: "mpesa", amount });
    const result = await mpesa.initiateStkPush({ phone, amount, orderId });

    res.json({ orderId, ...result });
  } catch (err) {
    console.error("M-Pesa initiate error:", err.response?.data || err.message);
    res.status(500).json({ error: "Could not start M-Pesa payment." });
  }
});

router.post("/mpesa/callback", express.json(), (req, res) => {
  try {
    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback) return res.status(400).json({ error: "Malformed callback." });

    const resultCode = stkCallback.ResultCode;
    const metadata = stkCallback.CallbackMetadata?.Item || [];
    const receipt = metadata.find((i) => i.Name === "MpesaReceiptNumber")?.Value;

    console.log("M-Pesa callback:", { resultCode, receipt, raw: stkCallback });

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    console.error("M-Pesa callback error:", err.message);
    res.status(500).json({ ResultCode: 1, ResultDesc: "Failed" });
  }
});

module.exports = router;
