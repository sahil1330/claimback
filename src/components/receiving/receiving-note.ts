/** Keep earlier counts available when the merchant corrects a later detail in chat. */
export function appendReceivingUpdate(current: string, update: string): string {
  const earlier = current.trim();
  const latest = update.trim();
  if (!latest) return earlier;
  return earlier ? `${earlier}\nLater merchant clarification: ${latest}` : latest;
}
