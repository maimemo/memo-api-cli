export function collect(value: string, previous: string[]): string[] {
  if (value === "-") return previous;
  return previous.concat([value]);
}
