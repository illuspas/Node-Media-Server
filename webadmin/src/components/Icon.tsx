import { icons } from "feather-icons";

interface IconProps {
  name: string;
  className?: string;
}

/** Render a feather icon as an inline SVG. */
export default function Icon({ name, className = "w-4 h-4" }: IconProps) {
  const icon = icons[name];
  if (!icon) return null;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.contents }}
    />
  );
}
