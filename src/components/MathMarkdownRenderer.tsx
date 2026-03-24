import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export type MathMarkdownRendererProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'dangerouslySetInnerHTML'
> & {
  source: string;
};

export const MathMarkdownRenderer = forwardRef<HTMLDivElement, MathMarkdownRendererProps>(
  function MathMarkdownRenderer({ source, className, ...props }, ref) {
    const markdownSource = source ?? '';

    try {
      return (
        <div ref={ref} className={className} {...props}>
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {markdownSource}
          </ReactMarkdown>
        </div>
      );
    } catch {
      return (
        <div ref={ref} className={className} {...props}>
          {markdownSource}
        </div>
      );
    }
  },
);

export default MathMarkdownRenderer;
