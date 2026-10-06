"use client";

/**
 * A debounced search box (`PHASES.md` §13 task 6 support: list/search widgets). The parent owns the
 * `value`, so results can be filtered on the server or client; only the debounce looks here. `useId`
 * ties label to input, `clearable` shows an X button.
 */
import * as React from "react";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

export interface SearchInputProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  /** Accessible name for the search field. Defaults for screen readers when you give none. */
  readonly label?: string;
  readonly debounceMs?: number;
  readonly className?: string;
}

export function SearchInput({
  value,
  onValueChange,
  placeholder = "Search…",
  label,
  debounceMs = 250,
  className,
}: Readonly<SearchInputProps>) {
  const id = React.useId();
  const [draft, setDraft] = React.useState(value);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (draft !== value) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onValueChange(draft), debounceMs);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, value, debounceMs, onValueChange]);

  return (
    <div className={cn("relative", className)}>
      <MagnifyingGlassIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        aria-label={label ?? undefined}
        autoComplete="off"
        className="pl-9 pr-8"
      />
      {draft && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            setDraft("");
            onValueChange("");
          }}
          className="absolute top-1/2 right-1 size-6 -translate-y-1/2 rounded-none"
        >
          <XIcon aria-hidden="true" className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
