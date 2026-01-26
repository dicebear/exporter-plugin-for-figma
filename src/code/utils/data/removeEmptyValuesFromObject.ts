export function removeEmptyValuesFromObject(obj: Record<string, any>): Record<string, any> {
  Object.keys(obj).forEach((key) => {
    if (obj[key] && typeof obj[key] === 'object') {
      removeEmptyValuesFromObject(obj[key]);
    }

    if (
      obj[key] === null ||
      obj[key] === '' ||
      obj[key] === undefined ||
      (typeof obj[key] === 'object' && Object.keys(obj[key]).length === 0 && Array.isArray(obj[key]) === false)
    ) {
      delete obj[key];
    }
  });

  return obj;
}
