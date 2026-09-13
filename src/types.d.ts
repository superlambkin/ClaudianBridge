// v0.41.0: esbuild '.md' text loader 用の型宣言
declare module '*.md' {
  const content: string;
  export default content;
}
