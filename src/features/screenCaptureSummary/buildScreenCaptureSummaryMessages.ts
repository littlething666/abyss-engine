import type { ChatMessage } from '../../types/llm';
import screenCaptureSummaryPrompt from '../../prompts/screen-capture-summary.prompt';

export function buildScreenCaptureSummaryMessages(
  imageDataUrl: string,
  instructionText?: string,
): ChatMessage[] {
  const text = (instructionText?.trim() || screenCaptureSummaryPrompt.trim()) || 'What is in this image?';

  return [
    {
      role: 'user',
      content: [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ];
}
