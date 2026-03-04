import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MathMarkdownRendererProps {
  source: string;
  className?: string;
}

export function MathMarkdownRenderer({ source, className }: MathMarkdownRendererProps) {
  const markdownSource = source ?? '';

  try {
    return (
      <div className={className}>
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {markdownSource}
        </ReactMarkdown>
      </div>
    );
  } catch {
    return <span className={className}>{markdownSource}</span>;
  }
}

export default MathMarkdownRenderer;
