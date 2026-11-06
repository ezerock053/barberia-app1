function isId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isName(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Service.price is DECIMAL(10, 2), which Sequelize exposes as a decimal string.
function isPrice(value) {
  return typeof value === 'string'
    && /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)
    && Number.isFinite(Number(value));
}

// Keep this aligned with the URL policy used when Express creates the payload.
function isSafeImage(value) {
  if (value == null) return true;
  if (typeof value !== 'string' || !value.trim()) return false;
  const image = value.trim();
  if (image.startsWith('/')) return !image.startsWith('//');
  try {
    const url = new URL(image);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isService(record) {
  return record && typeof record === 'object' && !Array.isArray(record)
    && isId(record.id)
    && isName(record.name)
    && isPrice(record.price)
    && (record.description == null || typeof record.description === 'string');
}

function isBarber(record) {
  return record && typeof record === 'object' && !Array.isArray(record)
    && isId(record.id)
    && isName(record.name)
    && isSafeImage(record.image);
}

export function readInitialCatalog(doc = globalThis.document) {
  const element = doc?.getElementById('seo-catalog');
  if (!element) return null;

  try {
    const value = JSON.parse(element.textContent);
    if (!value || !Array.isArray(value.services) || !Array.isArray(value.barbers)
      || !value.services.every(isService) || !value.barbers.every(isBarber)) return null;
    return { services: value.services, barbers: value.barbers };
  } catch {
    return null;
  }
}
