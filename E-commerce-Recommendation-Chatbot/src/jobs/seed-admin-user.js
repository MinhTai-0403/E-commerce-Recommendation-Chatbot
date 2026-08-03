const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { createPasswordHash, getAuthConfig } = require("../services/auth-service");

function normalizeUsername(value = "") {
  return String(value).trim().toLowerCase();
}

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const now = new Date();

  if (!username || !password) {
    throw new Error("Missing ADMIN_USERNAME or ADMIN_PASSWORD.");
  }

  const client = createMongoClient();
  await client.connect();

  try {
    const { dbName } = getMongoConfig();
    const { usersCollection } = getAuthConfig();
    const users = client.db(dbName).collection(usersCollection);
    const usernameNormalized = normalizeUsername(username);

    await users.createIndex(
      { usernameNormalized: 1 },
      { unique: true, sparse: true, name: "unique_user_username" }
    );
    await users.createIndex(
      { emailNormalized: 1 },
      { unique: true, sparse: true, name: "unique_user_email" }
    );
    await users.createIndex(
      { phoneNormalized: 1 },
      { unique: true, sparse: true, name: "unique_user_phone" }
    );

    await users.updateOne(
      { usernameNormalized },
      {
        $set: {
          username,
          usernameNormalized,
          fullName: "Admin CellphoneS",
          email: "admin@cellphones.local",
          emailNormalized: "admin@cellphones.local",
          passwordHash: createPasswordHash(password),
          role: "admin",
          status: "active",
          customerType: "normal",
          emailVerified: true,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          lastLoginAt: null,
        },
      },
      { upsert: true }
    );

    console.log(`Admin user synced to MongoDB: ${usernameNormalized}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
