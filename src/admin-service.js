const { ObjectId } = require("mongodb");
const { getAuthConfig, publicUser, verifyJwt } = require("./auth-service");

const MAX_ADMIN_LIMIT = 100;

function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
}

function isAdminAuthorized(req) {
  const expectedKey = process.env.ADMIN_API_KEY;
  const bearerToken = getBearerToken(req);
  const apiKeyHeader = req.headers["x-admin-api-key"];

  if (expectedKey && (bearerToken === expectedKey || apiKeyHeader === expectedKey)) {
    return true;
  }

  if (bearerToken) {
    try {
      const payload = verifyJwt(bearerToken);
      if (payload?.role === "admin") return true;
    } catch {
      // ignore invalid/misconfigured JWT and fall back to API key/local mode
    }
  }

  return false;
}

async function getCollections(getDb) {
  const { db, products } = await getDb();
  const { usersCollection, otpCollection } = getAuthConfig();

  return {
    db,
    products,
    users: db.collection(usersCollection),
    otps: db.collection(otpCollection),
  };
}

function sendUnauthorized(res, sendError) {
  sendError(res, 401, "Bạn cần quyền admin để thực hiện thao tác này.");
}

async function handleAdminSummary({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { products, users, otps } = await getCollections(getDb);
  const now = new Date();

  const [
    totalProducts,
    totalUsers,
    activeUsers,
    blockedUsers,
    pendingOtps,
    recentUsers,
    recentProducts,
  ] = await Promise.all([
    products.estimatedDocumentCount(),
    users.estimatedDocumentCount(),
    users.countDocuments({ status: { $in: [null, "active"] } }),
    users.countDocuments({ status: "blocked" }),
    otps.countDocuments({ expiresAt: { $gt: now } }),
    users.find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(5).toArray(),
    products
      .find(
        {},
        {
          projection: {
            name: 1,
            sku: 1,
            slug: 1,
            brand: 1,
            price: 1,
            currentPrice: 1,
            primaryImage: 1,
            images: { $slice: 1 },
            updatedAt: 1,
            scrapedAt: 1,
          },
        }
      )
      .sort({ updatedAt: -1, scrapedAt: -1, _id: -1 })
      .limit(6)
      .toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    data: {
      cards: {
        totalProducts,
        totalUsers,
        activeUsers,
        blockedUsers,
        pendingOtps,
      },
      recentUsers: recentUsers.map(publicUser),
      recentProducts: recentProducts.map((product) => ({
        id: String(product._id),
        name: product.name,
        sku: product.sku,
        slug: product.slug,
        brand: product.brand,
        price: product.price ?? product.currentPrice ?? null,
        image: product.primaryImage || product.images?.[0] || "",
        updatedAt: product.updatedAt || product.scrapedAt,
      })),
    },
  });
}

function buildUserQuery(searchParams) {
  const q = searchParams.get("q");
  const role = searchParams.get("role");
  const status = searchParams.get("status");
  const customerType = searchParams.get("customerType");
  const query = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { fullName: regex },
      { email: regex },
      { phone: regex },
      { role: regex },
      { customerType: regex },
    ];
  }

  if (role) query.role = role;
  if (status) query.status = status;
  if (customerType) query.customerType = customerType;

  return query;
}

async function handleListUsers({ req, res, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const { users } = await getCollections(getDb);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), 20, MAX_ADMIN_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildUserQuery(url.searchParams);

  const [total, docs] = await Promise.all([
    users.countDocuments(query),
    users
      .find(query, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: docs.map(publicUser),
  });
}

function sanitizeUserUpdate(input = {}) {
  const allowed = ["fullName", "customerType", "role", "status", "emailVerified"];
  const update = {};

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      update[key] = input[key];
    }
  }

  if (typeof update.fullName === "string") update.fullName = update.fullName.trim();
  if (update.customerType && !["normal", "student", "business"].includes(update.customerType)) {
    delete update.customerType;
  }
  if (update.role && !["customer", "admin"].includes(update.role)) delete update.role;
  if (update.status && !["active", "blocked"].includes(update.status)) delete update.status;
  if (update.emailVerified !== undefined) update.emailVerified = Boolean(update.emailVerified);

  update.updatedAt = new Date();
  return update;
}

async function handleUpdateUser({ req, res, pathParts, parseJsonBody, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const userId = pathParts[3];
  if (!ObjectId.isValid(userId)) {
    sendError(res, 400, "User id không hợp lệ.");
    return;
  }

  const body = await parseJsonBody(req);
  const update = sanitizeUserUpdate(body);

  const { users } = await getCollections(getDb);
  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(userId) },
    { $set: update },
    { returnDocument: "after", projection: { passwordHash: 0 } }
  );

  if (!result) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: publicUser(result),
  });
}

async function handleDeleteUser({ req, res, pathParts, sendJson, sendError, getDb }) {
  if (!isAdminAuthorized(req)) {
    sendUnauthorized(res, sendError);
    return;
  }

  const userId = pathParts[3];
  if (!ObjectId.isValid(userId)) {
    sendError(res, 400, "User id không hợp lệ.");
    return;
  }

  const { users } = await getCollections(getDb);
  const result = await users.findOneAndDelete(
    { _id: new ObjectId(userId) },
    { projection: { passwordHash: 0 } }
  );

  if (!result) {
    sendError(res, 404, "Không tìm thấy người dùng.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    deleted: publicUser(result),
  });
}

async function handleAdminRequest(context) {
  const { req, res, pathParts, sendError } = context;
  const resource = pathParts[2];
  const identifier = pathParts[3];

  if (!resource && req.method === "GET") {
    await handleAdminSummary(context);
    return;
  }

  if (resource === "summary" && req.method === "GET") {
    await handleAdminSummary(context);
    return;
  }

  if (resource === "users" && !identifier && req.method === "GET") {
    await handleListUsers(context);
    return;
  }

  if (resource === "users" && identifier && ["PATCH", "PUT"].includes(req.method)) {
    await handleUpdateUser(context);
    return;
  }

  if (resource === "users" && identifier && req.method === "DELETE") {
    await handleDeleteUser(context);
    return;
  }

  sendError(res, 404, "Admin route not found.");
}

module.exports = {
  handleAdminRequest,
  isAdminAuthorized,
};
