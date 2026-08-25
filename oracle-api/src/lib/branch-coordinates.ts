export type BranchCoordinates = {
  latitude: number | null;
  longitude: number | null;
};

function supplied(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Coordinates are stored only as an intentional pair. `null` for both fields
 * clears a saved location; omitting both fields leaves an existing location alone.
 */
export function parseBranchCoordinates(
  latitude: unknown,
  longitude: unknown,
  options: { allowOmitted?: boolean } = {},
): BranchCoordinates | undefined {
  const hasLatitude = supplied(latitude);
  const hasLongitude = supplied(longitude);
  const wasProvided = latitude !== undefined || longitude !== undefined;

  if (!wasProvided && options.allowOmitted) return undefined;
  if (!hasLatitude && !hasLongitude) return { latitude: null, longitude: null };
  if (!hasLatitude || !hasLongitude) {
    throw new Error("Latitude and longitude must be supplied together.");
  }

  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    throw new Error("Latitude and longitude must be valid numbers.");
  }
  if (parsedLatitude < -90 || parsedLatitude > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (parsedLongitude < -180 || parsedLongitude > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }
  return { latitude: parsedLatitude, longitude: parsedLongitude };
}
