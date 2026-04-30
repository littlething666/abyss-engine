/** Only `key` is substituted. Single `{ ... }` (e.g. JSON examples) is left literal. */
const templatePattern = /\{\{([^{}]+)\}\}/g;

export function interpolatePromptTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(templatePattern, (_match, key: string) => {
    return variables[key.trim()] ?? '';
  });
}
