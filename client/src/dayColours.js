// one colour per day, it loops if there are more days than colours
const DAY_COLOURS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777']

export function dayColour(dayNumber) {
  return DAY_COLOURS[(dayNumber - 1) % DAY_COLOURS.length]
}
