import type { RpcErrorResponse, RpcRequest } from "./contract";

export function unknownRequestResponse(request: Pick<RpcRequest, "id" | "type">): RpcErrorResponse {
  return {
    id: request.id,
    ok: false,
    type: request.type,
    error: {
      code: "UNKNOWN_REQUEST",
      message: `No backend handler registered for ${request.type}`
    }
  };
}

export function backendErrorResponse(
  request: Pick<RpcRequest, "id" | "type">,
  error: Error
): RpcErrorResponse {
  return {
    id: request.id,
    ok: false,
    type: request.type,
    error: {
      code: "BACKEND_ERROR",
      message: error.message
    }
  };
}
