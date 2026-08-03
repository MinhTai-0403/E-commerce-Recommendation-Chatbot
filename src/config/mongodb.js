const dns = require("node:dns");

// Dùng DNS công cộng để Node.js phân giải MongoDB Atlas SRV
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
}

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "Missing MONGODB_URI."
    );
  }

  return {
    uri,
    dbName: process.env.MONGODB_DB || "cosarii",
    productsCollection:
      process.env.MONGODB_PRODUCTS_COLLECTION || "cellphones_products",
    productBlobsCollection:
      process.env.MONGODB_PRODUCT_BLOBS_COLLECTION || "cellphones_product_blobs",
    productDetailsCollection:
      process.env.MONGODB_PRODUCT_DETAILS_COLLECTION || "cellphones_product_details",
    productReviewsCollection:
      process.env.MONGODB_PRODUCT_REVIEWS_COLLECTION || "cellphones_product_reviews",
    productQuestionsCollection:
      process.env.MONGODB_PRODUCT_QUESTIONS_COLLECTION || "cellphones_product_questions",
    cartsCollection:
      process.env.CARTS_COLLECTION ||
      process.env.MONGODB_CARTS_COLLECTION ||
      "smember_carts",
    ordersCollection:
      process.env.ORDERS_COLLECTION ||
      process.env.MONGODB_ORDERS_COLLECTION ||
      "smember_orders",
    paymentsCollection:
      process.env.PAYMENTS_COLLECTION ||
      process.env.MONGODB_PAYMENTS_COLLECTION ||
      "payments",
    couponsCollection:
      process.env.COUPONS_COLLECTION ||
      process.env.MONGODB_COUPONS_COLLECTION ||
      "coupons",
    userVouchersCollection:
      process.env.USER_VOUCHERS_COLLECTION ||
      process.env.MONGODB_USER_VOUCHERS_COLLECTION ||
      "user_vouchers",
    inventoryCollection:
      process.env.INVENTORY_COLLECTION ||
      process.env.MONGODB_INVENTORY_COLLECTION ||
      "inventory",
    userEventsCollection:
      process.env.USER_EVENTS_COLLECTION ||
      process.env.MONGODB_USER_EVENTS_COLLECTION ||
      "user_events",
    shipmentsCollection:
      process.env.SHIPMENTS_COLLECTION ||
      process.env.MONGODB_SHIPMENTS_COLLECTION ||
      "shipments",
    wishlistsCollection:
      process.env.WISHLISTS_COLLECTION ||
      process.env.MONGODB_WISHLISTS_COLLECTION ||
      "wishlists",
    notificationsCollection:
      process.env.NOTIFICATIONS_COLLECTION ||
      process.env.MONGODB_NOTIFICATIONS_COLLECTION ||
      "notifications",
    addressesCollection:
      process.env.ADDRESSES_COLLECTION ||
      process.env.MONGODB_ADDRESSES_COLLECTION ||
      "addresses",
    returnsCollection:
      process.env.RETURNS_COLLECTION ||
      process.env.MONGODB_RETURNS_COLLECTION ||
      "returns",
    warrantiesCollection:
      process.env.WARRANTIES_COLLECTION ||
      process.env.MONGODB_WARRANTIES_COLLECTION ||
      "warranties",
    adminAuditLogsCollection:
      process.env.ADMIN_AUDIT_LOGS_COLLECTION ||
      process.env.MONGODB_ADMIN_AUDIT_LOGS_COLLECTION ||
      "admin_audit_logs",
  };
}

function createMongoClient() {
  const { uri } = getMongoConfig();

  return new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
}

module.exports = {
  createMongoClient,
  getMongoConfig,
};
