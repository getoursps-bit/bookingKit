"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";

/**
 * A submit button that turns itself off once the form is valid and on its way,
 * so a double tap does not post twice. Invalid forms are left to the browser's
 * own messages.
 */
export function SubmitButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    props.onClick?.(event);
    const button = event.currentTarget;
    if (!button.form?.checkValidity()) return;
    // After the browser has taken the click as the submitter.
    setTimeout(() => {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }, 0);
  };
  return <button type="submit" {...props} onClick={onClick} />;
}
