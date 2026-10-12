/*
 * ComplyOn AI mark: rounded hexagon (shield) with a checkmark, thin line-art.
 * Drawn on a 24×24 grid; colour comes from `currentColor` unless overridden.
 * Used standalone (card faces) and nested inside the seal's SVG.
 */
export const SHIELD_PATH = 'M12 2.6 20.15 7.3v9.4L12 21.4l-8.15-4.7V7.3Z';
export const CHECK_PATH = 'm8.5 12.1 2.4 2.4 4.6-4.8';

export default function ShieldMark({ size = 24, strokeWidth = 1.1, className, ...rest }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={SHIELD_PATH} />
      <path d={CHECK_PATH} />
    </svg>
  );
}
