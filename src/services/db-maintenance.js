const NUMBER_BSON_TYPES = ["int", "long", "double", "decimal"];

let ensured = false;

function numericOrNull() {
  return { bsonType: [...NUMBER_BSON_TYPES, "null"] };
}

function dateOrNull() {
  return { bsonType: ["date", "null"] };
}

async function createIndexSafe(collection, spec, options = {}) {
  try {
    await collection.createIndex(spec, options);
  } catch (error) {
    console.warn(`[db-maintenance] skip index ${options.name || JSON.stringify(spec)}: ${error.message}`);
  }
}

async function applyValidationSafe(db, collectionName, validator) {
  const validationAction = process.env.MONGODB_VALIDATION_ACTION || "warn";
  const command = {
    collMod: collectionName,
    validator,
    validationLevel: "moderate",
    validationAction,
  };

  try {
    await db.command(command);
  } catch (error) {
    if (error?.codeName === "NamespaceNotFound" || error?.code === 26) {
      try {
        await db.createCollection(collectionName, {
          validator,
          validationLevel: "moderate",
          validationAction,
        });
      } catch (createError) {
        if (createError?.codeName !== "NamespaceExists") {
          console.warn(`[db-maintenance] skip validation ${collectionName}: ${createError.message}`);
        }
      }
      return;
    }

    console.warn(`[db-maintenance] skip validation ${collectionName}: ${error.message}`);
  }
}

