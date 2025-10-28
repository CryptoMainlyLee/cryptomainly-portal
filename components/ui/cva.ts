// Tiny utility to emulate class-variance-authority for this skeleton without extra deps
export type VariantProps<T> = T extends (arg: infer A) => any ? A : never;
export function cva(base: string, config?: { variants?: Record<string, Record<string, string>>; defaultVariants?: Record<string, string> }) {
  return function (options?: Record<string, string>) {
    const classes = [base];
    const variants = config?.variants || {};
    const defaults = config?.defaultVariants || {};
    const merged = { ...defaults, ...(options || {}) };
    for (const key of Object.keys(variants)) {
      const val = (merged as any)[key];
      if (val && variants[key][val]) classes.push(variants[key][val]);
    }
    return classes.join(" ");
  };
}
