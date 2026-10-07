import { createContext, useContext } from 'react';

export interface StepUpRequest {
  title: string;
  description: string;
  warning?: string;
  confirmLabel: string;
  tone?: 'default' | 'destructive';
}

/** Resolves with a single-use proof for `X-Step-Up-Token`, or null when the user backs out. */
export type ConfirmIdentity = (request: StepUpRequest) => Promise<string | null>;

export const StepUpContext = createContext<ConfirmIdentity | null>(null);

export function useStepUp(): ConfirmIdentity {
  const confirmIdentity = useContext(StepUpContext);
  if (!confirmIdentity) {
    throw new Error('useStepUp must be used within a StepUpProvider');
  }
  return confirmIdentity;
}
