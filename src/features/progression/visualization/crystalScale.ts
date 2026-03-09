export const getCrystalScale = (level: number): number => {
  const baseScale = 0.6;
  const scaleIncrement = 0.15;
  return baseScale + level * scaleIncrement;
};
