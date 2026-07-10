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
        createdAt: { bsonType: "date" },
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
        status: { enum: ["pending", "paid", "unmatched", "failed", "refunded"] },
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
        status: { enum: ["pending", "approved", "rejected", "received", "refunded", "cancelled"] },
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

  await Promise.all([
    createIndexSafe(productDetails, { slug: 1 }, { unique: strictProductSlug, sparse: true, name: strictProductSlug ? "unique_product_details_slug" : "product_details_slug" }),
    createIndexSafe(productDetails, { sku: 1 }, { sparse: true, name: "product_details_sku" }),
    createIndexSafe(productDetails, { brand: 1, currentPrice: 1 }, { name: "product_details_brand_price" }),
    createIndexSafe(productDetails, { category: 1, currentPrice: 1 }, { name: "product_details_category_price" }),
    createIndexSafe(productDetails, { brandKey: 1, currentPrice: 1 }, { name: "product_details_brand_key_price" }),
    createIndexSafe(productDetails, { createdAt: -1 }, { name: "product_details_created" }),
    createIndexSafe(productDetails, { updatedAt: -1 }, { name: "product_details_updated" }),
    createIndexSafe(productDetails, { statusLabel: 1 }, { name: "product_details_status_label" }),
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
    createIndexSafe(inventory, { key: 1 }, { unique: true, name: "unique_inventory_key" }),
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
