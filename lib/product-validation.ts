export function validateProduct(value: unknown) {
  if (!value || typeof value !== "object") return { error: "Invalid product." } as const;
  const body = value as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const price = Number(body.price); const stock = Number(body.stock);
  const unit = typeof body.unit === "string" ? body.unit.trim() : "piece";
  const imageUrl = typeof body.image_url === "string" ? body.image_url.trim() : "";
  const videoUrl = typeof body.video_url === "string" ? body.video_url.trim() : "";
  if (name.length < 2 || name.length > 120) return { error: "Product name must be 2–120 characters." } as const;
  if (category.length < 2 || category.length > 80) return { error: "Please select a valid category." } as const;
  if (!Number.isFinite(price) || price < 0 || price > 100000000) return { error: "Enter a valid price." } as const;
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return { error: "Stock must be a whole number between 0 and 1,000,000." } as const;
  if (description.length > 1500 || unit.length < 1 || unit.length > 20) return { error: "Please check the product description and unit." } as const;
  for (const url of [imageUrl, videoUrl]) if (url && (!/^https:\/\//i.test(url) || url.length > 2048)) return { error: "Image and video URLs must be valid HTTPS URLs." } as const;
  return { value: { name, category, description, price, stock, unit, image_url: imageUrl, video_url: videoUrl, active: body.active !== false } } as const;
}
