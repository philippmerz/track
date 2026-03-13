export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const distanceBetween = (pointA, pointB) => Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);

export const selectClosestAnchor = (nodeBounds, targetPoint, inset = 8) => {
  const candidates = [
    {
      side: "top",
      x: nodeBounds.centerX,
      y: nodeBounds.top + inset,
      normalX: 0,
      normalY: -1,
    },
    {
      side: "right",
      x: nodeBounds.right - inset,
      y: nodeBounds.centerY,
      normalX: 1,
      normalY: 0,
    },
    {
      side: "bottom",
      x: nodeBounds.centerX,
      y: nodeBounds.bottom - inset,
      normalX: 0,
      normalY: 1,
    },
    {
      side: "left",
      x: nodeBounds.left + inset,
      y: nodeBounds.centerY,
      normalX: -1,
      normalY: 0,
    },
  ];

  return candidates.reduce((closestCandidate, candidate) => {
    if (!closestCandidate) {
      return candidate;
    }

    return distanceBetween(candidate, targetPoint) < distanceBetween(closestCandidate, targetPoint)
      ? candidate
      : closestCandidate;
  }, null);
};

export const buildCurvePath = (from, to) => {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
};
