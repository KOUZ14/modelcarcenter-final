const STORAGE_KEY = "mcc-shipping-zip-v1";
const listeners = new Set<() => void>();
let memoryZip = "";

export function getShippingZip() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? memoryZip;
  } catch {
    return memoryZip;
  }
}

export function setShippingZip(zip: string) {
  memoryZip = zip;
  try {
    sessionStorage.setItem(STORAGE_KEY, zip);
  } catch {
    // Keep navigation working when browser storage is disabled.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeShippingZip(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function serverShippingZip() {
  return "";
}
