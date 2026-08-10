export interface FrontmatterVars {
  title: string;
  sourcePath: string;
  date: string;
  ext: string;
  sizeBytes: number;
  sha256: string;
}

export class FrontmatterApplier {
  static expand(template: string, vars: FrontmatterVars): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
      if (!(key in vars)) {
        return `{{${key}}}`;
      }
      const v = (vars as unknown as Record<string, unknown>)[key];
      if (typeof v === 'string') {
        return v.replace(/`/g, "'");
      }
      return String(v);
    });
  }
}
