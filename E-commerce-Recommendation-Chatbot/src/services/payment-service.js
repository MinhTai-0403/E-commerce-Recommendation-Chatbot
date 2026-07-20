function cleanText(value = "", maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizePaymentMethod(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (["bank_qr", "bank-qr", "vietqr", "qr", "bank_transfer", "bank-transfer"].includes(raw)) {
    return "bank_qr";
  }
  return "cod";
}

function getBankQrConfig() {
  const bankId = cleanText(process.env.BANK_QR_BANK_ID || process.env.BANK_QR_BANK_CODE, 40);
  const accountNumber = cleanText(
    process.env.BANK_QR_ACCOUNT_NUMBER || process.env.BANK_ACCOUNT_NUMBER,
    80
  );
  const accountName = cleanText(
    process.env.BANK_QR_ACCOUNT_NAME || process.env.BANK_ACCOUNT_NAME || "CELLPHONES CLONE",
    120
  );
  const template = cleanText(process.env.BANK_QR_TEMPLATE || "compact2", 32);

  return {
    provider: "vietqr",
    enabled: Boolean(bankId && accountNumber),
    bankId,
    accountNumber,
    accountName,
    template,
  };
}

function buildBankQrImageUrl({ amount, transferContent }) {
  const config = getBankQrConfig();
  if (!config.enabled) return "";

  const base = `https://img.vietqr.io/image/${encodeURIComponent(config.bankId)}-${encodeURIComponent(config.accountNumber)}-${encodeURIComponent(config.template)}.png`;
  const params = new URLSearchParams({
    amount: String(Math.max(0, Math.round(Number(amount || 0)))),
    addInfo: transferContent,
    accountName: config.accountName,
  });

  return `${base}?${params.toString()}`;
}

function buildOrderPayment({ method, orderCode, totals }) {
  if (method === "bank_qr") {
    const amount = Math.max(0, Math.round(Number(totals.total || totals.roundedTotal || 0)));
    const transferContent = orderCode;
    const bankConfig = getBankQrConfig();

    return {
      method: "bank_qr",
      methodLabel: "Chuyển khoản ngân hàng qua mã QR",
      status: "pending",
      statusLabel: "Chờ chuyển khoản",
      provider: bankConfig.provider,
      reference: orderCode,
      transferContent,
      amount,
      currency: totals.currency || "VND",
      qrImageUrl: buildBankQrImageUrl({ amount, transferContent }),
      expiresAt: new Date(Date.now() + Number(process.env.BANK_QR_EXPIRES_MINUTES || 30) * 60 * 1000),
      bank: {
        bankId: bankConfig.bankId,
        accountNumber: bankConfig.accountNumber,
        accountName: bankConfig.accountName,
      },
      instructions: bankConfig.enabled
        ? "Quét mã QR và giữ nguyên nội dung chuyển khoản để hệ thống tự xác nhận khi ngân hàng gửi thông báo giao dịch."
        : "Chưa cấu hình BANK_QR_BANK_ID và BANK_QR_ACCOUNT_NUMBER trong .env.",
      createdAt: new Date(),
    };
  }

  return {
    method: "cod",
    methodLabel: "Thanh toán khi nhận hàng",
    status: "unpaid",
    statusLabel: "Chưa thanh toán",
  };
}

module.exports = {
  buildBankQrImageUrl,
  buildOrderPayment,
  getBankQrConfig,
  sanitizePaymentMethod,
};
