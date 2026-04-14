import diagramSystemPromptTemplate from '../../prompts/diagram-system.prompt';
import { interpolatePromptTemplate } from '@/lib/interpolatePromptTemplate';

export { interpolatePromptTemplate };

export function extractExamplesSection(sourceText: string): string {
  const startMatch = sourceText.match(/^\s*6\.\s*Examples\s*$/m);
  if (!startMatch || typeof startMatch.index !== 'number') {
    return '';
  }

  const sectionStartIndex = startMatch.index + startMatch[0].length;
  const remainingText = sourceText.slice(sectionStartIndex);

  const sectionEndCandidateIndexes = [
    remainingText.match(/\r?\n\s*[-]{3,}\s*(?:\r?\n|$)/),
    remainingText.match(/\r?\n\s*7\.\s+[A-Za-z].*$/m),
    remainingText.match(/\r?\n\s*[89]\.\s+[A-Za-z].*$/m),
  ].reduce<number[]>((accumulator, match) => {
    if (match?.index !== undefined) {
      accumulator.push(match.index);
    }
    return accumulator;
  }, []);

  const sectionEndIndex = sectionEndCandidateIndexes.length > 0
    ? Math.min(...sectionEndCandidateIndexes)
    : remainingText.length;

  const sectionContent = remainingText.slice(0, sectionEndIndex).trim();
  return sectionContent.replace(/^\r?\n+/, '').trim();
}

export function buildDiagramSystemPrompt(topic: string, sourceText: string): string {
  return interpolatePromptTemplate(diagramSystemPromptTemplate, {
    topic,
    examples: extractExamplesSection(sourceText),
  });
}
