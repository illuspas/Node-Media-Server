declare module "feather-icons" {
  interface FeatherIcon {
    name: string;
    contents: string;
    tags: string[];
    toSvg(options?: Record<string, unknown>): string;
  }

  export const icons: Record<string, FeatherIcon>;
  export function toSvg(name: string, options?: Record<string, unknown>): string;
  export function replace(options?: Record<string, unknown>): void;
}
