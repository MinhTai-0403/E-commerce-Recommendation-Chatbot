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
      "Missing MONGODB_URI. Create a .env file from .env.example first."
    );
  }

  return {
    uri,
    dbName: process.env.MONGODB_DB || "cosarii",
    productsCollection:
      process.env.MONGODB_PRODUCTS_COLLECTION || "cellphones_products",
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