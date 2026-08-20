import { randomInt } from '../crypto/csprng';

export const TAG_PALETTE = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#0EA5E9', '#6366F1', '#A855F7', '#EC4899'];

export function randomTagColor(): string {
  return TAG_PALETTE[randomInt(TAG_PALETTE.length)]!;
}
