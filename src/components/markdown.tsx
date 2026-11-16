"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type MarkdownProps = {
  children: string;
  className?: string;
  onToggleTask?: (taskIndex: number, checked: boolean) => void;
};

export function Markdown({ children, className, onToggleTask }: MarkdownProps) {
  const taskCounter = { index: -1 };

  return (
    <div className={cn("note-prose prose prose-stone max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren, title }) => (
            <a
              href={href}
              title={title}
              target="_blank"
              rel="noopener noreferrer"
            >
              {linkChildren}
            </a>
          ),
          input: ({ node: _node, type, checked, ...props }) => {
            if (type === "checkbox") {
              taskCounter.index += 1;
              const index = taskCounter.index;
              const interactive = typeof onToggleTask === "function";
              return (
                <input
                  {...props}
                  type="checkbox"
                  checked={Boolean(checked)}
                  disabled={!interactive}
                  onChange={
                    interactive
                      ? (e) => onToggleTask(index, e.currentTarget.checked)
                      : undefined
                  }
                  className={cn(
                    props.className,
                    interactive && "cursor-pointer",
                  )}
                />
              );
            }
            return <input {...props} type={type} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
