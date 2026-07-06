const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
}

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("Missing MONGODB_URI. Create a .env file from .env.example first.");
  }

  return {
    uri,
    dbName: process.env.MONGODB_DB || "cosarii",
    productsCollection:
      process.env.MONGODB_PRODUCTS_COLLECTION || "cellphones_products",
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
