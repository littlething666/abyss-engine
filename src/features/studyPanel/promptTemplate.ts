const promptInterpolationPattern = /\{\{([^{}]+)\}\}|\{([^{}]+)\}/g;

export function interpolatePromptTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(
    promptInterpolationPattern,
    (_match, doubleBracesKey?: string, singleBracesKey?: string) =>
      variables[(doubleBracesKey || singleBracesKey || '').trim()] ?? '',
  );
}

