export function sanitizeHistory(history: Array<{ role: "user" | "assistant"; content: string }>): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-20)
    .filter(msg => msg && typeof msg === "object" && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string")
    .map(msg => ({
      role: msg.role,
      content: msg.content.substring(0, 4000),
    }));
}