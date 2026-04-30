/**
 * Substitutes `key` and `[[key]]` placeholders against the variables
 * map. Both delimiters are supported so prompts can use whichever survives
 * their authoring pipeline. Single `{ ... }` (e.g. JSON examples) is left
 * literal.
 */
const templatePattern = /\{\{([^{}]+)\}\}|\[\[([^\[\]]+)\]\]/g;

export function interpolatePromptTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(templatePattern, (_match, braceKey: string | undefined, bracketKey: string | undefined) => {
    const key = (braceKey ?? bracketKey ?? '').trim();
    return variables[key] ?? '';
  });
}
