import {
  ProjectState,
  projectStateMachine,
  type ProjectTransitionSuccess,
} from "@/features/projects/engine";

export interface OperationsGateEvidence {
  agreementAccepted: boolean;
  paymentApproved: boolean;
  proofValidated: boolean;
  portalActive: boolean;
}

export interface ApproveReservationInput {
  projectId: string;
  currentState: ProjectState;
  evidence: OperationsGateEvidence;
}

export type OperationsGateError =
  | {
      code: "MISSING_APPROVAL_EVIDENCE";
      missing: readonly (keyof OperationsGateEvidence)[];
      message: string;
    }
  | {
      code: "PROJECT_TRANSITION_REJECTED";
      message: string;
    };

export type OperationsGateResult =
  | { success: true; transition: ProjectTransitionSuccess }
  | { success: false; error: OperationsGateError };

export function approveReservationAtOperationsGate(
  input: ApproveReservationInput,
): OperationsGateResult {
  const missing = (Object.entries(input.evidence) as Array<
    [keyof OperationsGateEvidence, boolean]
  >)
    .filter(([, available]) => !available)
    .map(([key]) => key);

  if (missing.length) {
    return {
      success: false,
      error: {
        code: "MISSING_APPROVAL_EVIDENCE",
        missing,
        message: "La reserva no cuenta con toda la evidencia requerida.",
      },
    };
  }

  const transition = projectStateMachine.transition({
    projectId: input.projectId,
    state: input.currentState,
    targetState: ProjectState.CONFIRMED,
  });

  if (!transition.success) {
    return {
      success: false,
      error: {
        code: "PROJECT_TRANSITION_REJECTED",
        message: transition.error.message,
      },
    };
  }

  return { success: true, transition };
}
