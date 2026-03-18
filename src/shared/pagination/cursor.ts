/**
 * Encodes a cursor value as base64 for opaque pagination tokens.
 * Clients should treat cursors as opaque strings.
 */
export function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64');
}

/**
 * Decodes a base64 cursor back to the original value.
 * Throws if the cursor is malformed.
 */
export function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, 'base64').toString('utf-8');
  } catch {
    throw new Error('Invalid cursor');
  }
}
