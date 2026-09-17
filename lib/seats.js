/**
 * Seat 1 is permanently reserved for the co-pilot and can never be sold.
 * Mirrors public.copilot_seat_number() in the database — keep in sync.
 */
export const COPILOT_SEAT_NUMBER = 1;

export function isCopilotSeat(seatNumber) {
  return Number(seatNumber) === COPILOT_SEAT_NUMBER;
}

export function sellableSeatCount(capacity) {
  return Math.max(Number(capacity || 0) - 1, 0);
}

export function isSellableSeat(seatNumber, capacity) {
  const n = Number(seatNumber);
  return Number.isFinite(n) && n >= 2 && n <= Number(capacity || 0);
}
