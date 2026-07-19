const { z } = require("zod");

const safeString = (max = 255) => z.string().trim().max(max).optional().default("");
const positiveQuantity = z.coerce.number().int().min(1).max(99).default(1);

const orderItemSchema = z
  .object({
    id: safeString(120),
    productId: safeString(120),
    mongoId: safeString(120),
    slug: safeString(240),
    sku: safeString(120),
    url: safeString(500),
    name: safeString(500),
    quantity: positiveQuantity,
    selectedOptions: z.record(z.any()).optional().default({}),
    option: z.record(z.any()).optional(),
    options: z.record(z.any()).optional(),
    variantId: safeString(120),
    variantName: safeString(240),
    colorId: safeString(120),
    colorName: safeString(240),
  })
  .passthrough();

const orderPayloadSchema = z
  .object({
    items: z.array(orderItemSchema).min(1).max(30),
    customer: z.record(z.any()).optional().default({}),
    receiver: z.record(z.any()).optional().default({}),
    shippingAddress: z.record(z.any()).optional().default({}),
    shippingChoice: z.record(z.any()).optional().default({}),
    companyInvoice: z.record(z.any()).optional().default({}),
    paymentMethod: z.enum(["cod", "bank_qr", "bank", "transfer", "qr"]).optional().default("cod"),
    couponCode: safeString(80),
    note: safeString(1000),
    marketingOptIn: z.coerce.boolean().optional().default(false),
    educationOffer: z.coerce.boolean().optional().default(false),
    gifts: z.array(z.any()).optional().default([]),
  })
  .passthrough();

const reviewCreateSchema = z
  .object({
    rating: z.coerce.number().int().min(1).max(5).default(5),
    content: z.string().trim().min(3).max(4000),
  })
  .passthrough();

const questionCreateSchema = z
  .object({
    question: z.string().trim().min(3).max(4000),
  })
  .passthrough();

const couponAudienceSchema = z.enum([
  "all",
  "smember",
  "student",
  "teacher",
  "education",
  "business",
]);

const couponSchema = z
  .object({
    code: z.string().trim().min(2).max(80),
    name: safeString(200),
    description: safeString(1000),
    type: z.enum(["fixed", "percent", "free_shipping"]).default("fixed"),
    value: z.coerce.number().min(0).default(0),
    maxDiscount: z.coerce.number().min(0).optional(),
    minSubtotal: z.coerce.number().min(0).default(0),
    usageLimit: z.coerce.number().int().min(0).optional(),
    userLimit: z.coerce.number().int().min(0).optional(),
    audiences: z.array(couponAudienceSchema).min(1).max(6).default(["all"]),
    allowWithEducationOffer: z.coerce.boolean().optional().default(true),
    startsAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    status: z.enum(["active", "inactive", "expired"]).default("active"),
  })
  .passthrough();

const couponUpdateSchema = z
  .object({
    code: z.string().trim().min(2).max(80).optional(),
    name: z.string().trim().max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    type: z.enum(["fixed", "percent", "free_shipping"]).optional(),
    value: z.coerce.number().min(0).optional(),
    maxDiscount: z.coerce.number().min(0).optional(),
    minSubtotal: z.coerce.number().min(0).optional(),
    usageLimit: z.coerce.number().int().min(0).optional(),
    userLimit: z.coerce.number().int().min(0).optional(),
    audiences: z.array(couponAudienceSchema).min(1).max(6).optional(),
    allowWithEducationOffer: z.coerce.boolean().optional(),
    startsAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    status: z.enum(["active", "inactive", "expired"]).optional(),
  })
  .passthrough();

const addressSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(8).max(24),
    province: z.string().trim().min(2).max(120),
    district: z.string().trim().min(2).max(120),
    ward: z.string().trim().min(2).max(120),
    addressLine: z.string().trim().min(3).max(260),
    fullAddress: z.string().trim().max(700).optional(),
    isDefault: z.coerce.boolean().optional().default(false),
  })
  .passthrough();

const addressUpdateSchema = addressSchema.partial().passthrough();

const wishlistItemSchema = z
  .object({
    productId: safeString(120),
    slug: safeString(240),
    sku: safeString(120),
    url: safeString(500),
  })
  .passthrough();

const shipmentSchema = z
  .object({
    orderCode: z.string().trim().min(4).max(80),
    carrier: safeString(120),
    trackingCode: safeString(120),
    status: z.enum(["pending", "ready", "shipping", "delivered", "failed", "cancelled", "returned"]).default("pending"),
    receiverName: safeString(120),
    receiverPhone: safeString(24),
    shippingAddress: z.record(z.any()).optional().default({}),
    note: safeString(1000),
    estimatedDeliveryAt: z.coerce.date().optional(),
  })
  .passthrough();

const shipmentUpdateSchema = shipmentSchema.partial().passthrough();

const inventoryUpdateSchema = z
  .object({
    stock: z.coerce.number().int().min(0).optional(),
    reservedStock: z.coerce.number().int().min(0).optional(),
    soldCount: z.coerce.number().int().min(0).optional(),
    status: z.enum(["in_stock", "low_stock", "out_of_stock", "inactive"]).optional(),
    note: safeString(1000),
  })
  .passthrough();

const paymentUpdateSchema = z
  .object({
    status: z.enum(["pending", "paid", "unmatched", "failed", "refunded"]).optional(),
    orderCode: safeString(80),
    amount: z.coerce.number().min(0).optional(),
    bankReference: safeString(180),
    note: safeString(1000),
  })
  .passthrough();

const invoiceUpdateSchema = z
  .object({
    requested: z.coerce.boolean().optional(),
    companyName: safeString(180),
    taxCode: safeString(40),
    companyAddress: safeString(320),
    invoiceEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
    email: z.string().trim().email().max(160).optional().or(z.literal("")),
    invoiceStatus: z.enum(["not_requested", "pending", "issued", "sent", "cancelled"]).optional(),
    note: safeString(1000),
  })
  .passthrough();

const returnImageSchema = z
  .string()
  .trim()
  .max(300000)
  .refine(
    (value) => /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value),
    "Ảnh đổi trả phải là file JPG, PNG hoặc WEBP hợp lệ."
  );

const returnRequestSchema = z
  .object({
    orderCode: z.string().trim().min(4).max(80),
    productId: safeString(180),
    productSlug: safeString(240),
    productName: safeString(500),
    reason: z.string().trim().min(3).max(1000),
    customerPhone: safeString(24),
    images: z.array(returnImageSchema).max(6).optional().default([]),
    note: safeString(1000),
  })
  .passthrough();

function parseWithSchema(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };

  return {
    ok: false,
    message: result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; "),
  };
}

module.exports = {
  addressSchema,
  addressUpdateSchema,
  couponSchema,
  couponUpdateSchema,
  invoiceUpdateSchema,
  inventoryUpdateSchema,
  orderPayloadSchema,
  parseWithSchema,
  paymentUpdateSchema,
  questionCreateSchema,
  reviewCreateSchema,
  returnRequestSchema,
  shipmentSchema,
  shipmentUpdateSchema,
  wishlistItemSchema,
};
