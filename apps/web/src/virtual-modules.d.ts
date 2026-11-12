declare module 'virtual:asset-manifest' {
  /** SHA-256 digests indexed by paths relative to `public/assets/`. */
  const files: Readonly<Record<string, string>>;
  export default files;
}
