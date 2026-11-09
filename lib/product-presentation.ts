/** Remove only redundant identity at the edges; never rewrite seller descriptions. */
export function productDisplayTitle(product: { title: string; modelManufacturer: string; scale: string }) {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let title = product.title.trim();
  if (product.modelManufacturer.trim()) {
    title = title.replace(new RegExp(`^${escape(product.modelManufacturer.trim())}\\s+`, "i"), "");
  }
  if (product.scale.trim()) {
    title = title.replace(new RegExp(`\\s+${escape(product.scale.trim())}$`, "i"), "");
  }
  return title.trim() || product.title;
}
