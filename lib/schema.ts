/**
 * What shape a stored book is in.
 *
 * 1: the cover's coordinates are in inches.
 * 2: they are in points.
 *
 * Its own module because the code that creates books and the code that migrates
 * them both need it, and they already depend on each other one way round.
 */
export const SCHEMA = 2;
