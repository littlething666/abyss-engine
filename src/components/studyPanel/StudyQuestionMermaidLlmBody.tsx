'use client';

import { ChevronDown } from 'lucide-react';

import {
  extractMermaidFromAssistantText,
  type StudyPanelMermaidDiagramProps,
} from '../../features/studyPanel';
import { Button } from '@/components/ui/button';
import { Card as UiCard, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { StudyMermaidPreview } from './StudyMermaidPreview';

function MermaidAssistantRawCollapsible({ assistantText }: { assistantText: string }) {
  return (
    <UiCard className="w-full">
      <CardContent>
        <Collapsible defaultOpen={false} className="group rounded-md data-[state=open]:bg-muted">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-10 w-full justify-start gap-2 px-2 py-2 text-left font-normal"
              data-testid="study-card-llm-mermaid-streaming-output-toggle"
            >
              <span>Show raw model output</span>
              <ChevronDown
                className="ml-auto size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col items-stretch gap-2 p-2.5 pt-0 text-sm">
            <pre
              className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border/80 bg-background/80 p-2 font-mono text-xs"
              data-testid="study-card-llm-mermaid-streaming-output"
            >
              {assistantText}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </UiCard>
  );
}

export function StudyQuestionMermaidLlmBody(props: StudyPanelMermaidDiagramProps) {
  const llmMermaidDiagram = props;
  const extractedMermaidDiagram =
    llmMermaidDiagram.assistantText != null && llmMermaidDiagram.assistantText.length > 0
      ? extractMermaidFromAssistantText(llmMermaidDiagram.assistantText)
      : null;

  return (
    <div
      className="max-h-[min(60vh,36rem)] overflow-y-auto text-sm"
      data-testid="study-card-llm-mermaid-content"
    >
      {llmMermaidDiagram.errorMessage && !llmMermaidDiagram.isPending && (
        <p className="text-destructive" data-testid="study-card-llm-mermaid-error">
          {llmMermaidDiagram.errorMessage}
        </p>
      )}
      {llmMermaidDiagram.isPending
        && !(llmMermaidDiagram.assistantText && llmMermaidDiagram.assistantText.length > 0) && (
        <p className="text-muted-foreground" data-testid="study-card-llm-mermaid-loading">
          Warming up…
        </p>
      )}
      {llmMermaidDiagram.isPending
        && llmMermaidDiagram.assistantText
        && llmMermaidDiagram.assistantText.length > 0
        && !extractedMermaidDiagram && (
        <div className="space-y-2">
          <p className="text-muted-foreground" data-testid="study-card-llm-mermaid-streaming">
            Receiving diagram…
          </p>
          <MermaidAssistantRawCollapsible assistantText={llmMermaidDiagram.assistantText} />
        </div>
      )}
      {extractedMermaidDiagram && <StudyMermaidPreview code={extractedMermaidDiagram} />}
      {!llmMermaidDiagram.isPending
        && extractedMermaidDiagram
        && llmMermaidDiagram.assistantText
        && llmMermaidDiagram.assistantText.length > 0 && (
        <div className="mt-3">
          <MermaidAssistantRawCollapsible assistantText={llmMermaidDiagram.assistantText} />
        </div>
      )}
      {!llmMermaidDiagram.isPending
        && llmMermaidDiagram.assistantText
        && llmMermaidDiagram.assistantText.length > 0
        && !extractedMermaidDiagram
        && !llmMermaidDiagram.errorMessage && (
        <>
          <p className="text-muted-foreground mb-2 text-sm">
            No fenced Mermaid block was found in the response.
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-2 text-xs">
            {llmMermaidDiagram.assistantText}
          </pre>
        </>
      )}
    </div>
  );
}
