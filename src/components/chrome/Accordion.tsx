import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type AccordionProps = {
  title: string;
  defaultOpen?: boolean;
  headerExtra?: ReactNode;
  children: ReactNode;
};

export function Accordion({ title, defaultOpen = false, headerExtra, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="chrome-accordion-section">
      <button
        type="button"
        className="chrome-accordion-header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {title}
          {headerExtra}
        </span>
        <ChevronDown className="chrome-accordion-chevron" aria-hidden />
      </button>
      <div className="chrome-accordion-body" data-open={open}>
        <div className="chrome-accordion-body-inner">
          <div className="chrome-accordion-body-content">{children}</div>
        </div>
      </div>
    </section>
  );
}
