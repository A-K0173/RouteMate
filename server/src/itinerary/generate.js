/*
 * Input: places with id, name, lat, and lng, plus numDays and maxStopsPerDay.
 * Output: days containing geographically grouped, ordered stops and estimated
 * walking travel time from each stop to the next.
 */
const { kMeans, centre } = require('./cluster');
const { nearestNeighbourOrder } = require('./order');
const { haversineKm } = require('./distance');

const DEFAULT_SPEED_KMH = 4.5;

function validateInput(places, { numDays, maxStopsPerDay, speedKmh }) {
  if (!Array.isArray(places)) {
    throw new TypeError('Places must be an array');
  }
  if (!Number.isInteger(numDays) || numDays < 1) {
    throw new RangeError('Number of days must be a positive integer');
  }
  if (!Number.isInteger(maxStopsPerDay) || maxStopsPerDay < 1) {
    throw new RangeError('Maximum stops per day must be a positive integer');
  }
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) {
    throw new RangeError('Travel speed must be a positive number');
  }

  places.forEach((place, index) => {
    if (
      !place ||
      place.id === undefined ||
      typeof place.name !== 'string' ||
      !place.name.trim() ||
      !Number.isFinite(place.lat) ||
      place.lat < -90 ||
      place.lat > 90 ||
      !Number.isFinite(place.lng) ||
      place.lng < -180 ||
      place.lng > 180
    ) {
      throw new TypeError(`Place at index ${index} has invalid itinerary data`);
    }
  });
}

function enforceCap(clusters, cap) {
  for (let index = 0; index < clusters.length; index++) {
    while (clusters[index].length > cap) {
      const place = clusters[index].pop();
      let targetIndex = -1;
      let nearestDistance = Infinity;

      clusters.forEach((cluster, candidateIndex) => {
        if (candidateIndex === index || cluster.length >= cap) return;

        const distance = cluster.length === 0 ? 0 : haversineKm(place, centre(cluster));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          targetIndex = candidateIndex;
        }
      });

      if (targetIndex === -1) {
        throw new Error('Unable to balance itinerary stops within the daily limit');
      }
      clusters[targetIndex].push(place);
    }
  }
}

function generateItinerary(
  places,
  { numDays, maxStopsPerDay = 6, speedKmh = DEFAULT_SPEED_KMH } = {},
) {
  validateInput(places, { numDays, maxStopsPerDay, speedKmh });

  if (places.length > numDays * maxStopsPerDay) {
    throw new RangeError(
      `Too many places (${places.length}) for ${numDays} day(s) with ${maxStopsPerDay} stops each`,
    );
  }

  const clusters = kMeans(places, numDays);
  enforceCap(clusters, maxStopsPerDay);

  return clusters.map((members, dayIndex) => {
    const ordered = nearestNeighbourOrder(members);

    return {
      dayNumber: dayIndex + 1,
      stops: ordered.map((place, stopIndex) => ({
        placeId: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        order: stopIndex + 1,
        travelMinFromPrevious:
          stopIndex === 0
            ? 0
            : Math.round(
                (haversineKm(ordered[stopIndex - 1], place) / speedKmh) * 60,
              ),
      })),
    };
  });
}

module.exports = { generateItinerary };
