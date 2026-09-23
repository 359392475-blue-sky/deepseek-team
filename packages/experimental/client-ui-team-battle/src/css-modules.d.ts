/** CSS Module declarations for the Team Battle Client bundle. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}

/** Browser asset URL declarations emitted by the Client bundler. */
declare module '*.png' {
  const url: string
  export default url
}

/** Browser asset URL declarations emitted by the Client bundler. */
declare module '*.webp' {
  const url: string
  export default url
}