function slugifyInventoryKeyPart(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

async function applyInventoryManagementBackfill({ db, products, productDetails, inventory }) {
  const migrationId = "inventory-management-default-100-v2";
  const migrations = db.collection(process.env.APP_MIGRATIONS_COLLECTION || "app_migrations");
  const completed = await migrations.findOne({ _id: migrationId });
  if (completed) return;

  const productCollections = [...new Set([products, productDetails].filter(Boolean))];
  let matchedProducts = 0;
  let modifiedProducts = 0;

  for (const collection of productCollections) {
    const result = await collection.updateMany(
      { manageInventory: { $ne: true } },
      { $set: { manageInventory: true } }
    );
    matchedProducts += Number(result.matchedCount || 0);
    modifiedProducts += Number(result.modifiedCount || 0);
  }

  let createdInventoryRows = 0;
  if (inventory) {
    const productByIdentity = new Map();
    for (const collection of productCollections) {
      const docs = await collection.find(
        {},
        { projection: { name: 1, slug: 1, sku: 1 } }
      ).toArray();
      for (const product of docs) {
        const identity = String(product.slug || product.sku || product._id || "");
        if (identity) productByIdentity.set(identity, product);
      }
    }

    const existingRows = await inventory.find(
      {},
      { projection: { productId: 1, productSlug: 1, productSku: 1, slug: 1, sku: 1 } }
    ).toArray();
    const existingAliases = new Set(existingRows.flatMap((row) => [
      row.productId,
      row.productSlug,
      row.productSku,
      row.slug,
      row.sku,
    ]).filter(Boolean).map((value) => String(value).toLowerCase()));

    const operations = [];
    const flushOperations = async () => {
      if (!operations.length) return;
      const result = await inventory.bulkWrite(operations.splice(0), { ordered: false });
      createdInventoryRows += Number(result.upsertedCount || 0);
    };

    for (const product of productByIdentity.values()) {
      const productId = String(product._id || product.slug || product.sku || "");
      if (!productId) continue;
      const aliases = [productId, product.slug, product.sku].filter(Boolean).map(String);
      const normalizedAliases = aliases.map((value) => value.toLowerCase());
      const metadata = {
        productId,
        productSlug: product.slug || "",
        productSku: product.sku || "",
        productName: product.name || "",
      };

      if (normalizedAliases.some((alias) => existingAliases.has(alias))) {
        operations.push({
          updateMany: {
            filter: {
              $or: [
                { productId: { $in: aliases } },
                { productSlug: { $in: aliases } },
                { productSku: { $in: aliases } },
                { slug: { $in: aliases } },
                { sku: { $in: aliases } },
              ],
            },
            update: { $set: metadata },
          },
        });
      } else {
        const key = [productId, "default", "default"]
          .map(slugifyInventoryKeyPart)
          .join("::");
        operations.push({
          updateOne: {
            filter: { key },
            update: {
              $setOnInsert: {
                key,
                variantId: "",
                variantName: "Mặc định",
                colorId: "",
                colorName: "Mặc định",
                locationId: "main",
                stock: 100,
                reservedStock: 0,
                soldCount: 0,
                status: "in_stock",
                note: "Khởi tạo mặc định 100 sản phẩm.",
                createdAt: new Date(),
              },
              $set: metadata,
            },
            upsert: true,
          },
        });
        normalizedAliases.forEach((alias) => existingAliases.add(alias));
      }

      if (operations.length >= 500) await flushOperations();
    }
    await flushOperations();
  }

  let restoredInventoryRows = 0;
  if (inventory) {
    const now = new Date();
    const result = await inventory.updateMany(
      {
        status: { $ne: "inactive" },
        $and: [
          { $or: [{ stock: { $exists: false } }, { stock: { $lte: 0 } }] },
          { $or: [{ reservedStock: { $exists: false } }, { reservedStock: { $lte: 0 } }] },
          { $or: [{ soldCount: { $exists: false } }, { soldCount: { $lte: 0 } }] },
        ],
      },
      {
        $set: {
          stock: 100,
          reservedStock: 0,
          soldCount: 0,
          status: "in_stock",
          inventoryBackfilledAt: now,
          updatedAt: now,
        },
      }
    );
    restoredInventoryRows = Number(result.modifiedCount || 0);
  }

  await migrations.updateOne(
    { _id: migrationId },
    {
      $setOnInsert: {
        matchedProducts,
        modifiedProducts,
        createdInventoryRows,
        restoredInventoryRows,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  console.log(
    `[db-maintenance] inventory backfill completed: ${modifiedProducts} products enabled, ${createdInventoryRows} inventory rows created, ${restoredInventoryRows} empty inventory rows restored to 100.`
  );
}

function orderValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["orderCode", "status", "customer", "items", "totals", "payment", "createdAt"],
      properties: {
        orderCode: { bsonType: "string" },
        status: {
          enum: ["pending", "confirmed", "packing", "ready_for_pickup", "shipping", "completed", "cancelled", "refunded"],
        },
        customer: {
          bsonType: "object",
          required: ["phone"],
          properties: {
            phone: { bsonType: "string" },
            email: { bsonType: ["string", "null"] },
          },
        },
        items: {
          bsonType: "array",
          minItems: 1,
          items: {
            bsonType: "object",
            required: ["productId", "quantity", "currentPrice"],
            properties: {
              productId: { bsonType: "string" },
              quantity: numericOrNull(),
              currentPrice: numericOrNull(),
            },
          },
        },
        totals: {
          bsonType: "object",
          required: ["total"],
          properties: {
            total: numericOrNull(),
            subtotal: numericOrNull(),
            shippingFee: numericOrNull(),
          },
        },
        payment: {
          bsonType: "object",
          required: ["status"],
          properties: {
            status: { enum: ["unpaid", "pending", "paid", "refunded", "failed"] },
            method: { enum: ["cod", "bank_qr"] },
          },
        },
        createdAt: { bsonType: "date" },
      },
    },
  };
}

function cartValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "items", "updatedAt"],
      properties: {
        userId: { bsonType: "string" },
        items: { bsonType: "array" },
        updatedAt: { bsonType: "date" },
      },
    },
  };
}

function reviewValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["productSlug", "status", "rating", "content", "createdAt"],
      properties: {
        productSlug: { bsonType: "string" },
        status: { enum: ["pending", "approved", "hidden", "rejected"] },
        rating: numericOrNull(),
        content: { bsonType: "string" },
        createdAt: { bsonType: "date" },
      },
    },
  };
}

function questionValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["productSlug", "status", "question", "createdAt"],
      properties: {
        productSlug: { bsonType: "string" },
        status: { enum: ["pending", "answered", "approved", "hidden"] },
        question: { bsonType: "string" },
        createdAt: { bsonType: "date" },
      },
    },
  };
}

function productDetailValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["name"],
      properties: {
        name: { bsonType: "string" },
        slug: { bsonType: ["string", "null"] },
        sku: { bsonType: ["string", "null"] },
        currentPrice: numericOrNull(),
        price: numericOrNull(),
        originalPrice: numericOrNull(),
        manageInventory: { bsonType: ["bool", "null"] },
        updatedAt: dateOrNull(),
        scrapedAt: dateOrNull(),
      },
    },
  };
}

function couponValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["code", "type", "status", "value", "createdAt"],
      properties: {
        code: { bsonType: "string" },
        type: { enum: ["fixed", "percent", "free_shipping"] },
        status: { enum: ["active", "inactive", "expired"] },
        value: numericOrNull(),
        minSubtotal: numericOrNull(),
        maxDiscount: numericOrNull(),
        usageLimit: numericOrNull(),
        userLimit: numericOrNull(),
        distributionMode: { enum: ["manual_claim", "checkout_only", null] },
        createdAt: { bsonType: "date" },
      },
    },
  };
}

function userVoucherValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "couponId", "code", "status", "claimedAt", "createdAt"],
      properties: {
        userId: { bsonType: "string" },
        couponId: { bsonType: "string" },
        code: { bsonType: "string" },
        status: { enum: ["available", "reserved", "used", "expired", "revoked"] },
        source: { bsonType: ["string", "null"] },
        usedCount: numericOrNull(),
        orderCode: { bsonType: ["string", "null"] },
        claimedAt: { bsonType: "date" },
        reservedAt: dateOrNull(),
        usedAt: dateOrNull(),
        expiresAt: dateOrNull(),
        createdAt: { bsonType: "date" },
        updatedAt: dateOrNull(),
      },
    },
  };
}

function inventoryValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["key", "productId", "stock", "reservedStock", "soldCount"],
      properties: {
        key: { bsonType: "string" },
        productId: { bsonType: "string" },
        stock: numericOrNull(),
        reservedStock: numericOrNull(),
        soldCount: numericOrNull(),
      },
    },
  };
}

function paymentValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["transactionId", "status", "createdAt"],
      properties: {
        transactionId: { bsonType: "string" },
        orderCode: { bsonType: ["string", "null"] },
        amount: numericOrNull(),
        status: { enum: ["unpaid", "pending", "paid", "unmatched", "failed", "refunded"] },
        createdAt: { bsonType: "date" },
      },
    },
  };
}

function shipmentValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["orderCode", "status", "createdAt"],
      properties: {
        orderCode: { bsonType: "string" },
        trackingCode: { bsonType: ["string", "null"] },
        carrier: { bsonType: ["string", "null"] },
        status: {
          enum: ["pending", "ready", "shipping", "delivered", "failed", "cancelled", "returned"],
        },
        createdAt: { bsonType: "date" },
        updatedAt: dateOrNull(),
      },
    },
  };
}

function wishlistValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "productId", "createdAt"],
      properties: {
        userId: { bsonType: "string" },
        productId: { bsonType: "string" },
        productSlug: { bsonType: ["string", "null"] },
        productName: { bsonType: ["string", "null"] },
        createdAt: { bsonType: "date" },
      },
    },
  };
}

function notificationValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "type", "title", "createdAt"],
      properties: {
        userId: { bsonType: "string" },
        type: { bsonType: "string" },
        title: { bsonType: "string" },
        message: { bsonType: ["string", "null"] },
        readAt: dateOrNull(),
        createdAt: { bsonType: "date" },
      },
    },
  };
}

function addressValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["userId", "fullName", "phone", "province", "district", "ward", "addressLine", "createdAt"],
      properties: {
        userId: { bsonType: "string" },
        fullName: { bsonType: "string" },
        phone: { bsonType: "string" },
        province: { bsonType: "string" },
        district: { bsonType: "string" },
        ward: { bsonType: "string" },
        addressLine: { bsonType: "string" },
        fullAddress: { bsonType: ["string", "null"] },
        isDefault: { bsonType: ["bool", "null"] },
        createdAt: { bsonType: "date" },
        updatedAt: dateOrNull(),
      },
    },
  };
}

function returnValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["orderCode", "status", "reason", "createdAt"],
      properties: {
        orderCode: { bsonType: "string" },
        status: { enum: ["pending", "approved", "rejected", "received", "completed", "refunded", "cancelled"] },
        reason: { bsonType: "string" },
        userId: { bsonType: ["string", "null"] },
        productId: { bsonType: ["string", "null"] },
        productName: { bsonType: ["string", "null"] },
        createdAt: { bsonType: "date" },
        updatedAt: dateOrNull(),
      },
    },
  };
}

function warrantyValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["orderCode", "productId", "warrantyUntil", "createdAt"],
      properties: {
        orderCode: { bsonType: "string" },
        productId: { bsonType: "string" },
        productName: { bsonType: ["string", "null"] },
        warrantyMonths: numericOrNull(),
        warrantyUntil: { bsonType: "date" },
        createdAt: { bsonType: "date" },
      },
    },
  };
}

async function ensureCommerceDatabase({
  db,
  products,
  productDetails,
  productReviews,
  productQuestions,
  carts,
  orders,
  coupons,
  userVouchers,
  inventory,
  payments,
  userEvents,
  shipments,
  wishlists,
  notifications,
  addresses,
  returns,
  warranties,
  adminAuditLogs,
  collectionNames,
}) {
  if (ensured) return;

  const strictProductSlug = String(process.env.STRICT_PRODUCT_DETAIL_SLUG_UNIQUE || "false") === "true";
  const userVoucherCollection = userVouchers || db.collection(
    collectionNames.userVouchersCollection || process.env.USER_VOUCHERS_COLLECTION || "user_vouchers"
  );

  await applyInventoryManagementBackfill({
    db,
    products,
    productDetails,
    inventory,
  });

  await Promise.all([
    createIndexSafe(productDetails, { slug: 1 }, { unique: strictProductSlug, sparse: true, name: strictProductSlug ? "unique_product_details_slug" : "product_details_slug" }),
    createIndexSafe(productDetails, { sku: 1 }, { sparse: true, name: "product_details_sku" }),
    createIndexSafe(productDetails, { lookupKeys: 1 }, { sparse: true, name: "product_details_lookup_keys" }),
    createIndexSafe(productDetails, { effectivePrice: 1 }, { sparse: true, name: "product_details_effective_price" }),
    createIndexSafe(productDetails, { brand: 1, currentPrice: 1 }, { name: "product_details_brand_price" }),
    createIndexSafe(productDetails, { category: 1, currentPrice: 1 }, { name: "product_details_category_price" }),
    createIndexSafe(productDetails, { brandKey: 1, currentPrice: 1 }, { name: "product_details_brand_key_price" }),
    createIndexSafe(productDetails, { createdAt: -1 }, { name: "product_details_created" }),
    createIndexSafe(productDetails, { updatedAt: -1 }, { name: "product_details_updated" }),
    createIndexSafe(productDetails, { statusLabel: 1 }, { name: "product_details_status_label" }),
    createIndexSafe(productDetails, { category: 1, "facets.batteryCapacityMah": -1 }, { name: "product_details_category_battery" }),
    ...(products
      ? [
          createIndexSafe(products, { slug: 1 }, { sparse: true, name: "products_slug" }),
          createIndexSafe(products, { sku: 1 }, { sparse: true, name: "products_sku" }),
          createIndexSafe(products, { category: 1, currentPrice: 1 }, { name: "products_category_price" }),
          createIndexSafe(products, { brand: 1, currentPrice: 1 }, { name: "products_brand_price" }),
          createIndexSafe(products, { createdAt: -1 }, { name: "products_created" }),
        ]
      : []),
    createIndexSafe(productReviews, { productSlug: 1, status: 1, createdAt: -1 }, { name: "reviews_product_status_created" }),
    createIndexSafe(productReviews, { userId: 1, productSlug: 1 }, { name: "reviews_user_product" }),
    createIndexSafe(productQuestions, { productSlug: 1, status: 1, createdAt: -1 }, { name: "questions_product_status_created" }),
    createIndexSafe(coupons, { code: 1 }, { unique: true, name: "unique_coupon_code" }),
    createIndexSafe(userVoucherCollection, { userId: 1, couponId: 1 }, { unique: true, name: "unique_user_coupon_wallet" }),
    createIndexSafe(userVoucherCollection, { userId: 1, status: 1, claimedAt: -1 }, { name: "user_vouchers_user_status_claimed" }),
    createIndexSafe(userVoucherCollection, { couponId: 1, status: 1 }, { name: "user_vouchers_coupon_status" }),
    createIndexSafe(inventory, { key: 1 }, { unique: true, name: "unique_inventory_key" }),
    createIndexSafe(inventory, { productId: 1 }, { name: "inventory_product_id" }),
    createIndexSafe(inventory, { productSlug: 1 }, { sparse: true, name: "inventory_product_slug" }),
    createIndexSafe(inventory, { productSku: 1 }, { sparse: true, name: "inventory_product_sku" }),
    createIndexSafe(inventory, { status: 1, updatedAt: -1 }, { name: "inventory_status_updated" }),
    createIndexSafe(payments, { transactionId: 1 }, { unique: true, sparse: true, name: "unique_payment_transaction" }),
    createIndexSafe(payments, { orderCode: 1, createdAt: -1 }, { name: "payments_order_created" }),
    createIndexSafe(payments, { status: 1, createdAt: -1 }, { name: "payments_status_created" }),
    createIndexSafe(userEvents, { type: 1, createdAt: -1 }, { name: "user_events_type_created" }),
    createIndexSafe(shipments, { orderCode: 1 }, { name: "shipments_order_code" }),
    createIndexSafe(shipments, { trackingCode: 1 }, { sparse: true, name: "shipments_tracking_code" }),
    createIndexSafe(shipments, { status: 1, updatedAt: -1 }, { name: "shipments_status_updated" }),
    createIndexSafe(wishlists, { userId: 1, productId: 1 }, { unique: true, name: "unique_wishlist_user_product" }),
    createIndexSafe(wishlists, { userId: 1, createdAt: -1 }, { name: "wishlists_user_created" }),
    createIndexSafe(notifications, { userId: 1, readAt: 1, createdAt: -1 }, { name: "notifications_user_read_created" }),
    createIndexSafe(addresses, { userId: 1, isDefault: -1, updatedAt: -1 }, { name: "addresses_user_default_updated" }),
    createIndexSafe(returns, { orderCode: 1, createdAt: -1 }, { name: "returns_order_created" }),
    createIndexSafe(returns, { userId: 1, createdAt: -1 }, { name: "returns_user_created" }),
    createIndexSafe(returns, { status: 1, createdAt: -1 }, { name: "returns_status_created" }),
    createIndexSafe(warranties, { orderCode: 1, productId: 1 }, { name: "warranties_order_product" }),
    createIndexSafe(warranties, { warrantyUntil: 1 }, { name: "warranties_until" }),
    createIndexSafe(adminAuditLogs, { createdAt: -1 }, { name: "admin_audit_created" }),
  ]);

  await Promise.all([
    applyValidationSafe(db, collectionNames.productDetailsCollection, productDetailValidator()),
    applyValidationSafe(db, collectionNames.productReviewsCollection, reviewValidator()),
    applyValidationSafe(db, collectionNames.productQuestionsCollection, questionValidator()),
    applyValidationSafe(db, collectionNames.cartsCollection, cartValidator()),
    applyValidationSafe(db, collectionNames.ordersCollection, orderValidator()),
    applyValidationSafe(db, collectionNames.couponsCollection, couponValidator()),
    applyValidationSafe(
      db,
      collectionNames.userVouchersCollection || process.env.USER_VOUCHERS_COLLECTION || "user_vouchers",
      userVoucherValidator()
    ),
    applyValidationSafe(db, collectionNames.inventoryCollection, inventoryValidator()),
    applyValidationSafe(db, collectionNames.paymentsCollection, paymentValidator()),
    applyValidationSafe(db, collectionNames.shipmentsCollection, shipmentValidator()),
    applyValidationSafe(db, collectionNames.wishlistsCollection, wishlistValidator()),
    applyValidationSafe(db, collectionNames.notificationsCollection, notificationValidator()),
    applyValidationSafe(db, collectionNames.addressesCollection, addressValidator()),
    applyValidationSafe(db, collectionNames.returnsCollection, returnValidator()),
    applyValidationSafe(db, collectionNames.warrantiesCollection, warrantyValidator()),
  ]);

  ensured = true;
}

module.exports = {
  ensureCommerceDatabase,
};
