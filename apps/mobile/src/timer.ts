type AttemptTiming = { expiresAt: string | null; serverNow: string; receivedAt: number };

export function remainingSeconds(timing: AttemptTiming, now = Date.now()): number | null {
 if (!timing.expiresAt) return null;
 const elapsed = now - timing.receivedAt;
 return Math.max(0, Math.ceil((Date.parse(timing.expiresAt) - Date.parse(timing.serverNow) - elapsed) / 1000));
}
