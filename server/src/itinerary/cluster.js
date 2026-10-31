const { haversineKm } = require('./distance');

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const centre = (places) => ({
  lat: average(places.map((place) => place.lat)),
  lng: average(places.map((place) => place.lng)),
});

function kMeans(places, k, iterations = 20) {
  if (!Number.isInteger(k) || k < 1) {
    throw new RangeError('Number of clusters must be a positive integer');
  }
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError('Iterations must be a positive integer');
  }
  if (places.length <= k) {
    return [
      ...places.map((place) => [place]),
      ...Array.from({ length: k - places.length }, () => []),
    ];
  }

  let centres = places.slice(0, k).map(({ lat, lng }) => ({ lat, lng }));
  let clusters = [];

  for (let iteration = 0; iteration < iterations; iteration++) {
    clusters = Array.from({ length: k }, () => []);

    for (const place of places) {
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      centres.forEach((currentCentre, index) => {
        const distance = haversineKm(place, currentCentre);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      clusters[nearestIndex].push(place);
    }

    centres = clusters.map((members, index) =>
      members.length ? centre(members) : centres[index],
    );
  }

  return clusters;
}

module.exports = { kMeans, centre };
