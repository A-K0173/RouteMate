const { haversineKm } = require('./distance');

function nearestNeighbourOrder(places) {
  if (places.length <= 1) return [...places];

  const remaining = [...places];
  const route = [remaining.shift()];

  while (remaining.length) {
    const lastPlace = route[route.length - 1];
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    remaining.forEach((place, index) => {
      const distance = haversineKm(lastPlace, place);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    route.push(remaining.splice(nearestIndex, 1)[0]);
  }

  return route;
}

module.exports = { nearestNeighbourOrder };
