// Array positions can be referenced by provenance; do not remove null elements.
export function omitNullProperties(value) {
  if (Array.isArray(value)) return value.map(omitNullProperties);
  if (value !== null && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== null).map(([key, child]) => [key, omitNullProperties(child)])
  );
  return value;
}

export const compactJson = value => JSON.stringify(omitNullProperties(value)) + '\n';

export function compactSchema(schema) {
  const result = structuredClone(schema);
  const nullable = node => {
    if (node?.$ref?.startsWith('#/')) return nullable(node.$ref.slice(2).split('/').reduce((value, key) => value?.[key], result));
    return node?.type === 'null' || node?.type?.includes?.('null') || node?.enum?.includes(null);
  };
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.required && node.properties) node.required = node.required.filter(key => !nullable(node.properties[key]));
    for (const child of Object.values(node)) if (child && typeof child === 'object') Array.isArray(child) ? child.forEach(visit) : visit(child);
  };
  visit(result);
  return result;
}
