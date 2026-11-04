// The data files are large; type them by hand in data.ts instead of letting TypeScript infer them.
declare module "*.json" {
  const value: unknown;
  export default value;
}
