"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { lockBodyScroll, unlockBodyScroll } from "@/lib/ui/body-scroll-lock";

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Optional actions rendered in the header row (e.g. link to detail page). */
  headerActions?: ReactNode;
  size?: "default" | "wide";
}

/**
 * Accessible dialog portaled to document.body with backdrop dismiss and Escape close.
 *
 * @param props - Open state, title, and modal content.
 * @returns Portal dialog or null when closed.
 */
export function AppModal({
  open,
  onClose,
  title,
  description,
  children,
  headerActions,
  size = "default",
}: AppModalProps): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    lockBodyScroll();

    /**
     * Closes the modal when the user presses Escape.
     *
     * @param event - Keyboard event on the document.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      unlockBodyScroll();
    };
  }, [open, onClose]);

  if (!open || !mounted) {
    return null;
  }

  return createPortal(
    <div className="app-modal" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`app-modal__dialog app-modal__dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="app-modal__header">
          <div className="app-modal__header-text">
            <h2 id={titleId} className="app-modal__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="app-modal__description">
                {description}
              </p>
            ) : null}
          </div>
          <div className="app-modal__header-actions">
            {headerActions}
            <button
              type="button"
              className="app-modal__close"
              onClick={onClose}
              aria-label="Close dialog"
            >
              ×
            </button>
          </div>
        </header>
        <div className="app-modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
